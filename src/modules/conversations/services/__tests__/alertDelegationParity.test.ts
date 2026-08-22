import ConversationsServices from '../conversations.services'
import MessageProcessor from '../messageProcessor.service'
import AlertInteractionsService from '../../../alerts/services/alertInteractions.services'

/**
 * AC-5 — parity between the Slack-action and text-command entry points.
 *
 * Parity is asserted at the SERVICE level: the two callers legitimately differ on
 * `updatePreference`, so every case drives inputs resolving to the SAME service
 * arguments. This is not a claim that both callers behave identically for
 * different inputs.
 *
 * Both are wired over ONE shared real service on the same stubs, so a divergence
 * can only come from caller-side parsing/forwarding.
 */

const buildBlocksMock = (): { blocks: any[] } => ({ blocks: [] as any[] })

jest.mock('../../../../shared/utils/slackMessages.utils', () => ({
  msgAlertDetail: jest.fn(() => buildBlocksMock()),
  msgAlertCreated: jest.fn(() => buildBlocksMock()),
  msgAlertsList: jest.fn(() => buildBlocksMock()),
  msgTasksList: jest.fn(() => buildBlocksMock()),
  msgNotesList: jest.fn(() => buildBlocksMock()),
  msgLinksList: jest.fn(() => buildBlocksMock()),
  msgTaskCreated: jest.fn(() => buildBlocksMock()),
  msgNoteCreated: jest.fn(() => buildBlocksMock()),
  msgLinkCreated: jest.fn(() => buildBlocksMock()),
  msgReminderCreated: jest.fn(() => buildBlocksMock()),
  msgRemindersList: jest.fn(() => buildBlocksMock()),
  msgReminderDetail: jest.fn(() => buildBlocksMock()),
  msgAssistantQuickHelp: jest.fn(() => buildBlocksMock()),
}))

jest.mock('../../../../config/socketConfig', () => ({
  IoServer: { io: { in: () => ({ emit: jest.fn() }) } },
}))

jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: {
    client: {
      chat: {
        postMessage: jest.fn(),
      },
    },
  },
}))

const redisRepositoryMock = {
  getAlertSnoozeConfig: jest.fn(),
  saveAlertSnoozeConfig: jest.fn(),
}

const alertsServicesMock = {
  getAlertById: jest.fn(),
  getAlertsByUserId: jest.fn(),
  rescheduleAlert: jest.fn(),
  createFollowUpAlert: jest.fn(),
}

const USER_ID = 42
const ALERT_ID = 7

let alertInteractionsService: AlertInteractionsService
let conversationsServices: ConversationsServices
let messageProcessor: MessageProcessor

/** The Slack-action entry point: `handleAction('alert', operation, id, ...)`. */
const viaSlackAction = async (
  operation: string,
  channelId?: string,
  isChannelContext = false
): Promise<string | { blocks: any[] }> => {
  return await conversationsServices.handleAction(
    { entity: 'alert', operation, targetId: ALERT_ID },
    USER_ID,
    { channelId, isChannelContext }
  )
}

/**
 * The text-command entry point. `processAssistantMessage` wraps the shared result
 * in an assistant message, so a string result surfaces as `response.content` and a
 * block result as `response.contentBlock` — unwrapped here so the two entry points
 * are compared on the same shape.
 */
const viaTextCommand = async (
  message: string,
  channelId?: string,
  isChannelContext = false
): Promise<string | { blocks: any[] } | undefined> => {
  const result = await messageProcessor.processAssistantMessage(
    message,
    USER_ID,
    channelId,
    isChannelContext
  )

  const response = result.response as any

  return response?.contentBlock ?? response?.content
}

describe('Alert delegation parity between the two entry points (AC-5)', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    alertInteractionsService = new AlertInteractionsService(
      alertsServicesMock as any,
      redisRepositoryMock as any
    )

    conversationsServices = new ConversationsServices(
      {} as any, // aiRepository
      redisRepositoryMock as any,
      {} as any, // usersServices
      alertsServicesMock as any,
      alertInteractionsService,
      {} as any, // tasksServices
      {} as any, // notesServices
      {} as any, // linksServices
      {} as any, // messageProcessor
      {} as any // remindersServices
    )

    messageProcessor = new MessageProcessor(
      {} as any, // aiRepository
      redisRepositoryMock as any,
      alertsServicesMock as any,
      alertInteractionsService,
      {} as any, // tasksServices
      {} as any, // notesServices
      {} as any, // linksServices
      {} as any, // remindersServices
      {} as any, // imagesServices
      {} as any, // searchRepository
      {} as any, // translateServices
      {} as any // qrServices
    )
  })

  describe('snooze', () => {
    // `snooze_default` (button) and a bare `snooze #7` (text) both resolve to the
    // stored preference with updatePreference false — the same service arguments.
    it('produces the identical result for the stored-preference amount', async () => {
      redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 25 })
      alertsServicesMock.rescheduleAlert.mockResolvedValue({ data: { id: ALERT_ID } })

      const fromAction = await viaSlackAction('snooze_default')
      const fromText = await viaTextCommand(`snooze #${ALERT_ID}`)

      // Non-vacuity: both sides really produced a block, not undefined.
      expect(fromAction).toEqual({ blocks: expect.any(Array) })
      expect(fromText).toEqual(fromAction)
      expect(alertsServicesMock.rescheduleAlert).toHaveBeenNthCalledWith(1, ALERT_ID, USER_ID, 25)
      expect(alertsServicesMock.rescheduleAlert).toHaveBeenNthCalledWith(2, ALERT_ID, USER_ID, 25)
    })

    it('neither entry point writes the preference for the stored-preference amount', async () => {
      redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 25 })
      alertsServicesMock.rescheduleAlert.mockResolvedValue({ data: { id: ALERT_ID } })

      await viaSlackAction('snooze_default')
      await viaTextCommand(`snooze #${ALERT_ID}`)

      expect(redisRepositoryMock.saveAlertSnoozeConfig).not.toHaveBeenCalled()
    })

    it('surfaces the identical reschedule error message', async () => {
      redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 25 })
      alertsServicesMock.rescheduleAlert.mockResolvedValue({ error: 'No se encontró la alerta' })

      const fromAction = await viaSlackAction('snooze_default')
      const fromText = await viaTextCommand(`snooze #${ALERT_ID}`)

      expect(fromAction).toBe('No se encontró la alerta')
      expect(fromText).toBe(fromAction)
    })

    it('surfaces the identical default reschedule failure message', async () => {
      redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 25 })
      alertsServicesMock.rescheduleAlert.mockResolvedValue({ data: null })

      const fromAction = await viaSlackAction('snooze_default')
      const fromText = await viaTextCommand(`snooze #${ALERT_ID}`)

      expect(fromAction).toBe('No se pudo reprogramar la alerta. 😅')
      expect(fromText).toBe(fromAction)
    })
  })

  describe('repeat', () => {
    it.each([
      ['daily', 'repeat_daily', `alert repeat #${ALERT_ID} daily`],
      ['weekly', 'repeat_weekly', `alert repeat #${ALERT_ID} weekly`],
    ])('produces the identical %s recurrence result', async (_policy, operation, text) => {
      alertsServicesMock.createFollowUpAlert.mockResolvedValue({ data: { id: 99 } })

      const fromAction = await viaSlackAction(operation)
      const fromText = await viaTextCommand(text)

      // Non-vacuity: the recurrence context block the service appends is present.
      expect((fromAction as { blocks: any[] }).blocks).toHaveLength(1)
      expect(fromText).toEqual(fromAction)
    })

    it('surfaces the identical follow-up error message', async () => {
      alertsServicesMock.createFollowUpAlert.mockResolvedValue({ error: 'Sin cupo' })

      const fromAction = await viaSlackAction('repeat_daily')
      const fromText = await viaTextCommand(`alert repeat #${ALERT_ID} daily`)

      expect(fromAction).toBe('Sin cupo')
      expect(fromText).toBe(fromAction)
    })

    it('surfaces the identical default recurrence failure message', async () => {
      alertsServicesMock.createFollowUpAlert.mockResolvedValue({ data: null })

      const fromAction = await viaSlackAction('repeat_daily')
      const fromText = await viaTextCommand(`alert repeat #${ALERT_ID} daily`)

      expect(fromAction).toBe('No se pudo crear la recurrencia. 😅')
      expect(fromText).toBe(fromAction)
    })
  })

  describe('list by scope', () => {
    const alerts = [
      { id: 1, sent: false, date: new Date(Date.now() - 60_000), message: 'past' },
      { id: 2, sent: false, date: new Date(Date.now() + 60_000), message: 'future' },
      { id: 3, sent: true, date: new Date(Date.now() - 60_000), message: 'done' },
    ]

    it.each([
      ['pending', 'list_pending', 'alerts pending'],
      ['all', 'list_all', 'alerts all'],
      ['snoozed', 'list_snoozed', 'alerts snoozed'],
      ['overdue', 'list_overdue', 'alerts overdue'],
      ['resolved', 'list_resolved', 'alerts resolved'],
    ])('produces the identical %s listing', async (_scope, operation, text) => {
      alertsServicesMock.getAlertsByUserId.mockResolvedValue({ data: alerts })

      const fromAction = await viaSlackAction(operation, 'C1', true)
      const fromText = await viaTextCommand(text, 'C1', true)

      // Non-vacuity: both sides really rendered a listing, not undefined.
      expect(fromAction).toEqual({ blocks: expect.any(Array) })
      expect(fromText).toEqual(fromAction)
      expect(alertsServicesMock.getAlertsByUserId).toHaveBeenNthCalledWith(1, USER_ID, {
        channelId: 'C1',
      })
      expect(alertsServicesMock.getAlertsByUserId).toHaveBeenNthCalledWith(2, USER_ID, {
        channelId: 'C1',
      })
    })

    it('surfaces the identical lookup error message', async () => {
      alertsServicesMock.getAlertsByUserId.mockResolvedValue({ error: 'db down' })

      const fromAction = await viaSlackAction('list_pending')
      const fromText = await viaTextCommand('alerts pending')

      expect(fromAction).toBe('No se pudieron obtener las alertas. 😅')
      expect(fromText).toBe(fromAction)
    })

    it('surfaces the identical empty-store message', async () => {
      alertsServicesMock.getAlertsByUserId.mockResolvedValue({ data: [] })

      const fromAction = await viaSlackAction('list_pending')
      const fromText = await viaTextCommand('alerts pending')

      expect(fromAction).toBe('No tienes alertas guardadas.')
      expect(fromText).toBe(fromAction)
    })

    it('surfaces the identical scope-specific empty message', async () => {
      alertsServicesMock.getAlertsByUserId.mockResolvedValue({ data: [alerts[2]] })

      const fromAction = await viaSlackAction('list_pending')
      const fromText = await viaTextCommand('alerts pending')

      expect(fromAction).toBe('No tienes alertas pendientes.')
      expect(fromText).toBe(fromAction)
    })
  })
})
