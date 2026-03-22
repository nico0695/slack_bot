import QrController from '../qr.controller'

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor

  return {
    SlackAuth: identityDecorator,
  }
})

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

const generateQrMock = jest.fn()

const qrServicesMock = {
  generateQr: generateQrMock,
}

describe('QrController', () => {
  let controller: QrController
  let sayMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new QrController(qrServicesMock as any)
    sayMock = jest.fn()
  })

  describe('generateQr', () => {
    it('generates QR code successfully', async () => {
      const data = {
        payload: { text: 'qr https://example.com', user: 'U123', channel_type: 'im' },
        say: sayMock,
      }
      generateQrMock.mockResolvedValue({
        data: { qrBase64: 'data:image/png;base64,abc123' },
      })

      await controller.generateQr(data)

      expect(generateQrMock).toHaveBeenCalledWith('https://example.com')
      expect(sayMock).toHaveBeenCalledWith('data:image/png;base64,abc123')
    })

    it('says usage message when text is empty', async () => {
      const data = {
        payload: { text: 'qr ', user: 'U123', channel_type: 'im' },
        say: sayMock,
      }

      await controller.generateQr(data)

      expect(sayMock).toHaveBeenCalledWith('Uso: `qr <texto o URL>`')
      expect(generateQrMock).not.toHaveBeenCalled()
    })

    it('says validation error when text exceeds max length', async () => {
      const longText = 'a'.repeat(2001)
      const data = {
        payload: { text: `qr ${longText}`, user: 'U123', channel_type: 'im' },
        say: sayMock,
      }

      await controller.generateQr(data)

      expect(sayMock).toHaveBeenCalledWith(expect.stringContaining('Parámetros inválidos'))
      expect(generateQrMock).not.toHaveBeenCalled()
    })

    it('says error message when service returns error', async () => {
      const data = {
        payload: { text: 'qr test', user: 'U123', channel_type: 'im' },
        say: sayMock,
      }
      generateQrMock.mockResolvedValue({ error: 'QR generation failed' })

      await controller.generateQr(data)

      expect(sayMock).toHaveBeenCalledWith('No se pudo generar el código QR')
    })

    it('says error message when an exception is thrown', async () => {
      const data = {
        payload: { text: 'qr test', user: 'U123', channel_type: 'im' },
        say: sayMock,
      }
      generateQrMock.mockRejectedValue(new Error('Unexpected error'))

      await controller.generateQr(data)

      expect(sayMock).toHaveBeenCalledWith('Ups! Ocurrió un error al generar el QR.')
    })
  })
})
