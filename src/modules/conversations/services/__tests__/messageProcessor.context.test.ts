import MessageProcessor from '../messageProcessor.service'
import AssistantSingleShotService from '../assistantSingleShot.service'
import { roleTypes } from '../../shared/constants/openai'
import { ConversationProviders } from '../../shared/constants/conversationFlow'
import { ASSISTANT_CONTEXT_MAX_ENTRIES } from '../../shared/constants/assistantContext.constants'
import { IAssistantContextEntry } from '../../shared/interfaces/converstions'

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

const WEB_CHANNEL = '99999997'
const REQUEST_ID = '9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b'
const ALERT_DATE = new Date('2999-01-01T13:00:00Z')

const aiRepositoryMock = { chatCompletion: jest.fn() }

const alertsServicesMock = {
  getAlertsByUserId: jest.fn(),
  createAssistantAlert: jest.fn(),
}

const tasksServicesMock = {
  getTasksByUserId: jest.fn(),
  createAssistantTask: jest.fn(),
}

const notesServicesMock = {
  getNotesByUserId: jest.fn(),
  createAssistantNote: jest.fn(),
}

const linksServicesMock = {
  getLinksByUserId: jest.fn(),
  createAssistantLink: jest.fn(),
}

const qrServicesMock = { generateQr: jest.fn() }

const redisRepositoryMock = {
  getAssistantContext: jest.fn(),
  appendAssistantContext: jest.fn(),
}

// Mirrors the real store: per-user list, atomic append + trim, no overwrite API
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
    qrServicesMock as any,
    redisRepository
  )

const mockQuestionFlow = (): void => {
  aiRepositoryMock.chatCompletion.mockImplementation(
    async (messages: any[], options?: { mode?: string }) => {
      if (options?.mode === 'classification') {
        return { role: roleTypes.assistant, content: '{"intent":"question"}' }
      }
      const userMessage = String(messages[messages.length - 1].content).trim()
      return {
        role: roleTypes.assistant,
        content: `respuesta a ${userMessage}`,
        provider: ConversationProviders.ASSISTANT,
      }
    }
  )
}

const mockIntent = (intent: Record<string, unknown>): void => {
  aiRepositoryMock.chatCompletion.mockResolvedValue({
    role: roleTypes.assistant,
    content: JSON.stringify(intent),
  })
}

// System prompt of every classification call, in order
const classifierPrompts = (): string[] =>
  aiRepositoryMock.chatCompletion.mock.calls
    .filter(([, options]) => options?.mode === 'classification')
    .map(([messages]) => String(messages[0].content))

beforeEach(() => {
  jest.resetAllMocks()

  redisRepositoryMock.getAssistantContext.mockResolvedValue([])
  redisRepositoryMock.appendAssistantContext.mockResolvedValue(true)

  alertsServicesMock.getAlertsByUserId.mockResolvedValue({ data: [] })
  tasksServicesMock.getTasksByUserId.mockResolvedValue({ data: [] })
  notesServicesMock.getNotesByUserId.mockResolvedValue({ data: [] })
  linksServicesMock.getLinksByUserId.mockResolvedValue({ data: [] })

  alertsServicesMock.createAssistantAlert.mockResolvedValue({
    data: { id: 1, message: 'm', date: ALERT_DATE },
  })
  tasksServicesMock.createAssistantTask.mockResolvedValue({ data: { id: 2, title: 't' } })
  notesServicesMock.createAssistantNote.mockResolvedValue({ data: { id: 3, title: 'n' } })
  linksServicesMock.createAssistantLink.mockResolvedValue({ data: { id: 4, url: 'u' } })
})

describe('MessageProcessor - recording the personal exchange', () => {
  it('appends the user message and the response once', async () => {
    const result = await buildProcessor().processAssistantMessage('.n comprar pan', 7)

    expect(result.response?.content).toBe('Nota creada correctamente con id: #3')
    expect(redisRepositoryMock.appendAssistantContext).toHaveBeenCalledTimes(1)
    expect(redisRepositoryMock.appendAssistantContext).toHaveBeenCalledWith(7, [
      { role: roleTypes.user, content: '.n comprar pan' },
      { role: roleTypes.assistant, content: 'Nota creada correctamente con id: #3' },
    ])
  })

  it('stores plainText instead of the raw content, and never the blocks', async () => {
    qrServicesMock.generateQr.mockResolvedValue({ data: { qrBase64: 'QUJD'.repeat(100) } })

    const result = await buildProcessor().processAssistantMessage('.qr https://example.com', 7)

    expect(result.response?.plainText).toBeTruthy()

    const [, entries] = redisRepositoryMock.appendAssistantContext.mock.calls[0]
    expect(entries).toEqual([
      { role: roleTypes.user, content: '.qr https://example.com' },
      { role: roleTypes.assistant, content: result.response?.plainText },
    ])
    expect(JSON.stringify(entries)).not.toContain('QUJD')
    expect(JSON.stringify(entries)).not.toContain('contentBlock')
  })

  it('does not record a "+" message', async () => {
    const result = await buildProcessor().processAssistantMessage('+ hola equipo', 7)

    expect(result).toEqual({ response: null, shouldSkipAI: true })
    expect(redisRepositoryMock.getAssistantContext).not.toHaveBeenCalled()
    expect(redisRepositoryMock.appendAssistantContext).not.toHaveBeenCalled()
  })

  it('does not record when there is no response', async () => {
    aiRepositoryMock.chatCompletion.mockResolvedValue({
      role: roleTypes.assistant,
      content: 'not json',
    })

    const result = await buildProcessor().processAssistantMessage('hola', 7)

    expect(result).toEqual({ response: null, shouldSkipAI: false })
    expect(redisRepositoryMock.appendAssistantContext).not.toHaveBeenCalled()
  })

  it('rethrows a handler error unchanged and records nothing', async () => {
    const failure = new Error('boom')
    notesServicesMock.createAssistantNote.mockRejectedValue(failure)

    await expect(buildProcessor().processAssistantMessage('.n comprar pan', 7)).rejects.toBe(
      failure
    )
    expect(redisRepositoryMock.appendAssistantContext).not.toHaveBeenCalled()
  })

  it('still processes the request when the context read comes back empty', async () => {
    mockQuestionFlow()
    const repository = new FakeContextRepository()
    await repository.appendAssistantContext(7, [
      { role: roleTypes.user, content: 'previo' },
      { role: roleTypes.assistant, content: 'respuesta previa' },
    ])
    repository.appendAssistantContext.mockClear()
    // Failed read: the repository answers [] although the list has entries
    repository.getAssistantContext.mockResolvedValueOnce([])

    const result = await buildProcessor(repository).processAssistantMessage('hola', 7)

    expect(result.response?.content).toBe('respuesta a hola')
    expect(classifierPrompts()[0]).not.toContain('HISTORIAL:\n')
    // Pure append: the earlier exchange is still there
    expect(repository.entries(7).map((entry) => entry.content)).toEqual([
      'previo',
      'respuesta previa',
      'hola',
      'respuesta a hola',
    ])
  })

  it('still processes the request when the context read throws', async () => {
    mockQuestionFlow()
    redisRepositoryMock.getAssistantContext.mockRejectedValue(new Error('redis down'))

    const result = await buildProcessor().processAssistantMessage('hola', 7)

    expect(result.response?.content).toBe('respuesta a hola')
    expect(redisRepositoryMock.appendAssistantContext).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['returns false', () => redisRepositoryMock.appendAssistantContext.mockResolvedValue(false)],
    [
      'rejects',
      () => redisRepositoryMock.appendAssistantContext.mockRejectedValue(new Error('redis down')),
    ],
    [
      'throws synchronously',
      () =>
        redisRepositoryMock.appendAssistantContext.mockImplementation(() => {
          throw new Error('redis down')
        }),
    ],
  ])('returns the result and does not re-run when the save %s', async (_name, arrange) => {
    arrange()

    const result = await buildProcessor().processAssistantMessage('.a 10m llamar al médico', 7)

    expect(result.shouldSkipAI).toBe(false)
    expect(result.response?.content).toContain('#1')
    expect(alertsServicesMock.createAssistantAlert).toHaveBeenCalledTimes(1)
    expect(redisRepositoryMock.appendAssistantContext).toHaveBeenCalledTimes(1)
  })
})

describe('MessageProcessor - shared personal context across entry points', () => {
  it('feeds the classifier with exchanges made through the other entry points', async () => {
    mockQuestionFlow()
    const repository = new FakeContextRepository()
    const processor = buildProcessor(repository)
    const visibleWebHistory: any[] = [
      { role: roleTypes.user, content: 'solo visible en la web', userSlackId: 'U1' },
    ]

    // Slack DM
    await processor.processAssistantMessage('mensaje desde slack', 7, undefined, false, undefined)
    // REST
    await new AssistantSingleShotService(processor).processMessage(
      REQUEST_ID,
      'mensaje desde rest',
      7
    )
    // Web
    await processor.processAssistantMessage(
      'mensaje desde web',
      7,
      WEB_CHANNEL,
      false,
      visibleWebHistory
    )

    const [slackPrompt, restPrompt, webPrompt] = classifierPrompts()

    expect(slackPrompt).not.toContain('HISTORIAL:\n')

    expect(restPrompt).toContain(
      'HISTORIAL:\nU:mensaje desde slack\nA:respuesta a mensaje desde slack'
    )

    expect(webPrompt).toContain(
      [
        'HISTORIAL:',
        'U:mensaje desde slack',
        'A:respuesta a mensaje desde slack',
        'U:mensaje desde rest',
        'A:respuesta a mensaje desde rest',
      ].join('\n')
    )
    expect(webPrompt).not.toContain('solo visible en la web')

    expect(repository.entries(7).map((entry) => entry.content)).toEqual([
      'mensaje desde slack',
      'respuesta a mensaje desde slack',
      'mensaje desde rest',
      'respuesta a mensaje desde rest',
      'mensaje desde web',
      'respuesta a mensaje desde web',
    ])
  })

  it('does not share context between users', async () => {
    mockQuestionFlow()
    const repository = new FakeContextRepository()
    const processor = buildProcessor(repository)

    await processor.processAssistantMessage('secreto del usuario 7', 7)
    await processor.processAssistantMessage('hola', 8)

    expect(classifierPrompts()[1]).not.toContain('secreto del usuario 7')
    expect(repository.getAssistantContext).toHaveBeenLastCalledWith(8)
    expect(repository.entries(8).map((entry) => entry.content)).toEqual([
      'hola',
      'respuesta a hola',
    ])
    expect(repository.entries(7)).toHaveLength(2)
  })

  it('keeps channel requests out of the personal context', async () => {
    mockQuestionFlow()
    const repository = new FakeContextRepository()
    const processor = buildProcessor(repository)
    const channelHistory: any[] = [
      { role: roleTypes.user, content: 'historial del canal', userSlackId: 'U1' },
    ]

    await processor.processAssistantMessage('mensaje personal', 7)
    repository.getAssistantContext.mockClear()
    repository.appendAssistantContext.mockClear()

    const result = await processor.processAssistantMessage(
      'mensaje en canal',
      7,
      'C123',
      true,
      channelHistory
    )

    expect(result.response?.content).toBe('respuesta a mensaje en canal')
    expect(repository.getAssistantContext).not.toHaveBeenCalled()
    expect(repository.appendAssistantContext).not.toHaveBeenCalled()

    const channelPrompt = classifierPrompts()[1]
    expect(channelPrompt).toContain('HISTORIAL:\nU:historial del canal')
    expect(channelPrompt).not.toContain('mensaje personal')
    expect(repository.entries(7)).toHaveLength(2)
  })

  it.each([
    ['blank', '   '],
    ['empty', ''],
    ['missing', undefined],
  ])(
    'keeps a channel request with a %s channel id out of the personal context',
    async (_name, channelId) => {
      mockQuestionFlow()
      const repository = new FakeContextRepository()
      const processor = buildProcessor(repository)

      await processor.processAssistantMessage('mensaje personal', 7)
      repository.getAssistantContext.mockClear()
      repository.appendAssistantContext.mockClear()

      const result = await processor.processAssistantMessage(
        'mensaje en canal',
        7,
        channelId,
        true,
        [{ role: roleTypes.user, content: 'historial del canal', userSlackId: 'U1' } as any]
      )

      expect(result.response?.content).toBe('respuesta a mensaje en canal')
      expect(repository.getAssistantContext).not.toHaveBeenCalled()
      expect(repository.appendAssistantContext).not.toHaveBeenCalled()

      const channelPrompt = classifierPrompts()[1]
      expect(channelPrompt).toContain('HISTORIAL:\nU:historial del canal')
      expect(channelPrompt).not.toContain('mensaje personal')
      expect(repository.entries(7)).toHaveLength(2)
    }
  )

  it('stores both exchanges of two simultaneous requests without interleaving them', async () => {
    const repository = new FakeContextRepository()
    const processor = buildProcessor(repository)

    // The first request finishes last
    notesServicesMock.createAssistantNote.mockImplementation(
      async (_userId: number, title: string) => {
        await new Promise((resolve) => setTimeout(resolve, title === 'primera' ? 20 : 1))
        return { data: { id: title === 'primera' ? 1 : 2, title } }
      }
    )

    await Promise.all([
      processor.processAssistantMessage('.n primera', 7),
      processor.processAssistantMessage('.n segunda', 7, WEB_CHANNEL, false, []),
    ])

    expect(repository.entries(7)).toEqual([
      { role: roleTypes.user, content: '.n segunda' },
      { role: roleTypes.assistant, content: 'Nota creada correctamente con id: #2' },
      { role: roleTypes.user, content: '.n primera' },
      { role: roleTypes.assistant, content: 'Nota creada correctamente con id: #1' },
    ])
  })
})

describe('MessageProcessor - creation channel (RF03)', () => {
  const scopes: Array<[string, string | undefined, boolean, string | undefined]> = [
    ['web synthetic channel', WEB_CHANNEL, false, undefined],
    ['real channel', 'C123', true, 'C123'],
  ]

  describe.each(scopes)('%s', (_name, channelId, isChannelContext, expectedChannel) => {
    const run = async (message: string): Promise<void> => {
      const result = await buildProcessor().processAssistantMessage(
        message,
        7,
        channelId,
        isChannelContext
      )
      expect(result.response).toBeTruthy()
    }

    it('.t command', async () => {
      await run('.t comprar pan')

      const [userId, title, , options] = tasksServicesMock.createAssistantTask.mock.calls[0]
      expect([userId, title]).toEqual([7, 'comprar pan'])
      expect(options.channelId).toBe(expectedChannel)
    })

    it('.n command', async () => {
      await run('.n comprar pan')

      expect(notesServicesMock.createAssistantNote).toHaveBeenCalledWith(
        7,
        'comprar pan',
        '',
        undefined,
        expectedChannel
      )
    })

    it('.a command', async () => {
      await run('.a 10m llamar al médico')

      const call = alertsServicesMock.createAssistantAlert.mock.calls[0]
      expect(call.slice(0, 2)).toEqual([7, '10m'])
      expect(call[3]).toBe(expectedChannel)
    })

    it('.link command', async () => {
      await run('.link https://example.com')

      const [userId, url, options] = linksServicesMock.createAssistantLink.mock.calls[0]
      expect([userId, url]).toEqual([7, 'https://example.com'])
      expect(options.channelId).toBe(expectedChannel)
    })

    it('"remind me" command', async () => {
      await run('remind me in 10m to call mom')

      expect(alertsServicesMock.createAssistantAlert).toHaveBeenCalledWith(
        7,
        '10m',
        'call mom',
        expectedChannel
      )
    })

    it('alert.create intent', async () => {
      mockIntent({ intent: 'alert.create', time: '10m', title: 'llamar' })
      await run('avisame en 10 minutos que llame')

      expect(alertsServicesMock.createAssistantAlert).toHaveBeenCalledWith(
        7,
        '10m',
        'llamar',
        expectedChannel
      )
    })

    it('task.create intent', async () => {
      mockIntent({ intent: 'task.create', title: 'comprar pan' })
      await run('anotá la tarea de comprar pan')

      const [, title, , options] = tasksServicesMock.createAssistantTask.mock.calls[0]
      expect(title).toBe('comprar pan')
      expect(options.channelId).toBe(expectedChannel)
    })

    it('note.create intent', async () => {
      mockIntent({ intent: 'note.create', title: 'idea' })
      await run('guardá una nota con esta idea')

      expect(notesServicesMock.createAssistantNote).toHaveBeenCalledWith(
        7,
        'idea',
        '',
        undefined,
        expectedChannel
      )
    })

    it('link.create intent', async () => {
      mockIntent({ intent: 'link.create', url: 'https://example.com' })
      await run('guardá este link https://example.com')

      const [, url, options] = linksServicesMock.createAssistantLink.mock.calls[0]
      expect(url).toBe('https://example.com')
      expect(options.channelId).toBe(expectedChannel)
    })
  })
})
