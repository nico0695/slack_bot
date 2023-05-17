import * as redis from 'redis'
import { IConversation } from '../../shared/interfaces/converstions'

export default class RedisRepository {
  #redisClient

  constructor() {
    this.#redisClient = redis.createClient()
    void this.#connect()

    this.saveConversationMessages = this.saveConversationMessages.bind(this)
    this.getConversationMessages = this.getConversationMessages.bind(this)
  }

  #connect = async (): Promise<void> => {
    try {
      await this.#redisClient.connect()
    } catch (error) {
      console.log('connect error= ', error.message)
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
}
