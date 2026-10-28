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
