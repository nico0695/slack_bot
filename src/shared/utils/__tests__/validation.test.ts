import { z } from 'zod'

import BadRequestError from '../errors/BadRequestError'
import { validateBody, validateQuery, validateParams, paginationSchema, idParamSchema } from '../validation'

describe('validation utilities', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive().optional(),
  })

  describe('validateBody', () => {
    it('returns parsed data when valid', () => {
      const result = validateBody(testSchema, { name: 'Alice', age: 30 })

      expect(result).toEqual({ name: 'Alice', age: 30 })
    })

    it('applies defaults and strips unknown fields', () => {
      const schemaWithDefault = z.object({
        title: z.string().min(1),
        description: z.string().optional().default(''),
      })

      const result = validateBody(schemaWithDefault, { title: 'Test' })

      expect(result).toEqual({ title: 'Test', description: '' })
    })

    it('throws BadRequestError with field context when invalid', () => {
      try {
        validateBody(testSchema, { name: '', age: -5 })
        fail('Expected BadRequestError')
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestError)
        const badRequest = error as BadRequestError
        expect(badRequest.errors[0].context.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'name' }),
            expect.objectContaining({ field: 'age' }),
          ])
        )
      }
    })

    it('throws BadRequestError when data is null', () => {
      expect(() => validateBody(testSchema, null)).toThrow(BadRequestError)
    })
  })

  describe('validateQuery', () => {
    it('returns parsed data when valid', () => {
      const schema = z.object({ tag: z.string().optional() })
      const result = validateQuery(schema, { tag: 'work' })

      expect(result).toEqual({ tag: 'work' })
    })
  })

  describe('validateParams', () => {
    it('returns parsed data when valid', () => {
      const schema = z.object({ id: z.string().min(1) })
      const result = validateParams(schema, { id: '42' })

      expect(result).toEqual({ id: '42' })
    })
  })

  describe('paginationSchema', () => {
    it('applies default values when omitted', () => {
      const result = paginationSchema.parse({})

      expect(result).toEqual({ page: 1, pageSize: 6 })
    })

    it('coerces string values to integers', () => {
      const result = paginationSchema.parse({ page: '3', pageSize: '10' })

      expect(result).toEqual({ page: 3, pageSize: 10 })
    })

    it('rejects page less than 1', () => {
      expect(() => paginationSchema.parse({ page: 0 })).toThrow()
    })

    it('rejects non-integer values', () => {
      expect(() => paginationSchema.parse({ page: 1.5 })).toThrow()
    })
  })

  describe('idParamSchema', () => {
    it('coerces string id to number', () => {
      const result = idParamSchema.parse({ id: '7' })

      expect(result).toEqual({ id: 7 })
    })

    it('rejects empty string id', () => {
      expect(() => idParamSchema.parse({ id: '' })).toThrow()
    })

    it('rejects non-positive id', () => {
      expect(() => idParamSchema.parse({ id: '0' })).toThrow()
      expect(() => idParamSchema.parse({ id: '-1' })).toThrow()
    })
  })
})
