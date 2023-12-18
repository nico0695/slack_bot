import * as redis from 'redis'
import { IConversation, IConversationFlow } from '../../shared/interfaces/converstions'
import { rConversationFlow } from './redis.constatns'

export class RedisRepository {
  #redisClient

  constructor() {
    this.#redisClient = redis.createClient()
    void this.#connect()
  }

  #connect = async (): Promise<void> => {
    try {
      await this.#redisClient.connect()
      console.log('~ Redis connected!')
    } catch (error) {
      console.error('x Redis - connect error= ', error.message)
    }
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

      const responseFormated: IConversation[] = JSON.parse(response)

      return responseFormated
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
}

export const RedisRepositoryInstance = new RedisRepository()
