import { Logger } from 'typeorm'

import { createModuleLogger } from './logger'

const log = createModuleLogger('typeorm')

/**
 * TypeORM logger backed by pino. Failed queries are logged without their bound
 * parameters, since those can carry secrets (e.g. the bridge webhook secret).
 */
export class TypeormLogger implements Logger {
  logQuery(): void {}

  logQueryError(error: string | Error, query: string): void {
    log.error({ err: error, query }, 'Query failed')
  }

  logQuerySlow(): void {}

  logSchemaBuild(): void {}

  logMigration(): void {}

  log(level: 'log' | 'info' | 'warn', message: any): void {
    if (level === 'warn') {
      log.warn({ message }, 'TypeORM warning')
    }
  }
}
