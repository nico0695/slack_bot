import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

const level = process.env.LOG_LEVEL ?? (isTest ? 'silent' : isProduction ? 'info' : 'debug')

const transport = !isProduction && !isTest
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    }
  : undefined

const logger = pino({
  level,
  transport,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'slack-bot' },
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
  serializers: {
    err: (err: any) => {
      const serialized: Record<string, any> = {
        type: err?.constructor?.name ?? 'Error',
        message: err?.message,
        stack: err?.stack,
      }

      if (err?.response?.status) {
        serialized.responseStatus = err.response.status
      }
      if (err?.response?.data?.error?.message) {
        serialized.apiError = err.response.data.error.message
      }

      return serialized
    },
  },
})

export function createModuleLogger(module: string): pino.Logger {
  return logger.child({ module })
}

export default logger
