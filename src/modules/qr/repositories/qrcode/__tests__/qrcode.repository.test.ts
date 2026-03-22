import QRCode from 'qrcode'
import QrCodeRepository from '../qrcode.repository'

jest.mock('../../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}))

describe('QrCodeRepository', () => {
  const repository = QrCodeRepository.getInstance()
  const mockToDataURL = QRCode.toDataURL as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateQrCode', () => {
    it('generates QR code successfully', async () => {
      const mockDataUrl = 'data:image/png;base64,mockQRCode'
      mockToDataURL.mockResolvedValue(mockDataUrl)

      const result = await repository.generateQrCode('https://example.com')

      expect(mockToDataURL).toHaveBeenCalledWith('https://example.com', {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 1,
      })
      expect(result).toBe(mockDataUrl)
    })

    it('returns null when QR code generation fails', async () => {
      mockToDataURL.mockRejectedValue(new Error('Generation failed'))

      const result = await repository.generateQrCode('invalid content')

      expect(result).toBeNull()
    })

    it('handles different content types', async () => {
      const mockDataUrl = 'data:image/png;base64,mockQRCode'
      mockToDataURL.mockResolvedValue(mockDataUrl)

      const result = await repository.generateQrCode('Some text content')

      expect(mockToDataURL).toHaveBeenCalledWith('Some text content', expect.any(Object))
      expect(result).toBe(mockDataUrl)
    })

    it('returns singleton instance', () => {
      const instance1 = QrCodeRepository.getInstance()
      const instance2 = QrCodeRepository.getInstance()

      expect(instance1).toBe(instance2)
    })
  })
})
