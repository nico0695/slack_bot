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

  /**
   * Generate QR code from Slack message
   * Command format: .qr <content>
   *
   * @param data slack response
   */
  public generateQr = async (data: any): Promise<void> => {
    const { payload, say }: any = data

    try {
      const content: string = payload.text.replace(/^\.qr\s+/i, '').trimStart()

      if (!content || content.length === 0) {
        await say('Por favor proporciona el contenido para generar el código QR. Uso: .qr <contenido>')
        return
      }

      if (content.length > 2000) {
        await say('El contenido es demasiado largo. Máximo 2000 caracteres.')
        return
      }

      const response = await this.qrServices.generateQrCode(content)

      if (response.error) {
        await say(`Error: ${response.error}`)
        return
      }

      await say(`Código QR generado para: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"\n${response.data.image}`)
    } catch (error) {
      log.error({ err: error }, 'generateQr failed')
      await say('Ocurrió un error al generar el código QR')
    }
  }
}
