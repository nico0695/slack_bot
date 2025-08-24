import { Tasks } from '../../entities/tasks'
import { Alerts } from '../../entities/alerts'
import { Notes } from '../../entities/notes'
import { formatDateToText } from './dates.utils'

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
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Tienes *${alerts.length} Alertas*`,
      },
    },
    {
      type: 'divider',
    }
  )

  alerts.forEach((alert) => {
    // Alert title and description
    blocks.push(
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Día:* ${formatDateToText(alert.date, 'es', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}`,
          },
          {
            type: 'mrkdwn',
            text: `*A las:* ${formatDateToText(alert.date, 'es', {
              hour: 'numeric',
              minute: 'numeric',
            })}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Message:* ${alert.message}`,
        },
      }
    )

    // Actions
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            emoji: true,
            text: 'Borrar Alerta',
          },
          style: 'danger',
          value: `${alert.id}`,
          action_id: 'delete_alert',
        },
      ],
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

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Tienes *${notes.length} Notas*`,
      },
    },
    {
      type: 'divider',
    }
  )

  notes.forEach((note) => {
    // Note title and description
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${note.title}* \n${note.description}`,
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
            text: 'Borrar Nota',
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
          text: `Tarea creada correctamente - Id: ${data.id}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Título:* ${data.title} - Status: ${data.status} \n *Descripción:* ${data.description}`,
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
