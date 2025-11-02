import ConversationsServices from '../conversations.services'
import { ConversationProviders } from '../../shared/constants/conversationFlow'
import { roleTypes } from '../../shared/constants/openai'

const redisRepositoryMock = {
  getConversationMessages: jest.fn(),
  saveConversationMessages: jest.fn(),
  getConversationFlow: jest.fn(),
  saveConversationFlow: jest.fn(),
  deleteConversationFlow: jest.fn(),
  saveAssistantPreferences: jest.fn(),
  getAssistantPreferences: jest.fn(),
  saveAlertMetadata: jest.fn(),
  getAlertMetadata: jest.fn(),
  saveAssistantDigestSnapshot: jest.fn(),
  getAssistantDigestSnapshot: jest.fn(),
  getAlertSnoozeConfig: jest.fn(),
}

const aiRepositoryMock = {
  chatCompletion: jest.fn(),
}

const usersServicesMock = {
  getUsersByTeamId: jest.fn(),
}

const alertsServicesMock = {
  deleteAlert: jest.fn(),
  getAlertsByUserId: jest.fn(),
  rescheduleAlert: jest.fn(),
  createFollowUpAlert: jest.fn(),
  resolveAlert: jest.fn(),
  createAssistantAlert: jest.fn(),
}

const tasksServicesMock = {
  getTasksByUserId: jest.fn(),
}

const notesServicesMock = {
  getNotesByUserId: jest.fn(),
}

const imagesServicesMock = {
  generateImageForAssistant: jest.fn(),
  getImages: jest.fn(),
}

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

jest.mock('../../repositories/redis/conversations.redis', () => ({
  RedisRepository: {
    getInstance: () => redisRepositoryMock,
  },
}))

jest.mock('../../../../config/socketConfig', () => ({
  IoServer: { io: { in: () => ({ emit: jest.fn() }) } },
}))

jest.mock('../../../users/services/users.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => usersServicesMock,
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
  msgAlertDetail: jest.fn(() => buildBlocksMock()),
  msgAlertCreated: jest.fn(() => buildBlocksMock()),
  msgNoteCreated: jest.fn(() => buildBlocksMock()),
  msgAlertsList: jest.fn(() => buildBlocksMock()),
  msgTasksList: jest.fn(() => buildBlocksMock()),
  msgNotesList: jest.fn(() => buildBlocksMock()),
  msgAssistantQuickHelp: jest.fn(() => buildBlocksMock()),
}))

describe('ConversationsServices', () => {
  let service: ConversationsServices

  beforeEach(() => {
    jest.resetAllMocks()
    service = ConversationsServices.getInstance()
  })

  describe('generateConversation', () => {
    it('stores conversation in redis and returns response content', async () => {
      redisRepositoryMock.getConversationMessages.mockResolvedValue([])
      aiRepositoryMock.chatCompletion.mockResolvedValue({
        role: roleTypes.assistant,
        content: 'response',
        provider: ConversationProviders.ASSISTANT,
      })
      redisRepositoryMock.saveConversationMessages.mockResolvedValue(true)

      const result = await service.generateConversation(
        {
          role: roleTypes.user,
          content: 'hello',
          provider: ConversationProviders.SLACK,
        },
        'user1',
        'channel1'
      )

      expect(aiRepositoryMock.chatCompletion).toHaveBeenCalled()
      expect(redisRepositoryMock.saveConversationMessages).toHaveBeenCalledWith(
        'cb_channel1_user1',
        expect.arrayContaining([
          expect.objectContaining({ content: 'hello' }),
          expect.objectContaining({ content: 'response' }),
        ])
      )
      expect(result).toBe('response')
    })

    it('returns null when redis throws', async () => {
      redisRepositoryMock.getConversationMessages.mockRejectedValue(new Error('redis down'))

      const result = await service.generateConversation(
        {
          role: roleTypes.user,
          content: 'hola',
          provider: ConversationProviders.SLACK,
        },
        'user1'
      )

      expect(result).toBeNull()
      expect(aiRepositoryMock.chatCompletion).not.toHaveBeenCalled()
    })
  })

  describe('cleanConversation', () => {
    it('clears conversation cache', async () => {
      redisRepositoryMock.saveConversationMessages.mockResolvedValue(true)

      const result = await service.cleanConversation('user1', 'channel1')

      expect(result).toBe(true)
      expect(redisRepositoryMock.saveConversationMessages).toHaveBeenCalledWith(
        'cb_channel1_user1',
        []
      )
    })

    it('returns false on redis failure', async () => {
      redisRepositoryMock.saveConversationMessages.mockRejectedValue(new Error('fail'))

      const result = await service.cleanConversation('user1')

      expect(result).toBe(false)
    })
  })

  describe('conversation flow management', () => {
    it('detects when conversation flow already exists', async () => {
      redisRepositoryMock.getConversationFlow.mockResolvedValue({} as any)

      const started = await service.conversationFlowStarted('channel1')

      expect(started).toBe(true)
    })

    it('starts new conversation flow when not running', async () => {
      redisRepositoryMock.getConversationFlow.mockResolvedValueOnce(null)
      redisRepositoryMock.saveConversationFlow.mockResolvedValue(true)

      const response = await service.startConversationFlow('channel1')

      expect(response).toBe('Conversación iniciada correctamente.')
      expect(redisRepositoryMock.saveConversationFlow).toHaveBeenCalled()
    })

    it('returns message when conversation already started', async () => {
      redisRepositoryMock.getConversationFlow.mockResolvedValue({})

      const response = await service.startConversationFlow('channel1')

      expect(response).toBe('Ya existe una conversación en curso en este canal.')
      expect(redisRepositoryMock.saveConversationFlow).not.toHaveBeenCalled()
    })

    it('returns failure message when saveConversationFlow fails', async () => {
      redisRepositoryMock.getConversationFlow.mockResolvedValueOnce(null)
      redisRepositoryMock.saveConversationFlow.mockResolvedValue(false)

      const response = await service.startConversationFlow('channel1')

      expect(response).toBe('No se pudo iniciar la conversación 🤷‍♂️')
    })

    it('ends conversation flow when running', async () => {
      redisRepositoryMock.getConversationFlow.mockResolvedValue({})
      redisRepositoryMock.deleteConversationFlow.mockResolvedValue(true)

      const response = await service.endConversationFlow('channel1')

      expect(response).toBe('Conversación finalizada correctamente.')
      expect(redisRepositoryMock.deleteConversationFlow).toHaveBeenCalledWith('channel1')
    })

    it('informs when ending flow without active session', async () => {
      redisRepositoryMock.getConversationFlow.mockResolvedValue(null)

      const response = await service.endConversationFlow('channel1')

      expect(response).toBe('No existe una conversación en curso en este canal.')
    })
  })

  it('handles invalid actions gracefully', async () => {
    const response = await service.handleAction({ entity: '', operation: '', targetId: NaN }, 1)

    expect(response).toBe('Acción no reconocida.')
  })

  it('formats stored conversation when showing history', async () => {
    redisRepositoryMock.getConversationMessages.mockResolvedValue([
      {
        role: roleTypes.assistant,
        content: 'Hola',
        provider: ConversationProviders.ASSISTANT,
      },
      {
        role: roleTypes.user,
        content: 'Que tal?',
        provider: ConversationProviders.SLACK,
      },
    ])
    usersServicesMock.getUsersByTeamId.mockResolvedValue({
      data: [{ slackId: 'user1', name: 'Nick' }],
    })

    const result = await service.showConversation('user1', 'channel1', 'team1')

    expect(usersServicesMock.getUsersByTeamId).toHaveBeenCalledWith('team1')
    expect(result).toBe('bot: Hola\nNick: Que tal?')
  })

  describe('getAssistantQuickHelp', () => {
    const slackMessagesUtils = jest.requireMock('../../../../shared/utils/slackMessages.utils')

    beforeEach(() => {
      redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
      slackMessagesUtils.msgAssistantQuickHelp.mockReturnValue({ blocks: [] })
    })

    it('queries channel-scoped data when called from a channel context', async () => {
      const now = new Date()
      alertsServicesMock.getAlertsByUserId.mockResolvedValue({
        data: [{ id: 1, sent: false, date: now, message: 'Ping', userId: 12 }],
      })
      notesServicesMock.getNotesByUserId.mockResolvedValue({ data: [{ id: 3 }] as any })
      tasksServicesMock.getTasksByUserId.mockResolvedValue({
        data: [{ id: 5, status: 'pending' } as any],
      })

      await service.getAssistantQuickHelp(42, { channelId: 'C123', isChannelContext: true })

      expect(alertsServicesMock.getAlertsByUserId).toHaveBeenCalledWith(42, {
        channelId: 'C123',
      })
      expect(notesServicesMock.getNotesByUserId).toHaveBeenCalledWith(42, {
        channelId: 'C123',
      })
      expect(tasksServicesMock.getTasksByUserId).toHaveBeenCalledWith(42, {
        channelId: 'C123',
      })
      expect(slackMessagesUtils.msgAssistantQuickHelp).toHaveBeenCalled()
    })

    it('uses personal scope when context is not a channel', async () => {
      alertsServicesMock.getAlertsByUserId.mockResolvedValue({ data: [] })
      notesServicesMock.getNotesByUserId.mockResolvedValue({ data: [] })
      tasksServicesMock.getTasksByUserId.mockResolvedValue({ data: [] })

      await service.getAssistantQuickHelp(7, { channelId: 'D555', isChannelContext: false })

      expect(alertsServicesMock.getAlertsByUserId).toHaveBeenCalledWith(7, {
        channelId: null,
      })
      expect(notesServicesMock.getNotesByUserId).toHaveBeenCalledWith(7, {
        channelId: null,
      })
      expect(tasksServicesMock.getTasksByUserId).toHaveBeenCalledWith(7, {
        channelId: null,
      })
    })
  })
})
