import { PushSubscription } from 'web-push'

import { usersPushSubscriptionsKey } from './redis.constatns'
import { RedisConfig } from '../../../../config/redisConfig'

export class UsersRedis {
  static #instance: UsersRedis

  #redisClient

  private constructor() {
    this.#redisClient = RedisConfig.getClient()
  }

  static getInstance(): UsersRedis {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new UsersRedis()
    return this.#instance
  }

  addOrUpdateUserSubscription = async (
    userId: number,
    subscription: PushSubscription
  ): Promise<boolean> => {
    try {
      const userKey = userId.toString()

      const redisKey = usersPushSubscriptionsKey

      const usersSubscriptions: { [key: string]: PushSubscription } =
        JSON.parse(await this.#redisClient.get(redisKey)) ?? {}

      usersSubscriptions[userKey] = subscription

      await this.#redisClient.set(redisKey, JSON.stringify(usersSubscriptions))

      return true
    } catch (error) {
      console.log('errorr= ', error.message)
      return false
    }
  }

  getUsersSubscriptions = async (): Promise<{ [key: string]: PushSubscription }> => {
    try {
      const response = await this.#redisClient.get(usersPushSubscriptionsKey)

      const responseFormated = JSON.parse(response)

      return responseFormated
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }
}
