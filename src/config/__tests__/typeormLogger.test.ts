const errorMock = jest.fn()
const warnMock = jest.fn()

jest.mock('../logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    error: (...args: any[]) => errorMock(...args),
    warn: (...args: any[]) => warnMock(...args),
  }),
}))

// eslint-disable-next-line import/first
import { TypeormLogger } from '../typeormLogger'

describe('TypeormLogger', () => {
  const logger = new TypeormLogger()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('logs failed queries without their parameters', () => {
    const error = new Error('SQLITE_ERROR')

    logger.logQueryError(error, 'UPDATE "users" SET "bridgeWebhookSecret" = ?')

    expect(errorMock).toHaveBeenCalledWith(
      { err: error, query: 'UPDATE "users" SET "bridgeWebhookSecret" = ?' },
      'Query failed'
    )
  })

  it('forwards warnings only', () => {
    logger.log('info', 'ignored')
    logger.log('warn', 'careful')

    expect(warnMock).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledWith({ message: 'careful' }, 'TypeORM warning')
  })
})
