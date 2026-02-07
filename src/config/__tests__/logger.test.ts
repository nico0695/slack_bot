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

  it('redacts sensitive fields from logged objects', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.LOG_LEVEL

    const logger = require('../logger').default

    const output: string[] = []
    const dest = {
      write: (msg: string) => { output.push(msg) },
    }

    const testLogger = require('pino')({
      ...logger,
      level: 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-slack-signature"]',
          'req.headers["x-slack-request-timestamp"]',
          'req.body.token',
          'req.body.client_secret',
          'req.body.api_app_id',
        ],
        remove: true,
      },
    }, dest)

    testLogger.info({
      req: {
        headers: { authorization: 'Bearer secret-token', 'x-slack-signature': 'v0=abc123' },
        body: { token: 'xoxb-secret', message: 'hello' },
      },
    }, 'test redaction')

    const logged = JSON.parse(output[0])
    expect(logged.req.headers.authorization).toBeUndefined()
    expect(logged.req.headers['x-slack-signature']).toBeUndefined()
    expect(logged.req.body.token).toBeUndefined()
    expect(logged.req.body.message).toBe('hello')
  })
})
