import { IQrParsedInput, IQrVisualOptions } from '../interfaces/qr.interfaces'
import { QR_SHORTCUTS, QR_DEFAULTS } from '../constants/qr.constants'

const VALID_HEX_COLOR = /^#[0-9A-Fa-f]{6}$/
const VALID_ERROR_LEVEL = /^[LMQH]$/
const FG_FLAG_PATTERN = /-fg\s+(#[0-9A-Fa-f]{6})\b/
const BG_FLAG_PATTERN = /-bg\s+(#[0-9A-Fa-f]{6})\b/
const ECL_FLAG_PATTERN = /-e\s+([LMQH])\b/

// Pre-compile shortcut patterns
const SHORTCUT_PATTERNS = Object.entries(QR_SHORTCUTS).map(([key, shortcut]) => ({
  key,
  shortcut,
  pattern: new RegExp(`^-${key}\\s+(.+)$`, 's'),
}))

/**
 * Parse raw input string for the .qr command.
 * Extracts visual flags (-fg, -bg, -e) and shortcut flags (-wa, -tl, etc.)
 * Returns the final content string and visual options.
 */
export function parseQrInput(raw: string): IQrParsedInput {
  let input = raw.trim()

  const visualOptions: Partial<IQrVisualOptions> = {}

  // Extract -fg flag
  const fgMatch = input.match(FG_FLAG_PATTERN)
  if (fgMatch) {
    if (VALID_HEX_COLOR.test(fgMatch[1])) {
      visualOptions.foregroundColor = fgMatch[1]
    }
    input = input.replace(fgMatch[0], '').trim()
  }

  // Extract -bg flag
  const bgMatch = input.match(BG_FLAG_PATTERN)
  if (bgMatch) {
    if (VALID_HEX_COLOR.test(bgMatch[1])) {
      visualOptions.backgroundColor = bgMatch[1]
    }
    input = input.replace(bgMatch[0], '').trim()
  }

  // Extract -e flag
  const eMatch = input.match(ECL_FLAG_PATTERN)
  if (eMatch) {
    if (VALID_ERROR_LEVEL.test(eMatch[1])) {
      visualOptions.errorCorrectionLevel = eMatch[1] as IQrVisualOptions['errorCorrectionLevel']
    }
    input = input.replace(eMatch[0], '').trim()
  }

  // Check for shortcut flags
  for (const { shortcut, pattern } of SHORTCUT_PATTERNS) {
    const match = input.match(pattern)
    if (match) {
      const formatted = shortcut.format(match[1].trim())
      if (formatted) {
        return { content: formatted, visualOptions }
      }
      break
    }
  }

  return { content: input, visualOptions }
}

/**
 * Merge partial visual options with defaults.
 */
export function resolveVisualOptions(partial: Partial<IQrVisualOptions>): IQrVisualOptions {
  return {
    foregroundColor: partial.foregroundColor ?? QR_DEFAULTS.foregroundColor,
    backgroundColor: partial.backgroundColor ?? QR_DEFAULTS.backgroundColor,
    errorCorrectionLevel: partial.errorCorrectionLevel ?? QR_DEFAULTS.errorCorrectionLevel,
  }
}
