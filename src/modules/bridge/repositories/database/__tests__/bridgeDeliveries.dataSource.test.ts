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

  it('throws on constraint violations other than the duplicated occurrence', async () => {
    // ON CONFLICT DO NOTHING only skips uniqueness conflicts, so the event is never lost silently
    await expect(
      deliveriesDataSource.insertDeliveryIfAbsent({ ...delivery('event-1'), payload: null })
    ).rejects.toThrow(/NOT NULL/)

    expect(await BridgeDeliveries.count()).toBe(0)
  })

  it('keeps a single row for concurrent enqueues of the same occurrence', async () => {
    await Promise.all(
      ['a', 'b', 'c'].map(async (id) => {
        await deliveriesDataSource.insertDeliveryIfAbsent(delivery(`event-${id}`))
      })
    )

    expect(await BridgeDeliveries.count()).toBe(1)
  })

  describe('claiming and updating', () => {
    const now = new Date('2026-10-25T15:11:00.000Z')
    const lockedUntil = new Date('2026-10-25T15:13:00.000Z')

    const seed = async (eventId: string, values: Partial<BridgeDeliveries>): Promise<number> => {
      await deliveriesDataSource.insertDeliveryIfAbsent({
        ...delivery(eventId, new Date(`2026-10-25T15:0${eventId.slice(-1)}:00.000Z`)),
      })
      const row = await BridgeDeliveries.findOneByOrFail({ eventId })
      await BridgeDeliveries.update(row.id, values)
      return row.id
    }

    it('returns pending due deliveries and sending ones with an expired lock', async () => {
      const dueId = await seed('event-1', { nextAttemptAt: new Date('2026-10-25T15:10:59.999Z') })
      const exactId = await seed('event-2', { nextAttemptAt: now })
      await seed('event-3', { nextAttemptAt: new Date('2026-10-25T15:11:00.001Z') })
      const staleId = await seed('event-4', {
        status: 'sending',
        lockedUntil: new Date('2026-10-25T15:10:00.000Z'),
      })
      await seed('event-5', { status: 'sending', lockedUntil })
      await seed('event-6', { status: 'delivered', nextAttemptAt: new Date(0) })
      await seed('event-7', { status: 'failed', nextAttemptAt: new Date(0) })

      const due = await deliveriesDataSource.getDueDeliveries(now, 20)

      const byId = (a: number, b: number): number => a - b
      expect(due.map((row) => row.id).sort(byId)).toEqual([dueId, exactId, staleId].sort(byId))
    })

    it('limits the batch size', async () => {
      await seed('event-1', { nextAttemptAt: new Date(0) })
      await seed('event-2', { nextAttemptAt: new Date(0) })

      expect(await deliveriesDataSource.getDueDeliveries(now, 1)).toHaveLength(1)
    })

    it('claims a pending due delivery only once', async () => {
      const id = await seed('event-1', { nextAttemptAt: new Date(0) })
      const [row] = await deliveriesDataSource.getDueDeliveries(now, 20)

      const first = await deliveriesDataSource.claimDelivery(row, now, lockedUntil)
      const second = await deliveriesDataSource.claimDelivery(row, now, lockedUntil)

      const stored = await BridgeDeliveries.findOneByOrFail({ id })
      expect([first, second]).toEqual([true, false])
      expect(stored.status).toBe('sending')
      expect(stored.lockedUntil.toISOString()).toBe(lockedUntil.toISOString())
    })

    it('counts an attempt on every claim', async () => {
      const id = await seed('event-1', { nextAttemptAt: new Date(0), attempts: 2 })
      const row = await BridgeDeliveries.findOneByOrFail({ id })

      await deliveriesDataSource.claimDelivery(row, now, lockedUntil)

      expect((await BridgeDeliveries.findOneByOrFail({ id })).attempts).toBe(3)
    })

    it('reclaims a sending delivery only when its lock expired', async () => {
      const staleId = await seed('event-1', {
        status: 'sending',
        lockedUntil: new Date('2026-10-25T15:10:00.000Z'),
      })
      const freshId = await seed('event-2', { status: 'sending', lockedUntil })

      const stale = await BridgeDeliveries.findOneByOrFail({ id: staleId })
      const fresh = await BridgeDeliveries.findOneByOrFail({ id: freshId })

      expect(await deliveriesDataSource.claimDelivery(stale, now, lockedUntil)).toBe(true)
      expect(await deliveriesDataSource.claimDelivery(fresh, now, lockedUntil)).toBe(false)
    })

    it('does not claim a pending delivery that is not due yet', async () => {
      const id = await seed('event-1', { nextAttemptAt: new Date('2026-10-25T15:20:00.000Z') })
      const row = await BridgeDeliveries.findOneByOrFail({ id })

      expect(await deliveriesDataSource.claimDelivery(row, now, lockedUntil)).toBe(false)
    })

    it('updates the delivery state', async () => {
      const id = await seed('event-1', { status: 'sending', lockedUntil })

      await deliveriesDataSource.updateDelivery(id, {
        status: 'delivered',
        attempts: 1,
        lockedUntil: null,
        lastStatusCode: 202,
        lastError: null,
        deliveredAt: now,
      })

      expect(await BridgeDeliveries.findOneByOrFail({ id })).toMatchObject({
        status: 'delivered',
        attempts: 1,
        lockedUntil: null,
        lastStatusCode: 202,
        lastError: null,
        deliveredAt: now,
      })
    })
  })
})
