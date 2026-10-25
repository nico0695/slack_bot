import { getBridgeBaseUrlError, isBlockedIp, normalizeBridgeBaseUrl } from '../bridgeUrl.utils'

describe('bridgeUrl.utils', () => {
  const originalAllowPrivate = process.env.BRIDGE_WEBHOOK_ALLOW_PRIVATE

  afterEach(() => {
    if (originalAllowPrivate === undefined) {
      delete process.env.BRIDGE_WEBHOOK_ALLOW_PRIVATE
    } else {
      process.env.BRIDGE_WEBHOOK_ALLOW_PRIVATE = originalAllowPrivate
    }
  })

  describe('isBlockedIp', () => {
    it.each([
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.10',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:a00:1',
    ])('blocks %s', (ip) => {
      expect(isBlockedIp(ip)).toBe(true)
    })

    it.each(['8.8.8.8', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
      'allows %s',
      (ip) => {
        expect(isBlockedIp(ip)).toBe(false)
      }
    )

    it('blocks values that are not IPs', () => {
      expect(isBlockedIp('not-an-ip')).toBe(true)
    })
  })

  describe('getBridgeBaseUrlError', () => {
    it.each([
      'https://bridge.example.com',
      'https://bridge.example.com/api/v1/',
      'https://8.8.8.8',
    ])('accepts %s', (url) => {
      expect(getBridgeBaseUrlError(url)).toBeNull()
    })

    it.each([
      ['not a url', 'La URL no es válida'],
      ['http://bridge.example.com', 'La URL debe usar HTTPS'],
      ['https://user:pass@bridge.example.com', 'La URL no debe incluir credenciales'],
      ['https://bridge.example.com/?a=1', 'La URL base no debe incluir query ni fragmento'],
      ['https://bridge.example.com/#x', 'La URL base no debe incluir query ni fragmento'],
      ['https://localhost', 'La URL no puede apuntar a un host local o interno'],
      ['https://api.localhost', 'La URL no puede apuntar a un host local o interno'],
      ['https://bridge.local', 'La URL no puede apuntar a un host local o interno'],
      ['https://db.internal', 'La URL no puede apuntar a un host local o interno'],
      ['https://127.0.0.1', 'La URL no puede apuntar a una IP privada o reservada'],
      ['https://2130706433', 'La URL no puede apuntar a una IP privada o reservada'],
      ['https://192.168.0.10:8443', 'La URL no puede apuntar a una IP privada o reservada'],
      ['https://[::1]', 'La URL no puede apuntar a una IP privada o reservada'],
    ])('rejects %s', (url, message) => {
      expect(getBridgeBaseUrlError(url)).toBe(message)
    })

    it('allows private hosts when BRIDGE_WEBHOOK_ALLOW_PRIVATE is true', () => {
      process.env.BRIDGE_WEBHOOK_ALLOW_PRIVATE = 'true'

      expect(getBridgeBaseUrlError('https://192.168.0.10')).toBeNull()
      expect(getBridgeBaseUrlError('https://localhost')).toBeNull()
      expect(getBridgeBaseUrlError('http://192.168.0.10')).toBe('La URL debe usar HTTPS')
    })
  })

  describe('normalizeBridgeBaseUrl', () => {
    it.each([
      ['https://bridge.example.com', 'https://bridge.example.com'],
      ['https://bridge.example.com/', 'https://bridge.example.com'],
      ['https://bridge.example.com/api//', 'https://bridge.example.com/api'],
      ['https://Bridge.Example.com:8443/api', 'https://bridge.example.com:8443/api'],
    ])('normalizes %s', (input, expected) => {
      expect(normalizeBridgeBaseUrl(input)).toBe(expected)
    })
  })
})
