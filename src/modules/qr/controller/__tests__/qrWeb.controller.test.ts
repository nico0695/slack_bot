/* eslint-disable import/first */
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

import QrWebController from '../qrWeb.controller'

describe('QrWebController', () => {
  let controller: QrWebController

  beforeEach(() => {
    jest.clearAllMocks()
    ;(QrWebController as any).instance = undefined
    controller = QrWebController.getInstance()
  })

  it('returns singleton instance', () => {
    const instance1 = QrWebController.getInstance()
    const instance2 = QrWebController.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('generates QR and returns base64 image', async () => {
    const mockBuffer = Buffer.from('png-data')
    generateQrMock.mockResolvedValue({
      data: { buffer: mockBuffer, content: 'https://example.com' },
    })

    const result = await controller.generateQr({ text: 'https://example.com' })

    expect(result.data).toBeDefined()
    expect(result.data.image).toBe(mockBuffer.toString('base64'))
    expect(result.data.content).toBe('https://example.com')
  })

  it('returns error for empty text', async () => {
    const result = await controller.generateQr({ text: '' })
    expect(result.error).toBe('El texto para generar el QR no puede estar vacío')
  })

  it('returns error when service fails', async () => {
    generateQrMock.mockResolvedValue({ error: 'QR generation failed' })

    const result = await controller.generateQr({ text: 'test' })
    expect(result.error).toBe('QR generation failed')
  })

  it('handles exceptions gracefully', async () => {
    generateQrMock.mockRejectedValue(new Error('Unexpected'))

    const result = await controller.generateQr({ text: 'test' })
    expect(result.error).toBe('Error al generar el código QR')
  })

  it('parses visual flags from text', async () => {
    const mockBuffer = Buffer.from('png-data')
    generateQrMock.mockResolvedValue({
      data: { buffer: mockBuffer, content: 'hello' },
    })

    await controller.generateQr({ text: 'hello -fg #FF0000' })

    expect(generateQrMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'hello',
        foregroundColor: '#FF0000',
      })
    )
  })

  it('allows explicit options to override parsed flags', async () => {
    const mockBuffer = Buffer.from('png-data')
    generateQrMock.mockResolvedValue({
      data: { buffer: mockBuffer, content: 'hello' },
    })

    await controller.generateQr({
      text: 'hello -fg #FF0000',
      foregroundColor: '#00FF00',
    })

    expect(generateQrMock).toHaveBeenCalledWith(
      expect.objectContaining({
        foregroundColor: '#00FF00',
      })
    )
  })

  it('handles shortcut flags', async () => {
    const mockBuffer = Buffer.from('png-data')
    generateQrMock.mockResolvedValue({
      data: { buffer: mockBuffer, content: 'https://t.me/myuser' },
    })

    const result = await controller.generateQr({ text: '-tl myuser' })

    expect(generateQrMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'https://t.me/myuser' })
    )
    expect(result.data).toBeDefined()
  })
})
