import { formatDateToText } from '../../../../shared/utils/dates.utils'

// Plain-text versions of assistant responses for clients that cannot render Slack blocks

export const PLAIN_TEXT_LIST_MAX_ITEMS = 10

export const QR_OMITTED_TEXT =
  'Se generó el código QR, pero no se puede mostrar en este dispositivo.'

export const IMAGES_LIST_OMITTED_TEXT =
  'La lista de imágenes no está disponible en este dispositivo.'

export const generatedImagesOmittedText = (count: number, provider: string): string =>
  count > 1
    ? `Se generaron ${count} imágenes con ${provider}, pero no se pueden mostrar en este dispositivo.`
    : `Se generó ${count} imagen con ${provider}, pero no se puede mostrar en este dispositivo.`

/**
 * Header plus one line per item, capped at `maxItems` with a "y N más" tail.
 * Without items only the empty text is returned.
 */
export const formatPlainTextList = (
  header: string,
  lines: string[],
  emptyText: string,
  maxItems = PLAIN_TEXT_LIST_MAX_ITEMS
): string => {
  if (lines.length === 0) {
    return emptyText
  }

  const visible = lines.slice(0, maxItems)
  const hidden = lines.length - visible.length

  return [header, ...visible, ...(hidden > 0 ? [`y ${hidden} más`] : [])].join('\n')
}

export const alertPlainTextLine = (alert: { id: number; message: string; date: Date }): string =>
  `#${alert.id} - ${alert.message} (${formatDateToText(alert.date)})`

export const taskPlainTextLine = (task: {
  id: number
  title: string
  description?: string
}): string => `#${task.id} - ${task.title}${task.description ? `: ${task.description}` : ''}`

export const notePlainTextLine = (note: {
  id: number
  title: string
  description?: string
}): string => `#${note.id} - ${note.title}${note.description ? `: ${note.description}` : ''}`

export const linkPlainTextLine = (link: { id: number; url: string; title?: string }): string =>
  `#${link.id} - ${link.title ? `${link.title}: ${link.url}` : link.url}`

export const TRUNCATED_NOTICE = '\n… (respuesta recortada)'

// Pictographs plus the skin tones, flag letters, joiners and variation selectors around them.
// Built from strings so the invisible code points stay escaped in the source.
const EMOJI_PATTERN = new RegExp(
  [
    '\\p{Extended_Pictographic}',
    '\\p{Emoji_Modifier}',
    '\\p{Regional_Indicator}',
    '\\u200D',
    '\\uFE0E',
    '\\uFE0F',
    '\\u20E3',
  ].join('|'),
  'gu'
)

/**
 * Slack mrkdwn to plain text: links become "label: url", formatting marks and emojis go away
 */
export const normalizePlainText = (text: string): string =>
  text
    .replace(/<([^<>|\s]+)\|([^<>]+)>/g, '$2: $1')
    .replace(/<(https?:\/\/[^<>\s]+)>/g, '$1')
    .replace(/\*{1,2}([^*\n]+?)\*{1,2}/g, '$1')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,:;!?])/gm, '$1$2')
    .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,:;!?])/gm, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(EMOJI_PATTERN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/**
 * Cut to `maxChars` characters (not UTF-16 units), notice included
 */
export const truncatePlainText = (
  text: string,
  maxChars: number
): { text: string; truncated: boolean } => {
  const chars = Array.from(text)

  if (chars.length <= maxChars) {
    return { text, truncated: false }
  }

  const keep = Math.max(maxChars - Array.from(TRUNCATED_NOTICE).length, 0)

  return { text: chars.slice(0, keep).join('').trimEnd() + TRUNCATED_NOTICE, truncated: true }
}
