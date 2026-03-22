import BadRequestError from '../../../../shared/utils/errors/BadRequestError'
import QrWebController from '../qrWeb.controller'

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor

  return {
    HttpAuth: identityDecorator,
    Permission: () => identityDecorator,
    Profiles: {
      USER: 'USER',
      USER_PREMIUM: 'USER_PREMIUM',
      ADMIN: 'ADMIN',
    },
  }
})

const generateQrMock = jest.fn()

const qrServicesMock = {
  generateQr: generateQrMock,
}

describe('QrWebController', () => {
  let controller: QrWebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new QrWebController(qrServicesMock as any)
    controller.userData = { id: 11 } as any
    res = { send: jest.fn() }
  })

  describe('generate', () => {
    it('generates QR code successfully', async () => {
      const req: any = {
        body: { text: 'https://example.com' },
      }
      generateQrMock.mockResolvedValue({
        data: { qrBase64: 'data:image/png;base64,abc123' },
      })

      await controller.generate(req, res)

      expect(generateQrMock).toHaveBeenCalledWith('https://example.com')
      expect(res.send).toHaveBeenCalledWith({
        qrBase64: 'data:image/png;base64,abc123',
      })
    })

    it('throws BadRequestError when text is missing', async () => {
      const req: any = { body: {} }

      await expect(controller.generate(req, res)).rejects.toThrow(BadRequestError)

      expect(generateQrMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when text is empty', async () => {
      const req: any = { body: { text: '' } }

      await expect(controller.generate(req, res)).rejects.toThrow(BadRequestError)

      expect(generateQrMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service returns error', async () => {
      const req: any = {
        body: { text: 'https://example.com' },
      }
      generateQrMock.mockResolvedValue({ error: 'QR generation failed' })

      await expect(controller.generate(req, res)).rejects.toThrow(BadRequestError)
    })
  })
})
