import { IConversation } from '../shared/interfaces/converstions'
import { roleTypes } from '../shared/constants/openai'
import { ConversationProviders } from '../shared/constants/conversationFlow'
import { AssistantMessage } from '../shared/utils/asistantMessage.utils'
import { AssistantsFlags, AssistantsVariables } from '../shared/constants/assistant.constants'
import {
  assistantPromptFlagsLite,
  assistantPromptLite,
  assistantSearchSummaryLite,
} from '../shared/constants/prompt.constants'

import AlertsServices from '../../alerts/services/alerts.services'
import TasksServices from '../../tasks/services/tasks.services'
import NotesServices from '../../notes/services/notes.services'
import SearchRepository from '../repositories/search/search.repository'
import OpenaiRepository from '../repositories/openai/openai.repository'
import GeminiRepository from '../repositories/gemini/gemini.repository'
import { RedisRepository } from '../repositories/redis/conversations.redis'

import { formatDateToText } from '../../../shared/utils/dates.utils'
import * as slackMsgUtils from '../../../shared/utils/slackMessages.utils'

export enum AIRepositoryType {
  OPENAI = 'OPENAI',
  GEMINI = 'GEMINI',
}

const AIRepositoryByType = {
  [AIRepositoryType.OPENAI]: OpenaiRepository,
  [AIRepositoryType.GEMINI]: GeminiRepository,
}

interface IProcessMessageResult {
  response: IConversation | null
  shouldSkipAI: boolean
}

export default class MessageProcessor {
  static #instance: MessageProcessor

  #aiRepository: OpenaiRepository | GeminiRepository
  #redisRepository: RedisRepository
  #alertsServices: AlertsServices
  #tasksServices: TasksServices
  #notesServices: NotesServices
  #defaultSnoozeMinutes = 10

  private constructor(aiToUse = AIRepositoryType.OPENAI) {
    this.#aiRepository = AIRepositoryByType[aiToUse].getInstance()
    this.#redisRepository = RedisRepository.getInstance()
    this.#alertsServices = AlertsServices.getInstance()
    this.#tasksServices = TasksServices.getInstance()
    this.#notesServices = NotesServices.getInstance()
  }

  static getInstance(): MessageProcessor {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new MessageProcessor()
    return this.#instance
  }

  /**
   * Main entry point to process assistant messages
   */
  processAssistantMessage = async (
    message: string,
    userId: number,
    channelId?: string
  ): Promise<IProcessMessageResult> => {
    // Check if message should skip AI generation
    const shouldSkipAI = this.shouldSkipAI(message)

    if (shouldSkipAI) {
      return { response: null, shouldSkipAI: true }
    }

    // Try assistant commands first (snooze, repeat, alerts list, etc)
    const commandResponse = await this.#handleAssistantCommand(userId, message, channelId)
    if (commandResponse) {
      return { response: commandResponse, shouldSkipAI: false }
    }

    // Try assistant variables/flags (.a, .t, .n, etc)
    const variableResponse = await this.#manageAssistantVariables(userId, message, channelId)
    if (variableResponse) {
      return { response: variableResponse, shouldSkipAI: false }
    }

    return { response: null, shouldSkipAI: false }
  }

  /**
   * Check if message starts with '+' to skip AI
   */
  shouldSkipAI = (message: string): boolean => {
    return message.trim().startsWith('+')
  }

  /**
   * Remove skip flag from message
   */
  cleanSkipFlag = (message: string): string => {
    return message.replace(/^\+\s*/, '')
  }

  #withDateContext = (prompt: string): string => {
    if (!prompt.includes('<fecha>')) return prompt
    const now = new Date()
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)

    return prompt.replace(/<fecha>/g, formatted)
  }

  #getSnoozeMinutes = async (userId: number): Promise<number> => {
    const config = await this.#redisRepository.getAlertSnoozeConfig(userId)
    return config?.defaultSnoozeMinutes ?? this.#defaultSnoozeMinutes
  }

  #setSnoozeMinutes = async (userId: number, minutes: number): Promise<void> => {
    await this.#redisRepository.saveAlertSnoozeConfig(userId, { defaultSnoozeMinutes: minutes })
  }

  #buildAssistantResponse = (content: string, block?: { blocks: any[] }): IConversation => {
    return {
      role: roleTypes.assistant,
      content,
      ...(block ? { contentBlock: block } : {}),
      provider: ConversationProviders.ASSISTANT,
    }
  }

  #handleAssistantCommand = async (
    userId: number,
    message: string,
    channelId?: string
  ): Promise<IConversation | null> => {
    const trimmed = message.trim()
    if (!trimmed) {
      return null
    }

    const lower = trimmed.toLowerCase()

    const snoozeMatch = lower.match(/^snooze\s+#?(\d+)(?:\s+(\d+)([mh]))?/)
    if (snoozeMatch) {
      const alertId = Number(snoozeMatch[1])
      if (!Number.isFinite(alertId)) {
        return this.#buildAssistantResponse('Necesito un número de alerta válido para snooze.')
      }

      let minutes: number | null = null
      const amountRaw = snoozeMatch[2]
      const unit = snoozeMatch[3]

      if (amountRaw && unit) {
        const amount = Number(amountRaw)
        if (!Number.isFinite(amount) || amount <= 0) {
          return this.#buildAssistantResponse('Usa minutos u horas válidas para snooze.')
        }
        minutes = unit === 'h' ? amount * 60 : amount
      }

      if (!minutes) {
        minutes = await this.#getSnoozeMinutes(userId)
      }

      const result = await this.#handleAlertSnooze(alertId, userId, minutes, {
        updatePreference: Boolean(amountRaw),
      })

      if (typeof result === 'string') {
        return this.#buildAssistantResponse(result)
      }

      const summary = `Alerta #${alertId} reprogramada a ${minutes} minuto${
        minutes > 1 ? 's' : ''
      }.`
      return this.#buildAssistantResponse(summary, result)
    }

    const repeatMatch = lower.match(/^(?:alert\s+)?repeat\s+#?(\d+)\s+(daily|weekly)/)
    if (repeatMatch) {
      const alertId = Number(repeatMatch[1])
      const policy = repeatMatch[2] as 'daily' | 'weekly'
      const minutesToAdd = policy === 'daily' ? 24 * 60 : 7 * 24 * 60

      const result = await this.#handleAlertRepeat(alertId, userId, minutesToAdd, policy)

      if (typeof result === 'string') {
        return this.#buildAssistantResponse(result)
      }

      const summary = `Listo, la alerta #${alertId} ahora se repetirá ${
        policy === 'daily' ? 'todos los días' : 'cada semana'
      }.`
      return this.#buildAssistantResponse(summary, result)
    }

    const alertsListMatch = lower.match(
      /^alerts?\s+(pending|pendientes|all|todas|snoozed|snoozeadas|resolved|resueltas|overdue|atrasadas)/
    )
    if (alertsListMatch) {
      const scopeRaw = alertsListMatch[1]
      let scope: 'pending' | 'all' | 'snoozed' | 'overdue' | 'resolved' = 'pending'

      if (scopeRaw === 'all' || scopeRaw === 'todas') {
        scope = 'all'
      } else if (scopeRaw === 'snoozed' || scopeRaw === 'snoozeadas') {
        scope = 'snoozed'
      } else if (scopeRaw === 'resolved' || scopeRaw === 'resueltas') {
        scope = 'resolved'
      } else if (scopeRaw === 'overdue' || scopeRaw === 'atrasadas') {
        scope = 'overdue'
      } else {
        scope = 'pending'
      }

      const result = await this.#listAlertsByScope(userId, scope)

      if (typeof result === 'string') {
        return this.#buildAssistantResponse(result)
      }

      const summary =
        scope === 'all'
          ? 'Estas son todas tus alertas.'
          : scope === 'pending'
          ? 'Alertas pendientes al detalle.'
          : scope === 'snoozed'
          ? 'Alertas con snooze activo.'
          : scope === 'resolved'
          ? 'Alertas marcadas como resueltas.'
          : 'Alertas atrasadas que necesitan atención.'

      return this.#buildAssistantResponse(summary, result)
    }

    const preferMatch = lower.match(
      /^(?:set|configurar|pref(?:erencia)?)\s+(?:snooze|snooze\s+default)\s+(\d+)([mh])/
    )
    if (preferMatch) {
      const amount = Number(preferMatch[1])
      const unit = preferMatch[2]
      if (!Number.isFinite(amount) || amount <= 0) {
        return this.#buildAssistantResponse('Usa un número válido para configurar el snooze.')
      }

      const minutes = unit === 'h' ? amount * 60 : amount
      await this.#setSnoozeMinutes(userId, minutes)
      return this.#buildAssistantResponse(
        `Snooze preferido actualizado a ${minutes} minuto${minutes > 1 ? 's' : ''}.`
      )
    }

    const remindMatch = trimmed.match(/^remind me\s+(?:in\s+)?(.+?)\s+to\s+(.+)/i)
    if (remindMatch) {
      const timeText = remindMatch[1]
      const noteText = remindMatch[2]

      const alertRes = await this.#alertsServices.createAssistantAlert(
        userId,
        timeText,
        noteText,
        channelId
      )

      if (alertRes.error || !alertRes.data) {
        return this.#buildAssistantResponse(
          'No pude crear esa alerta, intenta con otro formato de tiempo.'
        )
      }

      const block = slackMsgUtils.msgAlertCreated(alertRes.data)
      const summary = `Listo, te recordaré ${noteText} (${formatDateToText(alertRes.data.date)}).`
      return this.#buildAssistantResponse(summary, block)
    }

    return null
  }

  #manageAssistantVariables = async (
    userId: number,
    message: string,
    channelId?: string
  ): Promise<IConversation | null> => {
    const assistantMessage = new AssistantMessage(message)

    if (!assistantMessage.variable) {
      // No variable found, try AI fallback
      return await this.#intentFallbackRouter(userId, assistantMessage.cleanMessage, channelId)
    }

    let responseMessage: IConversation | null = null

    switch (assistantMessage.variable) {
      case AssistantsVariables.ALERT: {
        if (assistantMessage.flags[AssistantsFlags.LIST]) {
          const alerts = await this.#alertsServices.getAlertsByUserId(userId)
          const alertsList = alerts.data ?? []
          const messageToResponse =
            alertsList.length > 0
              ? alertsList
                  ?.map(
                    (alert) =>
                      `• Id: _#${alert.id}_ - *${alert.message}*: ${formatDateToText(alert.date)}`
                  )
                  .join('\n')
              : 'No tienes alertas'

          const messageBlockToResponse = slackMsgUtils.msgAlertsList(alertsList)

          responseMessage = {
            role: roleTypes.assistant,
            content: messageToResponse,
            contentBlock: messageBlockToResponse,
            provider: ConversationProviders.ASSISTANT,
          }
          break
        }

        if (!assistantMessage.value || !assistantMessage.cleanMessage) {
          throw new Error('Ups! No se pudo crear la alerta, debes ingresar una hora,. 😅')
        }

        const alert = await this.#alertsServices.createAssistantAlert(
          userId,
          assistantMessage.value as string,
          assistantMessage.cleanMessage,
          channelId
        )

        if (alert.error) {
          throw new Error(alert.error)
        }

        const contentBlock = slackMsgUtils.msgAlertCreated(alert.data)

        responseMessage = {
          role: roleTypes.assistant,
          content: `Alerta creada correctamente para el ${formatDateToText(
            alert.data.date
          )} con id: #${alert.data.id}`,
          contentBlock,
          provider: ConversationProviders.ASSISTANT,
        }
        break
      }

      case AssistantsVariables.TASK: {
        const sendGeneralTaskList = async (): Promise<IConversation> => {
          const tasks = await this.#tasksServices.getTasksByUserId(userId)

          const messageToResponse =
            tasks?.data?.length > 0
              ? tasks?.data
                  ?.map((task) => `• Id: _#${task.id}_ - *${task.title}*: ${task.description}`)
                  .join('\n')
              : 'No tienes tareas'

          const messageBlockToResponse = slackMsgUtils.msgTasksList(tasks?.data ?? [])

          return {
            role: roleTypes.assistant,
            content: messageToResponse,
            contentBlock: messageBlockToResponse,
            provider: ConversationProviders.ASSISTANT,
          }
        }

        if (assistantMessage.flags[AssistantsFlags.LIST]) {
          responseMessage = await sendGeneralTaskList()
          break
        }

        if (assistantMessage.flags[AssistantsFlags.LIST_TAG] !== undefined) {
          const tagRaw = String(assistantMessage.flags[AssistantsFlags.LIST_TAG] ?? '')
          const normalizedTag = tagRaw.trim()

          if (!normalizedTag) {
            responseMessage = await sendGeneralTaskList()
            break
          }

          const tasks = await this.#tasksServices.getTasksByUserId(userId, {
            tag: normalizedTag,
          })

          const messageToResponse =
            tasks?.data?.length > 0
              ? tasks?.data
                  ?.map((task) => `• Id: _#${task.id}_ - *${task.title}*: ${task.description}`)
                  .join('\n')
              : 'No tienes tareas'

          responseMessage = {
            role: roleTypes.assistant,
            content: `#### Tareas - tag: ${normalizedTag} \n ` + messageToResponse,
            provider: ConversationProviders.ASSISTANT,
          }
          break
        }

        if (!assistantMessage.value) {
          throw new Error('Ups! No se pudo crear la tarea, debes ingresar un título. 😅')
        }

        const tagFlagRaw = (assistantMessage?.flags?.[AssistantsFlags.TAG] as string) ?? ''
        const normalizedTaskTag = tagFlagRaw.trim()

        const task = await this.#tasksServices.createAssistantTask(
          userId,
          assistantMessage.value as string,
          (assistantMessage?.flags?.[AssistantsFlags.DESCRIPTION] as string) ?? '',
          {
            tag: normalizedTaskTag || undefined,
            channelId,
          }
        )

        if (task.error) {
          throw new Error(task.error)
        }

        const contentBlock = slackMsgUtils.msgTaskCreated(task.data)

        responseMessage = {
          role: roleTypes.assistant,
          content: `Tarea creada correctamente con id: #${task.data.id}`,
          contentBlock,
          provider: ConversationProviders.ASSISTANT,
        }
        break
      }

      case AssistantsVariables.NOTE: {
        const sendGeneralNotesList = async (): Promise<IConversation> => {
          const notes = await this.#notesServices.getNotesByUserId(userId)

          const messageToResponse =
            notes?.data?.length > 0
              ? notes?.data
                  ?.map((note) => `• Id: _#${note.id}_ - **${note.title}:** ${note.description}`)
                  .join('\n')
              : 'No tienes notas'

          const messageBlockToResponse = slackMsgUtils.msgNotesList(notes?.data ?? [])

          return {
            role: roleTypes.assistant,
            content: messageToResponse,
            contentBlock: messageBlockToResponse,
            provider: ConversationProviders.ASSISTANT,
          }
        }

        if (assistantMessage.flags[AssistantsFlags.LIST]) {
          responseMessage = await sendGeneralNotesList()
          break
        }

        if (assistantMessage.flags[AssistantsFlags.LIST_TAG] !== undefined) {
          const tagRaw = String(assistantMessage.flags[AssistantsFlags.LIST_TAG] ?? '')
          const normalizedTag = tagRaw.trim()

          if (!normalizedTag) {
            responseMessage = await sendGeneralNotesList()
            break
          }

          const notes = await this.#notesServices.getNotesByUserId(userId, {
            tag: normalizedTag,
          })

          const messageToResponse =
            notes?.data?.length > 0
              ? notes?.data
                  ?.map((note) => `• Id: _#${note.id}_ - **${note.title}:** ${note.description}`)
                  .join('\n')
              : 'No tienes notas'

          responseMessage = {
            role: roleTypes.assistant,
            content: `#### Notas - tag: ${normalizedTag} \n ` + messageToResponse,
            provider: ConversationProviders.ASSISTANT,
          }
          break
        }

        if (!assistantMessage.value) {
          throw new Error('Ups! No se pudo crear la nota, debes ingresar un título. 😅')
        }

        const noteTagRaw = (assistantMessage?.flags?.[AssistantsFlags.TAG] as string) ?? ''
        const normalizedNoteTag = noteTagRaw.trim()

        const note = await this.#notesServices.createAssistantNote(
          userId,
          assistantMessage.value as string,
          (assistantMessage?.flags?.[AssistantsFlags.DESCRIPTION] as string) ?? '',
          normalizedNoteTag || undefined,
          channelId
        )

        if (note.error) {
          throw new Error(note.error)
        }

        const contentBlock = slackMsgUtils.msgNoteCreated(note.data)

        responseMessage = {
          role: roleTypes.assistant,
          content: `Nota creada correctamente con id: #${note.data.id}`,
          contentBlock,
          provider: ConversationProviders.ASSISTANT,
        }
        break
      }

      case AssistantsVariables.QUESTION: {
        const promptGenerated = [
          {
            role: roleTypes.system,
            content: this.#withDateContext(assistantPromptLite),
          },
          {
            role: roleTypes.user,
            content: assistantMessage.cleanMessage,
            provider: ConversationProviders.ASSISTANT,
          },
        ]

        const messageResponse = await this.#aiRepository.chatCompletion(promptGenerated as any)

        if (messageResponse) {
          responseMessage = messageResponse
        } else {
          throw new Error('No se pudo generar la respuesta')
        }
        break
      }

      default:
        responseMessage = {
          role: roleTypes.assistant,
          content: 'Ups! No se encontró ninguna variable para procesar. 😅',
          provider: ConversationProviders.ASSISTANT,
        }
        break
    }

    return responseMessage
  }

  #intentFallbackRouter = async (
    userId: number,
    cleanMessage: string,
    channelId?: string
  ): Promise<IConversation | null> => {
    try {
      if (!cleanMessage) return null

      const classificationPrompt = [
        {
          role: roleTypes.system,
          content: this.#withDateContext(assistantPromptFlagsLite),
          provider: ConversationProviders.ASSISTANT,
        },
        {
          role: roleTypes.user,
          content: cleanMessage,
          provider: ConversationProviders.ASSISTANT,
        },
      ]

      const classificationRes = await this.#aiRepository.chatCompletion(
        classificationPrompt as any,
        { mode: 'classification' }
      )
      let raw = classificationRes?.content ?? ''

      raw = raw.trim()
      raw = raw
        .replace(/^```(json)?/i, '')
        .replace(/```$/i, '')
        .trim()

      let parsed: any = null
      const tryParses: string[] = []
      tryParses.push(raw)

      if (!/^{[\s\S]*}$/.test(raw)) {
        const braceStart = raw.indexOf('{')
        const braceEnd = raw.lastIndexOf('}')
        if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
          tryParses.push(raw.slice(braceStart, braceEnd + 1))
        }
      }

      tryParses.forEach((candidate, idx) => {
        tryParses[idx] = candidate.replace(/,\s*}/g, '}')
      })

      for (const candidate of tryParses) {
        if (parsed) break
        try {
          parsed = JSON.parse(candidate)
        } catch (e) {
          continue
        }
      }

      if (!parsed || typeof parsed !== 'object') return null

      const intent = (parsed.intent || '').toLowerCase()
      if (!intent) return null

      switch (intent) {
        case 'alert.create': {
          if (!parsed.time || !parsed.title) return null
          const alert = await this.#alertsServices.createAssistantAlert(
            userId,
            parsed.time,
            parsed.title,
            channelId
          )
          if (alert.error) return null
          const contentBlock = slackMsgUtils.msgAlertCreated(alert.data)
          return {
            role: roleTypes.assistant,
            content: `Alerta creada (fallback) para el ${formatDateToText(
              alert.data.date
            )} con id: #${alert.data.id}`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'alert.list': {
          const alerts = await this.#alertsServices.getAlertsByUserId(userId)
          if (alerts.error) return null
          const alertsList = alerts.data ?? []
          const contentBlock = slackMsgUtils.msgAlertsList(alertsList)
          return {
            role: roleTypes.assistant,
            content: parsed.successMessage || `Mostrando ${alerts.data?.length || 0} alertas`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'task.create': {
          if (!parsed.title) return null
          const normalizedTag =
            typeof parsed.tag === 'string' && parsed.tag.trim().length > 0
              ? parsed.tag.trim()
              : undefined
          const task = await this.#tasksServices.createAssistantTask(
            userId,
            parsed.title,
            parsed.description || '',
            {
              tag: normalizedTag,
              channelId,
            }
          )
          if (task.error) return null
          const contentBlock = slackMsgUtils.msgTaskCreated(task.data)
          return {
            role: roleTypes.assistant,
            content: `Tarea creada (fallback) con id: #${task.data.id}`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'task.list': {
          const normalizedTag =
            typeof parsed.tag === 'string' && parsed.tag.trim().length > 0
              ? parsed.tag.trim()
              : undefined
          const tasks = await this.#tasksServices.getTasksByUserId(
            userId,
            normalizedTag ? { tag: normalizedTag } : undefined
          )
          const totalTasks = Array.isArray(tasks.data) ? tasks.data.length : 0
          const tagLabel: string = normalizedTag ?? ''
          const tasksCountText: string = totalTasks.toString()
          ;(tasks.data || []).sort(
            (a: any, b: any) => +new Date(a.createdAt) - +new Date(b.createdAt)
          )
          if (tasks.error) return null
          const contentBlock = slackMsgUtils.msgTasksList(tasks.data ?? [])
          return {
            role: roleTypes.assistant,
            content:
              parsed.successMessage ||
              (normalizedTag
                ? `Mostrando ${tasksCountText} tareas con tag "${tagLabel}"`
                : `Mostrando ${tasksCountText} tareas`),
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'note.create': {
          if (!parsed.title) return null
          const normalizedTag =
            typeof parsed.tag === 'string' && parsed.tag.trim().length > 0
              ? parsed.tag.trim()
              : undefined
          const note = await this.#notesServices.createAssistantNote(
            userId,
            parsed.title,
            parsed.description || '',
            normalizedTag,
            channelId
          )
          if (note.error) return null
          const contentBlock = slackMsgUtils.msgNoteCreated(note.data)
          return {
            role: roleTypes.assistant,
            content: `Nota creada (fallback) con id: #${note.data.id}`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'note.list': {
          const normalizedTag =
            typeof parsed.tag === 'string' && parsed.tag.trim().length > 0
              ? parsed.tag.trim()
              : undefined
          const notes = await this.#notesServices.getNotesByUserId(
            userId,
            normalizedTag ? { tag: normalizedTag } : undefined
          )
          const totalNotes = Array.isArray(notes.data) ? notes.data.length : 0
          const noteTagLabel: string = normalizedTag ?? ''
          const notesCountText = totalNotes.toString()
          if (notes.error) return null
          const contentBlock = slackMsgUtils.msgNotesList(notes.data ?? [])
          return {
            role: roleTypes.assistant,
            content:
              parsed.successMessage ||
              (normalizedTag
                ? `Mostrando ${notesCountText} notas con tag "${noteTagLabel}"`
                : `Mostrando ${notesCountText} notas`),
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'search': {
          if (!parsed.query) return null
          return await this.#searchAndSummarize(cleanMessage, parsed.query)
        }
        case 'question': {
          const promptGenerated = [
            {
              role: roleTypes.system,
              content: this.#withDateContext(assistantPromptLite),
            },
            {
              role: roleTypes.user,
              content: cleanMessage,
              provider: ConversationProviders.ASSISTANT,
            },
          ]
          const messageResponse = await this.#aiRepository.chatCompletion(promptGenerated as any)
          return messageResponse
        }
        default:
          return {
            role: roleTypes.assistant,
            content: 'Lo siento, no entendí tu mensaje. ¿Puedes reformularlo o ser más específico?',
            provider: ConversationProviders.ASSISTANT,
          }
      }
    } catch (e) {
      return null
    }
  }

  #searchAndSummarize = async (
    cleanMessage: string,
    query: string
  ): Promise<IConversation | null> => {
    const trimmed = (query || '').trim()
    if (!trimmed) return null

    const searchRepo = SearchRepository.getInstance()
    const results = await searchRepo.search(trimmed)

    if (!results.length) {
      return {
        role: roleTypes.assistant,
        content: 'No encontré resultados fiables ahora.',
        provider: ConversationProviders.ASSISTANT,
      }
    }

    const summaryUser = `Consulta original: ${cleanMessage}\nConsulta optimizada: ${trimmed}\nHOY_ES:${new Date().toLocaleDateString()}\n\nResultados:${results}\n\nGenera respuesta breve (1-2 frases) usando solo datos visibles. Si hay números útiles (temperatura exacta, marcador, fecha/hora, precio) inclúyelos sin adornos. Si falta info -> indica que no hay datos suficientes.`
    const aiSummary = await this.#aiRepository.chatCompletion([
      {
        role: roleTypes.system,
        content: this.#withDateContext(assistantSearchSummaryLite),
      } as any,
      { role: roleTypes.user, content: summaryUser } as any,
    ])

    return {
      role: roleTypes.assistant,
      content: aiSummary?.content || 'No se pudo generar un resumen.',
      provider: ConversationProviders.ASSISTANT,
    }
  }

  #handleAlertSnooze = async (
    alertId: number,
    userId: number,
    minutes: number,
    options: { updatePreference?: boolean } = {}
  ): Promise<string | { blocks: any[] }> => {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return 'El snooze debe ser mayor a 1 minuto.'
    }

    const res = await this.#alertsServices.rescheduleAlert(alertId, userId, minutes)

    if (res.error || !res.data) {
      return res.error ?? 'No se pudo reprogramar la alerta. 😅'
    }

    if (options.updatePreference) {
      await this.#setSnoozeMinutes(userId, minutes)
    }

    return slackMsgUtils.msgAlertDetail(res.data)
  }

  #handleAlertRepeat = async (
    alertId: number,
    userId: number,
    minutesToAdd: number,
    policy: 'daily' | 'weekly'
  ): Promise<string | { blocks: any[] }> => {
    const followUp = await this.#alertsServices.createFollowUpAlert(alertId, userId, minutesToAdd)

    if (followUp.error || !followUp.data) {
      return followUp.error ?? 'No se pudo crear la recurrencia. 😅'
    }

    const messageBlock = slackMsgUtils.msgAlertCreated(followUp.data)

    messageBlock.blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `La alerta #${alertId} se repetirá de forma ${
            policy === 'daily' ? 'diaria' : 'semanal'
          }.`,
        },
      ],
    })

    return messageBlock
  }

  #listAlertsByScope = async (
    userId: number,
    scope: 'pending' | 'all' | 'snoozed' | 'overdue' | 'resolved'
  ): Promise<string | { blocks: any[] }> => {
    const alertsRes = await this.#alertsServices.getAlertsByUserId(userId, {})
    if (alertsRes.error) {
      return 'No se pudieron obtener las alertas. 😅'
    }

    const alerts = alertsRes.data ?? []
    if (!alerts.length) {
      return 'No tienes alertas guardadas.'
    }

    const now = new Date()

    let filtered = alerts
    let emptyMessage = 'No hay alertas para mostrar.'

    switch (scope) {
      case 'pending':
        filtered = alerts.filter((alert) => !alert.sent)
        emptyMessage = 'No tienes alertas pendientes.'
        break
      case 'snoozed':
        filtered = alerts.filter((alert) => !alert.sent)
        emptyMessage = 'No tienes alertas pendientes.'
        break
      case 'overdue':
        filtered = alerts.filter((alert) => !alert.sent && new Date(alert.date) < now)
        emptyMessage = 'No tienes alertas atrasadas.'
        break
      case 'resolved':
        filtered = alerts.filter((alert) => alert.sent)
        emptyMessage = 'No tienes alertas resueltas.'
        break
      case 'all':
      default:
        filtered = alerts
        emptyMessage = 'No tienes alertas guardadas.'
        break
    }

    if (!filtered.length) {
      return emptyMessage
    }

    return slackMsgUtils.msgAlertsList(filtered)
  }
}
