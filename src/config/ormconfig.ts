import { DataSource, LoggerOptions } from 'typeorm'

/** DataSource Config */
const connectionSource = new DataSource({
  type: 'sqlite',

  logging: ['error'] as LoggerOptions,

  synchronize: true,
  name: 'default',
  entities: ['src/entities/*{.ts,.js}'],
  database: 'src/database/database.sqlite',
})

export default connectionSource
