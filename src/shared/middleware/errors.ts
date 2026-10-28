import { NextFunction, Request, Response } from 'express'
import { CustomError } from '../utils/errors/CustomError'
import { createModuleLogger } from '../../config/logger'

const log = createModuleLogger('middleware.errors')

// Request errors raised by express.json() (body-parser), keyed by their `type`
const bodyParserErrors: Record<string, { statusCode: number; message: string }> = {
  'entity.parse.failed': { statusCode: 400, message: 'Cuerpo JSON inválido' },
  'entity.too.large': {
    statusCode: 413,
    message: 'El cuerpo de la solicitud es demasiado grande',
  },
}

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof CustomError) {
    const { statusCode, errors, logging } = err
    if (logging) {
      log.error({ err, statusCode, errors }, 'Custom error')
    }

    res.status(statusCode).send({ errors })
    return
  }

  const bodyParserError = bodyParserErrors[(err as any)?.type]
  if (bodyParserError) {
    // The parser error carries the raw body and its message may quote it: log only the type
    log.warn({ type: (err as any).type, statusCode: bodyParserError.statusCode }, 'Invalid body')

    res.status(bodyParserError.statusCode).send({ errors: [{ message: bodyParserError.message }] })
    return
  }

  log.error({ err }, 'Unhandled error')
  res.status(500).send({ errors: [{ message: 'Something went wrong' }] })
}
