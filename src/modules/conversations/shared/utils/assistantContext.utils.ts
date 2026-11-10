import { Alerts } from '../../../../entities/alerts'
import { Links } from '../../../../entities/links'
import { Notes } from '../../../../entities/notes'
import { Tasks } from '../../../../entities/tasks'
import { getArgentinaDateParts } from '../../../../shared/utils/dates.utils'
import {
  ASSISTANT_CONTEXT_MAX_ENTRY_CHARS,
  ASSISTANT_DATA_MAX_CHARS,
  ASSISTANT_DATA_MAX_ITEMS_PER_TYPE,
} from '../constants/assistantContext.constants'
import { roleTypes } from '../constants/openai'
import { IAssistantContextEntry, IConversation } from '../interfaces/converstions'

export const OMITTED_CONTENT_MARKER = '[contenido omitido]'

export const DATA_CONTEXT_OMITTED_NOTICE =
  'AVISO: hay registros omitidos por límite, campos recortados u omitidos por su longitud, o datos no disponibles; la ausencia de un registro o dato aquí no significa que no exista.'

const DATA_FIELD_MAX_CHARS = 500

// Splits out http(s) URLs and data: URIs (";base64" optional, payload up to the next whitespace
// or closing delimiter); whichever starts first wins, so a URL inside a data payload goes with it
const URL_OR_DATA_URI_REGEX =
  /(https?:\/\/\S+|\bdata:(?:[\w.+-]+\/[\w.+-]+)?(?:;[^\s;,]+)*,[^\s"'<>)\]]*)/gi

const HTTP_URL_REGEX = /https?:\/\/\S+/gi

// Base64 candidates (standard and URL-safe): 2+ full lines (MIME/PEM style) plus an optional
// short last line, or a single long run. The last line is only taken when it fills its line and
// has a non-letter, so the first word of a following prose line is never eaten.
const BASE64_CANDIDATE_REGEX =
  /[A-Za-z0-9+/_-]{60,}={0,2}(?:\r?\n[A-Za-z0-9+/_-]{60,}={0,2})+(?:\r?\n(?=[A-Za-z]*[0-9+/_=-])[A-Za-z0-9+/_-]+={0,2}(?=[ \t]*(?:\r?\n|$)))?|[A-Za-z0-9+/=_-]{200,}/g

const BASE64_DOMINANT_CLASS_RATIO = 0.8

// Tells base64 from other long runs of the same alphabet: separators, words, hex checksums and
// paths or slugs (mostly one character class). "+" does not show up in those, so it settles it.
const isBase64Like = (candidate: string): boolean => {
  const run = candidate.replace(/[\s=]/g, '')
  const upper = run.replace(/[^A-Z]/g, '').length
  const lower = run.replace(/[^a-z]/g, '').length
  const digit = run.replace(/[^0-9]/g, '').length
  const letters = upper + lower

  if (letters === 0 || letters === run.length) return false
  if (/^[0-9a-f]+$/i.test(run)) return false
  if (run.includes('+')) return true

  return Math.max(upper, lower, digit) < BASE64_DOMINANT_CLASS_RATIO * (letters + digit)
}

const stripBase64 = (text: string): string =>
  text.replace(BASE64_CANDIDATE_REGEX, (candidate) =>
    isBase64Like(candidate) ? OMITTED_CONTENT_MARKER : candidate
  )

export interface IDataContextInput {
  alerts: Alerts[] | null
  tasks: Tasks[] | null
  notes: Notes[] | null
  links: Links[] | null
}

export interface IDataContextOptions {
  maxItemsPerType?: number
  maxChars?: number
}

interface IRecordLine {
  text: string
  truncated: boolean // a field value was cut or left out
}

interface IDataSection {
  title: string
  total: number | null // null = could not be fetched
  lines: IRecordLine[]
}

type RecordField = [label: string, value: string | null | undefined, whole?: boolean]

const countChars = (text: string): number => Array.from(text).length

// Truncates by Unicode code points; the trailing ellipsis counts towards the limit
const truncateChars = (text: string, maxChars: number): string => {
  const chars = Array.from(text)

  if (chars.length <= maxChars) return text
  if (maxChars <= 0) return ''

  return `${chars
    .slice(0, maxChars - 1)
    .join('')
    .trimEnd()}…`
}

// Like truncateChars, but a cut that would land inside an http(s) URL moves to before that URL
const truncateKeepingUrls = (text: string, maxChars: number): string => {
  const chars = Array.from(text)

  if (chars.length <= maxChars) return text
  if (maxChars <= 0) return ''

  let cut = chars.slice(0, maxChars - 1).join('').length

  for (const match of text.matchAll(HTTP_URL_REGEX)) {
    const start = match.index ?? 0
    if (start < cut && cut < start + match[0].length) cut = start
  }

  return `${text.slice(0, cut).trimEnd()}…`
}

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * Text safe to store in the personal context: no binary-like content, bounded length.
 */
export const toContextText = (text: string): string => {
  const withoutBinary = (text ?? '')
    .split(URL_OR_DATA_URI_REGEX)
    .map((part, index) => {
      // Even indexes are plain text, odd ones the captured URL or data URI
      if (index % 2 === 0) return stripBase64(part)
      // http(s) URLs are kept verbatim: long path-style URLs look like base64 runs
      return /^https?:/i.test(part) ? part : OMITTED_CONTENT_MARKER
    })
    .join('')
    .trim()

  return truncateKeepingUrls(withoutBinary, ASSISTANT_CONTEXT_MAX_ENTRY_CHARS)
}

/**
 * Entries to append after a completed exchange. Empty when either side has no text.
 */
export const buildContextEntries = (
  userMessage: string,
  response: IConversation
): IAssistantContextEntry[] => {
  const userText = toContextText(userMessage)
  const assistantText = toContextText(response.plainText ?? response.content)

  if (!userText || !assistantText) return []

  return [
    { role: roleTypes.user, content: userText },
    { role: roleTypes.assistant, content: assistantText },
  ]
}

/**
 * Compact context for the classifier prompt: one "U:"/"A:" line per entry.
 */
export const formatContextForClassifier = (
  entries: IAssistantContextEntry[],
  maxCharsPerEntry = 200
): string =>
  entries
    .map((entry) => {
      const prefix = entry.role === roleTypes.user ? 'U' : 'A'
      return `${prefix}:${truncateChars(collapseWhitespace(entry.content), maxCharsPerEntry)}`
    })
    .join('\n')

const toTime = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

const pad = (value: number): string => String(value).padStart(2, '0')

// YYYY-MM-DD HH:mm in Argentina time
const formatDataDate = (value: Date | string | null | undefined): string => {
  const time = toTime(value)
  if (time === null) return ''

  const { year, month, day, hour, minute } = getArgentinaDateParts(new Date(time))
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`
}

// `whole` fields (urls) are never cut: a partial url is worse than none, so past the limit they
// are left out. Other fields are cut, but never in the middle of a url they embed
const buildRecordLine = (id: number, fields: RecordField[]): IRecordLine => {
  const parts = [`- #${id}`]
  let truncated = false

  fields.forEach(([label, value, whole]) => {
    const full = collapseWhitespace(String(value ?? ''))
    const tooLong = countChars(full) > DATA_FIELD_MAX_CHARS

    if (tooLong) truncated = true
    if (tooLong && whole) return

    const clean = truncateKeepingUrls(full, DATA_FIELD_MAX_CHARS)
    if (clean) parts.push(`${label}: ${clean}`)
  })

  return { text: parts.join(' | '), truncated }
}

const byDateAsc =
  <T extends { id: number }>(getDate: (item: T) => Date | string | null | undefined) =>
  (a: T, b: T): number => {
    const diff =
      (toTime(getDate(a)) ?? Number.MAX_SAFE_INTEGER) -
      (toTime(getDate(b)) ?? Number.MAX_SAFE_INTEGER)
    return diff !== 0 ? diff : a.id - b.id
  }

const byCreatedAtDesc = <T extends { id: number; createdAt: Date }>(a: T, b: T): number => {
  const diff = (toTime(b.createdAt) ?? 0) - (toTime(a.createdAt) ?? 0)
  return diff !== 0 ? diff : b.id - a.id
}

const buildSection = <T>(
  title: string,
  items: T[] | null,
  maxItems: number,
  compare: (a: T, b: T) => number,
  toLine: (item: T) => IRecordLine
): IDataSection => {
  if (items === null) return { title, total: null, lines: [] }

  return {
    title,
    total: items.length,
    lines: [...items].sort(compare).slice(0, Math.max(0, maxItems)).map(toLine),
  }
}

const buildSectionHeader = (section: IDataSection, shown: number): string => {
  if (section.total === null) return `${section.title} (no disponible)`
  if (shown < section.total) return `${section.title} (mostrando ${shown} de ${section.total})`
  return `${section.title} (${section.total})`
}

const renderDataContext = (sections: IDataSection[], shown: number[]): string => {
  const incomplete = sections.some(
    (section, index) =>
      section.total === null ||
      shown[index] < section.total ||
      section.lines.slice(0, shown[index]).some((line) => line.truncated)
  )

  const blocks = sections.map((section, index) =>
    [
      buildSectionHeader(section, shown[index]),
      ...section.lines.slice(0, shown[index]).map((line) => line.text),
    ].join('\n')
  )

  if (incomplete) blocks.push(DATA_CONTEXT_OMITTED_NOTICE)

  return blocks.join('\n\n')
}

/**
 * Saved-data block for question answering. `null` means the type could not be fetched.
 * Output never exceeds `maxChars` code points; records are dropped whole, never cut.
 * Field values over 500 chars are cut with "…" (never inside an embedded url; url fields are
 * left out instead of cut). Whenever a
 * record is dropped, a field is cut or left out, or a type is unavailable, the block ends with
 * DATA_CONTEXT_OMITTED_NOTICE.
 */
export const buildDataContext = (
  data: IDataContextInput,
  options?: IDataContextOptions
): string => {
  const maxItems = options?.maxItemsPerType ?? ASSISTANT_DATA_MAX_ITEMS_PER_TYPE
  const maxChars = options?.maxChars ?? ASSISTANT_DATA_MAX_CHARS

  const sections: IDataSection[] = [
    buildSection(
      'ALERTAS',
      data.alerts,
      maxItems,
      byDateAsc<Alerts>((alert) => alert.date),
      (alert) =>
        buildRecordLine(alert.id, [
          ['mensaje', alert.message],
          ['estado', alert.sent ? 'enviada' : 'pendiente'],
          ['fecha', formatDataDate(alert.date ?? alert.createdAt)],
        ])
    ),
    buildSection('TAREAS', data.tasks, maxItems, byCreatedAtDesc, (task) =>
      buildRecordLine(task.id, [
        ['título', task.title],
        ['descripción', task.description],
        ['etiqueta', task.tag],
        ['estado', task.status],
        ['fecha', formatDataDate(task.alertDate ?? task.createdAt)],
      ])
    ),
    buildSection('NOTAS', data.notes, maxItems, byCreatedAtDesc, (note) =>
      buildRecordLine(note.id, [
        ['título', note.title],
        ['descripción', note.description],
        ['etiqueta', note.tag],
        ['fecha', formatDataDate(note.createdAt)],
      ])
    ),
    buildSection('LINKS', data.links, maxItems, byCreatedAtDesc, (link) =>
      buildRecordLine(link.id, [
        ['título', link.title],
        ['descripción', link.description],
        ['etiqueta', link.tag],
        ['estado', link.status],
        ['fecha', formatDataDate(link.createdAt)],
        ['url', link.url, true],
      ])
    ),
  ]

  const all = sections.map((section) => section.lines.length)
  const complete = renderDataContext(sections, all)
  if (countChars(complete) <= maxChars) return complete

  // Round-robin: one record per type per pass, so a type with huge records cannot starve the rest
  const shown = sections.map(() => 0)
  const open = sections.map((section) => section.lines.length > 0)

  while (open.some(Boolean)) {
    sections.forEach((section, index) => {
      if (!open[index]) return

      const candidate = [...shown]
      candidate[index] += 1

      if (countChars(renderDataContext(sections, candidate)) <= maxChars) {
        shown[index] = candidate[index]
        open[index] = shown[index] < section.lines.length
      } else {
        open[index] = false
      }
    })
  }

  const output = renderDataContext(sections, shown)
  if (countChars(output) <= maxChars) return output

  // Budget smaller than the bare headers: keep the notice and drop headers from the end
  const headers = sections.map((section) => buildSectionHeader(section, 0))
  while (headers.length > 0) {
    headers.pop()
    const reduced = [...headers, DATA_CONTEXT_OMITTED_NOTICE].join('\n')
    if (countChars(reduced) <= maxChars) return reduced
  }

  return ''
}
