import { singleton } from 'tsyringe'
import QRCode from 'qrcode'
import { createModuleLogger } from '../../../config/logger'
import { GenericResponse } from '../../../shared/interfaces/services'
import { IQrBufferResponse, IQrResponse } from '../shared/interfaces/qr.interfaces'
import {
  QR_ERROR_CORRECTION_LEVEL,
  QR_IMAGE_WIDTH,
  QR_TEXT_MAX_LENGTH,
} from '../shared/constants/qr.constants'

const log = createModuleLogger('qr.services')

@singleton()
export default class QrServices {
  async generateQr(text: string): Promise<GenericResponse<IQrResponse>> {
    const trimmedText = (text ?? '').trim()

    if (!trimmedText || trimmedText.length > QR_TEXT_MAX_LENGTH) {
      return { error: 'El texto debe tener entre 1 y 2000 caracteres' }
    }

    try {
      const qrBase64 = await QRCode.toDataURL(trimmedText, {
        width: QR_IMAGE_WIDTH,
        errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
      })

      log.info({ textLength: trimmedText.length }, 'QR code generated')

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

  async generateQrBuffer(text: string): Promise<GenericResponse<IQrBufferResponse>> {
    const trimmedText = (text ?? '').trim()

    if (!trimmedText || trimmedText.length > QR_TEXT_MAX_LENGTH) {
      return { error: 'El texto debe tener entre 1 y 2000 caracteres' }
    }

    try {
      const qrBuffer = await QRCode.toBuffer(trimmedText, {
        width: QR_IMAGE_WIDTH,
        errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
      })

      log.info({ textLength: trimmedText.length }, 'QR buffer generated')

      return {
        data: {
          qrBuffer,
        },
      }
    } catch (error) {
      log.error({ err: error }, 'generateQrBuffer failed')
      return { error: 'Error inesperado al generar el código QR' }
    }
  }
}
