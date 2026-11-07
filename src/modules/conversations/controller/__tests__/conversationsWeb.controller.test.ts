import ConversationsWebController from '../conversationsWeb.controller'

const startConversationFlowMock = jest.fn()
const showConversationFlowWebMock = jest.fn()
const generateConversationFlowMock = jest.fn()
const sendMessageToConversationFlowMock = jest.fn()
const generateAssistantConversationMock = jest.fn()
const showChannelsConversationFlowMock = jest.fn()
const endConversationFlowMock = jest.fn()

const conversationServicesMock = {
  startConversationFlow: startConversationFlowMock,
  showConversationFlowWeb: showConversationFlowWebMock,
  generateConversationFlow: generateConversationFlowMock,
  sendMessageToConversationFlow: sendMessageToConversationFlowMock,
  generateAssistantConversation: generateAssistantConversationMock,
  getWebAssistantHistory: jest.fn(),
  showChannelsConversationFlow: showChannelsConversationFlowMock,
  endConversationFlow: endConversationFlowMock,
}

const getUserByIdMock = jest.fn()

const usersServicesMock = {
  getUserById: getUserByIdMock,
}

describe('ConversationsWebController', () => {
  let controller: ConversationsWebController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new ConversationsWebController(
      conversationServicesMock as any,
      usersServicesMock as any,
      {} as any
    )
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
    conversationServicesMock.getWebAssistantHistory.mockResolvedValue([
      { role: 'assistant', content: 'hola' },
    ])

    const result = await controller.joinAssistantChannel(42)

    expect(conversationServicesMock.getWebAssistantHistory).toHaveBeenCalledWith(42)
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
