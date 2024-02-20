import { DataSource, LoggerOptions } from 'typeorm'

/** DataSource Config */
const connectionSource = new DataSource({
  type: 'sqlite',

  logging: ['error'] as LoggerOptions,

  synchronize: true,
  name: 'default',
  entities: ['../entities/*{.ts,.js}'],
  database: '../database/database.sqlite',
})

export default connectionSource
