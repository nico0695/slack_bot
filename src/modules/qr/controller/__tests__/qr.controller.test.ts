/* eslint-disable import/first */
jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (_t: any, _k: string, d: PropertyDescriptor): PropertyDescriptor => d
  return {
    SlackAuth: identityDecorator,
    HttpAuth: identityDecorator,
    Permission: () => identityDecorator,
    Profiles: { USER: 'USER', USER_PREMIUM: 'USER_PREMIUM', ADMIN: 'ADMIN' },
  }
})

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  }),
}))

const generateQrMock = jest.fn()

jest.mock('../../services/qr.services', () => {
  return {
    __esModule: true,
    default: {
      getInstance: () => ({
        generateQr: generateQrMock,
      }),
    },
  }
})

import QrController from '../qr.controller'

describe('QrController', () => {
  let controller: QrController
  let say: jest.Mock
  let client: { files: { uploadV2: jest.Mock } }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(QrController as any).instance = undefined
    controller = QrController.getInstance()
    say = jest.fn()
    client = { files: { uploadV2: jest.fn().mockResolvedValue({}) } }
  })

  it('returns singleton instance', () => {
    const instance1 = QrController.getInstance()
    const instance2 = QrController.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('generates QR and uploads to Slack', async () => {
    const mockBuffer = Buffer.from('png-data')
    generateQrMock.mockResolvedValue({
      data: { buffer: mockBuffer, content: 'https://example.com' },
    })

    await controller.generateQr({
      payload: { text: '.qr https://example.com', channel: 'C123', user: 'U123' },
      say,
      client,
    })

    expect(generateQrMock).toHaveBeenCalledWith({
      content: 'https://example.com',
      foregroundColor: '#000000',
      backgroundColor: '#FFFFFF',
      errorCorrectionLevel: 'M',
    })
    expect(client.files.uploadV2).toHaveBeenCalledWith({
      channel_id: 'C123',
      file: mockBuffer,
      filename: 'qrcode.png',
      title: 'QR Code',
      initial_comment: 'QR generado para: https://example.com',
    })
    expect(say).not.toHaveBeenCalled()
  })

  it('sends usage message when no text provided', async () => {
    await controller.generateQr({
      payload: { text: '.qr', channel: 'C123', user: 'U123' },
      say,
      client,
    })

    expect(say).toHaveBeenCalledWith(
      'Uso: `.qr <texto_o_url> [-fg <hex>] [-bg <hex>] [-e <H|M|L|Q>]`'
    )
    expect(generateQrMock).not.toHaveBeenCalled()
  })

  it('sends error when service returns error', async () => {
    generateQrMock.mockResolvedValue({ error: 'Something went wrong' })

    await controller.generateQr({
      payload: { text: '.qr test', channel: 'C123', user: 'U123' },
      say,
      client,
    })

    expect(say).toHaveBeenCalledWith('Error: Something went wrong')
  })

  it('handles exceptions gracefully', async () => {
    generateQrMock.mockRejectedValue(new Error('Unexpected'))

    await controller.generateQr({
      payload: { text: '.qr test', channel: 'C123', user: 'U123' },
      say,
      client,
    })

    expect(say).toHaveBeenCalledWith('Ups! Ocurrió un error al generar el QR.')
  })

  it('handles .qr with visual flags', async () => {
    const mockBuffer = Buffer.from('png-data')
    generateQrMock.mockResolvedValue({
      data: { buffer: mockBuffer, content: 'hello' },
    })

    await controller.generateQr({
      payload: { text: '.qr hello -fg #FF0000 -bg #00FF00 -e H', channel: 'C123', user: 'U123' },
      say,
      client,
    })

    expect(generateQrMock).toHaveBeenCalledWith({
      content: 'hello',
      foregroundColor: '#FF0000',
      backgroundColor: '#00FF00',
      errorCorrectionLevel: 'H',
    })
  })

  it('handles .qr with shortcut flags', async () => {
    const mockBuffer = Buffer.from('png-data')
    generateQrMock.mockResolvedValue({
      data: { buffer: mockBuffer, content: 'https://t.me/myuser' },
    })

    await controller.generateQr({
      payload: { text: '.qr -tl myuser', channel: 'C123', user: 'U123' },
      say,
      client,
    })

    expect(generateQrMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'https://t.me/myuser' })
    )
  })
})
