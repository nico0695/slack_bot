import ConversationsWebController from '../conversationsWeb.controller'

const startConversationFlowMock = jest.fn()
const showConversationFlowWebMock = jest.fn()
const generateConversationFlowMock = jest.fn()
const sendMessageToConversationFlowMock = jest.fn()
const generateAssistantConversationMock = jest.fn()
const generateConversationFlowAssistantMock = jest.fn()
const showChannelsConversationFlowMock = jest.fn()
const endConversationFlowMock = jest.fn()

const conversationServicesMock = {
  startConversationFlow: startConversationFlowMock,
  showConversationFlowWeb: showConversationFlowWebMock,
  generateConversationFlow: generateConversationFlowMock,
  sendMessageToConversationFlow: sendMessageToConversationFlowMock,
  generateAssistantConversation: generateAssistantConversationMock,
  generateConversationFlowAssistant: generateConversationFlowAssistantMock,
  showChannelsConversationFlow: showChannelsConversationFlowMock,
  endConversationFlow: endConversationFlowMock,
}

const getUserByIdMock = jest.fn()

const usersServicesMock = {
  getUserById: getUserByIdMock,
}

jest.mock('../../services/conversations.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => conversationServicesMock,
  },
}))

jest.mock('../../../users/services/users.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => usersServicesMock,
  },
}))

describe('ConversationsWebController', () => {
  let controller: ConversationsWebController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = ConversationsWebController.getInstance()
  })

  it('joins channel returning conversation flow', async () => {
    startConversationFlowMock.mockResolvedValue('conversation started')
    showConversationFlowWebMock.mockResolvedValue({
      conversation: [{ role: 'user', content: 'hi' }],
    })

    const result = await controller.joinChannel({ channel: 'ch', username: 'nick' })

    expect(startConversationFlowMock).toHaveBeenCalledWith('ch', 'web')
    expect(result).toEqual({
      message: 'conversation started',
      conversation: [{ role: 'user', content: 'hi' }],
    })
  })

  it('joins assistant channel returning cached flow', async () => {
    showConversationFlowWebMock.mockResolvedValue({
      conversation: [{ role: 'assistant', content: 'hola' }],
    })

    const result = await controller.joinAssistantChannel({ channel: 'ch', username: 'nick' })

    expect(showConversationFlowWebMock).toHaveBeenCalledWith('ch')
    expect(result).toEqual({
      message: 'Conversación iniciada',
      conversation: [{ role: 'assistant', content: 'hola' }],
    })
  })

  describe('generateConversation', () => {
    it('delegates to generateConversationFlow when iaEnabled', async () => {
      const generated = { role: 'assistant', content: 'ready' }
      generateConversationFlowMock.mockResolvedValue(generated)

      const result = await controller.generateConversation({
        username: 'nick',
        channel: 'general',
        message: 'hi',
        iaEnabled: true,
      })

      expect(generateConversationFlowMock).toHaveBeenCalledWith('hi', 'nick', 'general')
      expect(result).toBe(generated)
    })

    it('sends message through flow when IA disabled', async () => {
      sendMessageToConversationFlowMock.mockResolvedValue(undefined)

      const result = await controller.generateConversation({
        username: 'nick',
        channel: 'general',
        message: 'hi',
      })

      expect(sendMessageToConversationFlowMock).toHaveBeenCalledWith('hi', 'nick', 'general')
      expect(result).toBeNull()
    })
  })

  describe('conversationAssistantFlow', () => {
    it('returns message when user not found', async () => {
      getUserByIdMock.mockResolvedValue({ data: null })

      const result = await controller.conversationAssistantFlow(42, 'hola', true)

      expect(result).toEqual({
        role: 'assistant',
        content: 'No se pudo obtener el usuario 🤷‍♂️',
        provider: 'assistant',
      })
    })

    it('returns direct assistant response when available', async () => {
      getUserByIdMock.mockResolvedValue({ data: { id: 42 } })
      const assistantResponse = {
        role: 'assistant',
        content: 'todo listo',
        provider: 'assistant',
      }
      generateAssistantConversationMock.mockResolvedValue(assistantResponse)

      const result = await controller.conversationAssistantFlow(42, 'hola', false)

      expect(generateAssistantConversationMock).toHaveBeenCalledWith('hola', 42, '99999942', 'web')
      expect(result).toBe(assistantResponse)
    })

    it('falls back to IA flow when enabled and first call returns null', async () => {
      getUserByIdMock.mockResolvedValue({ data: { id: 42 } })
      generateAssistantConversationMock.mockResolvedValue(null)
      const fallbackResponse = {
        role: 'assistant',
        content: 'fallback',
        provider: 'assistant',
      }
      generateConversationFlowAssistantMock.mockResolvedValue(fallbackResponse)

      const result = await controller.conversationAssistantFlow(42, 'hola', true)

      expect(generateConversationFlowAssistantMock).toHaveBeenCalledWith(
        'hola',
        42,
        '99999942',
        'web'
      )
      expect(result).toBe(fallbackResponse)
    })
  })

  it('shows channels via service', async () => {
    showChannelsConversationFlowMock.mockResolvedValue(['a'])
    const res = {
      send: jest.fn(),
    }

    await controller.showChannels({}, res)

    expect(showChannelsConversationFlowMock).toHaveBeenCalled()
    expect(res.send).toHaveBeenCalledWith(['a'])
  })

  it('closes channel via service', async () => {
    endConversationFlowMock.mockResolvedValue('closed')
    const res = { send: jest.fn() }

    await controller.closeChannel({ body: { channelId: 'ch' } }, res)

    expect(endConversationFlowMock).toHaveBeenCalledWith('ch')
    expect(res.send).toHaveBeenCalledWith('closed')
  })
})
