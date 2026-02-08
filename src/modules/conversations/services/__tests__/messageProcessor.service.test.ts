import MessageProcessor from '../messageProcessor.service'

const redisRepositoryMock = {
  getAlertSnoozeConfig: jest.fn(),
  saveAlertSnoozeConfig: jest.fn(),
}

const aiRepositoryMock = {
  chatCompletion: jest.fn(),
}

const alertsServicesMock = {
  getAlertsByUserId: jest.fn(),
  createAssistantAlert: jest.fn(),
  rescheduleAlert: jest.fn(),
  createFollowUpAlert: jest.fn(),
}

const tasksServicesMock = {
  getTasksByUserId: jest.fn(),
  createAssistantTask: jest.fn(),
}

const notesServicesMock = {
  getNotesByUserId: jest.fn(),
  createAssistantNote: jest.fn(),
}

const imagesServicesMock = {
  getImages: jest.fn(),
  generateImageForAssistant: jest.fn(),
}

jest.mock('../../repositories/redis/conversations.redis', () => ({
  RedisRepository: {
    getInstance: () => redisRepositoryMock,
  },
}))

jest.mock('../../repositories/openai/openai.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => aiRepositoryMock,
  },
}))

jest.mock('../../repositories/gemini/gemini.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => aiRepositoryMock,
  },
}))

jest.mock('../../../alerts/services/alerts.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => alertsServicesMock,
  },
}))

jest.mock('../../../tasks/services/tasks.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => tasksServicesMock,
  },
}))

jest.mock('../../../notes/services/notes.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => notesServicesMock,
  },
}))

jest.mock('../../../images/services/images.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => imagesServicesMock,
  },
}))

jest.mock('../../repositories/search/search.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      search: jest.fn(),
    }),
  },
}))

const buildBlocksMock = (): { blocks: any[] } => ({ blocks: [] as any[] })

jest.mock('../../../../shared/utils/slackMessages.utils', () => ({
  msgAlertsList: jest.fn(() => buildBlocksMock()),
  msgAlertCreated: jest.fn(() => buildBlocksMock()),
  msgAlertDetail: jest.fn(() => buildBlocksMock()),
  msgTasksList: jest.fn(() => buildBlocksMock()),
  msgTaskCreated: jest.fn(() => buildBlocksMock()),
  msgNotesList: jest.fn(() => buildBlocksMock()),
  msgNoteCreated: jest.fn(() => buildBlocksMock()),
}))

describe('MessageProcessor - channel scoped lookups', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = MessageProcessor.getInstance()
  })

  it('requests channel-specific alerts when running inside a channel', async () => {
    alertsServicesMock.getAlertsByUserId.mockResolvedValue({
      data: [
        {
          id: 1,
          sent: false,
          date: new Date(),
          message: 'Demo',
        },
      ],
    })

    const result = await processor.processAssistantMessage('alerts pending', 99, 'C12345', true)

    expect(alertsServicesMock.getAlertsByUserId).toHaveBeenCalledWith(99, {
      channelId: 'C12345',
    })
    expect(result.response).toBeTruthy()
  })

  it('defaults to personal scope when context is not a channel', async () => {
    alertsServicesMock.getAlertsByUserId.mockResolvedValue({
      data: [],
    })

    const result = await processor.processAssistantMessage('alerts pending', 77, 'D123', false)

    expect(alertsServicesMock.getAlertsByUserId).toHaveBeenCalledWith(77, {
      channelId: null,
    })
    expect(result.response).toBeTruthy()
  })
})

describe('MessageProcessor - image handling', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = MessageProcessor.getInstance()
  })

  it('lists images when using .img -l variable', async () => {
    imagesServicesMock.getImages.mockResolvedValue({
      data: {
        data: [
          { imageUrl: 'https://example.com/img1.png', prompt: 'A cat', provider: 'openai' },
          { imageUrl: 'https://example.com/img2.png', prompt: 'A dog', provider: 'openai' },
        ],
      },
    })

    const result = await processor.processAssistantMessage('.img -l', 99, undefined, false)

    expect(imagesServicesMock.getImages).toHaveBeenCalledWith(1, 10)
    expect(result.response).toBeTruthy()
    expect(result.response?.content).toContain('Tus imágenes recientes')
  })

  it('returns empty message when no images exist', async () => {
    imagesServicesMock.getImages.mockResolvedValue({
      data: { data: [] },
    })

    const result = await processor.processAssistantMessage('.img -l', 99, undefined, false)

    expect(result.response?.content).toBe('No tienes imágenes generadas')
  })

  it('generates image when using .img variable with prompt', async () => {
    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/generated.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    const result = await processor.processAssistantMessage(
      '.img a beautiful sunset',
      99,
      undefined,
      false
    )

    expect(imagesServicesMock.generateImageForAssistant).toHaveBeenCalledWith(
      'a beautiful sunset',
      99,
      {}
    )
    expect(result.response).toBeTruthy()
    expect(result.response?.content).toContain('Generated')
    expect(result.response?.content).toContain('openai')
  })

  it('parses image options from flags', async () => {
    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/generated.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    // Note: -s is shorthand for -size, -qty for -quality, -st for -style, -num for -number
    const result = await processor.processAssistantMessage(
      '.img a cat -size 1024x1792 -quality hd -style vivid -num 2',
      99,
      undefined,
      false
    )

    expect(imagesServicesMock.generateImageForAssistant).toHaveBeenCalledWith('a cat', 99, {
      size: '1024x1792',
      quality: 'hd',
      style: 'vivid',
      numberOfImages: 2,
    })
    expect(result.response).toBeTruthy()
  })

  it('handles image generation errors gracefully', async () => {
    imagesServicesMock.generateImageForAssistant.mockRejectedValue(
      new Error('API rate limit exceeded')
    )

    const result = await processor.processAssistantMessage(
      '.img a beautiful sunset',
      99,
      undefined,
      false
    )

    expect(result.response?.content).toContain('API rate limit exceeded')
  })
})

describe('MessageProcessor - skip AI flag', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    processor = MessageProcessor.getInstance()
  })

  it('returns shouldSkipAI true when message starts with +', async () => {
    const result = await processor.processAssistantMessage('+ some message', 99, undefined, false)

    expect(result.shouldSkipAI).toBe(true)
    expect(result.response).toBeNull()
  })

  it('cleanSkipFlag removes the + prefix', () => {
    expect(processor.cleanSkipFlag('+ some message')).toBe('some message')
    expect(processor.cleanSkipFlag('+message')).toBe('message')
  })
})

describe('MessageProcessor - onProgress callback', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = MessageProcessor.getInstance()
  })

  it('calls onProgress with "Generando imagen..." before image generation via .img', async () => {
    const onProgress = jest.fn()

    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/img.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    await processor.processAssistantMessage(
      '.img a cat',
      99,
      undefined,
      false,
      undefined,
      onProgress
    )

    expect(onProgress).toHaveBeenCalledWith('Generando imagen...')
  })

  it('does not fail when onProgress is undefined', async () => {
    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/img.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    const result = await processor.processAssistantMessage(
      '.img a cat',
      99,
      undefined,
      false,
      undefined,
      undefined
    )

    expect(result.response).toBeTruthy()
  })

  it('does not call onProgress for fast operations like alert create', async () => {
    const onProgress = jest.fn()

    alertsServicesMock.createAssistantAlert.mockResolvedValue({
      data: { id: 1, date: new Date(), message: 'Test' },
    })

    await processor.processAssistantMessage(
      '.alert 10m test reminder',
      99,
      undefined,
      false,
      undefined,
      onProgress
    )

    expect(onProgress).not.toHaveBeenCalled()
  })
})
