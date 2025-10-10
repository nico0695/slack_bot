import { IConversation, IConversationFlow } from '../../shared/interfaces/converstions'
import {
  rAssistantDigestSnapshot,
  rAssistantPreferences,
  rAlertMetadata,
  rConversationFlow,
} from './redis.constatns'
import { RedisConfig } from '../../../../config/redisConfig'
import { AssistantPreferences } from '../../shared/interfaces/assistantPreferences'
import { AlertMetadata } from '../../shared/interfaces/alertMetadata'

export class RedisRepository {
  static #instance: RedisRepository

  #redisClient

  // TTL constants (in seconds)
  private readonly TTL_ALERT_METADATA = 90 * 24 * 60 * 60 // 90 days
  private readonly TTL_ASSISTANT_PREFERENCES = 365 * 24 * 60 * 60 // 1 year
  private readonly TTL_DIGEST_SNAPSHOT = 30 * 24 * 60 * 60 // 30 days

  private constructor() {
    this.#redisClient = RedisConfig.getClient()
  }

  static getInstance(): RedisRepository {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new RedisRepository()
    return this.#instance
  }

  saveConversationMessages = async (key: string, value: IConversation[]): Promise<boolean> => {
    try {
      const valueFormated = JSON.stringify(value)

      await this.#redisClient.set(key, valueFormated)

      return true
    } catch (error) {
      console.log('error= ', error.message)
      return false
    }
  }

  getConversationMessages = async (key: string): Promise<IConversation[]> => {
    try {
      const response = await this.#redisClient.get(key)

      const responseFormated: IConversation[] = JSON.parse(response).filter(
        (item: any) => item !== null
      )

      return responseFormated.filter((item) => item !== null)
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  /** Conversation Flow */

  saveConversationFlow = async (chanelId: string, value: IConversationFlow): Promise<boolean> => {
    try {
      const valueFormated = JSON.stringify(value)

      await this.#redisClient.set(rConversationFlow(chanelId), valueFormated)

      return true
    } catch (error) {
      return false
    }
  }

  getConversationFlow = async (chanelId: string): Promise<IConversationFlow> => {
    try {
      const response = await this.#redisClient.get(rConversationFlow(chanelId))

      const responseFormated: IConversationFlow = JSON.parse(response)

      responseFormated.conversation = responseFormated.conversation.filter((item) => item !== null)

      return responseFormated
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  deleteConversationFlow = async (chanelId: string): Promise<boolean> => {
    try {
      await this.#redisClient.del(rConversationFlow(chanelId))

      return true
    } catch (error) {
      console.log('error= ', error.message)
      return false
    }
  }

  getChannelsConversationFlow = async (): Promise<string[]> => {
    try {
      const response = await this.#redisClient.keys(rConversationFlow('*'))

      return response
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  saveAssistantPreferences = async (
    userId: number,
    preferences: AssistantPreferences
  ): Promise<boolean> => {
    try {
      const key = rAssistantPreferences(userId)
      await this.#redisClient.set(key, JSON.stringify(preferences), {
        EX: this.TTL_ASSISTANT_PREFERENCES,
      })
      return true
    } catch (error) {
      console.log('saveAssistantPreferences - error=', error.message)
      return false
    }
  }

  getAssistantPreferences = async (userId: number): Promise<AssistantPreferences | null> => {
    try {
      const response = await this.#redisClient.get(rAssistantPreferences(userId))
      if (!response) {
        return null
      }
      return JSON.parse(response) as AssistantPreferences
    } catch (error) {
      console.log('getAssistantPreferences - error=', error.message)
      return null
    }
  }

  saveAssistantDigestSnapshot = async (
    userId: number,
    digest: { generatedAt: string; blocks: any[] }
  ): Promise<boolean> => {
    try {
      const key = rAssistantDigestSnapshot(userId)
      const payload = JSON.stringify(digest)
      await this.#redisClient.set(key, payload, {
        EX: this.TTL_DIGEST_SNAPSHOT,
      })
      return true
    } catch (error) {
      console.log('saveAssistantDigestSnapshot - error=', error.message)
      return false
    }
  }

  getAssistantDigestSnapshot = async (
    userId: number
  ): Promise<{ generatedAt: string; blocks: any[] } | null> => {
    try {
      const response = await this.#redisClient.get(rAssistantDigestSnapshot(userId))
      if (!response) {
        return null
      }
      return JSON.parse(response)
    } catch (error) {
      console.log('getAssistantDigestSnapshot - error=', error.message)
      return null
    }
  }

  saveAlertMetadata = async (alertId: number, metadata: AlertMetadata): Promise<boolean> => {
    try {
      const key = rAlertMetadata(alertId)
      const currentRaw = await this.#redisClient.get(key)
      const currentMetadata = currentRaw ? JSON.parse(currentRaw) : {}
      const merged = { ...currentMetadata, ...metadata }
      await this.#redisClient.set(key, JSON.stringify(merged), {
        EX: this.TTL_ALERT_METADATA,
      })
      return true
    } catch (error) {
      console.log('saveAlertMetadata - error=', error.message)
      return false
    }
  }

  getAlertMetadata = async (alertId: number): Promise<AlertMetadata | null> => {
    try {
      const key = rAlertMetadata(alertId)
      const response = await this.#redisClient.get(key)
      if (!response) {
        return null
      }
      return JSON.parse(response) as AlertMetadata
    } catch (error) {
      console.log('getAlertMetadata - error=', error.message)
      return null
    }
  }

  deleteAlertMetadata = async (alertId: number): Promise<boolean> => {
    try {
      await this.#redisClient.del(rAlertMetadata(alertId))
      return true
    } catch (error) {
      console.log('deleteAlertMetadata - error=', error.message)
      return false
    }
  }
}
