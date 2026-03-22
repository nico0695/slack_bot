import QrServices from '../qr.services'

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

const toDataURLMock = jest.fn()

jest.mock('qrcode', () => ({
  toDataURL: (...args: any[]) => toDataURLMock(...args),
}))

describe('QrServices', () => {
  const services = new QrServices()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateQr', () => {
    it('returns QR base64 on success', async () => {
      toDataURLMock.mockResolvedValue('data:image/png;base64,abc123')

      const result = await services.generateQr('https://example.com')

      expect(toDataURLMock).toHaveBeenCalledWith('https://example.com', { width: 300, errorCorrectionLevel: 'M' })
      expect(result).toEqual({
        data: {
          qrBase64: 'data:image/png;base64,abc123',
        },
      })
    })

    it('returns error when QRCode.toDataURL throws', async () => {
      toDataURLMock.mockRejectedValue(new Error('QR generation failed'))

      const result = await services.generateQr('test')

      expect(result).toEqual({ error: 'Error inesperado al generar el código QR' })
    })

    it('passes text to QRCode.toDataURL', async () => {
      toDataURLMock.mockResolvedValue('data:image/png;base64,xyz')

      await services.generateQr('plain text content')

      expect(toDataURLMock).toHaveBeenCalledWith('plain text content', expect.any(Object))
    })

    it('returns error when text is empty', async () => {
      const result = await services.generateQr('')

      expect(result).toEqual({ error: 'El texto debe tener entre 1 y 2000 caracteres' })
      expect(toDataURLMock).not.toHaveBeenCalled()
    })

    it('returns error when text exceeds max length', async () => {
      const result = await services.generateQr('a'.repeat(2001))

      expect(result).toEqual({ error: 'El texto debe tener entre 1 y 2000 caracteres' })
      expect(toDataURLMock).not.toHaveBeenCalled()
    })

    it('handles text at max length boundary', async () => {
      toDataURLMock.mockResolvedValue('data:image/png;base64,boundary')

      const result = await services.generateQr('a'.repeat(2000))

      expect(result.data).toBeDefined()
      expect(toDataURLMock).toHaveBeenCalled()
    })

    it('handles emoji and unicode in text', async () => {
      toDataURLMock.mockResolvedValue('data:image/png;base64,emoji123')

      const result = await services.generateQr('🔗 https://example.com')

      expect(result.data.qrBase64).toBeDefined()
      expect(toDataURLMock).toHaveBeenCalledWith('🔗 https://example.com', expect.any(Object))
    })
  })
})
