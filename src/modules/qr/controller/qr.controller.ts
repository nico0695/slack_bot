import { injectable } from 'tsyringe'
import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/genericController'
import { SlackAuth } from '../../../shared/middleware/auth'
import QrServices from '../services/qr.services'
import { qrSchema } from '../shared/schemas/qr.schemas'

const log = createModuleLogger('qr.controller')

@injectable()
export default class QrController extends GenericController {
  constructor(private qrServices: QrServices) {
    super()
    this.generateQr = this.generateQr.bind(this)
  }

  @SlackAuth
  public async generateQr(data: any): Promise<void> {
    const { payload, say, client }: any = data

    try {
      const text: string = payload.text.replace(/^qr\s+/i, '').trim()

      if (!text) {
        say('Uso: `qr <texto o URL>`')
        return
      }

      const validation = qrSchema.safeParse({ text })

      if (!validation.success) {
        const messages = validation.error.errors.map((e) => e.message).join(', ')
        say(`Parámetros inválidos: ${messages}`)
        return
      }

      const response = await this.qrServices.generateQrBuffer(validation.data.text)

      if (response.error) {
        say('No se pudo generar el código QR')
        return
      }

      await client.files.uploadV2({
        channel_id: payload.channel,
        file: response.data.qrBuffer,
        filename: 'qr.png',
      })
    } catch (error) {
      log.error({ err: error }, 'generateQr failed')
      say('Ups! Ocurrió un error al generar el QR.')
    }
  }
}
