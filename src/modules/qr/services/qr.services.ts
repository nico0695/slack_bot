import QRCode from 'qrcode'

import { createModuleLogger } from '../../../config/logger'
import { GenericResponse } from '../../../shared/interfaces/services'
import { IQrGenerateOptions, IQrResult } from '../shared/interfaces/qr.interfaces'
import { QR_DEFAULTS } from '../shared/constants/qr.constants'

const log = createModuleLogger('qr.service')

export default class QrServices {
  private static instance: QrServices

  private constructor() {
    this.generateQr = this.generateQr.bind(this)
  }

  static getInstance(): QrServices {
    if (this.instance) {
      return this.instance
    }

    this.instance = new QrServices()
    return this.instance
  }

  /**
   * Generate a QR code image buffer from content string.
   */
  async generateQr(options: IQrGenerateOptions): Promise<GenericResponse<IQrResult>> {
    try {
      const { content } = options

      if (!content || content.trim().length === 0) {
        return { error: 'El contenido para generar el QR no puede estar vacío' }
      }

      const fg = options.foregroundColor ?? QR_DEFAULTS.foregroundColor
      const bg = options.backgroundColor ?? QR_DEFAULTS.backgroundColor
      const ecl = options.errorCorrectionLevel ?? QR_DEFAULTS.errorCorrectionLevel

      const buffer = await QRCode.toBuffer(content, {
        errorCorrectionLevel: ecl,
        color: {
          dark: fg,
          light: bg,
        },
        width: 300,
        margin: 2,
      })

      log.info({ contentLength: content.length, ecl }, 'QR code generated')

      return {
        data: {
          buffer,
          content,
        },
      }
    } catch (error) {
      log.error({ err: error }, 'generateQr failed')
      return { error: 'Error al generar el código QR' }
    }
  }
}
