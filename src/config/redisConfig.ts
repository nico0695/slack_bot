import * as redis from 'redis'

export class RedisConfig {
  static #instance: RedisConfig

  #redisClient

  private constructor() {
    const REDIS_HOST = process.env.REDIS_HOST ? process.env.REDIS_HOST : ''
    this.#redisClient = redis.createClient({
      url: REDIS_HOST,
    })

    // Don't connect during tests to avoid async operations after tests complete
    if (process.env.NODE_ENV !== 'test') {
      void this.#connect()
    }
  }

  #connect = async (): Promise<void> => {
    try {
      await this.#redisClient.connect()
      console.log('~ Redis connected!')
    } catch (error) {
      console.error('x Redis - connect erro= ', error.message)
    }
  }

  #disconnect = async (): Promise<void> => {
    try {
      if (this.#redisClient.isReady) {
        await this.#redisClient.disconnect()
        console.log('~ Redis disconnected!')
      }
    } catch (error) {
      console.error('x Redis - disconnect error= ', error.message)
    }
  }

  static getInstance(): RedisConfig {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new RedisConfig()
    return this.#instance
  }

  static getClient(): any {
    const instance = RedisConfig.getInstance()

    return instance.#redisClient
  }

  static async disconnect(): Promise<void> {
    if (this.#instance) {
      await this.#instance.#disconnect()
    }
  }

  static reset(): void {
    this.#instance = null
  }
}
