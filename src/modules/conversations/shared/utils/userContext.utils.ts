import { Alerts } from '../../../../entities/alerts'
import { Tasks } from '../../../../entities/tasks'
import { Notes } from '../../../../entities/notes'
import { Links } from '../../../../entities/links'
import { truncateText } from '../../../../shared/utils/string.utils'
import { getRelativeTimeCompact } from '../../../../shared/utils/dates.utils'
import { IUserConversation } from '../interfaces/converstions'

export interface IUserContextData {
  alerts?: Alerts[]
  tasks?: Tasks[]
  notes?: Notes[]
  links?: Links[]
}

export interface IUserContextOptions {
  maxItems?: number
}

export const buildUserDataContext = (
  data: IUserContextData,
  options: IUserContextOptions = {}
): string => {
  const maxItems = options.maxItems ?? 5
  const lines: string[] = []

  if (data.alerts && data.alerts.length > 0) {
    lines.push(formatCompactAlerts(data.alerts, maxItems))
  }

  if (data.tasks && data.tasks.length > 0) {
    lines.push(formatCompactTasks(data.tasks, maxItems))
  }

  if (data.notes && data.notes.length > 0) {
    lines.push(formatCompactNotes(data.notes, maxItems))
  }

  if (data.links && data.links.length > 0) {
    lines.push(formatCompactLinks(data.links, maxItems))
  }

  if (lines.length === 0) {
    return '[SIN_DATOS_PREVIOS]'
  }

  return lines.join('\n')
}

export const formatCompactAlerts = (alerts: Alerts[], maxItems: number): string => {
  const now = new Date()
  const sorted = [...alerts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const items = sorted.slice(0, maxItems).map((alert) => {
    const msg = truncateText(alert.message, 20)
    const time: string = getRelativeTimeCompact(new Date(alert.date), now)
    return `#${String(alert.id)}"${msg}"${time}`
  })
  return `[A:${String(alerts.length)}] ${items.join(' ')}`
}

export const formatCompactTasks = (tasks: Tasks[], maxItems: number): string => {
  const sorted = [...tasks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  const items = sorted.slice(0, maxItems).map((task) => {
    const title = truncateText(task.title, 20)
    const tag = task.tag ? `[${task.tag}]` : ''
    return `#${String(task.id)}"${title}"${tag}`
  })
  return `[T:${String(tasks.length)}] ${items.join(' ')}`
}

export const formatCompactNotes = (notes: Notes[], maxItems: number): string => {
  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  const items = sorted.slice(0, maxItems).map((note) => {
    const title = truncateText(note.title, 20)
    const tag = note.tag ? `[${note.tag}]` : ''
    return `#${String(note.id)}"${title}"${tag}`
  })
  return `[N:${String(notes.length)}] ${items.join(' ')}`
}

export const formatCompactLinks = (links: Links[], maxItems: number): string => {
  const sorted = [...links].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  const items = sorted.slice(0, maxItems).map((link) => {
    const title = truncateText(link.title || link.url, 20)
    const tag = link.tag ? `[${link.tag}]` : ''
    return `#${String(link.id)}"${title}"${tag}`
  })
  return `[L:${String(links.length)}] ${items.join(' ')}`
}

export const formatConversationHistory = (
  messages: IUserConversation[],
  maxMessages = 3,
  maxCharacters = 60
): string => {
  if (!messages || messages.length === 0) return ''

  return messages
    .slice(-maxMessages)
    .map((msg) => {
      const prefix = msg.role === 'user' ? 'U' : 'A'
      const content =
        maxCharacters === 60
          ? truncateText(msg.content, maxCharacters)
          : Array.from(msg.content).slice(0, maxCharacters).join('')
      return `${prefix}:${content}`
    })
    .join('\n')
}

// Each section has its own budget so one large description cannot hide another type.
// Serialized records deliberately include only useful fields, never user/account metadata.
export const buildQuestionDataContext = (
  data: IUserContextData,
  unavailable: Array<keyof IUserContextData> = []
): string => {
  // Leave space for the prompt label and separators inside the 16000-character data budget.
  const sectionBudget = 3900
  const omission = '\n[CONTEXTO_INCOMPLETO: texto truncado por límite de caracteres]'
  const types: Array<keyof IUserContextData> = ['alerts', 'tasks', 'notes', 'links']
  return types
    .map((type) => {
      if (unavailable.includes(type)) return `${type}: [DATOS_NO_DISPONIBLES]`
      const records = data[type] ?? []
      const selected = records.slice(0, 20).map((record) => {
        const item = record as unknown as Record<string, unknown>
        const fields = [
          'id',
          'message',
          'title',
          'description',
          'tag',
          'status',
          'date',
          'alertDate',
          'sent',
          'createdAt',
          'updatedAt',
          'url',
        ]
        return Object.fromEntries(
          fields.filter((field) => item[field] != null).map((field) => [field, item[field]])
        )
      })
      const header = `${type}: total=${records.length}, incluidos=${selected.length}`
      const omitted =
        records.length > 20 ? `\n[OMITIDOS: ${records.length - 20} registros por límite de 20]` : ''
      const section = `${header}${omitted}\n${JSON.stringify(selected)}`
      const chars = Array.from(section)
      return chars.length > sectionBudget
        ? chars.slice(0, sectionBudget - Array.from(omission).length).join('') + omission
        : section
    })
    .join('\n')
}
