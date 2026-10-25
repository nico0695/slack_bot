import { DataSource } from 'typeorm'

import { BridgeDeliveries } from '../../../../../entities/bridgeDeliveries'
import BridgeDeliveriesDataSource from '../bridgeDeliveries.dataSource'

// Integration test against an in-memory SQLite database
describe('BridgeDeliveriesDataSource', () => {
  let dataSource: DataSource
  let deliveriesDataSource: BridgeDeliveriesDataSource

  const occurrenceAt = new Date('2026-10-25T15:10:00.000Z')

  const delivery = (eventId: string, date = occurrenceAt): any => ({
    eventId,
    alertId: 123,
    userId: 7,
    occurrenceAt: date,
    nextAttemptAt: new Date('2026-10-25T15:10:42.000Z'),
    payload: {
      version: 1,
      event_id: eventId,
      type: 'alert.triggered',
      alert_id: 123,
      scheduled_at: date.toISOString(),
      triggered_at: '2026-10-25T15:10:42.000Z',
      message: 'Alerta',
    },
  })

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [BridgeDeliveries],
      synchronize: true,
    })
    await dataSource.initialize()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await BridgeDeliveries.clear()
    deliveriesDataSource = new BridgeDeliveriesDataSource()
  })

  it('stores a pending delivery with its payload', async () => {
    await deliveriesDataSource.insertDeliveryIfAbsent(delivery('event-1'))

    const stored = await BridgeDeliveries.findOneBy({ eventId: 'event-1' })

    expect(stored).toMatchObject({
      alertId: 123,
      userId: 7,
      status: 'pending',
      attempts: 0,
      lockedUntil: null,
      payload: delivery('event-1').payload,
    })
    expect(stored.occurrenceAt.toISOString()).toBe(occurrenceAt.toISOString())
  })

  it('keeps the first event when the same occurrence is enqueued again', async () => {
    await deliveriesDataSource.insertDeliveryIfAbsent(delivery('event-1'))
    await deliveriesDataSource.insertDeliveryIfAbsent(delivery('event-2'))

    const stored = await BridgeDeliveries.find()

    expect(stored).toHaveLength(1)
    expect(stored[0].eventId).toBe('event-1')
    expect(stored[0].payload.event_id).toBe('event-1')
  })

  it('stores a new event for a rescheduled occurrence', async () => {
    await deliveriesDataSource.insertDeliveryIfAbsent(delivery('event-1'))
    await deliveriesDataSource.insertDeliveryIfAbsent(
      delivery('event-2', new Date('2026-10-25T15:20:00.000Z'))
    )

    expect(await BridgeDeliveries.count()).toBe(2)
  })

  it('keeps a single row for concurrent enqueues of the same occurrence', async () => {
    await Promise.all(
      ['a', 'b', 'c'].map(async (id) => {
        await deliveriesDataSource.insertDeliveryIfAbsent(delivery(`event-${id}`))
      })
    )

    expect(await BridgeDeliveries.count()).toBe(1)
  })
})
