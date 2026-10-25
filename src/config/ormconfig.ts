import { DataSource, LoggerOptions } from 'typeorm'

import { TypeormLogger } from './typeormLogger'

const basePath = process.env.BASE_PATH
const dbUrl = process.env.DB_URL

const connectionSource = new DataSource({
  type: 'sqlite',

  logging: ['error'] as LoggerOptions,
  logger: new TypeormLogger(),

  synchronize: true,
  name: 'default',
  entities: [`${basePath ?? 'src'}/entities/*{.ts,.js}`],
  database: dbUrl ?? 'src/database/database.sqlite',
})

export default connectionSource
