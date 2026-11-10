import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { Configuration, OpenAIApi } from 'openai'

import {
  DEFAULT_DATASET_PATH,
  IClassificationRequest,
  ICaseRun,
  IEvalCase,
  IModelReport,
  ITokenUsage,
  aggregateReport,
  buildCaseMessages,
  buildClassificationRequest,
  filterCases,
  formatComparisonTable,
  loadDataset,
  scoreCase,
} from './classifierEval.utils'

/**
 * Offline evaluation of the assistant intent classifier across models.
 *
 *   npm run eval:classifier -- [--models a,b] [--filter text] [--out report.json]
 *
 * It only calls the chat completion endpoint with the production classification parameters and
 * scores the JSON it gets back. It never executes an assistant action: no MessageProcessor, DI
 * container, database, Redis or Slack code is imported.
 */

export const DEFAULT_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini']

// Matched by the "/*-temp.*" rule of .gitignore when run from the project root
export const DEFAULT_OUTPUT_FILE = 'classifier-eval-temp.json'

export const MISSING_KEY_MESSAGE =
  'Falta OPENAI_API_KEY: no se ejecutó la evaluación ni se hizo ninguna llamada. ' +
  'Definila en el entorno (o en .env) y volvé a correr "npm run eval:classifier".'

export const REAL_RUN_NOTICE =
  'IMPORTANTE: el dataset es sintético y chico; estos números orientan, no prueban calidad en uso real. ' +
  'Cambiar el modelo de producción (hoy gpt-4o-mini) requiere esta corrida real, revisada caso por caso.'

const USAGE = [
  'Uso: npm run eval:classifier -- [opciones]',
  '  --models <a,b>   Modelos a comparar (env EVAL_MODELS). Default: ' + DEFAULT_MODELS.join(','),
  '  --filter <txt>   Solo casos cuyo id o intent esperado contenga el texto; admite varios separados por coma (env EVAL_FILTER)',
  '  --out <ruta>     Reporte JSON (env EVAL_OUTPUT). Default: ./' + DEFAULT_OUTPUT_FILE,
  '  --dataset <ruta> Dataset alternativo (env EVAL_DATASET)',
  '  --help           Muestra esta ayuda',
  'Requiere OPENAI_API_KEY. Opcional: OPENAI_ORGANIZATION.',
].join('\n')

// Statuses that will repeat for every case of the model: stop instead of burning requests
const FATAL_STATUSES = [401, 403, 404]

export interface IModelCompletion {
  content: string | null
  finishReason?: string | null
  usage?: ITokenUsage | null
}

export interface IClassifierClient {
  complete: (request: IClassificationRequest) => Promise<IModelCompletion>
}

export interface IRunnerDeps {
  argv: string[]
  env: Record<string, string | undefined>
  print: (line: string) => void
  // Built only after the API key check passed
  createClient?: (apiKey: string, organization?: string) => IClassifierClient
  writeReport?: (filePath: string, content: string) => void
  clock?: () => number
}

interface IRunnerOptions {
  models: string[]
  filter?: string
  out: string
  dataset: string
  help: boolean
}

const VALUE_FLAGS = ['--models', '--filter', '--out', '--dataset']

export const parseRunnerArgs = (
  argv: string[],
  env: Record<string, string | undefined>
): IRunnerOptions => {
  const values: Record<string, string> = {}
  let help = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      help = true
      continue
    }

    const separator = arg.indexOf('=')
    const flag = separator === -1 ? arg : arg.slice(0, separator)
    const inlineValue = separator === -1 ? undefined : arg.slice(separator + 1)
    if (!VALUE_FLAGS.includes(flag)) throw new Error(`Opción desconocida: ${arg}`)

    const value = inlineValue ?? argv[(index += 1)]
    if (value === undefined || value.trim() === '') throw new Error(`Falta el valor de ${flag}`)
    values[flag] = value
  }

  const models = (values['--models'] ?? env.EVAL_MODELS ?? DEFAULT_MODELS.join(','))
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0)

  if (models.length === 0) throw new Error('La lista de modelos está vacía')

  return {
    models: [...new Set(models)],
    filter: values['--filter'] ?? env.EVAL_FILTER,
    out: values['--out'] ?? env.EVAL_OUTPUT ?? DEFAULT_OUTPUT_FILE,
    dataset: values['--dataset'] ?? env.EVAL_DATASET ?? DEFAULT_DATASET_PATH,
    help,
  }
}

/**
 * Real client: one chat completion per request, no retries (same as production).
 */
export const createOpenAIClient = (apiKey: string, organization?: string): IClassifierClient => {
  const openai = new OpenAIApi(new Configuration({ apiKey, organization }))

  return {
    complete: async (request) => {
      const completion = await openai.createChatCompletion(request as any)
      const choice = completion.data.choices[0]
      const usage = completion.data.usage

      return {
        content: choice?.message?.content ?? null,
        finishReason: choice?.finish_reason ?? null,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : null,
      }
    },
  }
}

interface IRequestFailure {
  status: number | null
  summary: string
}

// Only status and error code/type. The error object and the provider message are never printed:
// the first carries the Authorization header and the second can echo part of the key.
const describeRequestError = (error: unknown): IRequestFailure => {
  const response = (error as any)?.response
  const status = typeof response?.status === 'number' ? (response.status as number) : null
  const code = response?.data?.error?.code ?? response?.data?.error?.type
  const fallback = (error as any)?.code ?? 'error de red o desconocido'

  return {
    status,
    summary:
      status !== null
        ? `HTTP ${status}${typeof code === 'string' ? ` (${code})` : ''}`
        : String(fallback),
  }
}

interface IModelRun {
  report: IModelReport
  runs: ICaseRun[]
  aborted: string | null
}

const runModel = async (
  model: string,
  cases: IEvalCase[],
  now: Date,
  client: IClassifierClient,
  clock: () => number,
  print: (line: string) => void
): Promise<IModelRun> => {
  const runs: ICaseRun[] = []
  let aborted: string | null = null

  for (const evalCase of cases) {
    if (aborted) {
      runs.push({
        score: scoreCase(evalCase, null, now),
        rawOutput: null,
        error: `no ejecutado: ${aborted}`,
      })
      continue
    }

    const request = buildClassificationRequest(model, buildCaseMessages(evalCase, now))
    const startedAt = clock()

    try {
      const completion = await client.complete(request)
      runs.push({
        score: scoreCase(evalCase, completion.content, now),
        rawOutput: completion.content,
        finishReason: completion.finishReason,
        latencyMs: clock() - startedAt,
        usage: completion.usage,
      })
    } catch (error) {
      const failure = describeRequestError(error)
      runs.push({
        score: scoreCase(evalCase, null, now),
        rawOutput: null,
        latencyMs: clock() - startedAt,
        error: failure.summary,
      })

      if (failure.status !== null && FATAL_STATUSES.includes(failure.status)) {
        aborted = failure.summary
        print(`  ${model}: se corta el modelo por ${failure.summary}`)
      }
    }
  }

  return { report: aggregateReport(model, runs), runs, aborted }
}

const printFailures = (report: IModelReport, print: (line: string) => void): void => {
  if (report.failures.length === 0) return

  print(`\nFallos de ${report.model} (${report.failures.length}):`)
  report.failures.forEach((failure) => {
    print(`  - ${failure.id}: ${failure.reasons.join(' | ')}`)
  })
}

const defaultWriteReport = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

/**
 * Runs the evaluation and returns the process exit code.
 * 0: completed. 1: missing API key or a model could not be evaluated. 2: invalid usage.
 */
export const runClassifierEval = async (deps: IRunnerDeps): Promise<number> => {
  const { argv, env, print } = deps
  let options: IRunnerOptions

  try {
    options = parseRunnerArgs(argv, env)
  } catch (error) {
    print(`${(error as Error).message}\n\n${USAGE}`)
    return 2
  }

  if (options.help) {
    print(USAGE)
    return 0
  }

  const apiKey = (env.OPENAI_API_KEY ?? '').trim()
  if (!apiKey) {
    print(MISSING_KEY_MESSAGE)
    return 1
  }

  const dataset = loadDataset(options.dataset)
  const cases = filterCases(dataset.cases, options.filter)

  if (cases.length === 0) {
    print(`Ningún caso coincide con el filtro "${options.filter ?? ''}".`)
    return 2
  }

  const now = new Date(dataset.metadata.now)
  const clock = deps.clock ?? Date.now
  const client = (deps.createClient ?? createOpenAIClient)(
    apiKey,
    env.OPENAI_ORGANIZATION?.trim() || undefined
  )

  print(
    `Evaluando ${cases.length} de ${dataset.cases.length} casos (dataset ${dataset.metadata.name} v${dataset.metadata.version}, ` +
      `fecha de referencia ${dataset.metadata.now}) con: ${options.models.join(', ')}`
  )

  const modelRuns: IModelRun[] = []
  for (const model of options.models) {
    print(`- ${model}...`)
    modelRuns.push(await runModel(model, cases, now, client, clock, print))
  }

  const reports = modelRuns.map((run) => run.report)

  print(`\n${formatComparisonTable(reports)}`)
  reports.forEach((report) => {
    printFailures(report, print)
  })

  const outputPath = path.resolve(options.out)
  const reportFile = {
    generatedAt: new Date(clock()).toISOString(),
    dataset: {
      name: dataset.metadata.name,
      version: dataset.metadata.version,
      now: dataset.metadata.now,
      totalCases: dataset.cases.length,
      evaluatedCases: cases.length,
      filter: options.filter ?? null,
      sources: [...new Set(cases.map((evalCase) => evalCase.source))],
    },
    notice: REAL_RUN_NOTICE,
    models: modelRuns.map((run) => ({
      ...run.report,
      aborted: run.aborted,
      cases: run.runs.map((caseRun) => ({ ...caseRun.score, ...caseRun, score: undefined })),
    })),
  }

  ;(deps.writeReport ?? defaultWriteReport)(outputPath, JSON.stringify(reportFile, null, 2))
  print(`\nReporte JSON: ${outputPath} (no versionar)`)
  print(`\n${REAL_RUN_NOTICE}`)

  return modelRuns.some((run) => run.aborted !== null) ? 1 : 0
}

const main = async (): Promise<void> => {
  dotenv.config()

  process.exitCode = await runClassifierEval({
    argv: process.argv.slice(2),
    env: process.env,
    print: (line) => {
      process.stdout.write(`${line}\n`)
    },
  })
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // Message only: an error object could carry request headers
    process.stderr.write(`La evaluación falló: ${(error as Error)?.message ?? 'error'}\n`)
    process.exitCode = 1
  })
}
