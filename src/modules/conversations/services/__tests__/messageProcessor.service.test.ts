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

    const result = await processor.processAssistantMessage(
      'alerts pending',
      99,
      'C12345',
      true
    )

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
