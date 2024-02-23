import * as redis from 'redis'

export class RedisConfig {
  static #instance: RedisConfig

  #redisClient

  private constructor() {
    this.#redisClient = redis.createClient()
    // TODO: Fix to docker
    // this.#redisClient = redis.createClient({
    //   url: 'redis://127.0.0.1:6379',
    // })

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
