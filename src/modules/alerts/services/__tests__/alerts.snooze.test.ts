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
describe('AlertsServices snoozeAlertByPreset', () => {
  let dataSource: DataSource
  let services: AlertsServices
  let userId: number
  let otherUserId: number
  let alertId: number

  // Future date: relative presets add to it, so results do not depend on the clock.
  // No fake timers: replacing the global Date breaks TypeORM's date hydration
  const scheduledAt = new Date('2099-01-01T18:00:00.123Z')

  const createUser = async (email: string): Promise<number> => {
    const user = new Users()
    user.name = email
    user.phone = ''
    user.email = email
    await user.save()
    return user.id
  }

  const reload = async (): Promise<Alerts> =>
    await Alerts.findOneOrFail({ where: { id: alertId }, relations: ['user'] })

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

    await Alerts.createQueryBuilder()
      .insert()
      .into(Alerts)
      .values({
        message: 'Llamar al dentista',
        date: scheduledAt,
        sent: true,
        user: { id: userId },
        channelId: 'C123',
        requestId: '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        source: 'esp32-poc',
        deviceId: 'esp32-02',
      })
      .execute()
    alertId = (await Alerts.findOneByOrFail({ message: 'Llamar al dentista' })).id

    services = new AlertsServices(new AlertsDataSource(), {} as any)
  })

  it('reschedules the same alert, leaves it pending and keeps its other data', async () => {
    const result = await services.snoozeAlertByPreset(alertId, userId, 'snooze_5m', scheduledAt)

    const target = new Date('2099-01-01T18:05:00.123Z')
    expect(result).toEqual({ status: 'snoozed', alertId, scheduledAt: target })

    const stored = await reload()
    expect(stored.date).toEqual(target)
    expect(stored.sent).toBe(false)
    expect(stored).toMatchObject({
      message: 'Llamar al dentista',
      channelId: 'C123',
      requestId: '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
      source: 'esp32-poc',
      deviceId: 'esp32-02',
      user: { id: userId },
    })
    expect(await Alerts.count()).toBe(1)
  })

  it('reports missing and other-user alerts as not_found without changes', async () => {
    expect(
      await services.snoozeAlertByPreset(alertId, otherUserId, 'snooze_1h', scheduledAt)
    ).toEqual({ status: 'not_found' })
    expect(
      await services.snoozeAlertByPreset(alertId + 100, userId, 'snooze_1h', scheduledAt)
    ).toEqual({ status: 'not_found' })

    expect((await reload()).date).toEqual(scheduledAt)
  })

  it('rejects a stale expected date without changes', async () => {
    const stale = new Date('2099-01-01T18:00:00.000Z')

    const result = await services.snoozeAlertByPreset(alertId, userId, 'snooze_1h', stale)

    expect(result).toEqual({ status: 'schedule_changed' })
    const stored = await reload()
    expect(stored.date).toEqual(scheduledAt)
    expect(stored.sent).toBe(true)
  })

  it('lets only one of two concurrent snoozes with the same expected date win', async () => {
    const results = await Promise.all([
      services.snoozeAlertByPreset(alertId, userId, 'snooze_1h', scheduledAt),
      services.snoozeAlertByPreset(alertId, userId, 'snooze_tomorrow_same_time', scheduledAt),
    ])

    const statuses = results.map((result) => result.status).sort()
    expect(statuses).toEqual(['schedule_changed', 'snoozed'])

    const winner = results.find((result) => result.status === 'snoozed') as any
    expect((await reload()).date).toEqual(winner.scheduledAt)
  })
})
