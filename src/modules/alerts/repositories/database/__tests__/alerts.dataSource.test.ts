import { Alerts } from '../../../../../entities/alerts'
import AlertsDataSource from '../alerts.dataSource'

describe('AlertsDataSource', () => {
  const dataSource = new AlertsDataSource()

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createAlert', () => {
    it('persists a new alert for user', async () => {
      const saveSpy = jest
        .spyOn(Alerts.prototype as any, 'save')
        .mockImplementation(async function (this: Alerts) {
          return this
        })

      const result = await dataSource.createAlert({
        userId: 5,
        date: new Date('2023-01-01T00:00:00.000Z'),
        message: 'Wake up!',
      })

      expect(saveSpy).toHaveBeenCalledTimes(1)
      expect(result).toBeInstanceOf(Alerts)
      expect(result.message).toBe('Wake up!')
      expect(result.user.id).toBe(5)
    })

    it('throws when save fails', async () => {
      const error = new Error('db error')
      jest.spyOn(Alerts.prototype as any, 'save').mockRejectedValue(error)

      await expect(
        dataSource.createAlert({
          userId: 9,
          date: new Date(),
          message: 'Ping',
        })
      ).rejects.toBe(error)
    })
  })

  it('gets alert by request id including soft deleted rows', async () => {
    const alert = { id: 4 } as any
    const findOneSpy = jest.spyOn(Alerts, 'findOne').mockResolvedValue(alert)

    const result = await dataSource.getAlertByRequestId(3, 'req-1')

    expect(findOneSpy).toHaveBeenCalledWith({
      where: { user: { id: 3 }, requestId: 'req-1' },
      withDeleted: true,
    })
    expect(result).toBe(alert)
  })

  it('retrieves alerts for user with extra filters', async () => {
    const alerts = [{ id: 1 }] as any
    const findSpy = jest.spyOn(Alerts, 'find').mockResolvedValue(alerts)

    const result = await dataSource.getAlertsByUserId(3, { sent: true })

    expect(findSpy).toHaveBeenCalledWith({
      where: { user: { id: 3 }, sent: true },
      order: { date: 'ASC' },
    })
    expect(result).toBe(alerts)
  })

  it('retrieves alerts for user with default sent=false filter', async () => {
    const alerts = [{ id: 2 }] as any
    const findSpy = jest.spyOn(Alerts, 'find').mockResolvedValue(alerts)

    const result = await dataSource.getAlertsByUserId(5)

    expect(findSpy).toHaveBeenCalledWith({
      where: { user: { id: 5 }, sent: false },
      order: { date: 'ASC' },
    })
    expect(result).toBe(alerts)
  })

  it('returns error when fetching alerts fails', async () => {
    const error = new Error('fail')
    jest.spyOn(Alerts, 'find').mockRejectedValue(error)

    const result = await dataSource.getAlertsByUserId(3)

    expect(result).toBe(error)
  })

  it('gets single alert by id and user', async () => {
    const alert = { id: 1 } as any
    const findOneSpy = jest.spyOn(Alerts, 'findOne').mockResolvedValue(alert)

    const result = await dataSource.getAlertById(1, 8)

    expect(findOneSpy).toHaveBeenCalledWith({
      where: { id: 1, user: { id: 8 } },
    })
    expect(result).toBe(alert)
  })

  it('updates alert and returns refreshed entity', async () => {
    jest.spyOn(Alerts, 'update').mockResolvedValue({} as any)
    const refreshedAlert = { id: 4 } as any
    const refreshSpy = jest.spyOn(dataSource, 'getAlertById').mockResolvedValue(refreshedAlert)

    const result = await dataSource.updateAlert(4, 2, { message: 'Hey' })

    expect(Alerts.update).toHaveBeenCalledWith({ id: 4, user: { id: 2 } }, { message: 'Hey' })
    expect(refreshSpy).toHaveBeenCalledWith(4, 2)
    expect(result).toBe(refreshedAlert)
  })

  it('gets alerts to notify ordered by date threshold', async () => {
    const alerts = [{ id: 10 }] as any
    const findSpy = jest.spyOn(Alerts, 'find').mockResolvedValue(alerts)

    const date = new Date('2024-01-01T00:00:00.000Z')
    const result = await dataSource.getAlertsByDate(date)

    const callArgs = findSpy.mock.calls[0][0] as any
    expect(callArgs.select).toMatchObject({
      id: true,
      message: true,
      date: true,
      requestId: true,
      deviceId: true,
      user: expect.objectContaining({ bridgeBaseUrl: true, bridgeWebhookEnabled: true }),
    })
    expect(callArgs.select.user).not.toHaveProperty('bridgeWebhookSecret')
    expect(callArgs.relations).toEqual(['user'])
    expect(callArgs.where.sent).toBe(false)
    expect(result).toBe(alerts)
  })

  it('returns error when query for alerts to notify fails', async () => {
    const error = new Error('fail')
    jest.spyOn(Alerts, 'find').mockRejectedValue(error)

    const result = await dataSource.getAlertsByDate(new Date())

    expect(result).toBe(error)
  })

  it('marks each alert as notified only while it keeps the date read', async () => {
    const updateSpy = jest.spyOn(Alerts, 'update').mockResolvedValue({} as any)
    const date = new Date('2030-01-01T18:00:00.000Z')

    await dataSource.updateAlertAsNotified([
      { id: 1, date },
      { id: 2, date },
    ])

    expect(updateSpy).toHaveBeenCalledTimes(2)
    expect(updateSpy).toHaveBeenCalledWith({ id: 1, date, sent: false }, { sent: true })
  })

  it('throws when marking an alert as notified fails', async () => {
    jest.spyOn(Alerts, 'update').mockRejectedValue(new Error('db error'))

    await expect(dataSource.updateAlertAsNotified([{ id: 1, date: new Date() }])).rejects.toThrow(
      'db error'
    )
  })

  describe('deleteAlerts', () => {
    it('returns affected rows count', async () => {
      jest.spyOn(Alerts, 'delete').mockResolvedValue({ affected: 2 } as any)

      const result = await dataSource.deleteAlerts(5, 1)

      expect(Alerts.delete).toHaveBeenCalledWith({ id: 5, user: { id: 1 } })
      expect(result).toBe(2)
    })

    it('returns zero when nothing deleted', async () => {
      jest.spyOn(Alerts, 'delete').mockResolvedValue({ affected: undefined } as any)

      const result = await dataSource.deleteAlerts(5, 1)

      expect(result).toBe(0)
    })

    it('throws when delete fails', async () => {
      jest.spyOn(Alerts, 'delete').mockRejectedValue('boom')

      await expect(dataSource.deleteAlerts(5, 1)).rejects.toThrow('boom')
    })
  })
})
