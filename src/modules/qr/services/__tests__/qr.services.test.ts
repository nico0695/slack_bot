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
  const services = QrServices.getInstance()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateQr', () => {
    it('returns QR base64 on success', async () => {
      toDataURLMock.mockResolvedValue('data:image/png;base64,abc123')

      const result = await services.generateQr('https://example.com')

      expect(toDataURLMock).toHaveBeenCalledWith('https://example.com', { width: 300 })
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
  })
})
