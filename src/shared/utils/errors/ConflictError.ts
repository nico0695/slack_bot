import { CustomError } from './CustomError'
import { IError } from './shared/interfaces'

export default class ConflictError extends CustomError {
  private static readonly _statusCode = 409
  private readonly _code: number
  private readonly _logging: boolean
  private readonly _context: { [key: string]: any }

  constructor(params?: {
    code?: number
    message?: string
    logging?: boolean
    context?: { [key: string]: any }
  }) {
    const { code, message, logging } = params || {}

    super(message || 'Conflict')
    this._code = code || ConflictError._statusCode
    this._logging = logging || false
    this._context = params?.context || {}

    Object.setPrototypeOf(this, ConflictError.prototype)
  }

  get errors(): IError[] {
    return [{ message: this.message, context: this._context }]
  }

  get statusCode(): number {
    return this._code
  }

  get logging(): boolean {
    return this._logging
  }
}
