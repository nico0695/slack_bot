import MessageProcessor, { QUESTION_DATA_HEADER } from '../messageProcessor.service'
import AssistantSingleShotService from '../assistantSingleShot.service'
import { roleTypes } from '../../shared/constants/openai'
import { ConversationProviders } from '../../shared/constants/conversationFlow'
import { ASSISTANT_CONTEXT_MAX_ENTRIES } from '../../shared/constants/assistantContext.constants'
import {
  assistantQuestionContextRules,
  assistantQuestionPrompt,
} from '../../shared/constants/prompt.constants'
import { IAssistantContextEntry } from '../../shared/interfaces/converstions'
import { DATA_CONTEXT_OMITTED_NOTICE } from '../../shared/utils/assistantContext.utils'

const mockLogFns = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: (...args: any[]) => mockLogFns.info(...args),
    error: (...args: any[]) => mockLogFns.error(...args),
    warn: (...args: any[]) => mockLogFns.warn(...args),
    debug: (...args: any[]) => mockLogFns.debug(...args),
    fatal: (...args: any[]) => mockLogFns.fatal(...args),
  }),
}))

const buildBlocksMock = (): { blocks: any[] } => ({ blocks: [] as any[] })

jest.mock('../../../../shared/utils/slackMessages.utils', () => ({
  msgAlertsList: jest.fn(() => buildBlocksMock()),
  msgAlertCreated: jest.fn(() => buildBlocksMock()),
  msgTasksList: jest.fn(() => buildBlocksMock()),
  msgTaskCreated: jest.fn(() => buildBlocksMock()),
  msgNotesList: jest.fn(() => buildBlocksMock()),
  msgNoteCreated: jest.fn(() => buildBlocksMock()),
  msgLinksList: jest.fn(() => buildBlocksMock()),
  msgLinkCreated: jest.fn(() => buildBlocksMock()),
}))

jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: { client: { chat: { postMessage: jest.fn() } } },
}))

const REQUEST_ID = '9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b'
const DATE_LINE_REGEX = /HOY_ES: [A-Z][a-z]{2}, \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\n$/

const aiRepositoryMock = { chatCompletion: jest.fn() }
const alertsServicesMock = { getAlertsByUserId: jest.fn(), createAssistantAlert: jest.fn() }
const tasksServicesMock = { getTasksByUserId: jest.fn() }
const notesServicesMock = { getNotesByUserId: jest.fn(), createAssistantNote: jest.fn() }
const linksServicesMock = { getLinksByUserId: jest.fn() }
const redisRepositoryMock = { getAssistantContext: jest.fn(), appendAssistantContext: jest.fn() }

// Mirrors the real store: per-user list, atomic append + trim
class FakeContextRepository {
  private store = new Map<number, IAssistantContextEntry[]>()

  getAssistantContext = jest.fn(
    async (userId: number): Promise<IAssistantContextEntry[]> => [...(this.store.get(userId) ?? [])]
  )

  appendAssistantContext = jest.fn(
    async (userId: number, entries: IAssistantContextEntry[]): Promise<boolean> => {
      const next = [...(this.store.get(userId) ?? []), ...entries]
      this.store.set(userId, next.slice(-ASSISTANT_CONTEXT_MAX_ENTRIES))
      return true
    }
  )

  entries = (userId: number): IAssistantContextEntry[] => this.store.get(userId) ?? []
}

const buildProcessor = (redisRepository: any = redisRepositoryMock): MessageProcessor =>
  new MessageProcessor(
    aiRepositoryMock as any,
    alertsServicesMock as any,
    {} as any, // alertInteractionsService
    tasksServicesMock as any,
    notesServicesMock as any,
    linksServicesMock as any,
    {} as any, // remindersServices
    {} as any, // imagesServices
    {} as any, // searchRepository
    {} as any, // translateServices
    {} as any, // qrServices
    redisRepository
  )

const alertFixture = {
  id: 11,
  message: 'pagar la luz',
  date: new Date('2026-11-10T12:30:00Z'),
  sent: false,
  createdAt: new Date('2026-11-01T12:00:00Z'),
}

const taskFixture = {
  id: 22,
  title: 'renovar pasaporte',
  description: 'llevar fotos carnet',
  tag: 'tramites',
  status: 'in_progress',
  alertDate: null as Date | null,
  createdAt: new Date('2026-11-02T15:00:00Z'),
}

const noteFixture = {
  id: 33,
  title: 'clave del wifi',
  description: 'está pegada en el router',
  tag: 'casa',
  createdAt: new Date('2026-11-03T15:00:00Z'),
}

const linkFixture = {
  id: 44,
  url: 'https://example.com/articulo-de-typescript',
  title: 'guía de typescript',
  description: 'leer el capítulo de genéricos',
  tag: 'dev',
  status: 'unread',
  createdAt: new Date('2026-11-04T15:00:00Z'),
}

const mockSavedData = (): void => {
  alertsServicesMock.getAlertsByUserId.mockResolvedValue({ data: [alertFixture] })
  tasksServicesMock.getTasksByUserId.mockResolvedValue({ data: [taskFixture] })
  notesServicesMock.getNotesByUserId.mockResolvedValue({ data: [noteFixture] })
  linksServicesMock.getLinksByUserId.mockResolvedValue({ data: [linkFixture] })
}

const ANSWER = 'respuesta generada'

// Classification calls return the given raw content; the rest are answered
const mockAi = (classification = '{"intent":"question"}'): void => {
  aiRepositoryMock.chatCompletion.mockImplementation(
    async (_messages: any[], options?: { mode?: string }) => {
      if (options?.mode === 'classification') {
        return { role: roleTypes.assistant, content: classification }
      }
      return {
        role: roleTypes.assistant,
        content: ANSWER,
        provider: ConversationProviders.ASSISTANT,
      }
    }
  )
}

const classificationCalls = (): any[][] =>
  aiRepositoryMock.chatCompletion.mock.calls.filter(
    ([, options]) => options?.mode === 'classification'
  )

// Messages of every non-classification call, in order
const answerCalls = (): any[][] =>
  aiRepositoryMock.chatCompletion.mock.calls
    .filter(([, options]) => options?.mode !== 'classification')
    .map(([messages]) => messages)

const lastAnswerMessages = (): any[] => {
  const calls = answerCalls()
  return calls[calls.length - 1]
}

const previousTurns: IAssistantContextEntry[] = [
  { role: roleTypes.user, content: 'anotá que el wifi cambió' },
  { role: roleTypes.assistant, content: 'Nota creada correctamente con id: #33' },
]

beforeEach(() => {
  jest.resetAllMocks()

  redisRepositoryMock.getAssistantContext.mockResolvedValue([])
  redisRepositoryMock.appendAssistantContext.mockResolvedValue(true)

  alertsServicesMock.getAlertsByUserId.mockResolvedValue({ data: [] })
  tasksServicesMock.getTasksByUserId.mockResolvedValue({ data: [] })
  notesServicesMock.getNotesByUserId.mockResolvedValue({ data: [] })
  linksServicesMock.getLinksByUserId.mockResolvedValue({ data: [] })
})

describe.each([
  ['.q variable', '.q ¿qué tengo guardado sobre el wifi?'],
  ['.question variable', '.question ¿qué tengo guardado sobre el wifi?'],
  ['question intent', '¿qué tengo guardado sobre el wifi?'],
])('MessageProcessor - question answering (%s)', (_name, message) => {
  const QUESTION = '¿qué tengo guardado sobre el wifi?'
  const usesClassifier = !message.startsWith('.')

  it('sends system, previous turns, saved data and the question in that order', async () => {
    mockAi()
    mockSavedData()
    redisRepositoryMock.getAssistantContext.mockResolvedValue(previousTurns)

    const result = await buildProcessor().processAssistantMessage(message, 7)

    expect(result.response?.content).toBe(ANSWER)
    expect(answerCalls()).toHaveLength(1)

    const messages = lastAnswerMessages()
    expect(messages.map((item) => item.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'user',
    ])
    expect(messages.slice(1, 3)).toEqual(previousTurns)
    expect(messages[4]).toEqual({ role: 'user', content: QUESTION })

    // Answering is a default-mode call
    const answerCall = aiRepositoryMock.chatCompletion.mock.calls.find(
      ([, options]) => options?.mode !== 'classification'
    )
    expect(answerCall?.[1]).toBeUndefined()
  })

  it('keeps data and history out of the system message, stable text before the date', async () => {
    mockAi()
    mockSavedData()
    redisRepositoryMock.getAssistantContext.mockResolvedValue(previousTurns)

    await buildProcessor().processAssistantMessage(message, 7)

    const system: string = lastAnswerMessages()[0].content
    const stable = assistantQuestionPrompt.split('HOY_ES: <fecha>')[0]

    expect(system.startsWith(stable)).toBe(true)
    expect(stable.endsWith(assistantQuestionContextRules)).toBe(true)
    expect(system.slice(stable.length)).toMatch(DATE_LINE_REGEX)
    expect(system).not.toContain('<fecha>')

    expect(system).not.toContain(QUESTION_DATA_HEADER)
    ;[
      'pagar la luz',
      'renovar pasaporte',
      'clave del wifi',
      'guía de typescript',
      'anotá que el wifi cambió',
      'Nota creada correctamente',
      QUESTION,
    ].forEach((text) => {
      expect(system).not.toContain(text)
    })
  })

  it('puts the saved records in a delimited user message', async () => {
    mockAi()
    mockSavedData()

    await buildProcessor().processAssistantMessage(message, 7)

    const messages = lastAnswerMessages()
    expect(messages.map((item) => item.role)).toEqual(['system', 'user', 'user'])

    const data: string = messages[1].content
    expect(data.startsWith(`${QUESTION_DATA_HEADER}\n`)).toBe(true)
    expect(data).toContain(
      [
        'ALERTAS (1)',
        '- #11 | mensaje: pagar la luz | estado: pendiente | fecha: 2026-11-10 09:30',
      ].join('\n')
    )
    expect(data).toContain(
      [
        'TAREAS (1)',
        '- #22 | título: renovar pasaporte | descripción: llevar fotos carnet | etiqueta: tramites | estado: in_progress | fecha: 2026-11-02 12:00',
      ].join('\n')
    )
    expect(data).toContain(
      [
        'NOTAS (1)',
        '- #33 | título: clave del wifi | descripción: está pegada en el router | etiqueta: casa | fecha: 2026-11-03 12:00',
      ].join('\n')
    )
    expect(data).toContain(
      [
        'LINKS (1)',
        '- #44 | título: guía de typescript | descripción: leer el capítulo de genéricos | etiqueta: dev | estado: unread | fecha: 2026-11-04 12:00 | url: https://example.com/articulo-de-typescript',
      ].join('\n')
    )
    expect(data).not.toContain('AVISO')
  })

  it('fetches personal-only data and loads the personal context once', async () => {
    mockAi()

    await buildProcessor().processAssistantMessage(message, 7)

    expect(alertsServicesMock.getAlertsByUserId).toHaveBeenLastCalledWith(7, {
      sent: false,
      channelId: null,
    })
    expect(tasksServicesMock.getTasksByUserId).toHaveBeenLastCalledWith(7, { channelId: null })
    expect(notesServicesMock.getNotesByUserId).toHaveBeenLastCalledWith(7, { channelId: null })
    expect(linksServicesMock.getLinksByUserId).toHaveBeenLastCalledWith(7, { channelId: null })
    expect(redisRepositoryMock.getAssistantContext).toHaveBeenCalledTimes(1)
    expect(redisRepositoryMock.getAssistantContext).toHaveBeenCalledWith(7)
  })

  it('uses the channel data and history for a channel request, never the personal context', async () => {
    mockAi()
    redisRepositoryMock.getAssistantContext.mockResolvedValue(previousTurns)
    const channelHistory: any[] = [
      { role: roleTypes.system, content: 'mensaje de sistema', provider: 'assistant' },
      { role: roleTypes.user, content: 'hola canal', userSlackId: 'U1', provider: 'slack' },
      {
        role: roleTypes.assistant,
        content: 'contenido con bloques',
        plainText: 'texto plano',
        contentBlock: { blocks: [{ type: 'section' }] },
        provider: 'assistant',
      },
    ]

    const result = await buildProcessor().processAssistantMessage(
      message,
      7,
      ' C123 ',
      true,
      channelHistory
    )

    expect(result.response?.content).toBe(ANSWER)
    expect(redisRepositoryMock.getAssistantContext).not.toHaveBeenCalled()
    expect(redisRepositoryMock.appendAssistantContext).not.toHaveBeenCalled()

    expect(alertsServicesMock.getAlertsByUserId).toHaveBeenLastCalledWith(7, {
      sent: false,
      channelId: 'C123',
    })
    expect(tasksServicesMock.getTasksByUserId).toHaveBeenLastCalledWith(7, { channelId: 'C123' })
    expect(notesServicesMock.getNotesByUserId).toHaveBeenLastCalledWith(7, { channelId: 'C123' })
    expect(linksServicesMock.getLinksByUserId).toHaveBeenLastCalledWith(7, { channelId: 'C123' })

    const messages = lastAnswerMessages()
    expect(messages.slice(1, 3)).toEqual([
      { role: 'user', content: 'hola canal' },
      { role: 'assistant', content: 'texto plano' },
    ])
    expect(messages).toHaveLength(5)
    expect(JSON.stringify(messages)).not.toContain('anotá que el wifi cambió')
  })

  it('sends at most the last 6 channel turns', async () => {
    mockAi()
    const channelHistory: any[] = Array.from({ length: 9 }, (_item, index) => ({
      role: index % 2 === 0 ? roleTypes.user : roleTypes.assistant,
      content: `turno ${index}`,
      provider: 'slack',
    }))

    await buildProcessor().processAssistantMessage(message, 7, 'C123', true, channelHistory)

    const messages = lastAnswerMessages()
    expect(messages.slice(1, -2).map((item) => item.content)).toEqual([
      'turno 3',
      'turno 4',
      'turno 5',
      'turno 6',
      'turno 7',
      'turno 8',
    ])
  })

  it.each([
    [
      'returns an error',
      () => notesServicesMock.getNotesByUserId.mockResolvedValue({ error: 'Error al obtener' }),
    ],
    ['throws', () => notesServicesMock.getNotesByUserId.mockRejectedValue(new Error('db caída'))],
  ])('still answers when one service %s, marking it unavailable', async (_case, breakNotes) => {
    mockAi()
    mockSavedData()
    // The classifier context also reads notes; only the question fetch (personal scope) fails
    if (usesClassifier) {
      notesServicesMock.getNotesByUserId.mockResolvedValueOnce({ data: [] })
    }
    breakNotes()

    const result = await buildProcessor().processAssistantMessage(message, 7)

    expect(result.response?.content).toBe(ANSWER)

    const data: string = lastAnswerMessages().slice(-2)[0].content
    expect(data).toContain('NOTAS (no disponible)')
    expect(data).not.toContain('clave del wifi')
    expect(data).toContain('ALERTAS (1)')
    expect(data).toContain('TAREAS (1)')
    expect(data).toContain('LINKS (1)')
    expect(data.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
  })

  it('still answers when every service fails', async () => {
    mockAi()
    if (usesClassifier) {
      alertsServicesMock.getAlertsByUserId.mockResolvedValueOnce({ data: [] })
      tasksServicesMock.getTasksByUserId.mockResolvedValueOnce({ data: [] })
      notesServicesMock.getNotesByUserId.mockResolvedValueOnce({ data: [] })
      linksServicesMock.getLinksByUserId.mockResolvedValueOnce({ data: [] })
    }
    alertsServicesMock.getAlertsByUserId.mockRejectedValue(new Error('db caída'))
    tasksServicesMock.getTasksByUserId.mockResolvedValue({ error: 'x' })
    notesServicesMock.getNotesByUserId.mockRejectedValue(new Error('db caída'))
    linksServicesMock.getLinksByUserId.mockResolvedValue({ error: 'x' })

    const result = await buildProcessor().processAssistantMessage(message, 7)

    expect(result.response?.content).toBe(ANSWER)
    const data: string = lastAnswerMessages().slice(-2)[0].content
    ;['ALERTAS', 'TAREAS', 'NOTAS', 'LINKS'].forEach((section) => {
      expect(data).toContain(`${section} (no disponible)`)
    })
  })

  it('reports the total when a type has more than 20 records', async () => {
    mockAi()
    tasksServicesMock.getTasksByUserId.mockResolvedValue({
      data: Array.from({ length: 25 }, (_item, index) => ({
        ...taskFixture,
        id: index + 1,
        title: `tarea ${index + 1}`,
        createdAt: new Date(Date.UTC(2026, 9, 1, 12, index)),
      })),
    })

    await buildProcessor().processAssistantMessage(message, 7)

    const data: string = lastAnswerMessages().slice(-2)[0].content
    expect(data).toContain('TAREAS (mostrando 20 de 25)')
    expect(data.split('\n').filter((line) => line.startsWith('- #'))).toHaveLength(20)
    expect(data.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
  })

  it('still answers when the personal context cannot be read', async () => {
    mockAi()
    redisRepositoryMock.getAssistantContext.mockRejectedValue(new Error('redis caído'))

    const result = await buildProcessor().processAssistantMessage(message, 7)

    expect(result.response?.content).toBe(ANSWER)
    expect(lastAnswerMessages().map((item) => item.role)).toEqual(['system', 'user', 'user'])
  })

  it('records the exchange in the personal context', async () => {
    mockAi()

    await buildProcessor().processAssistantMessage(message, 7)

    expect(redisRepositoryMock.appendAssistantContext).toHaveBeenCalledTimes(1)
    expect(redisRepositoryMock.appendAssistantContext).toHaveBeenCalledWith(7, [
      { role: 'user', content: message },
      { role: 'assistant', content: ANSWER },
    ])
  })
})

describe('MessageProcessor - question answering failures', () => {
  it('.q throws when the AI gives no answer', async () => {
    aiRepositoryMock.chatCompletion.mockResolvedValue(null)

    await expect(buildProcessor().processAssistantMessage('.q hola', 7)).rejects.toThrow(
      'No se pudo generar la respuesta'
    )
    expect(redisRepositoryMock.appendAssistantContext).not.toHaveBeenCalled()
  })

  it('question intent returns no response when the AI gives no answer', async () => {
    aiRepositoryMock.chatCompletion.mockImplementation(
      async (_messages: any[], options?: { mode?: string }) =>
        options?.mode === 'classification'
          ? { role: roleTypes.assistant, content: '{"intent":"question"}' }
          : null
    )

    const result = await buildProcessor().processAssistantMessage('hola', 7)

    expect(result).toEqual({ response: null, shouldSkipAI: false })
    expect(redisRepositoryMock.appendAssistantContext).not.toHaveBeenCalled()
  })
})

describe('MessageProcessor - question with shared context across entry points', () => {
  it('answers a REST .q with the turns of an earlier Slack DM exchange', async () => {
    mockAi()
    const repository = new FakeContextRepository()
    const processor = buildProcessor(repository)

    // Slack DM
    await processor.processAssistantMessage('me mudo a Rosario en marzo', 7)
    // REST single shot
    const rest = await new AssistantSingleShotService(processor).processMessage(
      REQUEST_ID,
      '.q ¿a dónde me mudo?',
      7
    )

    expect(JSON.stringify(rest)).toContain(ANSWER)

    const messages = lastAnswerMessages()
    expect(messages.slice(1)).toEqual([
      { role: 'user', content: 'me mudo a Rosario en marzo' },
      { role: 'assistant', content: ANSWER },
      { role: 'user', content: expect.stringContaining(QUESTION_DATA_HEADER) },
      { role: 'user', content: '¿a dónde me mudo?' },
    ])

    expect(repository.entries(7)).toEqual([
      { role: 'user', content: 'me mudo a Rosario en marzo' },
      { role: 'assistant', content: ANSWER },
      { role: 'user', content: '.q ¿a dónde me mudo?' },
      { role: 'assistant', content: ANSWER },
    ])
  })

  it('does not leak another user turns into the question', async () => {
    mockAi()
    const repository = new FakeContextRepository()
    const processor = buildProcessor(repository)

    await processor.processAssistantMessage('secreto del usuario 7', 7)
    await processor.processAssistantMessage('.q ¿qué dije?', 8)

    expect(JSON.stringify(lastAnswerMessages())).not.toContain('secreto del usuario 7')
  })
})

describe('MessageProcessor - classifier messages', () => {
  it('orders the system content as stable instructions, date, context block', async () => {
    mockAi()
    alertsServicesMock.getAlertsByUserId.mockResolvedValue({ data: [alertFixture] })
    redisRepositoryMock.getAssistantContext.mockResolvedValue(previousTurns)

    await buildProcessor().processAssistantMessage('hola', 7)

    const [messages, options] = classificationCalls()[0]
    expect(options).toEqual({ mode: 'classification' })
    expect(messages.map((item: any) => item.role)).toEqual(['system', 'user'])
    expect(messages[1].content.trim()).toBe('hola')

    const system: string = messages[0].content
    const dateIndex = system.search(/HOY_ES: [A-Z][a-z]{2}, \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
    const dataIndex = system.indexOf('DATOS_USUARIO:\n')
    const historyIndex = system.indexOf('HISTORIAL:\nU:anotá que el wifi cambió')

    expect(system.indexOf('#IMPORTANT')).toBeGreaterThan(-1)
    expect(dateIndex).toBeGreaterThan(system.indexOf('#IMPORTANT'))
    expect(dataIndex).toBeGreaterThan(dateIndex)
    expect(historyIndex).toBeGreaterThan(dataIndex)
    expect(system).not.toContain('<fecha>')
    expect(system.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g)).toHaveLength(1)
  })
})

describe('MessageProcessor - unusable classifier response', () => {
  const REQUEST_SENTINEL = 'PEDIDO-CENTINELA-9731'
  const OUTPUT_SENTINEL = 'SALIDA-CENTINELA-4268'

  const expectedKeys = ['fenced', 'hasBraces', 'looksTruncated', 'rawLength', 'reason', 'userId']

  const run = async (raw: string | null): Promise<Record<string, unknown>> => {
    aiRepositoryMock.chatCompletion.mockResolvedValue(
      raw === null ? null : { role: roleTypes.assistant, content: raw }
    )

    const result = await buildProcessor().processAssistantMessage(`hacé ${REQUEST_SENTINEL}`, 7)

    expect(result).toEqual({ response: null, shouldSkipAI: false })
    expect(aiRepositoryMock.chatCompletion).toHaveBeenCalledTimes(1)
    expect(mockLogFns.warn).toHaveBeenCalledTimes(1)
    expect(mockLogFns.error).not.toHaveBeenCalled()

    const [payload, text] = mockLogFns.warn.mock.calls[0]
    expect(Object.keys(payload).sort()).toEqual(expectedKeys)

    const logged = JSON.stringify(mockLogFns.warn.mock.calls[0])
    expect(logged).not.toContain(REQUEST_SENTINEL)
    expect(logged).not.toContain(OUTPUT_SENTINEL)
    expect(typeof text).toBe('string')

    return payload
  }

  it.each([
    ['no response', null],
    ['empty content', ''],
    ['blank content', '  \n '],
    ['empty fence', '```json\n```'],
  ])('logs empty_response (%s)', async (_name, raw) => {
    const payload = await run(raw)

    expect(payload).toMatchObject({
      userId: 7,
      reason: 'empty_response',
      hasBraces: false,
      looksTruncated: false,
    })
  })

  it('logs invalid_json for plain text', async () => {
    const raw = `No puedo clasificar ${OUTPUT_SENTINEL}`

    expect(await run(raw)).toEqual({
      userId: 7,
      reason: 'invalid_json',
      rawLength: raw.length,
      hasBraces: false,
      fenced: false,
      looksTruncated: false,
    })
  })

  it('logs invalid_json for a cut-off fenced object', async () => {
    const raw = '```json\n{"intent":"note.create","title":"' + OUTPUT_SENTINEL

    expect(await run(raw)).toEqual({
      userId: 7,
      reason: 'invalid_json',
      rawLength: raw.length,
      hasBraces: true,
      fenced: true,
      looksTruncated: true,
    })
  })

  it('logs invalid_json for a non-object JSON value', async () => {
    expect(await run('42')).toMatchObject({ reason: 'invalid_json', hasBraces: false })
  })

  it.each([
    ['no intent field', `{"title":"${OUTPUT_SENTINEL}"}`],
    ['empty intent', `{"intent":"","title":"${OUTPUT_SENTINEL}"}`],
    ['non-string intent', `{"intent":{"name":"${OUTPUT_SENTINEL}"}}`],
  ])('logs missing_intent (%s)', async (_name, raw) => {
    expect(await run(raw)).toEqual({
      userId: 7,
      reason: 'missing_intent',
      rawLength: raw.length,
      hasBraces: true,
      fenced: false,
      looksTruncated: false,
    })
  })

  it('does not warn for a valid response', async () => {
    mockAi('```json\n{"intent":"question",}\n```')

    const result = await buildProcessor().processAssistantMessage('hola', 7)

    expect(result.response?.content).toBe(ANSWER)
    expect(mockLogFns.warn).not.toHaveBeenCalled()
  })
})

describe('MessageProcessor - priority order', () => {
  beforeEach(() => {
    mockAi()
    alertsServicesMock.createAssistantAlert.mockResolvedValue({
      data: { id: 1, message: 'call mom', date: new Date('2999-01-01T13:00:00Z') },
    })
    notesServicesMock.createAssistantNote.mockResolvedValue({ data: { id: 3, title: 'idea' } })
  })

  it('a "+" message skips everything', async () => {
    const result = await buildProcessor().processAssistantMessage('+ ¿qué hora es?', 7)

    expect(result).toEqual({ response: null, shouldSkipAI: true })
    expect(aiRepositoryMock.chatCompletion).not.toHaveBeenCalled()
    expect(redisRepositoryMock.getAssistantContext).not.toHaveBeenCalled()
  })

  it('a command is handled without the classifier', async () => {
    const result = await buildProcessor().processAssistantMessage('remind me in 10m to call mom', 7)

    expect(result.response).not.toBeNull()
    expect(alertsServicesMock.createAssistantAlert).toHaveBeenCalledTimes(1)
    expect(aiRepositoryMock.chatCompletion).not.toHaveBeenCalled()
    expect(redisRepositoryMock.getAssistantContext).not.toHaveBeenCalled()
  })

  it('a variable is handled without the classifier', async () => {
    const result = await buildProcessor().processAssistantMessage('.n idea', 7)

    expect(result.response).not.toBeNull()
    expect(notesServicesMock.createAssistantNote).toHaveBeenCalledTimes(1)
    expect(aiRepositoryMock.chatCompletion).not.toHaveBeenCalled()
    expect(redisRepositoryMock.getAssistantContext).not.toHaveBeenCalled()
  })

  it('.q answers without the classifier', async () => {
    await buildProcessor().processAssistantMessage('.q ¿qué hora es?', 7)

    expect(classificationCalls()).toHaveLength(0)
    expect(answerCalls()).toHaveLength(1)
  })

  it('free text reaches the classifier', async () => {
    await buildProcessor().processAssistantMessage('¿qué hora es?', 7)

    expect(classificationCalls()).toHaveLength(1)
  })
})
