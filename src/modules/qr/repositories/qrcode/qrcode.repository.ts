import QRCode from 'qrcode'
import { createModuleLogger } from '../../../../config/logger'
import { IQrRepository } from '../../shared/interfaces/qr.interfaces'
import { QR_OPTIONS } from '../../shared/constants/qr.constants'

const log = createModuleLogger('qr.repository')

export default class QrCodeRepository implements IQrRepository {
  private static instance: QrCodeRepository

  private constructor() {}

  static getInstance(): QrCodeRepository {
    if (this.instance) {
      return this.instance
    }

    this.instance = new QrCodeRepository()
    return this.instance
  }

  async generateQrCode(content: string): Promise<string | null> {
    try {
      const dataUrl = await QRCode.toDataURL(content, {
        errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel,
        type: QR_OPTIONS.type,
        width: QR_OPTIONS.width,
        margin: QR_OPTIONS.margin,
      })

      log.info({ contentLength: content.length }, 'QR code generated successfully')
      return dataUrl
    } catch (error) {
      log.error({ err: error, contentLength: content.length }, 'Failed to generate QR code')
      return null
    }
  }
}
