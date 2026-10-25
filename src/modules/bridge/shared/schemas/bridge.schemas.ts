import { z } from 'zod'

import {
  BRIDGE_SECRET_MAX_LENGTH,
  BRIDGE_SECRET_MIN_LENGTH,
  BRIDGE_URL_MAX_LENGTH,
} from '../constants/bridge.constants'
import { getBridgeBaseUrlError, normalizeBridgeBaseUrl } from '../utils/bridgeUrl.utils'

const bridgeBaseUrlSchema = z
  .string()
  .trim()
  .max(BRIDGE_URL_MAX_LENGTH)
  .superRefine((value, ctx) => {
    const error = getBridgeBaseUrlError(value)
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error })
    }
  })
  .transform(normalizeBridgeBaseUrl)

// Printable ASCII without spaces, so it is always a valid header value
const bridgeSecretSchema = z
  .string()
  .min(BRIDGE_SECRET_MIN_LENGTH)
  .max(BRIDGE_SECRET_MAX_LENGTH)
  .regex(/^[\x21-\x7E]+$/, 'El secreto sólo admite caracteres ASCII imprimibles sin espacios')

export const updateBridgeConfigSchema = z
  .object({
    baseUrl: bridgeBaseUrlSchema.nullable().optional(),
    secret: bridgeSecretSchema.nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
