import ConversationsController from '../conversations.controller'
import ConversationsServices from '../../services/conversations.services'
import AlertInteractionsService from '../../../alerts/services/alertInteractions.services'

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

const conversationsServicesMock = {
  handleAction: handleActionMock,
}

const messageProcessorMock = {}

const flowManagerMock = {}

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

    it('parses reminder triple value pattern', () => {
      const action = {
        action_id: 'reminder_actions:12',
        selected_option: { value: 'reminder:detail:12' },
      }

      const parsed = (controller as any).parseSlackAction(action)

      expect(parsed).toEqual({
        entity: 'reminder',
        operation: 'detail',
        targetId: 12,
      })
    })

    it('parses reminder extended action id when value lacks info', () => {
      const action = {
        action_id: 'reminder_actions:pause:8',
        value: '',
      }

      const parsed = (controller as any).parseSlackAction(action)

      expect(parsed).toEqual({
        entity: 'reminder',
        operation: 'pause',
        targetId: 8,
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

  describe('action regex (AC-3)', () => {
    // keep in sync with src/app.ts slackApp.action(...) regex literal — the inline
    // regex there is not exported, so this duplicated literal guards routing for
    // reminder_actions and assistant_actions while preserving all previously
    // matched patterns.
    const actionRegex =
      /^(?:alert|note|task|link|reminder|assistant)_actions.*$|^(?:delete|view)_(?:alert|note|task|link)(?:_details)?$/

    it('matches assistant_actions ids', () => {
      expect(actionRegex.test('assistant_actions:set_snooze_5m:0')).toBe(true)
      expect(actionRegex.test('assistant_actions:set_snooze_10m:0')).toBe(true)
      expect(actionRegex.test('assistant_actions:set_snooze_30m:0')).toBe(true)
      expect(actionRegex.test('assistant_actions')).toBe(true)
    })

    it('matches reminder_actions ids', () => {
      expect(actionRegex.test('reminder_actions:12')).toBe(true)
      expect(actionRegex.test('reminder_actions')).toBe(true)
    })

    it('still matches all previous _actions entities', () => {
      expect(actionRegex.test('alert_actions:1')).toBe(true)
      expect(actionRegex.test('note_actions:2')).toBe(true)
      expect(actionRegex.test('task_actions:3')).toBe(true)
      expect(actionRegex.test('link_actions:4')).toBe(true)
    })

    it('still matches the legacy delete/view branch (unchanged)', () => {
      expect(actionRegex.test('delete_alert')).toBe(true)
      expect(actionRegex.test('view_task_details')).toBe(true)
      expect(actionRegex.test('delete_note')).toBe(true)
    })

    it('does not match unrelated action ids', () => {
      expect(actionRegex.test('reminder_other')).toBe(false)
      expect(actionRegex.test('delete_reminder')).toBe(false)
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

  // AC-1, integration half. The describes above stub ConversationsServices, so they
  // prove routing but not that the button actually answers. These cases wire a real
  // ConversationsServices into the controller and exercise the full chain the
  // src/app.ts regex fix re-enabled — parseSlackAction -> handleAction ->
  // handleAssistantAction -> setSnoozeMinutes — mocking only the Redis boundary.
  // A regression anywhere in that chain fails here even though the regex
  // assertions in 'action regex (AC-3)' would still pass.
  describe('handleActions with real services — assistant quick-help buttons (AC-1)', () => {
    const saveAlertSnoozeConfig = jest.fn()

    const buildControllerWithRealServices = (): ConversationsController => {
      // The preference write now runs through a REAL AlertInteractionsService, so
      // the chain under test still ends at the same Redis boundary and the same
      // saveAlertSnoozeConfig call — only the hop in between is new.
      const realAlertInteractions = new AlertInteractionsService(
        {} as any, // alertsServices — unreachable from the assistant action path
        { saveAlertSnoozeConfig } as any // redisRepository — the one real boundary
      )

      // Only the Redis boundary is stubbed; the other constructor collaborators are
      // never touched for these operations.
      const realServices = new ConversationsServices(
        {} as any, // aiRepository
        { saveAlertSnoozeConfig } as any, // redisRepository
        {} as any, // usersServices
        {} as any, // alertsServices
        realAlertInteractions, // alertInteractionsService — real, not stubbed
        {} as any, // tasksServices
        {} as any, // notesServices
        {} as any, // linksServices
        {} as any, // messageProcessor
        {} as any // remindersServices
      )

      const realController = new ConversationsController(
        realServices,
        messageProcessorMock as any,
        flowManagerMock as any
      )
      realController.userData = { id: 123 } as any

      return realController
    }

    const snoozeButtonCases: Array<[string, number, string]> = [
      ['set_snooze_5m', 5, 'Snooze preferido configurado en 5 minutos.'],
      ['set_snooze_10m', 10, 'Snooze preferido configurado en 10 minutos.'],
      ['set_snooze_30m', 30, 'Snooze preferido configurado en 30 minutos.'],
    ]

    it.each(snoozeButtonCases)(
      'replies with the confirmation and persists the preference for %s',
      async (operation, minutes, expectedReply) => {
        saveAlertSnoozeConfig.mockResolvedValue(true)
        const say = jest.fn()
        const ack = jest.fn()

        await buildControllerWithRealServices().handleActions({
          ack,
          say,
          body: {
            channel: { id: 'D123', type: 'im' },
            actions: [
              {
                action_id: `assistant_actions:${operation}:0`,
                value: `assistant:${operation}:0`,
              },
            ],
          },
        })

        expect(ack).toHaveBeenCalled()
        expect(saveAlertSnoozeConfig).toHaveBeenCalledWith(123, {
          defaultSnoozeMinutes: minutes,
        })
        expect(say).toHaveBeenCalledWith(expectedReply)
      }
    )

    it('does not write a preference for an unknown assistant operation', async () => {
      const say = jest.fn()
      const ack = jest.fn()

      await buildControllerWithRealServices().handleActions({
        ack,
        say,
        body: {
          channel: { id: 'D123', type: 'im' },
          actions: [
            {
              action_id: 'assistant_actions:set_snooze_99m:0',
              value: 'assistant:set_snooze_99m:0',
            },
          ],
        },
      })

      expect(saveAlertSnoozeConfig).not.toHaveBeenCalled()
      expect(say).toHaveBeenCalledWith('Acción no reconocida.')
    })
  })
})
