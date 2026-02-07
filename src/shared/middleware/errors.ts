import { NextFunction, Request, Response } from 'express'
import { CustomError } from '../utils/errors/CustomError'
import { createModuleLogger } from '../../config/logger'

const log = createModuleLogger('middleware.errors')

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof CustomError) {
    const { statusCode, errors, logging } = err
    if (logging) {
      log.error({ err, statusCode, errors }, 'Custom error')
    }

    res.status(statusCode).send({ errors })
    return
  }

  log.error({ err }, 'Unhandled error')
  res.status(500).send({ errors: [{ message: 'Something went wrong' }] })
}
