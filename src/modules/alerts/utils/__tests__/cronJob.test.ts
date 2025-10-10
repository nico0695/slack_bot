import { alertCronJob } from '../cronJob'

const getAlertsToNotifyMock = jest.fn()
const updateAlertAsNotifiedMock = jest.fn()
const getAlertMetadataMock = jest.fn()
const postMessageMock = jest.fn()
const sendNotificationMock = jest.fn()
const msgAlertDetailMock = jest.fn()

const alertsServicesInstance = {
  getAlertsToNotify: getAlertsToNotifyMock,
  updateAlertAsNotified: updateAlertAsNotifiedMock,
}

const conversationsRedisInstance = {
  getAlertMetadata: getAlertMetadataMock,
}

jest.mock('../../services/alerts.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => alertsServicesInstance,
  },
}))

jest.mock('../../../conversations/repositories/redis/conversations.redis', () => ({
  __esModule: true,
  RedisRepository: {
    getInstance: () => conversationsRedisInstance,
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
    getAlertMetadataMock.mockResolvedValue({ priority: 'high' })
    msgAlertDetailMock.mockReturnValue({ blocks: ['block-data'] })
    postMessageMock.mockResolvedValue(undefined)
    sendNotificationMock.mockResolvedValue(undefined)
    updateAlertAsNotifiedMock.mockResolvedValue(undefined)

    await alertCronJob()
    await new Promise((resolve) => setImmediate(resolve))

    expect(getAlertMetadataMock).toHaveBeenCalledWith(1)
    expect(msgAlertDetailMock).toHaveBeenCalledWith(alert, { priority: 'high' })
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
})
