import { z, ZodError, ZodType } from 'zod'

import BadRequestError from './errors/BadRequestError'

function handleZodError(error: ZodError): never {
  const fields = error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))

  throw new BadRequestError({
    message: 'Datos de entrada no válidos',
    context: { fields },
  })
}

export function validateBody<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data) as z.infer<T>
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error)
    }
    throw error
  }
}

export function validateQuery<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data) as z.infer<T>
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error)
    }
    throw error
  }
}

export function validateParams<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data) as z.infer<T>
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error)
    }
    throw error
  }
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(6),
})

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})
