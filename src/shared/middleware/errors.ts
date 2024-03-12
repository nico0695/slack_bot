import { NextFunction, Request, Response } from 'express'
import { CustomError } from '../utils/errors/CustomError'

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof CustomError) {
    const { statusCode, errors, logging } = err
    if (logging) {
      console.error(
        'ERROR: ',
        JSON.stringify(
          {
            code: err.statusCode,
            errors: err.errors,
            stack: err.stack,
          },
          null,
          2
        )
      )
    }

    res.status(statusCode).send({ errors })
    return
  }

  console.error(JSON.stringify(err, null, 2))
  res.status(500).send({ errors: [{ message: 'Something went wrong' }] })
}
