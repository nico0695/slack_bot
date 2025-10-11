import { Tasks } from '../../entities/tasks'
import { Alerts } from '../../entities/alerts'
import { Notes } from '../../entities/notes'
import { formatDateToText, formatTimeLeft } from './dates.utils'

interface AlertStatusTokens {
  icon: string
  statusLine: string
  helper: string
}

interface TaskStatusTokens {
  icon: string
  statusLine: string
  helper: string
}

const truncateText = (value: string, maxLength: number): string => {
  if (!value) return ''
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

const formatShortDate = (date: Date): string =>
  formatDateToText(date, 'es', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const formatDurationDiff = (targetDate: Date, base: Date = new Date()): string => {
  const diffInMilliseconds = Math.abs(targetDate.getTime() - base.getTime())
  const seconds = Math.floor(diffInMilliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainingHours = hours % 24
    return `${days} día${days > 1 ? 's' : ''}${
      remainingHours > 0 ? ` y ${remainingHours} hora${remainingHours > 1 ? 's' : ''}` : ''
    }`
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours} hora${hours > 1 ? 's' : ''}${
      remainingMinutes > 0 ? ` y ${remainingMinutes} minuto${remainingMinutes > 1 ? 's' : ''}` : ''
    }`
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes} minuto${minutes > 1 ? 's' : ''}${
      remainingSeconds > 0 ? ` y ${remainingSeconds} segundo${remainingSeconds > 1 ? 's' : ''}` : ''
    }`
  }

  return `${seconds} segundo${seconds > 1 ? 's' : ''}`
}

const getAlertStatusTokens = (alert: Alerts): AlertStatusTokens => {
  const now = new Date()
  const alertDate = new Date(alert.date)
  const resolved = Boolean(alert.sent)
  const overdue = !resolved && alertDate.getTime() < now.getTime() + 2 * 60 * 1000

  const icon = resolved ? ':white_check_mark:' : overdue ? ':warning:' : ':rotating_light:'
  const scheduledAt = formatShortDate(alertDate)

  if (resolved) {
    return {
      icon,
      statusLine: `Resuelta • ${scheduledAt}`,
      helper: 'No se volverá a notificar.',
    }
  }

  if (overdue) {
    return {
      icon,
      statusLine: `Atrasada • ${scheduledAt}`,
      helper: `Venció hace ${formatDurationDiff(alertDate, now)}.`,
    }
  }

  return {
    icon,
    statusLine: `Próxima • ${scheduledAt}`,
    helper: `Falta ${formatTimeLeft(alertDate)}.`,
  }
}

const getTaskStatusTokens = (task: Tasks): TaskStatusTokens => {
  const status = (task.status ?? '').toLowerCase()
  const dueDate = task.alertDate ? new Date(task.alertDate) : null
  let icon = ':large_blue_circle:'
  let label = 'Pendiente'

  if (status === 'completed') {
    icon = ':white_check_mark:'
    label = 'Completada'
  } else if (status === 'in_progress') {
    icon = ':hammer_and_wrench:'
    label = 'En progreso'
  } else if (status === 'canceled') {
    icon = ':x:'
    label = 'Cancelada'
  }

  const reminderLabel = dueDate ? `Recordatorio: ${formatShortDate(dueDate)}` : 'Sin recordatorio'

  return {
    icon,
    statusLine: label,
    helper: reminderLabel,
  }
}

const overflowAccessory = (entity: 'note' | 'task', id: number): any => ({
  type: 'overflow',
  options: [
    {
      text: {
        type: 'plain_text',
        text: 'Ver Detalles',
      },
      value: `${entity}:detail:${id}`,
    },
    {
      text: {
        type: 'plain_text',
        text: 'Eliminar',
      },
      value: `${entity}:delete:${id}`,
    },
  ],
  action_id: `${entity}_actions:${id}`,
})

const alertOverflowAccessory = (id: number): any => ({
  type: 'overflow',
  options: [
    {
      text: {
        type: 'plain_text',
        text: 'Ver Detalles',
      },
      value: `alert:detail:${id}`,
    },
    {
      text: {
        type: 'plain_text',
        text: 'Snooze 5 min',
      },
      value: `alert:snooze_5m:${id}`,
    },
    {
      text: {
        type: 'plain_text',
        text: 'Snooze 1 hora',
      },
      value: `alert:snooze_1h:${id}`,
    },
    {
      text: {
        type: 'plain_text',
        text: 'Marcar resuelta',
      },
      value: `alert:resolve:${id}`,
    },
    {
      text: {
        type: 'plain_text',
        text: 'Eliminar',
      },
      value: `alert:delete:${id}`,
    },
  ],
  action_id: `alert_actions:${id}`,
})

const quickActionOverflow = (
  entity: 'alert' | 'note' | 'task',
  extraOptions: Array<{ label: string; value: string }> = []
): any => ({
  type: 'overflow',
  options: [
    {
      text: {
        type: 'plain_text',
        text: 'Ver listado',
      },
      value: `${entity}:list:0`,
    },
    ...extraOptions.slice(0, 4).map((option) => ({
      text: {
        type: 'plain_text',
        text: option.label,
      },
      value: option.value,
    })),
  ],
  action_id: `${entity}_actions:list:0`,
})

interface IQuickHelpPayload {
  alerts: number
  alertsPending: number
  alertsOverdue: number
  alertsResolved: number
  alertsSnoozed: number
  notes: number
  tasks: number
  tasksPending: number
  defaultSnoozeMinutes?: number
}

export const msgAssistantQuickHelp = (data: IQuickHelpPayload): { blocks: any[] } => {
  const snoozeTip = data.defaultSnoozeMinutes
    ? `Tip: Snooze rápido usando \`${data.defaultSnoozeMinutes}m\` o di "snooze #{id}".`
    : 'Tip: prueba comandos como `alert snooze #12 10m`.'

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':information_source: *Panel rápido*',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Notas* (${data.notes})\n> Guarda ideas o seguimientos rápidos.\n> Usa comandos como \`note nueva\` o \`note list\`.`,
        },
        accessory: quickActionOverflow('note'),
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Tareas* (${data.tasks})\n> Pendientes: *${data.tasksPending}*\n> Usa \`task done #{id}\` para completarlas rápido.`,
        },
        accessory: quickActionOverflow('task'),
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Alertas* (${data.alerts})\n> Pendientes: *${data.alertsPending}* · Snooze: *${data.alertsSnoozed}* · Atrasadas: *${data.alertsOverdue}*\n> Di \`snooze #{id} 5m\` o \`alert repeat #{id} daily\`.`,
        },
        accessory: quickActionOverflow('alert', [
          { label: 'Pendientes', value: 'alert:list_pending:0' },
          { label: 'Atrasadas', value: 'alert:list_overdue:0' },
          { label: 'Snoozeadas', value: 'alert:list_snoozed:0' },
        ]),
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: snoozeTip,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'assistant_actions:set_snooze_5m:0',
            text: { type: 'plain_text', text: 'Snooze 5m' },
            value: 'assistant:set_snooze_5m:0',
          },
          {
            type: 'button',
            action_id: 'assistant_actions:set_snooze_10m:0',
            text: { type: 'plain_text', text: 'Snooze 10m' },
            value: 'assistant:set_snooze_10m:0',
          },
          {
            type: 'button',
            action_id: 'assistant_actions:set_snooze_30m:0',
            text: { type: 'plain_text', text: 'Snooze 30m' },
            value: 'assistant:set_snooze_30m:0',
          },
        ],
      },
    ],
  }
}

/** ALERTS */
export const msgAlertCreated = (data: Alerts): { blocks: any[] } => {
  const message = truncateText(data.message ?? '', 120)
  const tokens = getAlertStatusTokens(data)

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${tokens.icon} *Alerta creada*\n*#${data.id}* ${
            message || '_Sin descripción_'
          }\n> ${tokens.statusLine}\n> ${tokens.helper}`,
        },
        accessory: alertOverflowAccessory(data.id),
      },
    ],
  }
}

export const msgAlertsList = (alerts: Alerts[]): { blocks: any[] } => {
  const blocks = []

  blocks.push(
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Tus Alertas (${alerts.length})`,
        emoji: true,
      },
    },
    {
      type: 'divider',
    }
  )

  alerts.forEach((alert) => {
    const truncatedMessage = truncateText(alert.message, 60)
    const tokens = getAlertStatusTokens(alert)

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${tokens.icon} *#${alert.id}* ${truncatedMessage || '_Sin descripción_'}\n> ${
          tokens.statusLine
        }\n> ${tokens.helper}`,
      },
      accessory: alertOverflowAccessory(alert.id),
    })

    blocks.push({
      type: 'divider',
    })
  })

  return { blocks }
}

export const msgAlertDetail = (alert: Alerts): { blocks: any[] } => {
  const tokens = getAlertStatusTokens(alert)
  const actions = [
    {
      type: 'button',
      action_id: `alert_actions:snooze_default:${alert.id}`,
      text: { type: 'plain_text', text: 'Snooze preferido' },
      value: `alert:snooze_default:${alert.id}`,
    },
    {
      type: 'button',
      action_id: `alert_actions:snooze_5m:${alert.id}`,
      text: { type: 'plain_text', text: 'Snooze 5m' },
      value: `alert:snooze_5m:${alert.id}`,
    },
    {
      type: 'button',
      action_id: `alert_actions:repeat_daily:${alert.id}`,
      text: { type: 'plain_text', text: 'Repetir diario' },
      value: `alert:repeat_daily:${alert.id}`,
    },
    {
      type: 'button',
      action_id: `alert_actions:repeat_weekly:${alert.id}`,
      text: { type: 'plain_text', text: 'Repetir semanal' },
      value: `alert:repeat_weekly:${alert.id}`,
    },
    {
      type: 'button',
      action_id: `alert_actions:resolve:${alert.id}`,
      text: { type: 'plain_text', text: 'Marcar resuelta' },
      style: 'primary',
      value: `alert:resolve:${alert.id}`,
    },
  ]

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${tokens.icon} *Alerta #${alert.id}*\n>${
            alert.message || '_Sin descripción_'
          }\n> ${tokens.statusLine}\n> ${tokens.helper}`,
        },
      },
      {
        type: 'actions',
        elements: actions,
      },
    ],
  }
}

/** NOTES */

export const msgNoteCreated = (data: Notes): { blocks: any[] } => {
  const truncatedTitle = truncateText(data.title ?? '', 60)
  const truncatedDescription = truncateText(data.description ?? '', 120)
  const tagLabel = data.tag ? ` · #${truncateText(data.tag, 20)}` : ''

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:memo: *Nota creada*\n*#${data.id}* ${truncatedTitle}${tagLabel}\n> ${
            truncatedDescription || '_Sin descripción_'
          }`,
        },
        accessory: overflowAccessory('note', data.id),
      },
    ],
  }
}

export const msgNotesList = (notes: Notes[]): { blocks: any[] } => {
  const blocks = []

  // Encabezado del mensaje
  blocks.push(
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Tus Notas (${notes.length})`,
        emoji: true,
      },
    },
    {
      type: 'divider',
    }
  )

  notes.forEach((note) => {
    const truncatedTitle = truncateText(note.title, 40)
    const truncatedDescription = truncateText(note.description, 70)
    const tagLabel = note.tag ? ` · #${truncateText(note.tag, 15)}` : ''

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*#${note.id}* ${truncatedTitle}${tagLabel}\n> ${
          truncatedDescription || '_Sin descripción_'
        }`,
      },
      accessory: overflowAccessory('note', note.id),
    })

    blocks.push({
      type: 'divider',
    })
  })

  return { blocks }
}

// Tasks

export const msgTaskCreated = (data: Tasks): { blocks: any[] } => {
  const truncatedTitle = truncateText(data.title ?? '', 60)
  const truncatedDescription = truncateText(data.description ?? '', 120)
  const tokens = getTaskStatusTokens(data)

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${tokens.icon} *Tarea creada*\n*#${data.id}* ${truncatedTitle} • ${
            tokens.statusLine
          }\n> ${truncatedDescription || '_Sin descripción_'}\n> ${tokens.helper}`,
        },
        accessory: overflowAccessory('task', data.id),
      },
    ],
  }
}

export const msgTasksList = (tasks: Tasks[]): { blocks: any[] } => {
  const blocks = []

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Tienes *${tasks.length} Tareas*`,
      },
    },
    {
      type: 'divider',
    }
  )

  tasks.forEach((task) => {
    const truncatedTitle = truncateText(task.title, 40)
    const truncatedDescription = truncateText(task.description, 70)
    const tokens = getTaskStatusTokens(task)

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${tokens.icon} *#${task.id}* ${truncatedTitle}\n> ${tokens.statusLine}\n> ${
          truncatedDescription || '_Sin descripción_'
        }\n> ${tokens.helper}`,
      },
      accessory: overflowAccessory('task', task.id),
    })

    blocks.push({
      type: 'divider',
    })
  })

  return { blocks }
}

export const msgAssistantDigest = (payload: {
  title: string
  rangeLabel: string
  stats: {
    alertsPending: number
    alertsOverdue: number
    alertsResolved: number
    tasksPending: number
    tasksCompleted: number
    notes: number
  }
  highlights: {
    alerts: Alerts[]
    tasks: Tasks[]
    notes: Notes[]
  }
}): { blocks: any[] } => {
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: payload.title,
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: payload.rangeLabel,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Alertas*: Pendientes ${payload.stats.alertsPending} · Atrasadas ${payload.stats.alertsOverdue} · Resueltas ${payload.stats.alertsResolved}\n*Tareas*: Pendientes ${payload.stats.tasksPending} · Completadas ${payload.stats.tasksCompleted}\n*Notas*: ${payload.stats.notes}`,
      },
    },
    {
      type: 'divider',
    },
  ]

  if (payload.highlights.alerts.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Alertas destacadas*',
      },
    })

    payload.highlights.alerts.slice(0, 3).forEach((alert) => {
      const tokens = getAlertStatusTokens(alert)
      const truncatedMessage = truncateText(alert.message ?? '', 80)
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${tokens.icon} *#${alert.id}* ${truncatedMessage || '_Sin descripción_'}\n> ${
            tokens.statusLine
          }\n> ${tokens.helper}`,
        },
        accessory: alertOverflowAccessory(alert.id),
      })
    })

    blocks.push({ type: 'divider' })
  }

  if (payload.highlights.tasks.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Tareas recientes*',
      },
    })

    payload.highlights.tasks.slice(0, 3).forEach((task) => {
      const tokens = getTaskStatusTokens(task)
      const truncatedTitle = truncateText(task.title ?? '', 60)
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${tokens.icon} *#${task.id}* ${truncatedTitle}\n> ${tokens.statusLine}\n> ${tokens.helper}`,
        },
        accessory: overflowAccessory('task', task.id),
      })
    })

    blocks.push({ type: 'divider' })
  }

  if (payload.highlights.notes.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Notas recientes*',
      },
    })

    payload.highlights.notes.slice(0, 3).forEach((note) => {
      const truncatedTitle = truncateText(note.title ?? '', 60)
      const truncatedDescription = truncateText(note.description ?? '', 80)
      const tagLabel = note.tag ? ` · #${truncateText(note.tag, 20)}` : ''
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:memo: *#${note.id}* ${truncatedTitle}${tagLabel}\n> ${
            truncatedDescription || '_Sin descripción_'
          }`,
        },
        accessory: overflowAccessory('note', note.id),
      })
    })

    blocks.push({ type: 'divider' })
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: 'Configura tu digest desde el panel rápido (`h`).',
      },
    ],
  })

  return { blocks }
}
