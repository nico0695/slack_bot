import { container } from 'tsyringe'

import { createModuleLogger } from '../../../config/logger'
import BridgeServices from '../services/bridge.services'

const log = createModuleLogger('bridge.cron')

// Prevents overlapping runs when deliveries take longer than the schedule interval
let isRunning = false

/**
 * Send pending bridge webhook events
 */
export const bridgeDeliveryCronJob = async (): Promise<void> => {
  if (isRunning) {
    log.warn('Previous bridgeDeliveryCronJob still running, skipping tick')
    return
  }

  isRunning = true

  try {
    const startTime = Date.now()
    const bridgeServices = container.resolve(BridgeServices)

    const response = await bridgeServices.processPendingDeliveries(new Date())

    if (response.error) {
      log.error('Failed to process bridge deliveries')
      return
    }

    if (Object.keys(response.data).length > 0) {
      log.info(
        { ...response.data, durationMs: Date.now() - startTime },
        'Bridge deliveries processed'
      )
    }
  } catch (error) {
    log.error({ err: error }, 'bridgeDeliveryCronJob failed')
  } finally {
    isRunning = false
  }
}
