import { createModuleLogger } from '../../../config/logger'
import { SlackAuth } from '../../../shared/middleware/auth'
import QrServices from '../services/qr.services'
import { parseQrInput, resolveVisualOptions } from '../shared/utils/qrParser.utils'

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

  @SlackAuth
  public async generateQr(data: any): Promise<void> {
    const { payload, say, client }: any = data

    try {
      const rawText: string = payload.text.replace(/^\.qr\s*/, '').trim()

      if (!rawText) {
        say('Uso: `.qr <texto_o_url> [-fg <hex>] [-bg <hex>] [-e <H|M|L|Q>]`')
        return
      }

      const parsed = parseQrInput(rawText)
      const visualOptions = resolveVisualOptions(parsed.visualOptions)

      const response = await this.qrServices.generateQr({
        content: parsed.content,
        foregroundColor: visualOptions.foregroundColor,
        backgroundColor: visualOptions.backgroundColor,
        errorCorrectionLevel: visualOptions.errorCorrectionLevel,
      })

      if (response.error) {
        say(`Error: ${response.error}`)
        return
      }

      await client.files.uploadV2({
        channel_id: payload.channel,
        file: response.data.buffer,
        filename: 'qrcode.png',
        title: 'QR Code',
        initial_comment: `QR generado para: ${response.data.content}`,
      })
    } catch (error) {
      log.error({ err: error, slackUserId: payload?.user }, 'generateQr failed')
      say('Ups! Ocurrió un error al generar el QR.')
    }
  }
}
