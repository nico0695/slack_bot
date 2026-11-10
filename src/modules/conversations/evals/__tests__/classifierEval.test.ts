import * as fs from 'fs'
import * as path from 'path'

import {
  DEFAULT_MODELS,
  DEFAULT_OUTPUT_FILE,
  IClassifierClient,
  MISSING_KEY_MESSAGE,
  REAL_RUN_NOTICE,
  parseRunnerArgs,
  runClassifierEval,
} from '../classifierEval'
import { IClassificationRequest, loadDataset } from '../classifierEval.utils'

const FAKE_KEY = 'sk-test-not-a-real-key'

interface IHarness {
  lines: string[]
  written: Array<{ filePath: string; content: string }>
  createClient: jest.Mock
  requests: IClassificationRequest[]
  run: (argv: string[], env: Record<string, string | undefined>) => Promise<number>
}

// The client is always a stub: these tests never reach the network and prove nothing about any
// real model
const buildHarness = (complete?: IClassifierClient['complete']): IHarness => {
  const lines: string[] = []
  const written: IHarness['written'] = []
  const requests: IClassificationRequest[] = []
  const createClient = jest.fn(
    (): IClassifierClient => ({
      complete: async (request) => {
        requests.push(request)
        return complete
          ? await complete(request)
          : { content: '{"intent":"question"}', finishReason: 'stop' }
      },
    })
  )
  let tick = 0

  return {
    lines,
    written,
    createClient,
    requests,
    run: async (argv, env) =>
      await runClassifierEval({
        argv,
        env,
        print: (line) => lines.push(line),
        createClient,
        writeReport: (filePath, content) => written.push({ filePath, content }),
        clock: () => (tick += 50),
      }),
  }
}

describe('parseRunnerArgs', () => {
  it('uses the defaults', () => {
    expect(parseRunnerArgs([], {})).toMatchObject({
      models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      filter: undefined,
      out: DEFAULT_OUTPUT_FILE,
      help: false,
    })
    expect(DEFAULT_MODELS).toEqual(['gpt-4o-mini', 'gpt-4.1-mini'])
  })

  it('reads flags over env', () => {
    expect(
      parseRunnerArgs(['--models', 'a, b,a', '--filter=alert', '--out', 'x.json'], {
        EVAL_MODELS: 'c',
        EVAL_FILTER: 'task',
        EVAL_OUTPUT: 'y.json',
      })
    ).toMatchObject({ models: ['a', 'b'], filter: 'alert', out: 'x.json' })
    expect(parseRunnerArgs([], { EVAL_MODELS: 'c', EVAL_FILTER: 'task' })).toMatchObject({
      models: ['c'],
      filter: 'task',
    })
  })

  it('rejects unknown flags and missing values', () => {
    expect(() => parseRunnerArgs(['--nope'], {})).toThrow(/Opción desconocida/)
    expect(() => parseRunnerArgs(['--models'], {})).toThrow(/Falta el valor/)
  })
})

describe('runClassifierEval', () => {
  it.each([[undefined], [''], ['   ']])(
    'exits with 1 and calls nothing when OPENAI_API_KEY is %p',
    async (key) => {
      const harness = buildHarness()

      const code = await harness.run([], { OPENAI_API_KEY: key })

      expect(code).toBe(1)
      expect(harness.lines).toEqual([MISSING_KEY_MESSAGE])
      expect(harness.createClient).not.toHaveBeenCalled()
      expect(harness.requests).toEqual([])
      expect(harness.written).toEqual([])
    }
  )

  it('exits with 2 on invalid usage or an empty filter result', async () => {
    const harness = buildHarness()

    expect(await harness.run(['--nope'], { OPENAI_API_KEY: FAKE_KEY })).toBe(2)
    expect(await harness.run(['--filter', 'zzz-none'], { OPENAI_API_KEY: FAKE_KEY })).toBe(2)
    expect(harness.requests).toEqual([])
  })

  it('prints the usage with --help without needing a key', async () => {
    const harness = buildHarness()

    expect(await harness.run(['--help'], {})).toBe(0)
    expect(harness.lines[0]).toContain('--models')
    expect(harness.createClient).not.toHaveBeenCalled()
  })

  it('sends one classification request per case and model (stub client)', async () => {
    const harness = buildHarness()
    const total = loadDataset().cases.length

    const code = await harness.run(['--out', 'out/report.json'], {
      OPENAI_API_KEY: FAKE_KEY,
      OPENAI_ORGANIZATION: 'org-x',
    })

    expect(code).toBe(0)
    expect(harness.createClient).toHaveBeenCalledTimes(1)
    expect(harness.createClient).toHaveBeenCalledWith(FAKE_KEY, 'org-x')
    expect(harness.requests).toHaveLength(total * 2)
    expect(new Set(harness.requests.map((request) => request.model))).toEqual(
      new Set(['gpt-4o-mini', 'gpt-4.1-mini'])
    )
    harness.requests.forEach((request) => {
      expect(request.temperature).toBe(0)
      expect(request.max_tokens).toBe(400)
      expect(request.messages.map((message) => message.role)).toEqual(['system', 'user'])
    })
  })

  it('prints the table and the notice, writes the report and never shows the key', async () => {
    const harness = buildHarness(async (request) => ({
      content: request.model === 'model-a' ? '{"intent":"note.list"}' : 'no json',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }))

    const code = await harness.run(
      ['--models', 'model-a,model-b', '--filter', 'note-list', '--out', 'out/report.json'],
      { OPENAI_API_KEY: FAKE_KEY }
    )
    const output = harness.lines.join('\n')

    expect(code).toBe(0)
    expect(output).toMatch(/model-a\s+1\s+1 \(100\.0%\)\s+1 \(100\.0%\)\s+0\s+0\s+50 ms\s+15/)
    expect(output).toMatch(/model-b\s+1\s+0 \(0\.0%\)\s+0 \(0\.0%\)\s+1\s+0\s+50 ms\s+15/)
    expect(output).toContain('- note-list: unusable output: invalid_json')
    expect(harness.lines[harness.lines.length - 1]).toContain(REAL_RUN_NOTICE)
    expect(output).not.toContain(FAKE_KEY)

    expect(harness.written).toHaveLength(1)
    expect(harness.written[0].filePath).toBe(path.resolve('out/report.json'))
    expect(harness.written[0].content).not.toContain(FAKE_KEY)

    const report = JSON.parse(harness.written[0].content)
    expect(report.notice).toBe(REAL_RUN_NOTICE)
    expect(report.dataset).toMatchObject({ evaluatedCases: 1, sources: ['synthetic'] })
    expect(report.models.map((model: any) => [model.model, model.fullCorrect])).toEqual([
      ['model-a', 1],
      ['model-b', 0],
    ])
    expect(report.models[0].cases[0]).toMatchObject({
      id: 'note-list',
      pass: true,
      rawOutput: '{"intent":"note.list"}',
      latencyMs: 50,
    })
  })

  it('counts request errors, hides their details and stops a model on a fatal status', async () => {
    const harness = buildHarness(async (request) => {
      if (request.model === 'model-fatal') {
        throw Object.assign(new Error(`Incorrect API key provided: ${FAKE_KEY}`), {
          config: { headers: { Authorization: `Bearer ${FAKE_KEY}` } },
          response: {
            status: 401,
            data: { error: { code: 'invalid_api_key', message: `bad key ${FAKE_KEY}` } },
          },
        })
      }
      throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    })

    const code = await harness.run(
      ['--models', 'model-fatal,model-flaky', '--filter', 'reminder.'],
      { OPENAI_API_KEY: FAKE_KEY }
    )
    const output = harness.lines.join('\n')
    const report = JSON.parse(harness.written[0].content)
    const reminderCases: number = report.dataset.evaluatedCases

    expect(code).toBe(1)
    expect(reminderCases).toBeGreaterThan(1)
    // One request for the aborted model, one per case for the other
    expect(harness.requests).toHaveLength(1 + reminderCases)
    expect(output).toContain('HTTP 401 (invalid_api_key)')
    expect(output).toContain('request error: ECONNRESET')
    expect(output).not.toContain(FAKE_KEY)
    expect(harness.written[0].content).not.toContain(FAKE_KEY)
    expect(report.models[0]).toMatchObject({
      aborted: 'HTTP 401 (invalid_api_key)',
      requestErrors: reminderCases,
      invalidJson: 0,
    })
    expect(report.models[1]).toMatchObject({ aborted: null, requestErrors: reminderCases })
  })
})

describe('eval import graph', () => {
  // Static walk of the relative imports reachable from the runner: nothing that opens
  // connections or executes assistant actions may be loaded
  const collect = (file: string, seen: Set<string>, bare: Set<string>): void => {
    if (seen.has(file)) return
    seen.add(file)

    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/(?:from|require\()\s*'([^']+)'/g)) {
      const target = match[1]
      if (!target.startsWith('.')) {
        bare.add(target)
        continue
      }
      const base = path.resolve(path.dirname(file), target)
      const resolved = [`${base}.ts`, path.join(base, 'index.ts')].find((candidate) =>
        fs.existsSync(candidate)
      )
      if (!resolved) throw new Error(`cannot resolve ${target} from ${file}`)
      collect(resolved, seen, bare)
    }
  }

  it('loads no service, repository, DI container, database, Redis or Slack module', () => {
    const seen = new Set<string>()
    const bare = new Set<string>()
    collect(path.join(__dirname, '../classifierEval.ts'), seen, bare)

    const files = [...seen].map((file) => path.relative(path.join(__dirname, '../../../..'), file))

    expect(files.length).toBeGreaterThan(5)
    expect(
      files.filter((file) =>
        /(^|\/)(services|repositories|controller|config)\/|(^|\/)(app|index)\.ts$/.test(file)
      )
    ).toEqual([])
    // typeorm arrives through the entity classes used as types; decorators only, no DataSource
    expect([...bare].sort()).toEqual(['dotenv', 'fs', 'openai', 'path', 'typeorm', 'zod'])
  })
})
