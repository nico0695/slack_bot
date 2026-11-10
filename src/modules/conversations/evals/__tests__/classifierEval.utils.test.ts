import * as fs from 'fs'
import * as path from 'path'

import { assistantPromptFlagsLite2 } from '../../shared/constants/prompt.constants'
import { applyDateContext } from '../../shared/utils/classificationPrompt.utils'
import {
  EXPECTED_INTENTS,
  ICaseRun,
  IEvalCase,
  ROUTER_INTENTS,
  UNKNOWN_INTENT,
  aggregateReport,
  buildCaseMessages,
  buildClassificationRequest,
  filterCases,
  formatComparisonTable,
  loadDataset,
  parseClassifierOutput,
  parseDataset,
  resolveMinutesFromNow,
  scoreCase,
} from '../classifierEval.utils'

const dataset = loadDataset()
const NOW = new Date(dataset.metadata.now)

const findCase = (id: string): IEvalCase => {
  const found = dataset.cases.find((evalCase) => evalCase.id === id)
  if (!found) throw new Error(`case not found: ${id}`)
  return found
}

const baseCase: IEvalCase = {
  id: 'base',
  source: 'synthetic',
  message: 'mensaje',
  expected: { intent: 'task.list' },
  note: 'nota',
}

describe('classifier dataset', () => {
  it('has between 30 and 50 cases with unique ids', () => {
    const ids = dataset.cases.map((evalCase) => evalCase.id)

    expect(dataset.cases.length).toBeGreaterThanOrEqual(30)
    expect(dataset.cases.length).toBeLessThanOrEqual(50)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('declares every phrase as synthetic and says so in the metadata', () => {
    expect(dataset.metadata.description).toMatch(/SINTÉTICAS/)
    expect(dataset.metadata.description).toMatch(/NO son mensajes reales/)
    expect(Object.keys(dataset.metadata.sources).sort()).toEqual(['real', 'synthetic'])

    dataset.cases.forEach((evalCase) => {
      expect(Object.keys(dataset.metadata.sources)).toContain(evalCase.source)
      expect(evalCase.source).toBe('synthetic')
    })
  })

  it('only expects intents the router handles (or its default branch)', () => {
    dataset.cases.forEach((evalCase) => {
      expect(EXPECTED_INTENTS).toContain(evalCase.expected.intent)
      ;(evalCase.expected.alsoAccept ?? []).forEach((intent) => {
        expect(EXPECTED_INTENTS).toContain(intent)
      })
    })
  })

  it('covers every intent of the router and the default branch', () => {
    const covered = new Set(dataset.cases.map((evalCase) => evalCase.expected.intent))

    expect([...ROUTER_INTENTS, UNKNOWN_INTENT].filter((intent) => !covered.has(intent))).toEqual([])
  })

  it('has valid history roles and at least 8 cases that depend on context', () => {
    const contextual = dataset.cases.filter((evalCase) => evalCase.history ?? evalCase.dataContext)

    expect(contextual.length).toBeGreaterThanOrEqual(8)
    dataset.cases.forEach((evalCase) => {
      ;(evalCase.history ?? []).forEach((turn) => {
        expect(['user', 'assistant']).toContain(turn.role)
      })
    })
  })

  it('uses a fixed reference date', () => {
    expect(NOW.toISOString()).toBe('2026-11-10T13:30:00.000Z')
  })

  it('keeps ROUTER_INTENTS in sync with the cases of intentFallbackRouter', () => {
    // Read as text: importing the service would load the DI graph
    const source = fs.readFileSync(
      path.join(__dirname, '../../services/messageProcessor.service.ts'),
      'utf8'
    )
    const start = source.indexOf('private intentFallbackRouter = async')
    const end = source.indexOf('private searchAndSummarize = async')
    const router = source.slice(start, end)
    const cases = [...router.matchAll(/^\s+case '([a-z.]+)': \{$/gm)].map((match) => match[1])

    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(cases.sort()).toEqual([...ROUTER_INTENTS].sort())
  })
})

describe('parseDataset', () => {
  const metadata = {
    name: 'x',
    version: 1,
    now: '2026-11-10T13:30:00.000Z',
    description: 'd',
    sources: { synthetic: 's' },
  }

  it('rejects duplicated ids, undeclared sources and unknown intents', () => {
    expect(() => parseDataset({ metadata, cases: [baseCase, baseCase] })).toThrow(/duplicated id/)
    expect(() => parseDataset({ metadata, cases: [{ ...baseCase, source: 'real' }] })).toThrow(
      /source not declared/
    )
    expect(() =>
      parseDataset({ metadata, cases: [{ ...baseCase, expected: { intent: 'task.delete' } }] })
    ).toThrow(/intent not handled/)
  })

  it('rejects invalid history roles and malformed time checks', () => {
    expect(() =>
      parseDataset({
        metadata,
        cases: [{ ...baseCase, history: [{ role: 'system', content: 'x' }] }],
      })
    ).toThrow(/Invalid classifier dataset/)
    expect(() =>
      parseDataset({
        metadata,
        cases: [
          {
            ...baseCase,
            expected: {
              intent: 'alert.create',
              fields: [{ field: 'time', check: 'time', toleranceMinutes: 1 }],
            },
          },
        ],
      })
    ).toThrow(/exactly one of/)
  })
})

describe('filterCases', () => {
  it('matches by id or expected intent and keeps everything without filter', () => {
    expect(filterCases(dataset.cases)).toHaveLength(dataset.cases.length)
    expect(filterCases(dataset.cases, 'qr-context-link').map((item) => item.id)).toEqual([
      'qr-context-link',
    ])
    expect(
      filterCases(dataset.cases, 'reminder.pause, note.list').map((item) => item.expected.intent)
    ).toEqual(['note.list', 'reminder.pause'])
  })
})

describe('buildCaseMessages', () => {
  it('uses the production prompt with the dataset date', () => {
    const [system, user] = buildCaseMessages(findCase('task-list-typo'), NOW)

    expect(system).toEqual({
      role: 'system',
      content: applyDateContext(assistantPromptFlagsLite2, NOW),
    })
    expect(system.content).toContain('HOY_ES: Tue, 2026-11-10 10:30:00')
    expect(user).toEqual({ role: 'user', content: 'pasame mis taeras' })
  })

  it('appends the history as compact U:/A: lines', () => {
    const [system] = buildCaseMessages(findCase('alert-context-hacela-2h'), NOW)

    expect(system.content.startsWith(applyDateContext(assistantPromptFlagsLite2, NOW))).toBe(true)
    expect(system.content).toContain(
      '\nHISTORIAL:\nU:avisame en 30 minutos que llame a mamá\nA:Alerta creada (fallback) para el martes 10 de noviembre 11:00 con id: #41'
    )
    expect(system.content).not.toContain('\nDATOS_USUARIO:\n')
  })

  it('appends the saved data as DATOS_USUARIO', () => {
    const [system] = buildCaseMessages(findCase('alert-snooze-context-data'), NOW)

    expect(system.content).toContain('\nDATOS_USUARIO:\n[A:2] #12"Reunión con Marta"45m')
    expect(system.content).not.toContain('\nHISTORIAL:\n')
  })

  it('builds the request with the production classification parameters', () => {
    const messages = buildCaseMessages(baseCase, NOW)

    expect(buildClassificationRequest('gpt-4.1-mini', messages)).toEqual({
      model: 'gpt-4.1-mini',
      messages,
      temperature: 0,
      max_tokens: 400,
    })
  })
})

describe('parseClassifierOutput', () => {
  it('parses plain and fenced JSON and lowercases the intent', () => {
    expect(parseClassifierOutput('{"intent":"Task.List"}')).toEqual({
      ok: true,
      intent: 'task.list',
      parsed: { intent: 'Task.List' },
    })
    expect(parseClassifierOutput('```json\n{"intent":"question"}\n```')).toMatchObject({
      ok: true,
      intent: 'question',
    })
  })

  it('recovers JSON surrounded by text and with a trailing comma', () => {
    expect(parseClassifierOutput('Claro: {"intent":"note.list","tag":"x",} listo')).toEqual({
      ok: true,
      intent: 'note.list',
      parsed: { intent: 'note.list', tag: 'x' },
    })
  })

  it('reports unusable outputs', () => {
    expect(parseClassifierOutput('')).toEqual({ ok: false, reason: 'empty_response' })
    expect(parseClassifierOutput(null)).toEqual({ ok: false, reason: 'empty_response' })
    expect(parseClassifierOutput('no sé qué hacer')).toEqual({ ok: false, reason: 'invalid_json' })
    expect(parseClassifierOutput('{"intent":"alert.create","time":"2h"')).toEqual({
      ok: false,
      reason: 'invalid_json',
    })
    expect(parseClassifierOutput('{"title":"x"}')).toEqual({ ok: false, reason: 'missing_intent' })
    expect(parseClassifierOutput('{"intent":5}')).toEqual({ ok: false, reason: 'missing_intent' })
  })
})

describe('resolveMinutesFromNow', () => {
  it('resolves relative durations, Argentina dates and unknown formats', () => {
    expect(resolveMinutesFromNow('2h', NOW)).toBe(120)
    expect(resolveMinutesFromNow('1h30m', NOW)).toBe(90)
    expect(resolveMinutesFromNow('1w2d', NOW)).toBe(9 * 1440)
    expect(resolveMinutesFromNow('2026-11-10 12:30', NOW)).toBe(120)
    expect(resolveMinutesFromNow('2026-11-11T09:00:00', NOW)).toBe(22.5 * 60)
    expect(resolveMinutesFromNow('2026-11-11', NOW)).toBe(13.5 * 60)
    expect(resolveMinutesFromNow('más tarde', NOW)).toBeNull()
    expect(resolveMinutesFromNow('', NOW)).toBeNull()
  })
})

// Everything below feeds hand-written outputs to the scorer. It tests the scoring code only and
// says nothing about how any real model performs.
describe('scoreCase (mock outputs)', () => {
  it('passes when intent and fields match, with relative or absolute time', () => {
    const evalCase = findCase('alert-create-relative')

    expect(
      scoreCase(evalCase, '{"intent":"alert.create","time":"20m","title":"Sacar la pizza"}', NOW)
    ).toMatchObject({ intentMatch: true, pass: true, parseStatus: 'ok' })
    expect(
      scoreCase(
        evalCase,
        '{"intent":"alert.create","time":"2026-11-10 10:50","title":"Pizza del horno"}',
        NOW
      ).pass
    ).toBe(true)
  })

  it('fails the fields but keeps the intent match', () => {
    const score = scoreCase(
      findCase('alert-create-tomorrow'),
      '{"intent":"alert.create","time":"2026-11-11 21:00","title":"que diga llamar"}',
      NOW
    )

    expect(score.intentMatch).toBe(true)
    expect(score.pass).toBe(false)
    expect(score.fieldResults.map((field) => field.pass)).toEqual([false, false])
    expect(score.fieldResults[0].detail).toContain('2026-11-11 09:00')
  })

  it('fails on a wrong intent without evaluating fields', () => {
    const score = scoreCase(
      findCase('alert-vs-reminder-oneshot'),
      '{"intent":"reminder.create","message":"pagar las expensas"}',
      NOW
    )

    expect(score).toMatchObject({
      predictedIntent: 'reminder.create',
      intentMatch: false,
      pass: false,
      fieldResults: [],
    })
  })

  it('maps intents the router does not handle to unknown', () => {
    const evalCase = findCase('unknown-task-delete')

    expect(scoreCase(evalCase, '{"intent":"task.delete","targetId":58}', NOW)).toMatchObject({
      predictedIntent: 'unknown',
      rawIntent: 'task.delete',
      pass: true,
      matchedAlternative: false,
    })
    expect(scoreCase(evalCase, '{"intent":"question"}', NOW)).toMatchObject({
      pass: true,
      matchedAlternative: true,
    })
    expect(scoreCase(evalCase, '{"intent":"task.list"}', NOW).pass).toBe(false)
  })

  it('normalizes ids, tags, urls, time of day and lists', () => {
    expect(
      scoreCase(findCase('reminder-pause-context'), '{"intent":"reminder.pause","id":"#6"}', NOW)
        .pass
    ).toBe(true)
    expect(
      scoreCase(findCase('reminder-pause-context'), '{"intent":"reminder.pause"}', NOW).pass
    ).toBe(false)
    expect(
      scoreCase(
        findCase('link-create-tag'),
        '{"intent":"link.create","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","tag":"Música"}',
        NOW
      ).pass
    ).toBe(true)
    expect(
      scoreCase(
        findCase('link-create-tag'),
        '{"intent":"link.create","url":"https://www.youtube.com/watch?v=dqw4w9wgxcq","tag":"musica"}',
        NOW
      ).pass
    ).toBe(false)
    expect(
      scoreCase(
        findCase('reminder-create-daily'),
        '{"intent":"reminder.create","message":"Tomar la pastilla","recurrenceType":"daily","timeOfDay":"8:00"}',
        NOW
      ).pass
    ).toBe(true)

    const weekly: IEvalCase = {
      ...baseCase,
      expected: {
        intent: 'reminder.create',
        fields: [{ field: 'weekDays', check: 'sameElements', value: ['monday', 'thursday'] }],
      },
    }
    expect(
      scoreCase(weekly, '{"intent":"reminder.create","weekDays":["Thursday","monday"]}', NOW).pass
    ).toBe(true)
    expect(scoreCase(weekly, '{"intent":"reminder.create","weekDays":["monday"]}', NOW).pass).toBe(
      false
    )
  })

  it('reads translate fields from parameters like the router does', () => {
    expect(
      scoreCase(
        findCase('translate'),
        '{"intent":"translate","parameters":{"targetLang":"english","text":"mañana no voy a poder ir a la reunión"}}',
        NOW
      ).pass
    ).toBe(true)
    // Other intents are read at the top level only
    expect(
      scoreCase(
        findCase('task-create-simple'),
        '{"intent":"task.create","parameters":{"title":"Renovar el registro"}}',
        NOW
      ).pass
    ).toBe(false)
  })

  it('marks unusable outputs', () => {
    expect(scoreCase(baseCase, 'texto libre', NOW)).toMatchObject({
      parseStatus: 'invalid_json',
      predictedIntent: null,
      pass: false,
    })
  })
})

describe('aggregateReport (mock outputs)', () => {
  const run = (
    evalCase: IEvalCase,
    rawOutput: string | null,
    extra?: Partial<ICaseRun>
  ): ICaseRun => ({
    score: scoreCase(evalCase, rawOutput, NOW),
    rawOutput,
    ...extra,
  })
  const usage = { promptTokens: 100, completionTokens: 20, totalTokens: 120 }

  const runs: ICaseRun[] = [
    run(findCase('task-list-typo'), '{"intent":"task.list"}', { latencyMs: 100, usage }),
    run(findCase('note-list'), '{"intent":"task.list"}', { latencyMs: 300, usage }),
    run(findCase('alert-create-relative'), '{"intent":"alert.create","time":"5h","title":"pizza"}'),
    run(findCase('alert-list-typo'), 'no es json', { finishReason: 'length' }),
    run(findCase('link-list'), '', { finishReason: 'stop' }),
    run(findCase('question-general'), null, { error: 'HTTP 500' }),
  ]
  const report = aggregateReport('mock-model', runs)

  it('counts accuracy, invalid outputs and request errors', () => {
    expect(report).toMatchObject({
      model: 'mock-model',
      total: 6,
      answered: 5,
      requestErrors: 1,
      intentCorrect: 2,
      intentAccuracy: 0.3333,
      fullCorrect: 1,
      fullAccuracy: 0.1667,
      invalidJson: 2,
      invalidJsonByReason: { empty_response: 1, invalid_json: 1, missing_intent: 0 },
      truncated: 1,
    })
  })

  it('reports per intent stats and per case failures', () => {
    expect(report.perIntent['task.list']).toEqual({
      total: 1,
      intentCorrect: 1,
      fullCorrect: 1,
      intentAccuracy: 1,
    })
    expect(report.perIntent['alert.create']).toEqual({
      total: 1,
      intentCorrect: 1,
      fullCorrect: 0,
      intentAccuracy: 1,
    })
    expect(report.failures.map((failure) => failure.id)).toEqual([
      'note-list',
      'alert-create-relative',
      'alert-list-typo',
      'link-list',
      'question-general',
    ])
    expect(report.failures[0].reasons).toEqual(['intent: expected note.list, got task.list'])
    expect(report.failures[1].reasons[0]).toContain('field time (time)')
    expect(report.failures[2].reasons).toEqual(['unusable output: invalid_json'])
    expect(report.failures[4].reasons).toEqual(['request error: HTTP 500'])
  })

  it('totals latency and tokens only when available', () => {
    expect(report.latency).toEqual({ measured: 2, totalMs: 400, avgMs: 200, maxMs: 300 })
    expect(report.tokens).toEqual({
      measured: 2,
      promptTokens: 200,
      completionTokens: 40,
      totalTokens: 240,
    })

    const bare = aggregateReport('bare', [run(findCase('note-list'), '{"intent":"note.list"}')])
    expect(bare.latency).toBeNull()
    expect(bare.tokens).toBeNull()
    expect(bare.failures).toEqual([])
  })

  it('renders one table row per model', () => {
    const table = formatComparisonTable([report, aggregateReport('other', runs.slice(0, 1))])
    const lines = table.split('\n')

    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^modelo\s+casos\s+intent ok/)
    expect(lines[2]).toMatch(
      /^mock-model\s+6\s+2 \(33\.3%\)\s+1 \(16\.7%\)\s+2\s+1\s+200 ms\s+240$/
    )
    expect(lines[3]).toMatch(/^other\s+1\s+1 \(100\.0%\)\s+1 \(100\.0%\)\s+0\s+0\s+100 ms\s+120$/)
  })
})
