import { Alerts } from '../../../../entities/alerts'
import { Tasks } from '../../../../entities/tasks'
import { Notes } from '../../../../entities/notes'
import { truncateText } from '../../../../shared/utils/string.utils'
import { getRelativeTimeCompact } from '../../../../shared/utils/dates.utils'
import { IUserConversation } from '../interfaces/converstions'

export interface IUserContextData {
  alerts?: Alerts[]
  tasks?: Tasks[]
  notes?: Notes[]
}

export interface IUserContextOptions {
  maxItems?: number
}

/**
 * Output example:
 * [A:3] #15"Revisar servidor"2h #12"Deploy prod"venc1h
 * [T:2] #5"Refactor auth"[trabajo] #8"Comprar regalo"
 * [N:1] #3"Ideas sprint"[dev]
 */
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

// Output: "U:mensaje usuario\nA:respuesta asistente\nU:otro mensaje"
export const formatConversationHistory = (
  messages: IUserConversation[],
  maxMessages = 3
): string => {
  if (!messages || messages.length === 0) return ''

  return messages
    .slice(-maxMessages)
    .map((msg) => {
      const prefix = msg.role === 'user' ? 'U' : 'A'
      const content = truncateText(msg.content, 60)
      return `${prefix}:${content}`
    })
    .join('\n')
}
