import { z } from 'zod'
import { QR_TEXT_MAX_LENGTH } from '../constants/qr.constants'

export const qrSchema = z.object({
  text: z.string().trim().min(1).max(QR_TEXT_MAX_LENGTH),
})
