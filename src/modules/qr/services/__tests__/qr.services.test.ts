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

const generateQrCodeMock = jest.fn()

const qrCodeRepositoryInstance = {
  generateQrCode: generateQrCodeMock,
}

jest.mock('../../repositories/qrcode/qrcode.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => qrCodeRepositoryInstance,
  },
}))

describe('QrServices', () => {
  const service = QrServices.getInstance()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateQrCode', () => {
    it('returns QR code data on success', async () => {
      const mockDataUrl = 'data:image/png;base64,mockQRCode'
      generateQrCodeMock.mockResolvedValue(mockDataUrl)

      const result = await service.generateQrCode('https://example.com')

      expect(generateQrCodeMock).toHaveBeenCalledWith('https://example.com')
      expect(result).toEqual({
        data: {
          image: mockDataUrl,
          format: 'png',
          content: 'https://example.com',
        },
      })
    })

    it('returns error when repository returns null', async () => {
      generateQrCodeMock.mockResolvedValue(null)

      const result = await service.generateQrCode('content')

      expect(result).toEqual({ error: 'No se pudo generar el código QR' })
    })

    it('returns error when repository throws', async () => {
      generateQrCodeMock.mockRejectedValue(new Error('QR generation failed'))

      const result = await service.generateQrCode('content')

      expect(result).toEqual({ error: 'Error inesperado al generar el código QR' })
    })

    it('handles different content types', async () => {
      const mockDataUrl = 'data:image/png;base64,mockQRCode'
      generateQrCodeMock.mockResolvedValue(mockDataUrl)

      const result = await service.generateQrCode('Text content')

      expect(generateQrCodeMock).toHaveBeenCalledWith('Text content')
      expect(result.data?.content).toBe('Text content')
    })

    it('returns singleton instance', () => {
      const instance1 = QrServices.getInstance()
      const instance2 = QrServices.getInstance()

      expect(instance1).toBe(instance2)
    })
  })
})
