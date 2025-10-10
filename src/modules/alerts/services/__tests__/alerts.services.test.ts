import AlertsServices from '../alerts.services'

const createAlertMock = jest.fn()
const getAlertsByUserIdMock = jest.fn()
const getAlertByIdMock = jest.fn()
const updateAlertMock = jest.fn()
const getAlertsByDateMock = jest.fn()
const updateAlertAsNotifiedMock = jest.fn()
const deleteAlertsMock = jest.fn()
const getUsersSubscriptionsMock = jest.fn()
const deleteAlertMetadataMock = jest.fn()
const formatTextToDateMock = jest.fn()

const alertsDataSourceInstance = {
  createAlert: createAlertMock,
  getAlertsByUserId: getAlertsByUserIdMock,
  getAlertById: getAlertByIdMock,
  updateAlert: updateAlertMock,
  getAlertsByDate: getAlertsByDateMock,
  updateAlertAsNotified: updateAlertAsNotifiedMock,
  deleteAlerts: deleteAlertsMock,
}

const usersRedisInstance = {
  getUsersSubscriptions: getUsersSubscriptionsMock,
}

const redisRepositoryInstance = {
  deleteAlertMetadata: deleteAlertMetadataMock,
  getAlertMetadata: jest.fn(),
}

jest.mock('../../repositories/database/alerts.dataSource', () => ({
  __esModule: true,
  default: {
    getInstance: () => alertsDataSourceInstance,
  },
}))

jest.mock('../../../users/repositories/redis/users.redis', () => ({
  __esModule: true,
  UsersRedis: {
    getInstance: () => usersRedisInstance,
  },
}))

jest.mock('../../../conversations/repositories/redis/conversations.redis', () => ({
  __esModule: true,
  RedisRepository: {
    getInstance: () => redisRepositoryInstance,
  },
}))

jest.mock('../../../../shared/utils/dates.utils', () => ({
  formatTextToDate: (...args: any[]) => formatTextToDateMock(...args),
}))

describe('AlertsServices', () => {
  const services = AlertsServices.getInstance()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createAssistantAlert', () => {
    it('formats text date and delegates creation', async () => {
      const parsedDate = new Date('2024-01-01T12:00:00.000Z')
      formatTextToDateMock.mockReturnValue(parsedDate)
      createAlertMock.mockResolvedValue({ id: 7 })

      const result = await services.createAssistantAlert(10, 'mañana', 'Standup')

      expect(formatTextToDateMock).toHaveBeenCalledWith('mañana')
      expect(createAlertMock).toHaveBeenCalledWith({
        userId: 10,
        date: parsedDate,
        message: 'Standup',
      })
      expect(result).toEqual({ data: { id: 7 } })
    })

    it('returns error when creation fails', async () => {
      formatTextToDateMock.mockReturnValue(new Date())
      createAlertMock.mockRejectedValue(new Error('fail'))

      const result = await services.createAssistantAlert(1, 'today', 'Ping')

      expect(result.error).toBe('Error al crear la alerta')
    })
  })

  it('fetches alerts by user with default filters', async () => {
    getAlertsByUserIdMock.mockResolvedValue([{ id: 1 }])

    const result = await services.getAlertsByUserId(5)

    expect(getAlertsByUserIdMock).toHaveBeenCalledWith(5, { sent: false })
    expect(result).toEqual({ data: [{ id: 1 }] })
  })

  it('returns error when alert is not found', async () => {
    getAlertByIdMock.mockResolvedValue(null)

    const result = await services.getAlertById(1, 2)

    expect(result.error).toBe('No se encontró la alerta solicitada')
  })

  describe('rescheduleAlert', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('calculates next date from now when alert is in the past', async () => {
      const now = new Date('2024-02-01T10:00:00.000Z')
      jest.useFakeTimers().setSystemTime(now)

      getAlertByIdMock.mockResolvedValue({
        id: 9,
        date: new Date('2024-02-01T09:30:00.000Z'),
      })
      const updatedAlert = { id: 9, date: new Date('2024-02-01T10:15:00.000Z') }
      updateAlertMock.mockResolvedValue(updatedAlert)

      const result = await services.rescheduleAlert(9, 3, 15)

      expect(updateAlertMock.mock.calls[0][2]).toMatchObject({
        date: new Date('2024-02-01T10:15:00.000Z'),
        sent: false,
      })
      expect(result).toEqual({ data: updatedAlert })
    })

    it('returns error when alert does not exist', async () => {
      getAlertByIdMock.mockResolvedValue(null)

      const result = await services.rescheduleAlert(1, 1, 5)

      expect(result.error).toBe('No se encontró la alerta solicitada')
    })
  })

  describe('markAlertResolved', () => {
    it('signals error when update returns null', async () => {
      updateAlertMock.mockResolvedValue(null)

      const result = await services.markAlertResolved(1, 2)

      expect(result.error).toBe('No se encontró la alerta solicitada')
    })

    it('returns updated alert when successful', async () => {
      const alert = { id: 4 }
      updateAlertMock.mockResolvedValue(alert)

      const result = await services.markAlertResolved(4, 3)

      expect(updateAlertMock).toHaveBeenCalledWith(4, 3, { sent: true })
      expect(result).toEqual({ data: alert })
    })
  })

  describe('createFollowUpAlert', () => {
    it('returns error when base alert is missing', async () => {
      getAlertByIdMock.mockResolvedValue(null)

      const result = await services.createFollowUpAlert(1, 2, 30)

      expect(result.error).toBe('No se encontró la alerta base para duplicar')
    })

    it('duplicates alert with shifted date', async () => {
      getAlertByIdMock.mockResolvedValue({
        id: 1,
        message: 'Original',
        date: new Date('2024-02-01T08:00:00.000Z'),
      })
      const newAlert = { id: 99 }
      createAlertMock.mockResolvedValue(newAlert)

      const result = await services.createFollowUpAlert(1, 2, 60)

      expect(createAlertMock).toHaveBeenCalledWith({
        userId: 2,
        message: 'Original',
        date: new Date('2024-02-01T09:00:00.000Z'),
      })
      expect(result).toEqual({ data: newAlert })
    })
  })

  it('enriches alerts to notify with push subscriptions', async () => {
    const alerts = [
      {
        id: 1,
        message: 'Ping',
        date: new Date(),
        user: { id: 5, slackChannelId: 'abc', pwSubscription: undefined as unknown },
      },
    ]
    getAlertsByDateMock.mockResolvedValue(alerts)
    const userSubscriptions: Record<string, unknown> = {
      5: { endpoint: 'https://example.com' },
    }
    getUsersSubscriptionsMock.mockResolvedValue(userSubscriptions)

    const result = await services.getAlertsToNotify()

    expect(result.data?.[0].user.pwSubscription).toEqual({ endpoint: 'https://example.com' })
  })

  describe('updateAlertAsNotified', () => {
    it('returns success flag', async () => {
      updateAlertAsNotifiedMock.mockResolvedValue(undefined)

      const result = await services.updateAlertAsNotified([1, 2])

      expect(updateAlertAsNotifiedMock).toHaveBeenCalledWith([1, 2])
      expect(result).toEqual({ data: true })
    })

    it('returns error when update fails', async () => {
      updateAlertAsNotifiedMock.mockRejectedValue(new Error('fail'))

      const result = await services.updateAlertAsNotified([1])

      expect(result.error).toBe('Error al actualizar la alerta')
    })
  })

  describe('deleteAlert', () => {
    it('deletes metadata when alert existed', async () => {
      deleteAlertsMock.mockResolvedValue(1)

      const result = await services.deleteAlert(4, 8)

      expect(deleteAlertMetadataMock).toHaveBeenCalledWith(4)
      expect(result).toEqual({ data: true })
    })

    it('skips metadata removal when nothing deleted', async () => {
      deleteAlertsMock.mockResolvedValue(0)

      const result = await services.deleteAlert(4, 8)

      expect(deleteAlertMetadataMock).not.toHaveBeenCalled()
      expect(result).toEqual({ data: false })
    })

    it('returns error when repository throws', async () => {
      deleteAlertsMock.mockRejectedValue(new Error('fail'))

      const result = await services.deleteAlert(4, 8)

      expect(result.error).toBe('Error al eliminar la alerta')
    })
  })
})
