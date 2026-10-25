import { alertCronJob } from '../cronJob'

const mockAlertsFns = {
  getAlertsToNotify: jest.fn(),
  updateAlertAsNotified: jest.fn(),
  enqueueAlertEvent: jest.fn(),
}

jest.mock('../../services/alerts.services', () => ({
  __esModule: true,
  default: class MockAlertsServices {},
}))

jest.mock('../../../bridge/services/bridge.services', () => ({
  __esModule: true,
  default: class MockBridgeServices {},
}))

jest.mock('tsyringe', () => ({
  container: {
    resolve: jest.fn().mockReturnValue({
      getAlertsToNotify: (...args: any[]) => mockAlertsFns.getAlertsToNotify(...args),
      updateAlertAsNotified: (...args: any[]) => mockAlertsFns.updateAlertAsNotified(...args),
      enqueueAlertEvent: (...args: any[]) => mockAlertsFns.enqueueAlertEvent(...args),
    }),
  },
  singleton: () => (cls: any) => cls,
}))

const getAlertsToNotifyMock = mockAlertsFns.getAlertsToNotify
const updateAlertAsNotifiedMock = mockAlertsFns.updateAlertAsNotified
const enqueueAlertEventMock = mockAlertsFns.enqueueAlertEvent
const postMessageMock = jest.fn()
const sendNotificationMock = jest.fn()
const msgAlertDetailMock = jest.fn()

jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: {
    client: {
      chat: {
        postMessage: (...args: any[]) => postMessageMock(...args),
      },
    },
  },
}))

jest.mock('web-push', () => ({
  sendNotification: (...args: any[]) => sendNotificationMock(...args),
}))

jest.mock('../../../../shared/utils/slackMessages.utils', () => ({
  msgAlertDetail: (...args: any[]) => msgAlertDetailMock(...args),
}))

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

describe('alertCronJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enqueueAlertEventMock.mockResolvedValue({ data: false })
  })

  it('returns early when alert service responds with error', async () => {
    getAlertsToNotifyMock.mockResolvedValue({ error: 'fail' })

    await alertCronJob()

    expect(updateAlertAsNotifiedMock).not.toHaveBeenCalled()
  })

  it('skips processing when there are no alerts', async () => {
    getAlertsToNotifyMock.mockResolvedValue({ data: [] })

    await alertCronJob()

    expect(updateAlertAsNotifiedMock).not.toHaveBeenCalled()
  })

  it('sends slack and push notifications for pending alerts', async () => {
    const alert = {
      id: 1,
      message: 'Ping',
      user: {
        id: 5,
        slackChannelId: 'channel',
        pwSubscription: { endpoint: 'https://example.com' },
      },
    }
    getAlertsToNotifyMock.mockResolvedValue({ data: [alert] })
    msgAlertDetailMock.mockReturnValue({ blocks: ['block-data'] })
    postMessageMock.mockResolvedValue(undefined)
    sendNotificationMock.mockResolvedValue(undefined)
    updateAlertAsNotifiedMock.mockResolvedValue(undefined)

    await alertCronJob()
    await new Promise((resolve) => setImmediate(resolve))

    expect(msgAlertDetailMock).toHaveBeenCalledWith(alert)
    expect(postMessageMock).toHaveBeenCalledWith({
      channel: 'channel',
      text: '🔔 Alerta: Ping',
      blocks: ['block-data'],
    })
    expect(sendNotificationMock).toHaveBeenCalledWith(alert.user.pwSubscription, expect.any(String))
    expect(updateAlertAsNotifiedMock).toHaveBeenCalledWith([1])
  })

  it('skips slack delivery when channel missing but updates notification state', async () => {
    const alert: any = {
      id: 2,
      message: 'No channel',
      user: {
        id: 9,
        slackChannelId: undefined as string | undefined,
        pwSubscription: { endpoint: 'https://example.com' },
      },
    }
    getAlertsToNotifyMock.mockResolvedValue({ data: [alert] })
    updateAlertAsNotifiedMock.mockResolvedValue(undefined)

    await alertCronJob()
    await new Promise((resolve) => setImmediate(resolve))

    expect(postMessageMock).not.toHaveBeenCalled()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(updateAlertAsNotifiedMock).toHaveBeenCalledWith([2])
  })

  it('sends slack message without web push when subscription absent', async () => {
    const alert: any = {
      id: 3,
      message: 'Slack only',
      user: {
        id: 11,
        slackChannelId: 'channel-2',
        pwSubscription: undefined as unknown,
      },
    }
    getAlertsToNotifyMock.mockResolvedValue({ data: [alert] })
    msgAlertDetailMock.mockReturnValue({ blocks: [] })
    updateAlertAsNotifiedMock.mockResolvedValue(undefined)

    await alertCronJob()
    await new Promise((resolve) => setImmediate(resolve))

    expect(postMessageMock).toHaveBeenCalled()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(updateAlertAsNotifiedMock).toHaveBeenCalledWith([3])
  })

  describe('bridge events', () => {
    const slackAlert: any = {
      id: 4,
      message: 'Bridge',
      user: { id: 5, slackChannelId: 'channel', bridgeWebhookEnabled: true },
    }
    const noChannelAlert: any = {
      id: 5,
      message: 'Bridge without Slack',
      user: { id: 5, slackChannelId: '', bridgeWebhookEnabled: true },
    }

    beforeEach(() => {
      msgAlertDetailMock.mockReturnValue({ blocks: [] })
      postMessageMock.mockResolvedValue(undefined)
      updateAlertAsNotifiedMock.mockResolvedValue(undefined)
    })

    it('enqueues every alert with the same trigger time, also without Slack channel', async () => {
      getAlertsToNotifyMock.mockResolvedValue({ data: [slackAlert, noChannelAlert] })
      enqueueAlertEventMock.mockResolvedValue({ data: true })

      await alertCronJob()

      expect(enqueueAlertEventMock).toHaveBeenCalledTimes(2)
      expect(enqueueAlertEventMock).toHaveBeenCalledWith(slackAlert, expect.any(Date))
      expect(enqueueAlertEventMock).toHaveBeenCalledWith(noChannelAlert, expect.any(Date))
      const [[, firstDate], [, secondDate]] = enqueueAlertEventMock.mock.calls
      expect(firstDate).toBe(secondDate)
      expect(updateAlertAsNotifiedMock).toHaveBeenCalledWith([4, 5])
    })

    it('skips Slack and keeps the alert unsent when enqueuing fails', async () => {
      getAlertsToNotifyMock.mockResolvedValue({ data: [slackAlert, noChannelAlert] })
      enqueueAlertEventMock.mockImplementation(async (alert: any) =>
        alert.id === 4 ? { error: 'fail' } : { data: true }
      )

      await alertCronJob()

      expect(postMessageMock).not.toHaveBeenCalled()
      expect(updateAlertAsNotifiedMock).toHaveBeenCalledWith([5])
    })

    it('does not mark anything when every enqueue fails', async () => {
      getAlertsToNotifyMock.mockResolvedValue({ data: [slackAlert] })
      enqueueAlertEventMock.mockResolvedValue({ error: 'fail' })

      await alertCronJob()

      expect(postMessageMock).not.toHaveBeenCalled()
      expect(updateAlertAsNotifiedMock).not.toHaveBeenCalled()
    })

    it('skips a tick while the previous run is still in progress', async () => {
      let releaseFirstRun: (value: any) => void
      getAlertsToNotifyMock.mockReturnValueOnce(
        new Promise((resolve) => {
          releaseFirstRun = resolve
        })
      )

      const firstRun = alertCronJob()
      await alertCronJob()

      expect(getAlertsToNotifyMock).toHaveBeenCalledTimes(1)

      releaseFirstRun({ data: [] })
      await firstRun

      getAlertsToNotifyMock.mockResolvedValue({ data: [] })
      await alertCronJob()

      expect(getAlertsToNotifyMock).toHaveBeenCalledTimes(2)
    })
  })
})
