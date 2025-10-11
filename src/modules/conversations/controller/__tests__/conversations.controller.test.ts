import ConversationsController from '../conversations.controller'

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

jest.mock('../../services/conversations.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      handleAction: handleActionMock,
    }),
  },
}))

describe('ConversationsController', () => {
  let controller: ConversationsController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = ConversationsController.getInstance()
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
})
