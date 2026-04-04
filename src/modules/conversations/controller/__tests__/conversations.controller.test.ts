import ConversationsController from '../conversations.controller'

jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: {
    client: { chat: { postMessage: jest.fn() } },
  },
  slackListenersKey: {},
}))

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor

  return {
    SlackAuth: identityDecorator,
    SlackAuthActions: identityDecorator,
  }
})

const handleActionMock = jest.fn()
const processAssistantMessageMock = jest.fn()
const isFlowActiveMock = jest.fn()

const conversationsServicesMock = {
  handleAction: handleActionMock,
}

const messageProcessorMock = {
  processAssistantMessage: processAssistantMessageMock,
  shouldSkipAI: jest.fn().mockReturnValue(false),
}

const flowManagerMock = {
  isFlowActive: isFlowActiveMock,
}

describe('ConversationsController', () => {
  let controller: ConversationsController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new ConversationsController(
      conversationsServicesMock as any,
      messageProcessorMock as any,
      flowManagerMock as any
    )
    controller.userData = { id: 123 } as any
  })

  describe('parseSlackAction', () => {
    it('parses triple value pattern', () => {
      const action = {
        action_id: 'alerts_actions',
        selected_option: { value: 'alert:list:15' },
      }

      const parsed = (controller as any).parseSlackAction(action)

      expect(parsed).toEqual({
        entity: 'alert',
        operation: 'list',
        targetId: 15,
      })
    })

    it('parses combined value fallback', () => {
      const action = {
        action_id: 'alerts_actions',
        value: 'detail_note:42',
      }

      const parsed = (controller as any).parseSlackAction(action)

      expect(parsed).toEqual({
        entity: 'note',
        operation: 'detail',
        targetId: 42,
      })
    })

    it('parses numeric value using action id', () => {
      const action = {
        action_id: 'delete_alert',
        value: '7',
      }

      const parsed = (controller as any).parseSlackAction(action)

      expect(parsed).toEqual({
        entity: 'alert',
        operation: 'delete',
        targetId: 7,
      })
    })

    it('parses extended action id when value lacks info', () => {
      const action = {
        action_id: 'alert_actions:detail:9',
        value: '',
      }

      const parsed = (controller as any).parseSlackAction(action)

      expect(parsed).toEqual({
        entity: 'alert',
        operation: 'detail',
        targetId: 9,
      })
    })

    it('returns null when action cannot be interpreted', () => {
      const action = {
        action_id: '',
        value: 'nonsense',
      }

      const parsed = (controller as any).parseSlackAction(action)

      expect(parsed).toBeNull()
    })
  })

  describe('handleActions', () => {
    it('acknowledges and informs when action missing', async () => {
      const say = jest.fn()
      const ack = jest.fn()

      await controller.handleActions({
        ack,
        say,
        body: { actions: [] },
      })

      expect(ack).toHaveBeenCalled()
      expect(say).toHaveBeenCalledWith('Ups! No se encontró la acción en la solicitud 🤷‍♂️')
      expect(handleActionMock).not.toHaveBeenCalled()
    })

    it('delegates to service when action parsed', async () => {
      handleActionMock.mockResolvedValue('ok')
      const say = jest.fn()
      const ack = jest.fn()

      await controller.handleActions({
        ack,
        say,
        body: {
          actions: [
            {
              action_id: 'note_actions:detail:21',
            },
          ],
        },
      })

      expect(ack).toHaveBeenCalled()
      expect(handleActionMock).toHaveBeenCalledWith(
        { entity: 'note', operation: 'detail', targetId: 21 },
        123,
        { channelId: undefined, isChannelContext: false }
      )
      expect(say).toHaveBeenCalledWith('ok')
    })

    it('uses channel context when channel id exists and type is missing', async () => {
      handleActionMock.mockResolvedValue('ok')
      const say = jest.fn()
      const ack = jest.fn()

      await controller.handleActions({
        ack,
        say,
        body: {
          channel: {
            id: 'C123',
          },
          actions: [
            {
              action_id: 'task_actions:detail:15',
            },
          ],
        },
      })

      expect(ack).toHaveBeenCalled()
      expect(handleActionMock).toHaveBeenCalledWith(
        { entity: 'task', operation: 'detail', targetId: 15 },
        123,
        { channelId: 'C123', isChannelContext: true }
      )
      expect(say).toHaveBeenCalledWith('ok')
    })

    it('responds with fallback when action not recognized', async () => {
      handleActionMock.mockResolvedValue('handled')
      const say = jest.fn()
      const ack = jest.fn()

      await controller.handleActions({
        ack,
        say,
        body: {
          actions: [
            {
              action_id: '   ',
              value: '   ',
            },
          ],
        },
      })

      expect(handleActionMock).not.toHaveBeenCalled()
      expect(say).toHaveBeenCalledWith('Ups! Acción no reconocida 🤷‍♂️')
      expect(ack).toHaveBeenCalled()
    })
  })

  describe('handleAssistantMessage (via conversationFlow)', () => {
    it('uploads file when response content is a data URL', async () => {
      isFlowActiveMock.mockResolvedValue(false)
      processAssistantMessageMock.mockResolvedValue({
        response: {
          content: 'data:image/png;base64,abc123',
          provider: 'ASSISTANT',
        },
      })

      const say = jest.fn()
      const uploadV2Mock = jest.fn().mockResolvedValue({})
      const client = { files: { uploadV2: uploadV2Mock } }

      await controller.conversationFlow({
        payload: { text: '.qr test', channel: 'C999', channel_type: 'im' },
        say,
        body: {},
        client,
      })

      expect(uploadV2Mock).toHaveBeenCalledWith({
        channel_id: 'C999',
        file: expect.any(Buffer),
        filename: 'image.png',
      })
      expect(say).not.toHaveBeenCalled()
    })

    it('falls back to say when upload fails', async () => {
      isFlowActiveMock.mockResolvedValue(false)
      processAssistantMessageMock.mockResolvedValue({
        response: {
          content: 'data:image/png;base64,abc123',
          provider: 'ASSISTANT',
        },
      })

      const say = jest.fn()
      const uploadV2Mock = jest.fn().mockRejectedValue(new Error('upload failed'))
      const client = { files: { uploadV2: uploadV2Mock } }

      await controller.conversationFlow({
        payload: { text: '.qr test', channel: 'C999', channel_type: 'im' },
        say,
        body: {},
        client,
      })

      expect(uploadV2Mock).toHaveBeenCalled()
      expect(say).toHaveBeenCalledWith('data:image/png;base64,abc123')
    })

    it('uses say for non-image responses', async () => {
      isFlowActiveMock.mockResolvedValue(false)
      processAssistantMessageMock.mockResolvedValue({
        response: {
          content: 'Hello! How can I help you?',
          provider: 'ASSISTANT',
        },
      })

      const say = jest.fn()
      const client = { files: { uploadV2: jest.fn() } }

      await controller.conversationFlow({
        payload: { text: 'hello', channel: 'C999', channel_type: 'im' },
        say,
        body: {},
        client,
      })

      expect(say).toHaveBeenCalledWith('Hello! How can I help you?')
      expect(client.files.uploadV2).not.toHaveBeenCalled()
    })

    it('prefers contentBlock over content for non-image responses', async () => {
      isFlowActiveMock.mockResolvedValue(false)
      const contentBlock = { blocks: [{ type: 'section', text: { text: 'block' } }] }
      processAssistantMessageMock.mockResolvedValue({
        response: {
          content: 'text fallback',
          contentBlock,
          provider: 'ASSISTANT',
        },
      })

      const say = jest.fn()
      const client = { files: { uploadV2: jest.fn() } }

      await controller.conversationFlow({
        payload: { text: '.alerts', channel: 'C999', channel_type: 'im' },
        say,
        body: {},
        client,
      })

      expect(say).toHaveBeenCalledWith(contentBlock)
    })
  })
})
