import QRCode from 'qrcode'
import { createModuleLogger } from '../../../config/logger'
import { GenericResponse } from '../../../shared/interfaces/services'
import { IQrResponse } from '../shared/interfaces/qr.interfaces'
import { QR_ERROR_CORRECTION_LEVEL, QR_IMAGE_WIDTH, QR_TEXT_MAX_LENGTH } from '../shared/constants/qr.constants'

const log = createModuleLogger('qr.services')

export default class QrServices {
  private static instance: QrServices

  private constructor() {}

  static getInstance(): QrServices {
    if (this.instance) {
      return this.instance
    }

    this.instance = new QrServices()
    return this.instance
  }

  async generateQr(text: string): Promise<GenericResponse<IQrResponse>> {
    if (!text || text.length > QR_TEXT_MAX_LENGTH) {
      return { error: 'El texto debe tener entre 1 y 2000 caracteres' }
    }

    try {
      const qrBase64 = await QRCode.toDataURL(text, {
        width: QR_IMAGE_WIDTH,
        errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
      })

      log.info({ textLength: text.length }, 'QR code generated')

      return {
        data: {
          qrBase64,
        },
      }
    } catch (error) {
      log.error({ err: error }, 'generateQr failed')
      return { error: 'Error inesperado al generar el código QR' }
    }
  }
}
