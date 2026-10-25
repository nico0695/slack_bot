import { LessThan, LessThanOrEqual } from 'typeorm'
import { singleton } from 'tsyringe'

import { BridgeDeliveries } from '../../../../entities/bridgeDeliveries'
import { BridgeDeliveryStatus } from '../../shared/constants/bridge.constants'
import {
  IBridgeDeliveryCreate,
  IBridgeDeliveryUpdate,
} from '../../shared/interfaces/bridge.interfaces'

// Writes are single statements outside transactions: on the shared SQLite connection
// a failed transaction rolls back concurrent writes of other requests.
@singleton()
export default class BridgeDeliveriesDataSource {
  /**
   * Store a delivery unless the alert occurrence already has one. Throws on failure
   * @param data IBridgeDeliveryCreate - Delivery to enqueue
   */
  async insertDeliveryIfAbsent(data: IBridgeDeliveryCreate): Promise<void> {
    await BridgeDeliveries.createQueryBuilder()
      .insert()
      .into(BridgeDeliveries)
      .values({
        eventId: data.eventId,
        alertId: data.alertId,
        userId: data.userId,
        occurrenceAt: data.occurrenceAt,
        payload: data.payload,
        nextAttemptAt: data.nextAttemptAt,
      })
      .orIgnore()
      .execute()
  }

  /**
   * Deliveries ready to be sent: pending and due, or left sending by a run that
   * stopped before finishing (expired lock)
   */
  async getDueDeliveries(now: Date, limit: number): Promise<BridgeDeliveries[]> {
    return await BridgeDeliveries.find({
      where: [
        { status: BridgeDeliveryStatus.PENDING, nextAttemptAt: LessThanOrEqual(now) },
        { status: BridgeDeliveryStatus.SENDING, lockedUntil: LessThan(now) },
      ],
      order: { nextAttemptAt: 'ASC' },
      take: limit,
    })
  }

  /**
   * Mark a delivery as sending if it is still in the state it was read in
   * @returns true when this call claimed it
   */
  async claimDelivery(delivery: BridgeDeliveries, now: Date, lockedUntil: Date): Promise<boolean> {
    const criteria =
      delivery.status === BridgeDeliveryStatus.SENDING
        ? { id: delivery.id, status: BridgeDeliveryStatus.SENDING, lockedUntil: LessThan(now) }
        : {
            id: delivery.id,
            status: BridgeDeliveryStatus.PENDING,
            nextAttemptAt: LessThanOrEqual(now),
          }

    const result = await BridgeDeliveries.update(criteria, {
      status: BridgeDeliveryStatus.SENDING,
      lockedUntil,
    })

    return result.affected === 1
  }

  async updateDelivery(id: number, data: IBridgeDeliveryUpdate): Promise<void> {
    await BridgeDeliveries.update(id, data)
  }
}
