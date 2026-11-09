import { singleton } from 'tsyringe'
import { createModuleLogger } from '../../../../config/logger'
import {
  IAssistantContextEntry,
  IConversation,
  IConversationFlow,
} from '../../shared/interfaces/converstions'
import { rConversationFlow, rAlertSnoozeConfig, rAssistantContext } from './redis.constants'
import { ASSISTANT_CONTEXT_MAX_ENTRIES } from '../../shared/constants/assistantContext.constants'
import { roleTypes } from '../../shared/constants/openai'
import { RedisConfig } from '../../../../config/redisConfig'

const log = createModuleLogger('conversations.redis')

export interface AlertSnoozeConfig {
  defaultSnoozeMinutes: number
}

const isAssistantContextEntry = (item: unknown): item is IAssistantContextEntry => {
  if (typeof item !== 'object' || item === null) return false
  const { role, content } = item as Record<string, unknown>
  return (role === roleTypes.user || role === roleTypes.assistant) && typeof content === 'string'
}

@singleton()
export class RedisRepository {
  private redisClient

  // TTL constants (in seconds)
  private readonly TTL_SNOOZE_CONFIG = 365 * 24 * 60 * 60 // 1 year

  constructor() {
    this.redisClient = RedisConfig.getClient()
  }

  saveConversationMessages = async (key: string, value: IConversation[]): Promise<boolean> => {
    try {
      const valueFormated = JSON.stringify(value)

      await this.redisClient.set(key, valueFormated)

      return true
    } catch (error) {
      log.error({ err: error }, 'Redis operation failed')
      return false
    }
  }

  getConversationMessages = async (key: string): Promise<IConversation[] | null> => {
    try {
      const response = await this.redisClient.get(key)

      if (!response) {
        return null
      }

      const responseFormated: IConversation[] = JSON.parse(response).filter(
        (item: any) => item !== null
      )

      return responseFormated.filter((item) => item !== null)
    } catch (error) {
      log.error({ err: error }, 'Redis operation failed')
      return null
    }
  }

  saveConversationFlow = async (chanelId: string, value: IConversationFlow): Promise<boolean> => {
    try {
      const valueFormated = JSON.stringify(value)

      await this.redisClient.set(rConversationFlow(chanelId), valueFormated)

      return true
    } catch (error) {
      return false
    }
  }

  getConversationFlow = async (chanelId: string): Promise<IConversationFlow | null> => {
    try {
      const response = await this.redisClient.get(rConversationFlow(chanelId))

      if (!response) {
        return null
      }

      const responseFormated: IConversationFlow = JSON.parse(response)

      responseFormated.conversation = responseFormated.conversation.filter((item) => item !== null)

      return responseFormated
    } catch (error) {
      log.error({ err: error }, 'Redis operation failed')
      return null
    }
  }

  deleteConversationFlow = async (chanelId: string): Promise<boolean> => {
    try {
      await this.redisClient.del(rConversationFlow(chanelId))

      return true
    } catch (error) {
      log.error({ err: error }, 'Redis operation failed')
      return false
    }
  }

  getChannelsConversationFlow = async (): Promise<string[] | null> => {
    try {
      const response = await this.redisClient.keys(rConversationFlow('*'))

      return response
    } catch (error) {
      log.error({ err: error }, 'Redis operation failed')
      return null
    }
  }

  saveAlertSnoozeConfig = async (userId: number, config: AlertSnoozeConfig): Promise<boolean> => {
    try {
      const key = rAlertSnoozeConfig(userId)
      await this.redisClient.set(key, JSON.stringify(config), {
        EX: this.TTL_SNOOZE_CONFIG,
      })
      return true
    } catch (error) {
      log.error({ err: error }, 'saveAlertSnoozeConfig failed')
      return false
    }
  }

  getAlertSnoozeConfig = async (userId: number): Promise<AlertSnoozeConfig | null> => {
    try {
      const response = await this.redisClient.get(rAlertSnoozeConfig(userId))
      if (!response) {
        return null
      }
      return JSON.parse(response) as AlertSnoozeConfig
    } catch (error) {
      log.error({ err: error }, 'getAlertSnoozeConfig failed')
      return null
    }
  }

  /**
   * Last entries of the personal assistant context, oldest first.
   * Read-only: on any failure or corrupt item it returns [] and leaves the stored list untouched.
   */
  getAssistantContext = async (userId: number): Promise<IAssistantContextEntry[]> => {
    try {
      const items: string[] = await this.redisClient.lRange(
        rAssistantContext(userId),
        -ASSISTANT_CONTEXT_MAX_ENTRIES,
        -1
      )

      return items.map((item) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(item)
        } catch {
          // SyntaxError messages quote the payload, so the original error is not logged
          throw new Error('Invalid JSON in assistant context entry')
        }
        if (!isAssistantContextEntry(parsed)) {
          throw new Error('Invalid assistant context entry shape')
        }
        return { role: parsed.role, content: parsed.content }
      })
    } catch (error) {
      log.warn({ err: error, userId }, 'getAssistantContext failed')
      return []
    }
  }

  /**
   * Appends entries and trims to the last ASSISTANT_CONTEXT_MAX_ENTRIES in one transaction.
   * Never reads first, so concurrent requests and failed reads cannot overwrite history.
   */
  appendAssistantContext = async (
    userId: number,
    entries: IAssistantContextEntry[]
  ): Promise<boolean> => {
    if (entries.length === 0) return true

    try {
      const key = rAssistantContext(userId)

      const replies: unknown = await this.redisClient
        .multi()
        .rPush(
          key,
          entries.map((entry) => JSON.stringify(entry))
        )
        .lTrim(key, -ASSISTANT_CONTEXT_MAX_ENTRIES, -1)
        .exec()

      // This client version resolves exec() with per-command errors (e.g. WRONGTYPE) in the array
      const failed = Array.isArray(replies) ? replies.find((reply) => reply instanceof Error) : null
      if (failed) {
        log.error({ err: failed, userId }, 'appendAssistantContext failed')
        return false
      }

      return true
    } catch (error) {
      log.error({ err: error, userId }, 'appendAssistantContext failed')
      return false
    }
  }
}
