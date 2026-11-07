import { singleton } from 'tsyringe'

import MessageProcessor from './messageProcessor.service'
import { IProcessMessageResult } from '../shared/interfaces/personalAssistant.interfaces'
import { RedisRepository } from '../repositories/redis/conversations.redis'
import { IConversation, ProgressCallback } from '../shared/interfaces/converstions'
import { ConversationProviders } from '../shared/constants/conversationFlow'
import { roleTypes } from '../shared/constants/openai'
import {
  PERSONAL_ASSISTANT_HISTORY_LIMIT,
  PERSONAL_ASSISTANT_MESSAGE_MAX_CHARS,
} from '../shared/constants/personalAssistant.constants'
import { normalizePlainText } from '../shared/utils/plainText.utils'

/** Shared personal context for all assistant transports within this Node instance. */
@singleton()
export default class PersonalAssistantService {
  private readonly pending = new Map<number, Promise<void>>()

  constructor(
    private messageProcessor: MessageProcessor,
    private redisRepository: RedisRepository
  ) {}

  processMessage = async (
    message: string,
    userId: number,
    onProgress?: ProgressCallback
  ): Promise<IProcessMessageResult> => {
    if (this.messageProcessor.shouldSkipAI(message)) {
      return { response: null, shouldSkipAI: true }
    }

    // Queue the complete turn: the next request must observe the previous saved answer.
    const previous = this.pending.get(userId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.pending.set(userId, current)
    await previous

    try {
      return await this.processTurn(message, userId, onProgress)
    } finally {
      release()
      if (this.pending.get(userId) === current) {
        this.pending.delete(userId)
      }
    }
  }

  private processTurn = async (
    message: string,
    userId: number,
    onProgress?: ProgressCallback
  ): Promise<IProcessMessageResult> => {
    let stored: IConversation[] | null = null
    try {
      stored = await this.redisRepository.getPersonalAssistantMessages(userId)
    } catch {
      // Unavailable context is not an empty context: do not overwrite existing history.
    }
    const history = stored === null ? undefined : this.normalizeHistory(stored)
    const result = await this.messageProcessor.processAssistantMessage(
      message,
      userId,
      undefined,
      false,
      history,
      onProgress
    )

    if (history && !result.shouldSkipAI && result.response) {
      const response = result.response
      // Omitted binary output is useful only when the processor supplied its text summary.
      const answer = this.normalizeText(
        response.plainText ?? (response.contentOmitted ? '' : response.content)
      )
      const question = this.normalizeText(message)
      if (answer && question) {
        const next = [
          ...history,
          { role: roleTypes.user, content: question, provider: ConversationProviders.ASSISTANT },
          { role: roleTypes.assistant, content: answer, provider: ConversationProviders.ASSISTANT },
        ].slice(-PERSONAL_ASSISTANT_HISTORY_LIMIT)
        try {
          await this.redisRepository.savePersonalAssistantMessages(userId, next)
        } catch {
          // A cache write must not change an already executed action or trigger a retry.
        }
      }
    }
    return result
  }

  private normalizeHistory = (history: IConversation[]): IConversation[] =>
    history
      .filter((entry) => entry.role === roleTypes.user || entry.role === roleTypes.assistant)
      .map((entry) => ({
        role: entry.role,
        content: this.normalizeText(entry.content),
        provider: ConversationProviders.ASSISTANT,
      }))
      .filter((entry) => Boolean(entry.content))
      .slice(-PERSONAL_ASSISTANT_HISTORY_LIMIT)

  private normalizeText = (text: string): string => {
    const withoutBinary = text
      .replace(/data:[^\s<>"']+/gi, '')
      .replace(/\b(?:iVBORw0KGgo|R0lGOD|UklGR|JVBERi0)[A-Za-z0-9+/=]*/g, '')
      .replace(/\/9j\/[A-Za-z0-9+/=]*/g, '')
      .replace(/[A-Za-z0-9+/]{100,}={0,2}/g, (value) =>
        /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9+/=]/.test(value) ? '' : value
      )
    return Array.from(normalizePlainText(withoutBinary))
      .slice(0, PERSONAL_ASSISTANT_MESSAGE_MAX_CHARS)
      .join('')
  }
}
