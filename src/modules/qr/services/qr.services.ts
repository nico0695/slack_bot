import { createModuleLogger } from '../../../config/logger'
import { GenericResponse } from '../../../shared/interfaces/services'
import { IQrRepository, IQrResponse } from '../shared/interfaces/qr.interfaces'
import QrCodeRepository from '../repositories/qrcode/qrcode.repository'

const log = createModuleLogger('qr.services')

export default class QrServices {
  private static instance: QrServices

  private qrRepository: IQrRepository

  private constructor() {
    this.qrRepository = QrCodeRepository.getInstance()
  }

  static getInstance(): QrServices {
    if (this.instance) {
      return this.instance
    }

    this.instance = new QrServices()
    return this.instance
  }

  async generateQrCode(content: string): Promise<GenericResponse<IQrResponse>> {
    try {
      const image = await this.qrRepository.generateQrCode(content)

      if (!image) {
        return { error: 'No se pudo generar el código QR' }
      }

      log.info({ contentLength: content.length }, 'QR code generated successfully')

      return {
        data: {
          image,
          format: 'png',
          content,
        },
      }
    } catch (error) {
      log.error({ err: error }, 'generateQrCode failed')
      return { error: 'Error inesperado al generar el código QR' }
    }
  }
}
