import { Tasks } from '../../entities/tasks'
import { Alerts } from '../../entities/alerts'
import { Notes } from '../../entities/notes'
import { formatDateToText, formatTimeLeft } from './dates.utils'

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

const overflowAccessory = (entity: 'alert' | 'note' | 'task', id: number): any => ({
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

/** ALERTS */
export const msgAlertCreated = (data: Alerts): { blocks: any[] } => {
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Alerta creada correctamente - Id: ${data.id}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Para el:*\n ${formatDateToText(data.date, 'es', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}`,
          },
          {
            type: 'mrkdwn',
            text: `*A las:*\n${formatDateToText(data.date, 'es', {
              hour: 'numeric',
              minute: 'numeric',
            })}`,
          },
        ],
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
    const timeLeft = formatTimeLeft(alert.date)
    const truncatedMessage = truncateText(alert.message, 60)
    const scheduledAt = formatShortDate(alert.date)

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*#${alert.id}* ${truncatedMessage}\n> ${scheduledAt} • ${timeLeft}`,
      },
      accessory: overflowAccessory('alert', alert.id),
    })

    blocks.push({
      type: 'divider',
    })
  })

  return { blocks }
}

/** NOTES */

export const msgNoteCreated = (data: Notes): { blocks: any[] } => {
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Nota creada correctamente - Id: ${data.id}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Título:* ${data.title} \n *Descripción:* ${data.description}`,
        },
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
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Tarea creada correctamente - *#${data.id}* \n Titulo: *${data.title}*`,
        },
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
    const reminder = task.alertDate ? formatShortDate(task.alertDate) : 'Sin recordatorio'

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*#${task.id}* ${truncatedTitle} • ${task.status}\n> ${truncatedDescription}\n> Recordatorio: ${reminder}`,
      },
      accessory: overflowAccessory('task', task.id),
    })

    blocks.push({
      type: 'divider',
    })
  })

  return { blocks }
}
