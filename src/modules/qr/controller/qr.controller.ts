import { createModuleLogger } from '../../../config/logger'
import QrServices from '../services/qr.services'

const log = createModuleLogger('qr.controller')

export default class QrController {
  private static instance: QrController

  private qrServices: QrServices

  private constructor() {
    this.qrServices = QrServices.getInstance()

    this.generateQr = this.generateQr.bind(this)
  }

  static getInstance(): QrController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new QrController()
    return this.instance
  }

  public generateQr = async (data: any): Promise<void> => {
    const { payload, say }: any = data

    try {
      const text: string = payload.text.replace(/^qr\s+/i, '').trim()

      if (!text) {
        say('Uso: `qr <texto o URL>`')
        return
      }

      const response = await this.qrServices.generateQr(text)

      if (response.error) {
        say('No se pudo generar el código QR')
        return
      }

      say(response.data.qrBase64)
    } catch (error) {
      log.error({ err: error }, 'generateQr failed')
    }
  }
}
