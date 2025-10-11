import { alertCronJob } from '../cronJob'

const getAlertsToNotifyMock = jest.fn()
const updateAlertAsNotifiedMock = jest.fn()
const postMessageMock = jest.fn()
const sendNotificationMock = jest.fn()
const msgAlertDetailMock = jest.fn()

const alertsServicesInstance = {
  getAlertsToNotify: getAlertsToNotifyMock,
  updateAlertAsNotified: updateAlertAsNotifiedMock,
}

jest.mock('../../services/alerts.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => alertsServicesInstance,
  },
}))

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

describe('alertCronJob', () => {
  let consoleLogSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
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
    expect(sendNotificationMock).toHaveBeenCalledWith(
      alert.user.pwSubscription,
      expect.any(String)
    )
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
})
