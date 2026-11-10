import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'

import { roleTypes } from '../shared/constants/openai'
import { IAssistantContextEntry } from '../shared/interfaces/converstions'
import { formatContextForClassifier } from '../shared/utils/assistantContext.utils'
import {
  buildClassificationMessages,
  buildClassifierContextBlock,
} from '../shared/utils/classificationPrompt.utils'

/**
 * Offline evaluation helpers for the assistant intent classifier.
 * Everything here is pure (the only I/O is reading the dataset file) and nothing executes
 * assistant actions: no services, database, Redis or Slack code is imported.
 */

export const DEFAULT_DATASET_PATH = path.join(__dirname, 'classifier.dataset.json')

// Mirror of the `case` labels of MessageProcessor#intentFallbackRouter. Duplicated on purpose:
// importing the service would pull the DI graph (database, Redis). Keep both in sync.
export const ROUTER_INTENTS = [
  'alert.create',
  'alert.list',
  'task.create',
  'task.list',
  'note.create',
  'note.list',
  'link.create',
  'link.list',
  'reminder.create',
  'reminder.list',
  'reminder.detail',
  'reminder.check',
  'reminder.pause',
  'reminder.resume',
  'reminder.delete',
  'alert.snooze',
  'image.create',
  'image.list',
  'search',
  'question',
  'translate',
  'qr.generate',
] as const

// The router's `default` branch: valid JSON whose intent it does not handle -> generic reply
export const UNKNOWN_INTENT = 'unknown'

export const EXPECTED_INTENTS: readonly string[] = [...ROUTER_INTENTS, UNKNOWN_INTENT]

// Mirror of the classification mode of OpenaiRepository#chatCompletion (the model is the variable)
export const CLASSIFICATION_TEMPERATURE = 0
export const CLASSIFICATION_MAX_TOKENS = 400

// Same fixed offset production uses for absolute alert dates (Argentina has no DST)
const ARGENTINA_UTC_OFFSET_HOURS = 3

const MAX_RAW_OUTPUT_CHARS = 400

const fieldName = z.string().min(1)

const fieldCheckSchema = z.discriminatedUnion('check', [
  z.object({ field: fieldName, check: z.literal('nonEmpty') }).strict(),
  z
    .object({
      field: fieldName,
      check: z.literal('equals'),
      value: z.union([z.string(), z.number()]),
      caseSensitive: z.boolean().optional(),
    })
    .strict(),
  z.object({ field: fieldName, check: z.literal('includes'), value: z.string().min(1) }).strict(),
  z
    .object({
      field: fieldName,
      check: z.literal('time'),
      minutesFromNow: z.number().optional(),
      at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        .optional(),
      toleranceMinutes: z.number().min(0),
    })
    .strict(),
  z
    .object({
      field: fieldName,
      check: z.literal('timeOfDay'),
      value: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .strict(),
  z
    .object({
      field: fieldName,
      check: z.literal('sameElements'),
      value: z.array(z.union([z.string(), z.number()])).min(1),
    })
    .strict(),
])

const caseSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(['synthetic', 'real']),
    message: z.string().min(1),
    history: z
      .array(
        z
          .object({
            role: z.enum([roleTypes.user, roleTypes.assistant]),
            content: z.string().min(1),
          })
          .strict()
      )
      .optional(),
    dataContext: z.string().min(1).optional(),
    expected: z
      .object({
        intent: z.string().min(1),
        alsoAccept: z.array(z.string().min(1)).optional(),
        fields: z.array(fieldCheckSchema).optional(),
      })
      .strict(),
    note: z.string().min(1),
  })
  .strict()

export const datasetSchema = z
  .object({
    metadata: z
      .object({
        name: z.string().min(1),
        version: z.number(),
        now: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
          message: 'metadata.now must be a valid date',
        }),
        description: z.string().min(1),
        sources: z.record(z.string().min(1)),
      })
      .passthrough(),
    cases: z.array(caseSchema).min(1),
  })
  .superRefine((dataset, ctx) => {
    const seen = new Set<string>()

    dataset.cases.forEach((evalCase, index) => {
      if (seen.has(evalCase.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cases', index, 'id'],
          message: `duplicated id: ${evalCase.id}`,
        })
      }
      seen.add(evalCase.id)

      if (!(evalCase.source in dataset.metadata.sources)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cases', index, 'source'],
          message: `source not declared in metadata.sources: ${evalCase.source}`,
        })
      }

      ;(evalCase.expected.fields ?? []).forEach((check, fieldIndex) => {
        if (check.check !== 'time') return
        if ((check.minutesFromNow === undefined) === (check.at === undefined)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cases', index, 'expected', 'fields', fieldIndex],
            message: 'time check needs exactly one of minutesFromNow or at',
          })
        }
      })

      const intents = [evalCase.expected.intent, ...(evalCase.expected.alsoAccept ?? [])]
      intents.forEach((intent) => {
        if (!EXPECTED_INTENTS.includes(intent)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cases', index, 'expected'],
            message: `intent not handled by the router: ${intent}`,
          })
        }
      })
    })
  })

export type IFieldCheck = z.infer<typeof fieldCheckSchema>
export type IEvalCase = z.infer<typeof caseSchema>
export type IEvalDataset = z.infer<typeof datasetSchema>

/**
 * Validates an already parsed dataset. Throws with the list of problems.
 */
export const parseDataset = (data: unknown): IEvalDataset => {
  const result = datasetSchema.safeParse(data)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid classifier dataset: ${issues}`)
  }

  return result.data
}

// Read with fs: the project tsconfig has no resolveJsonModule
export const loadDataset = (filePath: string = DEFAULT_DATASET_PATH): IEvalDataset =>
  parseDataset(JSON.parse(fs.readFileSync(filePath, 'utf8')))

/**
 * Cases whose id or expected intent contains the filter (comma separated terms, any match).
 */
export const filterCases = (cases: IEvalCase[], filter?: string): IEvalCase[] => {
  const terms = (filter ?? '')
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0)

  if (terms.length === 0) return cases

  return cases.filter((evalCase) =>
    terms.some(
      (term) =>
        evalCase.id.toLowerCase().includes(term) ||
        evalCase.expected.intent.toLowerCase().includes(term)
    )
  )
}

export interface IChatMessage {
  role: string
  content: string
}

export interface IClassificationRequest {
  model: string
  messages: IChatMessage[]
  temperature: number
  max_tokens: number
}

/**
 * [system, user] messages of a case, built with the production prompt and the production context
 * block: `history` goes through formatContextForClassifier (personal context path) and
 * `dataContext` is the DATOS_USUARIO string as buildUserDataContext would produce it.
 */
export const buildCaseMessages = (evalCase: IEvalCase, now: Date): IChatMessage[] => {
  const historyContext = formatContextForClassifier(
    (evalCase.history ?? []) as IAssistantContextEntry[]
  )
  const contextBlock = buildClassifierContextBlock(evalCase.dataContext ?? '', historyContext)

  // Same projection OpenaiRepository applies before sending: role and content only
  return buildClassificationMessages({ message: evalCase.message, contextBlock, now }).map(
    (message) => ({ role: String(message.role), content: message.content })
  )
}

export const buildClassificationRequest = (
  model: string,
  messages: IChatMessage[]
): IClassificationRequest => ({
  model,
  messages,
  temperature: CLASSIFICATION_TEMPERATURE,
  max_tokens: CLASSIFICATION_MAX_TOKENS,
})

export type ParseFailureReason = 'empty_response' | 'invalid_json' | 'missing_intent'

export type IParsedOutput =
  | { ok: true; intent: string; parsed: Record<string, unknown> }
  | { ok: false; reason: ParseFailureReason }

/**
 * Cleans and parses a raw classifier output.
 * Mirror of the cleaning logic of MessageProcessor#intentFallbackRouter (fence stripping, brace
 * extraction, trailing comma fix, lowercased intent). Duplicated because that logic is inline in a
 * private method; if it changes there, change it here.
 */
export const parseClassifierOutput = (rawOutput: string | null | undefined): IParsedOutput => {
  const raw = String(rawOutput ?? '')
    .trim()
    .replace(/^```(json)?/i, '')
    .replace(/```$/i, '')
    .trim()

  if (!raw) return { ok: false, reason: 'empty_response' }

  const candidates: string[] = [raw]

  if (!/^{[\s\S]*}$/.test(raw)) {
    const braceStart = raw.indexOf('{')
    const braceEnd = raw.lastIndexOf('}')
    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      candidates.push(raw.slice(braceStart, braceEnd + 1))
    }
  }

  let parsed: unknown = null

  for (const candidate of candidates) {
    if (parsed) break
    try {
      parsed = JSON.parse(candidate.replace(/,\s*}/g, '}'))
    } catch {
      continue
    }
  }

  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'invalid_json' }

  const record = parsed as Record<string, unknown>
  const intent = typeof record.intent === 'string' ? record.intent.toLowerCase() : ''

  if (!intent) return { ok: false, reason: 'missing_intent' }

  return { ok: true, intent, parsed: record }
}

/**
 * Outcome the router would take for a parsed intent: the intent itself or its default branch.
 */
export const toRouterOutcome = (intent: string): string =>
  (ROUTER_INTENTS as readonly string[]).includes(intent) ? intent : UNKNOWN_INTENT

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Reads a field where the router reads it: top level, plus the two fallbacks it implements
// (`id` for target ids and `parameters` for translate)
const readField = (parsed: Record<string, unknown>, intent: string, field: string): unknown => {
  if (field === 'targetId') return parsed.targetId ?? parsed.id

  if (intent === 'translate' && isRecord(parsed.parameters)) {
    return parsed[field] ?? parsed.parameters[field]
  }

  return parsed[field]
}

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const isEmptyValue = (value: unknown): boolean =>
  value === null || value === undefined || String(value).trim() === ''

// Same normalization the router applies to target ids ("#12" -> 12)
const toId = (value: unknown): number | null => {
  const normalized = String(value ?? '')
    .replace(/^#/, '')
    .trim()
  const id = Number(normalized)

  return normalized && Number.isInteger(id) ? id : null
}

const RELATIVE_TIME_REGEX = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/
const ABSOLUTE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

const argentinaTimeToMs = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number => Date.UTC(year, month - 1, day, hour + ARGENTINA_UTC_OFFSET_HOURS, minute)

/**
 * Minutes between `now` and the moment a classifier time value points to, or null when the value
 * is not a format the alert flow understands. Accepts "YYYY-MM-DD[ HH:mm[:ss]]" (Argentina time),
 * a relative duration ([w][d][h][m][s]) or any other string Date can parse.
 */
export const resolveMinutesFromNow = (value: unknown, now: Date): number | null => {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const absolute = ABSOLUTE_TIME_REGEX.exec(raw)
  if (absolute) {
    const [year, month, day, hour, minute] = absolute.slice(1, 6).map((part) => Number(part ?? 0))
    return (argentinaTimeToMs(year, month, day, hour, minute) - now.getTime()) / 60000
  }

  const relative = RELATIVE_TIME_REGEX.exec(raw.toLowerCase().replace(/\s+/g, ''))
  if (relative) {
    const [weeks, days, hours, minutes, seconds] = relative
      .slice(1, 6)
      .map((part) => Number(part ?? 0))
    return weeks * 10080 + days * 1440 + hours * 60 + minutes + seconds / 60
  }

  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : (parsed - now.getTime()) / 60000
}

const toTimeOfDay = (value: unknown): string | null => {
  const match = /(\d{1,2}):(\d{2})/.exec(String(value ?? ''))
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
}

export interface IFieldResult {
  field: string
  check: IFieldCheck['check']
  pass: boolean
  detail: string
}

const describe = (value: unknown): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? 'undefined'
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

export const checkField = (
  parsed: Record<string, unknown>,
  intent: string,
  check: IFieldCheck,
  now: Date
): IFieldResult => {
  const actual = readField(parsed, intent, check.field)
  const result = (pass: boolean, expected: string): IFieldResult => ({
    field: check.field,
    check: check.check,
    pass,
    detail: pass ? 'ok' : `expected ${expected}, got ${describe(actual)}`,
  })

  switch (check.check) {
    case 'nonEmpty':
      return result(!isEmptyValue(actual), 'a non-empty value')
    case 'equals': {
      if (typeof check.value === 'number') {
        const actualNumber = check.field === 'targetId' ? toId(actual) : Number(actual)
        return result(!isEmptyValue(actual) && actualNumber === check.value, String(check.value))
      }
      const pass = check.caseSensitive
        ? String(actual ?? '').trim() === check.value
        : normalizeText(actual) === normalizeText(check.value)
      return result(pass, `"${check.value}"`)
    }
    case 'includes':
      return result(
        normalizeText(actual).includes(normalizeText(check.value)),
        `text including "${check.value}"`
      )
    case 'time': {
      const expectedMinutes =
        check.minutesFromNow ?? resolveMinutesFromNow(check.at, now) ?? Number.NaN
      const actualMinutes = resolveMinutesFromNow(actual, now)
      const pass =
        actualMinutes !== null &&
        Math.abs(actualMinutes - expectedMinutes) <= check.toleranceMinutes + 1e-9
      return result(
        pass,
        `${check.at ?? `now+${String(check.minutesFromNow)}m`} (±${check.toleranceMinutes}m)`
      )
    }
    case 'timeOfDay':
      return result(toTimeOfDay(actual) === check.value, check.value)
    case 'sameElements': {
      const expected = check.value.map(normalizeText).sort()
      const actualItems = Array.isArray(actual) ? actual.map(normalizeText).sort() : null
      return result(
        actualItems !== null && JSON.stringify(actualItems) === JSON.stringify(expected),
        JSON.stringify(check.value)
      )
    }
  }
}

export type ParseStatus = 'ok' | ParseFailureReason

export interface ICaseScore {
  id: string
  expectedIntent: string
  // Router outcome of the model output; null when the output could not be used
  predictedIntent: string | null
  // Intent as written by the model, before mapping unhandled ones to "unknown"
  rawIntent: string | null
  parseStatus: ParseStatus
  intentMatch: boolean
  // True when the match came from `alsoAccept`; field checks are skipped in that case
  matchedAlternative: boolean
  fieldResults: IFieldResult[]
  // Intent matched and every evaluated field check passed
  pass: boolean
}

/**
 * Scores one raw model output against a case. Field checks only run when the primary expected
 * intent was predicted.
 */
export const scoreCase = (
  evalCase: IEvalCase,
  rawOutput: string | null | undefined,
  now: Date
): ICaseScore => {
  const base = { id: evalCase.id, expectedIntent: evalCase.expected.intent }
  const output = parseClassifierOutput(rawOutput)

  if ('reason' in output) {
    return {
      ...base,
      predictedIntent: null,
      rawIntent: null,
      parseStatus: output.reason,
      intentMatch: false,
      matchedAlternative: false,
      fieldResults: [],
      pass: false,
    }
  }

  const predictedIntent = toRouterOutcome(output.intent)
  const isPrimary = predictedIntent === evalCase.expected.intent
  const matchedAlternative =
    !isPrimary && (evalCase.expected.alsoAccept ?? []).includes(predictedIntent)
  const fieldResults = isPrimary
    ? (evalCase.expected.fields ?? []).map((check) =>
        checkField(output.parsed, output.intent, check, now)
      )
    : []

  return {
    ...base,
    predictedIntent,
    rawIntent: output.intent,
    parseStatus: 'ok',
    intentMatch: isPrimary || matchedAlternative,
    matchedAlternative,
    fieldResults,
    pass: (isPrimary || matchedAlternative) && fieldResults.every((field) => field.pass),
  }
}

export interface ITokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ICaseRun {
  score: ICaseScore
  rawOutput: string | null
  finishReason?: string | null
  latencyMs?: number
  usage?: ITokenUsage | null
  // Request failure (network, HTTP status). Counted apart from model mistakes
  error?: string
}

export interface IIntentStats {
  total: number
  intentCorrect: number
  fullCorrect: number
  intentAccuracy: number
}

export interface ICaseFailure {
  id: string
  expectedIntent: string
  predictedIntent: string | null
  reasons: string[]
  rawOutput: string | null
}

export interface IModelReport {
  model: string
  total: number
  // Cases that got a model answer (total minus request errors)
  answered: number
  requestErrors: number
  intentCorrect: number
  intentAccuracy: number
  fullCorrect: number
  fullAccuracy: number
  matchedAlternative: number
  // Answers the router could not use: empty, not JSON or JSON without intent
  invalidJson: number
  invalidJsonByReason: Record<ParseFailureReason, number>
  truncated: number
  perIntent: Record<string, IIntentStats>
  failures: ICaseFailure[]
  latency: { measured: number; totalMs: number; avgMs: number; maxMs: number } | null
  tokens: (ITokenUsage & { measured: number }) | null
}

const ratio = (part: number, total: number): number =>
  total === 0 ? 0 : Math.round((part / total) * 10000) / 10000

const truncateRaw = (raw: string | null): string | null =>
  raw !== null && raw.length > MAX_RAW_OUTPUT_CHARS ? `${raw.slice(0, MAX_RAW_OUTPUT_CHARS)}…` : raw

const failureReasons = (run: ICaseRun): string[] => {
  if (run.error) return [`request error: ${run.error}`]

  const { score } = run
  if (score.parseStatus !== 'ok') return [`unusable output: ${score.parseStatus}`]
  if (!score.intentMatch) {
    return [`intent: expected ${score.expectedIntent}, got ${String(score.rawIntent)}`]
  }

  return score.fieldResults
    .filter((field) => !field.pass)
    .map((field) => `field ${field.field} (${field.check}): ${field.detail}`)
}

/**
 * Aggregated report of one model. Accuracies use every case as denominator, so request errors
 * count as misses and are also reported apart.
 */
export const aggregateReport = (model: string, runs: ICaseRun[]): IModelReport => {
  const perIntent: Record<string, IIntentStats> = {}
  const invalidJsonByReason: Record<ParseFailureReason, number> = {
    empty_response: 0,
    invalid_json: 0,
    missing_intent: 0,
  }
  const failures: ICaseFailure[] = []
  const latencies: number[] = []
  const tokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0, measured: 0 }
  let requestErrors = 0
  let intentCorrect = 0
  let fullCorrect = 0
  let matchedAlternative = 0
  let truncated = 0

  runs.forEach((run) => {
    const { score } = run
    const stats = (perIntent[score.expectedIntent] ??= {
      total: 0,
      intentCorrect: 0,
      fullCorrect: 0,
      intentAccuracy: 0,
    })
    stats.total += 1

    if (run.error) {
      requestErrors += 1
    } else if (score.parseStatus !== 'ok') {
      invalidJsonByReason[score.parseStatus] += 1
    }

    if (!run.error && score.intentMatch) {
      intentCorrect += 1
      stats.intentCorrect += 1
    }
    if (!run.error && score.pass) {
      fullCorrect += 1
      stats.fullCorrect += 1
    }
    if (!run.error && score.matchedAlternative) matchedAlternative += 1
    if (run.finishReason && run.finishReason !== 'stop') truncated += 1

    if (run.error || !score.pass) {
      failures.push({
        id: score.id,
        expectedIntent: score.expectedIntent,
        predictedIntent: run.error ? null : score.predictedIntent,
        reasons: failureReasons(run),
        rawOutput: truncateRaw(run.rawOutput),
      })
    }

    if (typeof run.latencyMs === 'number') latencies.push(run.latencyMs)
    if (run.usage) {
      tokens.promptTokens += run.usage.promptTokens
      tokens.completionTokens += run.usage.completionTokens
      tokens.totalTokens += run.usage.totalTokens
      tokens.measured += 1
    }
  })

  Object.values(perIntent).forEach((stats) => {
    stats.intentAccuracy = ratio(stats.intentCorrect, stats.total)
  })

  const totalLatency = latencies.reduce((sum, value) => sum + value, 0)
  const invalidJson = Object.values(invalidJsonByReason).reduce((sum, value) => sum + value, 0)

  return {
    model,
    total: runs.length,
    answered: runs.length - requestErrors,
    requestErrors,
    intentCorrect,
    intentAccuracy: ratio(intentCorrect, runs.length),
    fullCorrect,
    fullAccuracy: ratio(fullCorrect, runs.length),
    matchedAlternative,
    invalidJson,
    invalidJsonByReason,
    truncated,
    perIntent,
    failures,
    latency:
      latencies.length > 0
        ? {
            measured: latencies.length,
            totalMs: Math.round(totalLatency),
            avgMs: Math.round(totalLatency / latencies.length),
            maxMs: Math.round(Math.max(...latencies)),
          }
        : null,
    tokens: tokens.measured > 0 ? tokens : null,
  }
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`

/**
 * Plain-text table with one row per model.
 */
export const formatComparisonTable = (reports: IModelReport[]): string => {
  const header = [
    'modelo',
    'casos',
    'intent ok',
    'intent+campos ok',
    'json inválido',
    'errores req',
    'lat media',
    'tokens',
  ]
  const rows = reports.map((report) => [
    report.model,
    String(report.total),
    `${report.intentCorrect} (${percent(report.intentAccuracy)})`,
    `${report.fullCorrect} (${percent(report.fullAccuracy)})`,
    String(report.invalidJson),
    String(report.requestErrors),
    report.latency ? `${report.latency.avgMs} ms` : 'n/d',
    report.tokens ? String(report.tokens.totalTokens) : 'n/d',
  ])
  const widths = header.map((title, index) =>
    Math.max(title.length, ...rows.map((row) => row[index].length))
  )
  const line = (cells: string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index]))
      .join('  ')
      .trimEnd()

  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join(
    '\n'
  )
}
