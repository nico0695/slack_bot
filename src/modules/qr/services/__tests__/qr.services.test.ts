/* eslint-disable import/first */
import QRCode from 'qrcode'

jest.mock('qrcode', () => ({
  toBuffer: jest.fn(),
}))

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  }),
}))

import QrServices from '../qr.services'

describe('QrServices', () => {
  let services: QrServices
  const toBufferMock = QRCode.toBuffer as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset singleton for clean state
    ;(QrServices as any).instance = undefined
    services = QrServices.getInstance()
  })

  it('returns singleton instance', () => {
    const instance1 = QrServices.getInstance()
    const instance2 = QrServices.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('generates a QR code buffer successfully', async () => {
    const mockBuffer = Buffer.from('mock-png-data')
    toBufferMock.mockResolvedValue(mockBuffer)

    const result = await services.generateQr({ content: 'https://example.com' })

    expect(result.data).toBeDefined()
    expect(result.data.buffer).toBe(mockBuffer)
    expect(result.data.content).toBe('https://example.com')
    expect(toBufferMock).toHaveBeenCalledWith('https://example.com', {
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      width: 300,
      margin: 2,
    })
  })

  it('uses custom visual options', async () => {
    const mockBuffer = Buffer.from('mock-png-data')
    toBufferMock.mockResolvedValue(mockBuffer)

    await services.generateQr({
      content: 'test',
      foregroundColor: '#FF0000',
      backgroundColor: '#00FF00',
      errorCorrectionLevel: 'H',
    })

    expect(toBufferMock).toHaveBeenCalledWith('test', {
      errorCorrectionLevel: 'H',
      color: {
        dark: '#FF0000',
        light: '#00FF00',
      },
      width: 300,
      margin: 2,
    })
  })

  it('returns error for empty content', async () => {
    const result = await services.generateQr({ content: '' })
    expect(result.error).toBe('El contenido para generar el QR no puede estar vacío')
    expect(result.data).toBeUndefined()
  })

  it('returns error for whitespace-only content', async () => {
    const result = await services.generateQr({ content: '   ' })
    expect(result.error).toBe('El contenido para generar el QR no puede estar vacío')
  })

  it('returns error when qrcode library throws', async () => {
    toBufferMock.mockRejectedValue(new Error('QR generation failed'))

    const result = await services.generateQr({ content: 'test' })
    expect(result.error).toBe('Error al generar el código QR')
    expect(result.data).toBeUndefined()
  })
})
