import { updateBridgeConfigSchema } from '../bridge.schemas'

const validSecret = 'a'.repeat(32)

describe('updateBridgeConfigSchema', () => {
  it('parses a full config and normalizes the URL', () => {
    const result = updateBridgeConfigSchema.parse({
      baseUrl: ' https://bridge.example.com/api/ ',
      secret: validSecret,
      enabled: true,
    })

    expect(result).toEqual({
      baseUrl: 'https://bridge.example.com/api',
      secret: validSecret,
      enabled: true,
    })
  })

  it('accepts an empty body and null values', () => {
    expect(updateBridgeConfigSchema.parse({})).toEqual({})
    expect(updateBridgeConfigSchema.parse({ baseUrl: null, secret: null })).toEqual({
      baseUrl: null,
      secret: null,
    })
  })

  it('rejects unknown fields such as userId', () => {
    const result = updateBridgeConfigSchema.safeParse({ userId: 2, enabled: false })

    expect(result.success).toBe(false)
  })

  it('rejects invalid URLs', () => {
    const result = updateBridgeConfigSchema.safeParse({ baseUrl: 'http://bridge.example.com' })

    expect(result.success).toBe(false)
  })

  it.each([
    ['too short', 'a'.repeat(31)],
    ['too long', 'a'.repeat(257)],
    ['with spaces', `${'a'.repeat(32)} b`],
    ['with non ASCII characters', `${'a'.repeat(32)}ñ`],
  ])('rejects a secret %s without echoing it', (_, secret) => {
    const result = updateBridgeConfigSchema.safeParse({ secret })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).not.toContain(secret)
    }
  })

  it('rejects a non boolean enabled', () => {
    const result = updateBridgeConfigSchema.safeParse({ enabled: 'true' })

    expect(result.success).toBe(false)
  })
})
