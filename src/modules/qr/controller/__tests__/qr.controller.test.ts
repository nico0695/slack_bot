import QrController from '../qr.controller'

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

const qrServicesInstance = {
  generateQrCode: generateQrCodeMock,
}

jest.mock('../../services/qr.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => qrServicesInstance,
  },
}))

describe('QrController', () => {
  const controller = QrController.getInstance()
  let mockData: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockData = {
      payload: {
        text: '.qr https://example.com',
        user: 'U123',
      },
      say: jest.fn(),
      body: {
        team_id: 'T123',
      },
    }
  })

  describe('generateQr', () => {
    it('generates QR code on success', async () => {
      const mockQrData = {
        image: 'data:image/png;base64,mockQRCode',
        format: 'png',
        content: 'https://example.com',
      }

      generateQrCodeMock.mockResolvedValue({ data: mockQrData })

      await controller.generateQr(mockData)

      expect(generateQrCodeMock).toHaveBeenCalledWith('https://example.com')
      expect(mockData.say).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com')
      )
      expect(mockData.say).toHaveBeenCalledWith(
        expect.stringContaining('data:image/png;base64,mockQRCode')
      )
    })

    it('shows error message when service returns error', async () => {
      generateQrCodeMock.mockResolvedValue({ error: 'QR generation failed' })

      await controller.generateQr(mockData)

      expect(mockData.say).toHaveBeenCalledWith('Error: QR generation failed')
    })

    it('shows usage message when content is empty', async () => {
      mockData.payload.text = '.qr   '

      await controller.generateQr(mockData)

      expect(mockData.say).toHaveBeenCalledWith(
        expect.stringContaining('Por favor proporciona el contenido')
      )
      expect(generateQrCodeMock).not.toHaveBeenCalled()
    })

    it('shows error when content exceeds 2000 characters', async () => {
      mockData.payload.text = '.qr ' + 'a'.repeat(2001)

      await controller.generateQr(mockData)

      expect(mockData.say).toHaveBeenCalledWith(
        expect.stringContaining('demasiado largo')
      )
      expect(generateQrCodeMock).not.toHaveBeenCalled()
    })

    it('handles exception gracefully', async () => {
      generateQrCodeMock.mockRejectedValue(new Error('Unexpected error'))

      await controller.generateQr(mockData)

      expect(mockData.say).toHaveBeenCalledWith(
        expect.stringContaining('Ocurrió un error')
      )
    })

    it('truncates long content in response message', async () => {
      const longContent = 'a'.repeat(150)
      mockData.payload.text = `.qr ${longContent}`

      const mockQrData = {
        image: 'data:image/png;base64,mockQRCode',
        format: 'png',
        content: longContent,
      }

      generateQrCodeMock.mockResolvedValue({ data: mockQrData })

      await controller.generateQr(mockData)

      expect(mockData.say).toHaveBeenCalledWith(expect.stringContaining('...'))
    })

    it('returns singleton instance', () => {
      const instance1 = QrController.getInstance()
      const instance2 = QrController.getInstance()

      expect(instance1).toBe(instance2)
    })
  })
})
