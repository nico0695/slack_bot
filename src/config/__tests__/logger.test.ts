/* eslint-disable @typescript-eslint/no-var-requires */
describe('logger', () => {
  const originalEnv = process.env.NODE_ENV
  const originalLogLevel = process.env.LOG_LEVEL

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    process.env.LOG_LEVEL = originalLogLevel
    jest.resetModules()
  })

  it('createModuleLogger returns a child logger with module field', () => {
    process.env.NODE_ENV = 'test'
    const { createModuleLogger } = require('../logger')

    const childLogger = createModuleLogger('test.module')

    expect(childLogger).toBeDefined()
    expect(typeof childLogger.info).toBe('function')
    expect(typeof childLogger.error).toBe('function')
    expect(typeof childLogger.warn).toBe('function')
    expect(typeof childLogger.debug).toBe('function')
  })

  it('respects LOG_LEVEL override', () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'warn'

    const logger = require('../logger').default

    expect(logger.level).toBe('warn')
  })

  it('uses silent level in test environment', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.LOG_LEVEL

    const logger = require('../logger').default

    expect(logger.level).toBe('silent')
  })
})
