import { generateRandomFileName } from '../generators.utils'

describe('generateRandomFileName', () => {
  const allowedCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  it('returns a string with 10 characters', () => {
    const result = generateRandomFileName()

    expect(typeof result).toBe('string')
    expect(result).toHaveLength(10)
  })

  it('uses only alphanumeric characters', () => {
    const result = generateRandomFileName()

    for (const char of result) {
      expect(allowedCharacters.includes(char)).toBe(true)
    }
  })

  it('generates different values across multiple calls', () => {
    const values = Array.from({ length: 5 }, generateRandomFileName)

    expect(new Set(values).size).toBeGreaterThan(1)
  })
})
