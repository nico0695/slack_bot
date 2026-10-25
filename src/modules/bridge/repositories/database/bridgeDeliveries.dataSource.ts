import { singleton } from 'tsyringe'

import { BridgeDeliveries } from '../../../../entities/bridgeDeliveries'
import { IBridgeDeliveryCreate } from '../../shared/interfaces/bridge.interfaces'

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
}
