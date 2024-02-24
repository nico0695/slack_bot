import * as redis from 'redis'

export class RedisConfig {
  static #instance: RedisConfig

  #redisClient

  private constructor() {
    const REDIS_HOST = process.env.REDIS_HOST ? process.env.REDIS_HOST : ''
    this.#redisClient = redis.createClient({
      url: REDIS_HOST,
    })

    void this.#connect()
  }

  #connect = async (): Promise<void> => {
    try {
      await this.#redisClient.connect()
      console.log('~ Redis connected!')
    } catch (error) {
      console.error('x Redis - connect erro= ', error.message)
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
}
