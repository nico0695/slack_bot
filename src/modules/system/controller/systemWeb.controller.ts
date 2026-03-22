import { Router, Request, Response } from 'express'
import { injectable } from 'tsyringe'

import connectionSource from '../../../config/ormconfig'
import { RedisConfig } from '../../../config/redisConfig'

@injectable()
export default class SystemWebController {
  public router: Router

  constructor() {
    this.router = Router()
    this.registerRoutes()
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
