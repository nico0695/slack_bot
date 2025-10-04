import { Tasks } from '../../entities/tasks'
import { Alerts } from '../../entities/alerts'
import { Notes } from '../../entities/notes'
import { formatDateToText, formatTimeLeft } from './dates.utils'

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
    const truncatedMessage =
      alert.message.length > 20 ? `${alert.message.slice(0, 20)}...` : alert.message

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${truncatedMessage}\n > En: *${timeLeft}*`,
      },
      accessory: {
        type: 'overflow',
        options: [
          {
            text: {
              type: 'plain_text',
              text: 'Ver Detalles',
            },
            value: `view_alert_details:${alert.id}`,
          },
          {
            text: {
              type: 'plain_text',
              text: 'Eliminar',
            },
            value: `delete_alert:${alert.id}`,
          },
        ],
        action_id: `alert_actions:${alert.id}`,
      },
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
    const truncatedDescription =
      note.description.length > 40 ? note.description.slice(0, 40) + '...' : note.description

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${note.title}* \n${truncatedDescription}`,
      },
    })

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Ver Detalles',
          },
          style: 'primary',
          value: `${note.id}`,
          action_id: 'view_note_details',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Eliminar',
          },
          style: 'danger',
          value: `${note.id}`,
          action_id: 'delete_note',
        },
      ],
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
    // Task title and description
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${task.title}* - Status: ${task.status} \n${task.description}`,
      },
    })

    // Actions
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            emoji: true,
            text: 'Borrar Tarea',
          },
          style: 'danger',
          value: `${task.id}`,
          action_id: 'delete_task',
        },
      ],
    })

    blocks.push({
      type: 'divider',
    })
  })

  return { blocks }
}
