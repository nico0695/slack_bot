import { singleton } from 'tsyringe'
import { createModuleLogger } from '../../../../config/logger'
import {
  IConversation,
  IConversationFlow,
  IUserConversation,
} from '../../shared/interfaces/converstions'
import {
  rConversationFlow,
  rAlertSnoozeConfig,
  rPersonalAssistantKey,
  rWebAssistantKey,
} from './redis.constants'
import { RedisConfig } from '../../../../config/redisConfig'
import { roleTypes } from '../../shared/constants/openai'
import { ConversationProviders } from '../../shared/constants/conversationFlow'

const log = createModuleLogger('conversations.redis')

export interface AlertSnoozeConfig {
  defaultSnoozeMinutes: number
}

@singleton()
export class RedisRepository {
  private redisClient

  // TTL constants (in seconds)
  private readonly TTL_SNOOZE_CONFIG = 365 * 24 * 60 * 60 // 1 year

  constructor() {
    this.redisClient = RedisConfig.getClient()
  }

  getPersonalAssistantMessages = async (userId: number): Promise<IConversation[] | null> => {
    try {
      const response = await this.redisClient.get(rPersonalAssistantKey(userId))
      if (response === null) return []

      const history: unknown = JSON.parse(response)
      if (
        !Array.isArray(history) ||
        !history.every(
          (entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            (entry.role === roleTypes.user || entry.role === roleTypes.assistant) &&
            typeof entry.content === 'string' &&
            entry.provider === ConversationProviders.ASSISTANT
        )
      ) {
        log.warn('Personal assistant history is invalid')
        return null
      }
      return history.map(({ role, content, provider }) => ({ role, content, provider }))
    } catch {
      log.warn('Personal assistant history is unavailable')
      return null
    }
  }

  savePersonalAssistantMessages = async (
    userId: number,
    history: IConversation[]
  ): Promise<boolean> => {
    try {
      const value = history.map(({ role, content, provider }) => ({ role, content, provider }))
      await this.redisClient.set(rPersonalAssistantKey(userId), JSON.stringify(value))
      return true
    } catch {
      log.warn('Personal assistant history could not be saved')
      return false
    }
  }

  getWebAssistantMessages = async (userId: number): Promise<IUserConversation[] | null> => {
    try {
      const response = await this.redisClient.get(rWebAssistantKey(userId))
      if (response === null) return []
      const history: unknown = JSON.parse(response)
      if (
        !Array.isArray(history) ||
        !history.every(
          (entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            (entry.role === roleTypes.user || entry.role === roleTypes.assistant) &&
            typeof entry.content === 'string' &&
            (entry.provider === ConversationProviders.WEB ||
              entry.provider === ConversationProviders.ASSISTANT)
        )
      ) {
        log.warn('Web assistant history is invalid')
        return null
      }
      return history
    } catch {
      log.warn('Web assistant history is unavailable')
      return null
    }
  }

  saveWebAssistantMessages = async (
    userId: number,
    history: IUserConversation[]
  ): Promise<boolean> => {
    try {
      await this.redisClient.set(rWebAssistantKey(userId), JSON.stringify(history.slice(-20)))
      return true
    } catch {
      log.warn('Web assistant history could not be saved')
      return false
    }
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
}
