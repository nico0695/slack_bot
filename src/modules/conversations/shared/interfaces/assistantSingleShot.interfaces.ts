import { AssistantSingleShotStatus } from '../constants/assistantSingleShot.constants'

/**
 * Final result of one assistant REST request (shared contract, snake_case)
 */
export interface IAssistantSingleShotResult {
  request_id: string
  status: AssistantSingleShotStatus
  message: string
  content_omitted: boolean
  error: { code: string } | null
}
