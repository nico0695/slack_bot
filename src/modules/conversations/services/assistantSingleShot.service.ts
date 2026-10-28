import { injectable } from 'tsyringe'

import { createModuleLogger } from '../../../config/logger'
import MessageProcessor from './messageProcessor.service'

import { IAssistantSingleShotResult } from '../shared/interfaces/assistantSingleShot.interfaces'
import {
  ASSISTANT_RESULT_UNCONFIRMED_CODE,
  AssistantSingleShotStatus,
  assistantSingleShotMessages,
  getAssistantRestLimits,
} from '../shared/constants/assistantSingleShot.constants'
import { normalizePlainText, truncatePlainText } from '../shared/utils/plainText.utils'

const log = createModuleLogger('conversations.assistantSingleShot')

/**
 * One assistant request and one final answer for clients without Slack or chat history:
 * same processing as a Slack DM, no conversation stored, no channel, no retries.
 */
@injectable()
export default class AssistantSingleShotService {
  constructor(private messageProcessor: MessageProcessor) {}

  processMessage = async (
    requestId: string,
    message: string,
    userId: number
  ): Promise<IAssistantSingleShotResult> => {
    const startedAt = Date.now()
    let result: IAssistantSingleShotResult

    try {
      const processed = await this.messageProcessor.processAssistantMessage(
        message,
        userId,
        undefined,
        false,
        undefined
      )

      if (processed.shouldSkipAI) {
        result = this.completed(requestId, assistantSingleShotMessages.skipped)
      } else if (!processed.response) {
        // null mixes missing data with technical failures and lost results: stay conservative
        log.warn({ requestId, userId }, 'Assistant single-shot got no response')
        result = this.unconfirmed(requestId)
      } else {
        const { plainText, content, contentOmitted } = processed.response
        result = this.completed(requestId, plainText ?? content, contentOmitted ?? false)
      }
    } catch (error) {
      // An action may have run before the failure: never report it as not executed
      log.error({ err: error, requestId, userId }, 'Assistant single-shot processing failed')
      result = this.unconfirmed(requestId)
    }

    log.info(
      {
        requestId,
        userId,
        status: result.status,
        contentOmitted: result.content_omitted,
        durationMs: Date.now() - startedAt,
      },
      'Assistant single-shot request finished'
    )

    return result
  }

  private unconfirmed = (requestId: string): IAssistantSingleShotResult => ({
    request_id: requestId,
    status: AssistantSingleShotStatus.UNKNOWN,
    message: assistantSingleShotMessages.unconfirmed,
    content_omitted: false,
    error: { code: ASSISTANT_RESULT_UNCONFIRMED_CODE },
  })

  private completed = (
    requestId: string,
    text: string,
    contentOmitted = false
  ): IAssistantSingleShotResult => {
    const normalized = normalizePlainText(text ?? '')
    const { text: message, truncated } = truncatePlainText(
      normalized || assistantSingleShotMessages.emptyResponse,
      getAssistantRestLimits().maxOutputChars
    )

    return {
      request_id: requestId,
      status: AssistantSingleShotStatus.COMPLETED,
      message,
      content_omitted: contentOmitted || truncated || !normalized,
      error: null,
    }
  }
}
