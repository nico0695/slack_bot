import QrWebController from '../qrWeb.controller'
import BadRequestError from '../../../../shared/utils/errors/BadRequestError'

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

jest.mock('../../../../shared/middleware/auth', () => ({
  HttpAuth: jest.fn(() => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor),
  Permission: jest.fn(() => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor),
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

describe('QrWebController', () => {
  const controller = QrWebController.getInstance()
  let mockReq: any
  let mockRes: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockReq = {
      body: {},
    }

    mockRes = {
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
  })

  describe('generateQr', () => {
    it('returns QR code data on success', async () => {
      const mockQrData = {
        image: 'data:image/png;base64,mockQRCode',
        format: 'png',
        content: 'https://example.com',
      }

      generateQrCodeMock.mockResolvedValue({ data: mockQrData })

      mockReq.body = { content: 'https://example.com' }

      await controller.generateQr(mockReq, mockRes)

      expect(generateQrCodeMock).toHaveBeenCalledWith('https://example.com')
      expect(mockRes.send).toHaveBeenCalledWith(mockQrData)
    })

    it('throws BadRequestError when service returns error', async () => {
      generateQrCodeMock.mockResolvedValue({ error: 'QR generation failed' })

      mockReq.body = { content: 'invalid' }

      await expect(controller.generateQr(mockReq, mockRes)).rejects.toThrow(BadRequestError)
    })

    it('validates content is not empty', async () => {
      mockReq.body = { content: '' }

      await expect(controller.generateQr(mockReq, mockRes)).rejects.toThrow()
    })

    it('validates content length', async () => {
      mockReq.body = { content: 'a'.repeat(2001) }

      await expect(controller.generateQr(mockReq, mockRes)).rejects.toThrow()
    })

    it('returns singleton instance', () => {
      const instance1 = QrWebController.getInstance()
      const instance2 = QrWebController.getInstance()

      expect(instance1).toBe(instance2)
    })
  })
})
