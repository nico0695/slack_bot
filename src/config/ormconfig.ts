import { DataSource, LoggerOptions } from 'typeorm'

const basePath = process.env.BASE_PATH
const dbUrl = process.env.DB_URL

/** DataSource Config */
const connectionSource = new DataSource({
  type: 'sqlite',

  logging: ['error'] as LoggerOptions,

  synchronize: true,
  name: 'default',
  entities: [`${basePath ?? 'src'}/entities/*{.ts,.js}`],
  database: dbUrl ?? 'src/database/database.sqlite',
})

export default connectionSource
