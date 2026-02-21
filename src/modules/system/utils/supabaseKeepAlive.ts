import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('system.keepAlive')

/**
 * Pings the Supabase auth health endpoint to prevent the free-tier project
 * from being paused due to inactivity (pauses after 7 days of no activity).
 * Runs on a schedule (every 3 days) via the app cron runner.
 */
export const supabaseKeepAlive = async (): Promise<void> => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL

    if (!supabaseUrl) {
      log.debug('SUPABASE_URL not configured, skipping keep-alive ping')
      return
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/health`)

    if (response.ok) {
      log.info('Supabase keep-alive ping successful')
    } else {
      log.warn({ status: response.status }, 'Supabase keep-alive ping returned non-OK status')
    }
  } catch (error) {
    log.error({ err: error }, 'Supabase keep-alive ping failed')
  }
}
