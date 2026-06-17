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

const generateQrBufferMock = jest.fn()

const qrServicesMock = {
  generateQrBuffer: generateQrBufferMock,
}

describe('QrController', () => {
  let controller: QrController
  let sayMock: jest.Mock
  let clientMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new QrController(qrServicesMock as any)
    sayMock = jest.fn()
    clientMock = {
      files: {
        uploadV2: jest.fn().mockResolvedValue({}),
      },
    }
  })

  describe('generateQr', () => {
    it('uploads QR image via client.files.uploadV2', async () => {
      const fakeBuffer = Buffer.from('fake-png-data')
      const data = {
        payload: {
          text: 'qr https://example.com',
          user: 'U123',
          channel: 'C123',
          channel_type: 'im',
        },
        say: sayMock,
        client: clientMock,
      }
      generateQrBufferMock.mockResolvedValue({
        data: { qrBuffer: fakeBuffer },
      })

      await controller.generateQr(data)

      expect(generateQrBufferMock).toHaveBeenCalledWith('https://example.com')
      expect(clientMock.files.uploadV2).toHaveBeenCalledWith({
        channel_id: 'C123',
        file: fakeBuffer,
        filename: 'qr.png',
      })
      expect(sayMock).not.toHaveBeenCalled()
    })

    it('says usage message when text is empty', async () => {
      const data = {
        payload: { text: 'qr ', user: 'U123', channel: 'C123', channel_type: 'im' },
        say: sayMock,
        client: clientMock,
      }

      await controller.generateQr(data)

      expect(sayMock).toHaveBeenCalledWith('Uso: `qr <texto o URL>`')
      expect(generateQrBufferMock).not.toHaveBeenCalled()
    })

    it('says validation error when text exceeds max length', async () => {
      const longText = 'a'.repeat(2001)
      const data = {
        payload: { text: `qr ${longText}`, user: 'U123', channel: 'C123', channel_type: 'im' },
        say: sayMock,
        client: clientMock,
      }

      await controller.generateQr(data)

      expect(sayMock).toHaveBeenCalledWith(expect.stringContaining('Parámetros inválidos'))
      expect(generateQrBufferMock).not.toHaveBeenCalled()
    })

    it('says error message when service returns error', async () => {
      const data = {
        payload: { text: 'qr test', user: 'U123', channel: 'C123', channel_type: 'im' },
        say: sayMock,
        client: clientMock,
      }
      generateQrBufferMock.mockResolvedValue({ error: 'QR generation failed' })

      await controller.generateQr(data)

      expect(sayMock).toHaveBeenCalledWith('No se pudo generar el código QR')
    })

    it('says error message when an exception is thrown', async () => {
      const data = {
        payload: { text: 'qr test', user: 'U123', channel: 'C123', channel_type: 'im' },
        say: sayMock,
        client: clientMock,
      }
      generateQrBufferMock.mockRejectedValue(new Error('Unexpected error'))

      await controller.generateQr(data)

      expect(sayMock).toHaveBeenCalledWith('Ups! Ocurrió un error al generar el QR.')
    })
  })
})
