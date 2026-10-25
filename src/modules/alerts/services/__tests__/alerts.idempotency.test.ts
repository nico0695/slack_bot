import { DataSource } from 'typeorm'

import { Alerts } from '../../../../entities/alerts'
import { Users } from '../../../../entities/users'
import AlertsDataSource from '../../repositories/database/alerts.dataSource'
import AlertsServices from '../alerts.services'

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

// Integration test against an in-memory SQLite database
describe('AlertsServices idempotent creation', () => {
  let dataSource: DataSource
  let alertsDataSource: AlertsDataSource
  let services: AlertsServices
  let userId: number
  let otherUserId: number

  const requestId = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

  const createUser = async (email: string): Promise<number> => {
    const user = new Users()
    user.name = email
    user.phone = ''
    user.email = email
    await user.save()
    return user.id
  }

  const payload = (): any => ({
    userId,
    message: 'Alerta de prueba desde ESP32',
    date: new Date('2026-10-25T15:10:00.000Z'),
    requestId,
    source: 'esp32-poc',
    deviceId: 'esp32-02',
  })

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [Alerts, Users],
      synchronize: true,
    })
    await dataSource.initialize()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await Alerts.clear()
    await Users.clear()

    userId = await createUser('nick@example.com')
    otherUserId = await createUser('other@example.com')

    alertsDataSource = new AlertsDataSource()
    services = new AlertsServices(alertsDataSource, {} as any)
  })

  it('keeps creating independent alerts without requestId', async () => {
    const data = { userId, message: 'Ping', date: new Date() }

    const first = await services.createAlert(data)
    const second = await services.createAlert(data)

    expect(first.data.id).not.toBe(second.data.id)
    expect(await Alerts.count()).toBe(2)
  })

  it('returns the same alert when the request is repeated', async () => {
    const first = await services.createAlert(payload())
    const second = await services.createAlert(payload())

    expect(first.data).toMatchObject({ requestId, source: 'esp32-poc', deviceId: 'esp32-02' })
    expect(second.data.id).toBe(first.data.id)
    expect(await Alerts.count()).toBe(1)
  })

  it('returns the same alert after it was notified and its date passed', async () => {
    const first = await services.createAlert(payload())
    await Alerts.update(first.data.id, { sent: true })

    const retry = await services.createAlert(payload())

    expect(retry.error).toBeUndefined()
    expect(retry.data.id).toBe(first.data.id)
    expect(retry.data.sent).toBe(true)
  })

  it('returns a conflict when the requestId is reused with different data', async () => {
    const first = await services.createAlert(payload())

    const conflict = await services.createAlert({ ...payload(), message: 'Otra alerta' })

    expect(conflict).toEqual({
      error: 'El requestId ya fue usado con datos distintos',
      conflictAlertId: first.data.id,
    })
    expect(await Alerts.count()).toBe(1)
  })

  it('scopes the requestId to the user', async () => {
    const mine = await services.createAlert(payload())
    const theirs = await services.createAlert({ ...payload(), userId: otherUserId })

    expect(theirs.data.id).not.toBe(mine.data.id)
    expect(await Alerts.count()).toBe(2)
  })

  it('stores a single alert for concurrent identical requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, async () => await services.createAlert(payload()))
    )

    const ids = new Set(results.map((result) => result.data?.id))

    expect(results.every((result) => result.error === undefined)).toBe(true)
    expect(ids.size).toBe(1)
    expect(await Alerts.count()).toBe(1)
  })

  it('keeps a single row when the same request is inserted twice', async () => {
    await alertsDataSource.insertAlertIfAbsent(payload())
    await alertsDataSource.insertAlertIfAbsent({ ...payload(), message: 'Otra alerta' })

    const stored = await alertsDataSource.getAlertByRequestId(userId, requestId)

    expect(stored.message).toBe('Alerta de prueba desde ESP32')
    expect(await Alerts.count()).toBe(1)
  })

  it('rejects a duplicated (user, requestId) at the database level', async () => {
    await alertsDataSource.insertAlertIfAbsent(payload())

    await expect(
      Alerts.insert({ message: 'Otra', date: new Date(), user: { id: userId }, requestId })
    ).rejects.toThrow(/UNIQUE/)
  })

  it('exposes request metadata and bridge flags, never the secret, to the cron', async () => {
    await Users.update(userId, {
      bridgeBaseUrl: 'https://bridge.example.com',
      bridgeWebhookEnabled: true,
      bridgeWebhookSecret: 's'.repeat(32),
    })
    await services.createAlert({ ...payload(), date: new Date(Date.now() - 60 * 1000) })

    const [alert] = await alertsDataSource.getAlertsByDate(new Date())

    expect(alert).toMatchObject({ requestId, deviceId: 'esp32-02' })
    expect(alert.user).toMatchObject({
      id: userId,
      bridgeBaseUrl: 'https://bridge.example.com',
      bridgeWebhookEnabled: true,
    })
    expect(JSON.stringify(alert)).not.toContain('s'.repeat(32))
  })
})
