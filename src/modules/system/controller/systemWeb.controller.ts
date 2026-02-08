import { Router, Request, Response } from 'express'

import connectionSource from '../../../config/ormconfig'
import { RedisConfig } from '../../../config/redisConfig'

export default class SystemWebController {
  static #instance: SystemWebController

  public router: Router

  private constructor() {
    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): SystemWebController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new SystemWebController()
    return this.#instance
  }

  protected registerRoutes(): void {
    this.router.get('/health', this.healthCheck)
  }

  private healthCheck(_req: Request, res: Response): void {
    const dbUp = connectionSource.isInitialized
    const redisUp = RedisConfig.getClient().isReady === true

    const status = dbUp && redisUp ? 'ok' : 'degraded'
    const code = status === 'ok' ? 200 : 503

    res.status(code).json({
      status,
      version: process.env.npm_package_version ?? 'unknown',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        database: { status: dbUp ? 'up' : 'down' },
        redis: { status: redisUp ? 'up' : 'down' },
      },
    })
  }
}
