import { DataSource } from 'typeorm'

import { BridgeDeliveries } from '../../../../entities/bridgeDeliveries'
import { Users } from '../../../../entities/users'
import BridgeConfigDataSource from '../../repositories/database/bridgeConfig.dataSource'
import BridgeDeliveriesDataSource from '../../repositories/database/bridgeDeliveries.dataSource'
import BridgeServices from '../bridge.services'

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

// Integration test of the delivery lifecycle against an in-memory SQLite database,
// with the HTTP repository mocked
describe('BridgeServices delivery lifecycle', () => {
  let dataSource: DataSource
  let services: BridgeServices
  const postAlertEventMock = jest.fn()

  const minute = 60 * 1000
  const triggeredAt = new Date('2026-10-25T15:10:42.000Z')

  const createUser = async (email: string, secret: string): Promise<number> => {
    const user = new Users()
    user.name = email
    user.phone = ''
    user.email = email
    await user.save()

    await new BridgeConfigDataSource().updateBridgeConfig(user.id, {
      baseUrl: `https://${email.split('@')[0]}.example.com`,
      enabled: true,
      secret,
    })

    return user.id
  }

  const alertOf = (id: number, userId: number): any => ({
    id,
    message: `Alerta ${id}`,
    date: new Date('2026-10-25T15:10:00.000Z'),
    user: { id: userId, bridgeBaseUrl: 'https://bridge.example.com', bridgeWebhookEnabled: true },
  })

  const deliveryOf = async (alertId: number): Promise<BridgeDeliveries> =>
    await BridgeDeliveries.findOneByOrFail({ alertId })

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [BridgeDeliveries, Users],
      synchronize: true,
    })
    await dataSource.initialize()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    await BridgeDeliveries.clear()
    await Users.clear()

    services = new BridgeServices(new BridgeConfigDataSource(), new BridgeDeliveriesDataSource(), {
      postAlertEvent: postAlertEventMock,
    } as any)
  })

  it('retries until the bridge accepts the event, keeping its identity', async () => {
    const userId = await createUser('bridge@example.com', 'a'.repeat(32))
    await services.enqueueAlertEvent(alertOf(1, userId), triggeredAt)
    const { eventId } = await deliveryOf(1)

    postAlertEventMock.mockResolvedValueOnce({ status: 503 })
    await services.processPendingDeliveries(triggeredAt)

    expect(await deliveryOf(1)).toMatchObject({ status: 'pending', attempts: 1 })

    // Not due yet: nothing is sent
    await services.processPendingDeliveries(new Date(triggeredAt.getTime() + 30 * 1000))
    expect(postAlertEventMock).toHaveBeenCalledTimes(1)

    postAlertEventMock.mockResolvedValueOnce({ status: 202 })
    const deliveredAt = new Date(triggeredAt.getTime() + minute)
    await services.processPendingDeliveries(deliveredAt)

    expect(postAlertEventMock).toHaveBeenCalledTimes(2)
    const [first, second] = postAlertEventMock.mock.calls
    expect(second).toEqual(first)
    expect(second[2].event_id).toBe(eventId)
    expect(await deliveryOf(1)).toMatchObject({
      status: 'delivered',
      attempts: 2,
      lastStatusCode: 202,
      lockedUntil: null,
      deliveredAt,
    })

    // Delivered events are not sent again
    await services.processPendingDeliveries(new Date(deliveredAt.getTime() + 60 * minute))
    expect(postAlertEventMock).toHaveBeenCalledTimes(2)
  })

  it('sends each event with the URL and secret of its own user', async () => {
    const firstUser = await createUser('first@example.com', 'a'.repeat(32))
    const secondUser = await createUser('second@example.com', 'b'.repeat(32))
    await services.enqueueAlertEvent(alertOf(1, firstUser), triggeredAt)
    await services.enqueueAlertEvent(alertOf(2, secondUser), triggeredAt)
    postAlertEventMock.mockResolvedValue({ status: 202 })

    await services.processPendingDeliveries(triggeredAt)

    expect(postAlertEventMock).toHaveBeenCalledWith(
      'https://first.example.com',
      'a'.repeat(32),
      expect.objectContaining({ alert_id: 1 })
    )
    expect(postAlertEventMock).toHaveBeenCalledWith(
      'https://second.example.com',
      'b'.repeat(32),
      expect.objectContaining({ alert_id: 2 })
    )
  })

  it('discards pending events once the user disables the bridge', async () => {
    const userId = await createUser('bridge@example.com', 'a'.repeat(32))
    await services.enqueueAlertEvent(alertOf(1, userId), triggeredAt)
    await services.updateConfig(userId, { enabled: false })

    await services.processPendingDeliveries(triggeredAt)

    expect(postAlertEventMock).not.toHaveBeenCalled()
    expect(await deliveryOf(1)).toMatchObject({ status: 'failed', lastError: 'bridge_disabled' })

    // Enabling it again does not bring the discarded event back
    await services.updateConfig(userId, { enabled: true })
    await services.processPendingDeliveries(new Date(triggeredAt.getTime() + 60 * minute))
    expect(postAlertEventMock).not.toHaveBeenCalled()
  })

  it('recovers an event left sending by a run that stopped', async () => {
    const userId = await createUser('bridge@example.com', 'a'.repeat(32))
    await services.enqueueAlertEvent(alertOf(1, userId), triggeredAt)
    const delivery = await deliveryOf(1)
    await BridgeDeliveries.update(delivery.id, {
      status: 'sending',
      lockedUntil: new Date(triggeredAt.getTime() + 2 * minute),
    })
    postAlertEventMock.mockResolvedValue({ status: 202 })

    await services.processPendingDeliveries(new Date(triggeredAt.getTime() + minute))
    expect(postAlertEventMock).not.toHaveBeenCalled()

    await services.processPendingDeliveries(new Date(triggeredAt.getTime() + 3 * minute))
    expect(postAlertEventMock).toHaveBeenCalledTimes(1)
    expect(await deliveryOf(1)).toMatchObject({ status: 'delivered' })
  })

  it('sends an event once when two runs overlap', async () => {
    const userId = await createUser('bridge@example.com', 'a'.repeat(32))
    await services.enqueueAlertEvent(alertOf(1, userId), triggeredAt)
    postAlertEventMock.mockResolvedValue({ status: 202 })

    await Promise.all([
      services.processPendingDeliveries(triggeredAt),
      services.processPendingDeliveries(triggeredAt),
    ])

    expect(postAlertEventMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after the last attempt, about one hour later', async () => {
    const userId = await createUser('bridge@example.com', 'a'.repeat(32))
    await services.enqueueAlertEvent(alertOf(1, userId), triggeredAt)
    postAlertEventMock.mockResolvedValue({ status: 503 })

    let now = triggeredAt
    for (let attempt = 1; attempt <= 8; attempt++) {
      await services.processPendingDeliveries(now)
      now = (await deliveryOf(1)).nextAttemptAt
    }

    const delivery = await deliveryOf(1)
    expect(postAlertEventMock).toHaveBeenCalledTimes(8)
    expect(delivery).toMatchObject({ status: 'failed', attempts: 8, lastError: 'max_attempts' })
    expect((now.getTime() - triggeredAt.getTime()) / minute).toBe(60)
  })
})
