import { createModuleLogger } from '../../../config/logger'
import QrServices from '../services/qr.services'
import { parseQrInput, resolveVisualOptions } from '../shared/utils/qrParser.utils'
import { IQrGenerateOptions } from '../shared/interfaces/qr.interfaces'

const log = createModuleLogger('qrWeb.controller')

export default class QrWebController {
  private static instance: QrWebController

  private qrServices: QrServices

  private constructor() {
    this.qrServices = QrServices.getInstance()

    this.generateQr = this.generateQr.bind(this)
  }

  static getInstance(): QrWebController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new QrWebController()
    return this.instance
  }

  /**
   * Handle generate_qr Socket.io event.
   * Accepts raw text or structured payload and returns base64 image.
   */
  public async generateQr(data: {
    text: string
    foregroundColor?: string
    backgroundColor?: string
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  }): Promise<{ data?: { image: string; content: string }; error?: string }> {
    try {
      const { text } = data

      if (!text || text.trim().length === 0) {
        return { error: 'El texto para generar el QR no puede estar vacío' }
      }

      const parsed = parseQrInput(text)
      const visualOptions = resolveVisualOptions(parsed.visualOptions)

      const options: IQrGenerateOptions = {
        content: parsed.content,
        foregroundColor: data.foregroundColor ?? visualOptions.foregroundColor,
        backgroundColor: data.backgroundColor ?? visualOptions.backgroundColor,
        errorCorrectionLevel: data.errorCorrectionLevel ?? visualOptions.errorCorrectionLevel,
      }

      const response = await this.qrServices.generateQr(options)

      if (response.error) {
        return { error: response.error }
      }

      const serviceData = response.data

      if (!serviceData) {
        log.error({ response }, 'QR service returned empty data without error')
        return { error: 'Error al generar el código QR' }
      }

      const base64Image = serviceData.buffer.toString('base64')

      log.info({ contentLength: parsed.content.length }, 'QR generated for socket client')

      return {
        data: {
          image: base64Image,
          content: serviceData.content,
        },
      }
    } catch (error) {
      log.error({ err: error }, 'generateQr socket handler failed')
      return { error: 'Error al generar el código QR' }
    }
  }
}
