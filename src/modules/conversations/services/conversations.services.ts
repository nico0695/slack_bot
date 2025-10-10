import { GlobalConstants } from '../../../shared/constants/global'
import { IoServer } from '../../../config/socketConfig'

import UsersServices from '../../users/services/users.services'
import AlertsServices from '../../alerts/services/alerts.services'
import TasksServices from '../../tasks/services/tasks.services'
import NotesServices from '../../notes/services/notes.services'
import { Alerts } from '../../../entities/alerts'
import { Tasks } from '../../../entities/tasks'
import { Notes } from '../../../entities/notes'

// AI
import GeminiRepository from '../repositories/gemini/gemini.repository'
import OpenaiRepository from '../repositories/openai/openai.repository'
import { roleTypes } from '../shared/constants/openai'

import { RedisRepository } from '../repositories/redis/conversations.redis'
import { conversationFlowPrefix, rConversationKey } from '../repositories/redis/redis.constatns'

import {
  IConversation,
  IConversationFlow,
  IUserConversation,
} from '../shared/interfaces/converstions'
import { ChannelType, ConversationProviders } from '../shared/constants/conversationFlow'

import { AssistantMessage } from '../shared/utils/asistantMessage.utils'
import { AssistantsFlags, AssistantsVariables } from '../shared/constants/assistant.constants'

import { formatDateToText } from '../../../shared/utils/dates.utils'
import {
  assistantPromptFlagsLite,
  assistantPromptLite,
  assistantSearchSummaryLite,
} from '../shared/constants/prompt.constants'
import * as slackMsgUtils from '../../../shared/utils/slackMessages.utils'
import SearchRepository from '../repositories/search/search.repository'
import { AssistantPreferences } from '../shared/interfaces/assistantPreferences'
import { AlertMetadata } from '../shared/interfaces/alertMetadata'

type TMembersNames = Record<string, string>

interface IManageAssistantMessage {
  cleanMessage: string
  variables: Record<string, string>
  flags: string[]
  responseMessage?: IConversation
}

export enum AIRepositoryType {
  OPENAI = 'OPENAI',
  GEMINI = 'GEMINI',
}

const AIRepositoryByType = {
  [AIRepositoryType.OPENAI]: OpenaiRepository,
  [AIRepositoryType.GEMINI]: GeminiRepository,
}

export default class ConversationsServices {
  static #instance: ConversationsServices

  #aiRepository: OpenaiRepository | GeminiRepository

  #redisRepository: RedisRepository

  #usersServices: UsersServices
  #alertsServices: AlertsServices
  #tasksServices: TasksServices
  #notesServices: NotesServices
  #defaultAssistantPreferences: AssistantPreferences

  private constructor(aiToUse = AIRepositoryType.OPENAI) {
    this.#aiRepository = AIRepositoryByType[aiToUse].getInstance()
    this.#redisRepository = RedisRepository.getInstance()

    this.#usersServices = UsersServices.getInstance()
    this.#alertsServices = AlertsServices.getInstance()
    this.#tasksServices = TasksServices.getInstance()
    this.#notesServices = NotesServices.getInstance()

    this.#defaultAssistantPreferences = {
      alertDefaultSnoozeMinutes: 10,
      preferredAlertScope: 'pending',
      preferredTaskScope: 'pending',
      preferredNoteScope: 'all',
      digestFrequency: 'off',
    }
  }

  static getInstance(): ConversationsServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ConversationsServices()
    return this.#instance
  }

  #generatePrompt = async (conversation: IConversation[]): Promise<IConversation[]> => {
    const requestMessages = conversation.map((message) => {
      return { role: message.role, content: message.content, provider: message.provider }
    })

    return [
      {
        role: roleTypes.system,
        content: this.#withDateContext(assistantPromptLite),
        provider: ConversationProviders.ASSISTANT,
      },
      ...requestMessages,
    ]
  }

  /**
   * Appends current date context to a prompt (idempotent: avoids duplicate if already present).
   * Format kept simple to reduce token usage.
   */
  #withDateContext = (prompt: string): string => {
    if (!prompt.includes('<fecha>')) return prompt
    const now = new Date()
    // Obtener fecha en timezone AR en formato estable YYYY-MM-DD
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now) // en-CA => YYYY-MM-DD

    return prompt.replace(/<fecha>/g, formatted)
  }

  /**
   * Executes external search then summarizes via AI.
   * Keeps logic isolated from the intent router for clarity & reuse.
   */
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

  #getTeamMembers = async (teamId: string): Promise<TMembersNames> => {
    const membersNames: TMembersNames = {}

    /** Get team members */
    if (teamId) {
      const teamMembers = await this.#usersServices.getUsersByTeamId(teamId)
      if (teamMembers?.data) {
        teamMembers.data.forEach((member) => {
          membersNames[member.slackId] = member.name
        })
      }
    }

    return membersNames
  }

  #mergePreferences = (
    base: AssistantPreferences,
    partial: Partial<AssistantPreferences>
  ): AssistantPreferences => {
    const merged: AssistantPreferences = { ...base }

    const source = partial ?? {}

    if (source.alertDefaultSnoozeMinutes !== undefined) {
      merged.alertDefaultSnoozeMinutes = source.alertDefaultSnoozeMinutes
    }

    if (source.preferredAlertScope !== undefined) {
      merged.preferredAlertScope = source.preferredAlertScope
    }

    if (source.preferredTaskScope !== undefined) {
      merged.preferredTaskScope = source.preferredTaskScope
    }

    if (source.preferredNoteScope !== undefined) {
      merged.preferredNoteScope = source.preferredNoteScope
    }

    if (source.digestFrequency !== undefined) {
      merged.digestFrequency = source.digestFrequency
    }

    if (source.digestChannelId !== undefined) {
      merged.digestChannelId = source.digestChannelId
    }

    if (source.lastDigestSentAt !== undefined) {
      merged.lastDigestSentAt = source.lastDigestSentAt
    }

    return merged
  }

  #getAssistantPreferences = async (userId: number): Promise<AssistantPreferences> => {
    const stored = await this.#redisRepository.getAssistantPreferences(userId)
    return this.#mergePreferences(this.#defaultAssistantPreferences, stored ?? {})
  }

  #saveAssistantPreferences = async (
    userId: number,
    preferences: AssistantPreferences
  ): Promise<AssistantPreferences> => {
    const payload = this.#mergePreferences(this.#defaultAssistantPreferences, preferences)
    await this.#redisRepository.saveAssistantPreferences(userId, payload)
    return payload
  }

  #updateAssistantPreferences = async (
    userId: number,
    partial: Partial<AssistantPreferences>
  ): Promise<AssistantPreferences> => {
    const current = await this.#getAssistantPreferences(userId)
    const merged = this.#mergePreferences(current, partial)
    await this.#redisRepository.saveAssistantPreferences(userId, merged)
    return merged
  }

  #getAlertMetadata = async (alertId: number): Promise<AlertMetadata | null> => {
    return await this.#redisRepository.getAlertMetadata(alertId)
  }

  #setAlertMetadata = async (
    alertId: number,
    metadata: Partial<AlertMetadata>
  ): Promise<AlertMetadata | null> => {
    await this.#redisRepository.saveAlertMetadata(alertId, metadata)
    return await this.#redisRepository.getAlertMetadata(alertId)
  }

  #clearAlertMetadata = async (alertId: number): Promise<void> => {
    await this.#redisRepository.deleteAlertMetadata(alertId)
  }

  #buildAlertMetadataMap = async (
    alerts: Alerts[]
  ): Promise<Record<number, AlertMetadata>> => {
    const results = await Promise.all(
      alerts.map(async (alert) => {
        const metadata = await this.#redisRepository.getAlertMetadata(alert.id)
        return { id: alert.id, metadata }
      })
    )

    const metadataMap: Record<number, AlertMetadata> = {}
    results.forEach(({ id, metadata }) => {
      if (!metadata) return
      metadataMap[id] = metadata
    })

    return metadataMap
  }

  #buildAssistantResponse = (
    content: string,
    block?: { blocks: any[] }
  ): IConversation => {
    return {
      role: roleTypes.assistant,
      content,
      ...(block ? { contentBlock: block } : {}),
      provider: ConversationProviders.ASSISTANT,
    }
  }

  #handleAssistantCommand = async (
    userId: number,
    message: string
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
        const preferences = await this.#getAssistantPreferences(userId)
        minutes = preferences.alertDefaultSnoozeMinutes ?? 10
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

    const alertsListMatch = lower.match(/^alerts?\s+(pending|pendientes|all|todas|snoozed|snoozeadas|resolved|resueltas|overdue|atrasadas)/)
    if (alertsListMatch) {
      const scopeRaw = alertsListMatch[1]
      let scope: 'pending' | 'all' | 'snoozed' | 'overdue' | 'resolved' = 'pending'

      if (scopeRaw === 'all' || scopeRaw === 'todas') {
        scope = 'all'
        await this.#updateAssistantPreferences(userId, { preferredAlertScope: 'all' })
      } else if (scopeRaw === 'snoozed' || scopeRaw === 'snoozeadas') {
        scope = 'snoozed'
        await this.#updateAssistantPreferences(userId, { preferredAlertScope: 'snoozed' })
      } else if (scopeRaw === 'resolved' || scopeRaw === 'resueltas') {
        scope = 'resolved'
      } else if (scopeRaw === 'overdue' || scopeRaw === 'atrasadas') {
        scope = 'overdue'
      } else {
        scope = 'pending'
        await this.#updateAssistantPreferences(userId, { preferredAlertScope: 'pending' })
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

    const digestMatch = lower.match(/^digest\s+(daily|weekly|off)\b/)
    if (digestMatch) {
      const freqRaw = digestMatch[1]
      if (freqRaw === 'off') {
        await this.#updateAssistantPreferences(userId, { digestFrequency: 'off' })
        return this.#buildAssistantResponse('Desactivé tus resúmenes automáticos.')
      }

      const digest = await this.generateAssistantDigest(
        userId,
        freqRaw as 'daily' | 'weekly'
      )

      if (typeof digest === 'string') {
        return this.#buildAssistantResponse(digest)
      }

      const summary = `Te envié el resumen ${
        freqRaw === 'daily' ? 'diario' : 'semanal'
      } con lo más importante.`
      return this.#buildAssistantResponse(summary, digest)
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
      await this.#updateAssistantPreferences(userId, { alertDefaultSnoozeMinutes: minutes })
      return this.#buildAssistantResponse(
        `Snooze preferido actualizado a ${minutes} minuto${minutes > 1 ? 's' : ''}.`
      )
    }

    const remindMatch = trimmed.match(/^remind me\s+(?:in\s+)?(.+?)\s+to\s+(.+)/i)
    if (remindMatch) {
      const timeText = remindMatch[1]
      const noteText = remindMatch[2]

      const alertRes = await this.#alertsServices.createAssistantAlert(userId, timeText, noteText)

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

  generateConversation = async (
    conversation: IConversation,
    userId: string,
    channelId?: string
  ): Promise<string | null> => {
    try {
      const conversationKey = rConversationKey(userId, channelId)

      /** Get conversation */
      const conversationStored = await this.#redisRepository.getConversationMessages(
        conversationKey
      )

      const newConversation = [...(conversationStored ?? []), conversation]

      const promptGenerated = await this.#generatePrompt(newConversation)

      /** Generate conversation */
      const messageResponse = await this.#aiRepository.chatCompletion(promptGenerated)

      const newConversationGenerated = [...newConversation, messageResponse]

      /** Save conversation */
      await this.#redisRepository.saveConversationMessages(
        conversationKey,
        newConversationGenerated
      )

      return messageResponse.content
    } catch (error) {
      console.log('- generateConversation service error= ', error.message)
      return null
    }
  }

  #getOrInitConversationFlow = async (channelId?: string): Promise<IConversationFlow> => {
    /** Get conversation */
    let conversationFlow = await this.#redisRepository.getConversationFlow(channelId)

    if (conversationFlow === null) {
      const newConversation: IConversationFlow = {
        createdAt: new Date(),
        updatedAt: new Date(),
        chanelId: channelId ?? '',
        conversation: [],
        channelType: ChannelType.ASSISTANT,
        socketChannel: channelId,
      }

      const response = await this.#redisRepository.saveConversationFlow(channelId, newConversation)

      if (!response) {
        return null
      }

      conversationFlow = newConversation
    }

    // TODO: change to update socketChanel when join in
    if (!conversationFlow.socketChannel) {
      const newConversation: IConversationFlow = {
        ...conversationFlow,
        socketChannel: channelId,
      }

      await this.#redisRepository.saveConversationFlow(channelId, newConversation)

      conversationFlow = newConversation
    }

    return conversationFlow
  }

  #manageAssistantVariables = async (
    userId: number,
    message: string
  ): Promise<IManageAssistantMessage> => {
    const assistantMessage = new AssistantMessage(message)

    const returnValue: IManageAssistantMessage = {
      cleanMessage: assistantMessage.cleanMessage,
      variables: {},
      flags: [],
    }

    if (assistantMessage.variable) {
      switch (assistantMessage.variable) {
        case AssistantsVariables.ALERT: {
          if (assistantMessage.flags[AssistantsFlags.LIST]) {
            const alerts = await this.#alertsServices.getAlertsByUserId(userId)

            const alertsList = alerts.data ?? []
            const metadataMap =
              alertsList.length > 0 ? await this.#buildAlertMetadataMap(alertsList) : {}

            const messageToResponse =
              alertsList.length > 0
                ? alertsList
                    ?.map(
                      (alert) =>
                        `• Id: _#${alert.id}_ - *${alert.message}*: ${formatDateToText(alert.date)}`
                    )
                    .join('\n')
                : 'No tienes alertas'

            const messageBlockToResponse = slackMsgUtils.msgAlertsList(alertsList, metadataMap)

            returnValue.responseMessage = {
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
            assistantMessage.cleanMessage
          )

          if (alert.error) {
            throw new Error(alert.error)
          }

          const contentBlock = slackMsgUtils.msgAlertCreated(alert.data)

          returnValue.responseMessage = {
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
          if (assistantMessage.flags[AssistantsFlags.LIST]) {
            const tasks = await this.#tasksServices.getTasksByUserId(userId)

            const messageToResponse =
              tasks?.data?.length > 0
                ? tasks?.data
                    ?.map((task) => `• Id: _#${task.id}_ - *${task.title}*: ${task.description}`)
                    .join('\n')
                : 'No tienes tareas'

            const messageBlockToResponse = slackMsgUtils.msgTasksList(tasks?.data ?? [])

            returnValue.responseMessage = {
              role: roleTypes.assistant,
              content: messageToResponse,
              contentBlock: messageBlockToResponse,
              provider: ConversationProviders.ASSISTANT,
            }

            break
          }

          if (!assistantMessage.value) {
            throw new Error('Ups! No se pudo crear la tarea, debes ingresar un título. 😅')
          }

          const task = await this.#tasksServices.createAssistantTask(
            userId,
            assistantMessage.value as string,
            (assistantMessage?.flags?.[AssistantsFlags.DESCRIPTION] as string) ?? ''
          )

          if (task.error) {
            throw new Error(task.error)
          }

          const contentBlock = slackMsgUtils.msgTaskCreated(task.data)

          returnValue.responseMessage = {
            role: roleTypes.assistant,
            content: `Tarea creada correctamente con id: #${task.data.id}`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }

          break
        }

        case AssistantsVariables.NOTE: {
          if (assistantMessage.flags[AssistantsFlags.LIST]) {
            const notes = await this.#notesServices.getNotesByUserId(userId)

            const messageToResponse =
              notes?.data?.length > 0
                ? notes?.data
                    ?.map((note) => `• Id: _#${note.id}_ - **${note.title}:** ${note.description}`)
                    .join('\n')
                : 'No tienes notas'

            const messageBlockToResponse = slackMsgUtils.msgNotesList(notes?.data ?? [])

            returnValue.responseMessage = {
              role: roleTypes.assistant,
              content: messageToResponse,
              contentBlock: messageBlockToResponse,
              provider: ConversationProviders.ASSISTANT,
            }

            break
          }

          if (assistantMessage.flags[AssistantsFlags.LIST_TAG] !== undefined) {
            const tag = assistantMessage.flags[AssistantsFlags.LIST_TAG] as string

            if (!tag) {
              returnValue.responseMessage = {
                role: roleTypes.assistant,
                content: 'Ups! Debes ingresar un tag para listar las notas. 😅',
                provider: ConversationProviders.ASSISTANT,
              }

              break
            }

            const notes = await this.#notesServices.getNotesByUserId(userId, {
              tag,
            })

            const messageToResponse =
              notes?.data?.length > 0
                ? notes?.data
                    ?.map((note) => `• Id: _#${note.id}_ - **${note.title}:** ${note.description}`)
                    .join('\n')
                : 'No tienes notas'

            returnValue.responseMessage = {
              role: roleTypes.assistant,
              content: `#### Notas - tag: ${tag ?? ''} \n ` + messageToResponse,
              provider: ConversationProviders.ASSISTANT,
            }

            break
          }

          if (!assistantMessage.value) {
            throw new Error('Ups! No se pudo crear la nota, debes ingresar un título. 😅')
          }

          const note = await this.#notesServices.createAssistantNote(
            userId,
            assistantMessage.value as string,
            (assistantMessage?.flags?.[AssistantsFlags.DESCRIPTION] as string) ?? '',
            (assistantMessage?.flags?.[AssistantsFlags.TAG] as string) ?? ''
          )

          if (note.error) {
            throw new Error(note.error)
          }

          const contentBlock = slackMsgUtils.msgNoteCreated(note.data)

          returnValue.responseMessage = {
            role: roleTypes.assistant,
            content: `Nota creada correctamente con id: #${note.data.id}`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }

          break
        }

        case AssistantsVariables.QUESTION: {
          const promptGenerated = await this.#generatePrompt([
            {
              role: roleTypes.user,
              content: assistantMessage.cleanMessage,
              provider: ConversationProviders.ASSISTANT,
            },
          ])

          /** Generate conversation */
          const messageResponse = await this.#aiRepository.chatCompletion(promptGenerated)

          if (messageResponse) {
            returnValue.responseMessage = messageResponse
          } else {
            throw new Error('No se pudo generar la respuesta')
          }

          break
        }

        default:
          // Response with default message
          returnValue.responseMessage = {
            role: roleTypes.assistant,
            content: 'Ups! No se encontró ninguna variable para procesar. 😅',
            provider: ConversationProviders.ASSISTANT,
          }

          break
      }
    }

    if (!returnValue.responseMessage) {
      const intentRouted = await this.#intentFallbackRouter(userId, assistantMessage.cleanMessage)
      if (intentRouted) {
        returnValue.responseMessage = intentRouted
      }
    }

    return returnValue
  }

  /**
   * Fallback router for intent classification.
   * @param userId User ID for context.
   * @param cleanMessage User message to classify.
   * @returns Classified intent or null if uncertain.
   */
  #intentFallbackRouter = async (
    userId: number,
    cleanMessage: string
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
            parsed.title
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
          const metadataMap =
            alertsList.length > 0 ? await this.#buildAlertMetadataMap(alertsList) : {}
          const contentBlock = slackMsgUtils.msgAlertsList(alertsList, metadataMap)
          return {
            role: roleTypes.assistant,
            content: parsed.successMessage || `Mostrando ${alerts.data?.length || 0} alertas`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'task.create': {
          if (!parsed.title) return null
          const task = await this.#tasksServices.createAssistantTask(
            userId,
            parsed.title,
            parsed.description || ''
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
          const tasks = await this.#tasksServices.getTasksByUserId(userId)
          ;(tasks.data || []).sort(
            (a: any, b: any) => +new Date(a.createdAt) - +new Date(b.createdAt)
          )
          if (tasks.error) return null
          const contentBlock = slackMsgUtils.msgTasksList(tasks.data ?? [])
          return {
            role: roleTypes.assistant,
            content: parsed.successMessage || `Mostrando ${tasks.data?.length || 0} tareas`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'note.create': {
          if (!parsed.title) return null
          const note = await this.#notesServices.createAssistantNote(
            userId,
            parsed.title,
            parsed.description || '',
            parsed.tag || ''
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
          const notes = await this.#notesServices.getNotesByUserId(userId)
          if (notes.error) return null
          const contentBlock = slackMsgUtils.msgNotesList(notes.data ?? [])
          return {
            role: roleTypes.assistant,
            content: parsed.successMessage || `Mostrando ${notes.data?.length || 0} notas`,
            contentBlock,
            provider: ConversationProviders.ASSISTANT,
          }
        }
        case 'search': {
          if (!parsed.query) return null
          return await this.#searchAndSummarize(cleanMessage, parsed.query)
        }
        case 'question': {
          const promptGenerated = await this.#generatePrompt([
            {
              role: roleTypes.user,
              content: cleanMessage,
              provider: ConversationProviders.ASSISTANT,
            },
          ])
          const messageResponse = await this.#aiRepository.chatCompletion(promptGenerated)
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

  generateAssistantConversation = async (
    message: string,
    userId: number,
    channelId: string,
    provider: ConversationProviders
  ): Promise<IConversation | null> => {
    try {
      const conversationFlow = await this.#getOrInitConversationFlow(channelId)

      const newConversation: IUserConversation = {
        role: roleTypes.user,
        content: message,
        userId,
        provider,
      }

      if (provider === ConversationProviders.SLACK && conversationFlow.socketChannel) {
        const io = IoServer.io
        if (io) {
          io.in(conversationFlow.socketChannel).emit('receive_assistant_message', newConversation)
        }
      }

      const { conversation: conversationStored } = conversationFlow

      // TODO: add filter for tokens
      const newConversationUser = [...conversationStored.slice(-10), newConversation]

      let responseMessage = await this.#handleAssistantCommand(userId, message)

      if (!responseMessage) {
        const managed = await this.#manageAssistantVariables(userId, message)
        responseMessage = managed.responseMessage ?? null
      }

      // if bot response message, add to conversation
      if (responseMessage) {
        newConversationUser.push(responseMessage)
      }

      const newConversationGenerated: IConversationFlow = {
        ...conversationFlow,
        conversation: [...newConversationUser],
        updatedAt: new Date(),
      }

      /** Save conversation */
      await this.#redisRepository.saveConversationFlow(channelId, newConversationGenerated)

      // Send alert message
      if (responseMessage) {
        return responseMessage
      }
    } catch (error) {
      return {
        role: roleTypes.assistant,
        content: error.message ?? 'Ups! Ocurrió un error al procesar tu solicitud 🤷‍♂️',
        provider: ConversationProviders.ASSISTANT,
      }
    }
  }

  cleanConversation = async (userId: string, channelId?: string): Promise<boolean> => {
    try {
      const conversationKey = rConversationKey(userId, channelId)

      await this.#redisRepository.saveConversationMessages(conversationKey, [])

      return true
    } catch (error) {
      console.log('error= ', error.message)
      return false
    }
  }

  showConversation = async (
    userId: string,
    channelId?: string,
    teamId?: string
  ): Promise<string | null> => {
    try {
      const conversationKey = rConversationKey(userId, channelId)

      /** Get conversation */
      const conversationStored = await this.#redisRepository.getConversationMessages(
        conversationKey
      )

      if (conversationStored.length === 0) return null

      const membersNames = await this.#getTeamMembers(teamId)

      return conversationStored
        .map((message) => {
          return `${
            message.role === roleTypes.assistant
              ? GlobalConstants.BOT_NAME
              : membersNames[userId] ?? userId
          }: ${message.content}`
        })
        .join('\n')
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  // Conversation flow

  conversationFlowStarted = async (channelId?: string): Promise<boolean> => {
    const conversationFlow = await this.#redisRepository.getConversationFlow(channelId)

    if (conversationFlow !== null) {
      return true
    }

    return false
  }

  startConversationFlow = async (
    channelId?: string,
    channelType: ChannelType = ChannelType.SLACK
  ): Promise<string> => {
    try {
      const conversationStarted = await this.conversationFlowStarted(channelId)

      if (conversationStarted) {
        return 'Ya existe una conversación en curso en este canal.'
      }

      const newConversation: IConversationFlow = {
        createdAt: new Date(),
        updatedAt: new Date(),
        chanelId: channelId ?? '',
        conversation: [],
        channelType,
      }

      const response = await this.#redisRepository.saveConversationFlow(channelId, newConversation)

      if (!response) {
        return 'No se pudo iniciar la conversación 🤷‍♂️'
      }

      return 'Conversación iniciada correctamente.'
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  endConversationFlow = async (channelId?: string): Promise<string | null> => {
    try {
      const conversationStarted = await this.conversationFlowStarted(channelId)

      if (!conversationStarted) {
        return 'No existe una conversación en curso en este canal.'
      }

      const response = await this.#redisRepository.deleteConversationFlow(channelId)

      if (!response) {
        return 'No se pudo finalizar la conversación 🤷‍♂️'
      }

      return 'Conversación finalizada correctamente.'
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  generateConversationFlow = async (
    message: string,
    userSlackId: string,
    channelId: string
  ): Promise<IConversation | null> => {
    try {
      /** Get conversation */
      const conversationFlow = await this.#redisRepository.getConversationFlow(channelId)

      if (conversationFlow === null) {
        return null
      }

      const skipGeneration = message.startsWith('+')
      const messageFormated = message.replace('+', '').trimStart()

      const newConversation: IUserConversation = {
        role: roleTypes.user,
        content: messageFormated,
        userSlackId,
        provider: ConversationProviders.SLACK,
      }

      const { conversation: conversationStored } = conversationFlow

      const newConversationUser = [...conversationStored, newConversation]

      // save message and skip generation with open ia
      if (skipGeneration) {
        /** Save conversation */
        await this.#redisRepository.saveConversationFlow(channelId, {
          ...conversationFlow,
          conversation: newConversationUser,
          updatedAt: new Date(),
        })

        return null
      }

      const promptGenerated = await this.#generatePrompt(
        newConversationUser.map((message) => ({
          role: message.role,
          content: message.content,
          provider: message.provider,
        }))
      )

      /** Generate conversation */
      const messageResponse = await this.#aiRepository.chatCompletion(promptGenerated)

      const newConversationGenerated: IConversationFlow = {
        ...conversationFlow,
        conversation: [...newConversationUser, messageResponse],
        updatedAt: new Date(),
      }

      /** Save conversation */
      await this.#redisRepository.saveConversationFlow(channelId, newConversationGenerated)

      return messageResponse
    } catch (error) {
      throw new Error('No se pudo generar la respuesta')
    }
  }

  generateConversationFlowAssistant = async (
    message: string,
    userId: number,
    chanelId: string,
    provider: ConversationProviders
  ): Promise<IConversation | null> => {
    try {
      /** Get conversation */
      const conversationFlow = await this.#redisRepository.getConversationFlow(chanelId)

      if (conversationFlow === null) {
        return null
      }

      const newConversation: IUserConversation = {
        role: roleTypes.user,
        content: message,
        userId,
        provider,
      }

      const { conversation: conversationStored } = conversationFlow

      // TODO: add filter for tokens
      const newConversationUser = [...conversationStored.slice(-10), newConversation]

      const promptGenerated = await this.#generatePrompt(newConversationUser)

      /** Generate conversation */
      // const messageResponse = await this.#aiRepository.chatCompletion(promptGenerated)
      const messageResponse = await this.#aiRepository.chatCompletion(promptGenerated)

      const newConversationGenerated: IConversationFlow = {
        ...conversationFlow,
        conversation: [...newConversationUser, messageResponse],
        updatedAt: new Date(),
      }

      /** Save conversation */
      await this.#redisRepository.saveConversationFlow(chanelId, newConversationGenerated)

      return messageResponse
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  sendMessageToConversationFlow = async (
    message: string,
    userSlackId: string,
    channelId: string
  ): Promise<IConversation | null> => {
    try {
      /** Get conversation */
      const conversationFlow = await this.#redisRepository.getConversationFlow(channelId)

      if (conversationFlow === null) {
        return null
      }

      const newConversation: IUserConversation = {
        role: roleTypes.user,
        content: message,
        userSlackId,
        provider: ConversationProviders.SLACK,
      }

      const { conversation: conversationStored } = conversationFlow

      const newConversationUser = [...conversationStored, newConversation]

      /** Save conversation */
      await this.#redisRepository.saveConversationFlow(channelId, {
        ...conversationFlow,
        conversation: newConversationUser,
        updatedAt: new Date(),
      })

      return newConversation
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  showConversationFlow = async (channelId: string, teamId?: string): Promise<string[] | null> => {
    try {
      /** Get conversation */
      const conversationFlow = await this.#redisRepository.getConversationFlow(channelId)

      if (conversationFlow === null) {
        return null
      }

      const { conversation: conversationStored } = conversationFlow

      const membersNames = teamId ? await this.#getTeamMembers(teamId) : {}

      return conversationStored.map((message) => {
        return `${
          message.role === roleTypes.assistant
            ? GlobalConstants.BOT_NAME
            : membersNames[message.userSlackId] ?? message.userSlackId
        }: ${message.content}`
      })
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  showConversationFlowWeb = async (channelId: string): Promise<IConversationFlow | null> => {
    try {
      /** Get conversation */
      const conversationFlow = await this.#redisRepository.getConversationFlow(channelId)

      if (conversationFlow === null) {
        return null
      }

      return conversationFlow
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  showChannelsConversationFlow = async (): Promise<string[] | null> => {
    try {
      /** Get conversation */
      const channels = await this.#redisRepository.getChannelsConversationFlow()

      return channels.map((channel) => channel.replace(conversationFlowPrefix, ''))
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  // Slack actions
  handleAction = async (
    data: {
      entity: string
      operation: string
      targetId: number
    },
    userId: number
  ): Promise<string | { blocks: any[] }> => {
    const entity = typeof data.entity === 'string' ? data.entity.toLowerCase() : ''
    const operation = typeof data.operation === 'string' ? data.operation.toLowerCase() : ''
    const targetId = data.targetId

    if (!entity || !operation || !Number.isFinite(targetId)) {
      return 'Acción no reconocida.'
    }

    try {
      switch (entity) {
        case 'alert':
          return await this.#handleAlertAction(operation, targetId, userId)
        case 'note':
          return await this.#handleNoteAction(operation, targetId, userId)
        case 'task':
          return await this.#handleTaskAction(operation, targetId, userId)
        case 'assistant':
          return await this.#handleAssistantAction(operation, userId)
        default:
          return 'Acción no reconocida.'
      }
    } catch (error) {
      return 'Error al ejecutar la accion. 😅'
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

    const snoozedUntil = new Date(res.data.date)
    const metadata = await this.#setAlertMetadata(alertId, {
      snoozedAt: new Date().toISOString(),
      snoozedUntil: snoozedUntil.toISOString(),
    })

    if (options.updatePreference) {
      await this.#updateAssistantPreferences(userId, { alertDefaultSnoozeMinutes: minutes })
    }

    return slackMsgUtils.msgAlertDetail(res.data, metadata ?? undefined)
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

    await this.#setAlertMetadata(alertId, { repeatPolicy: policy })
    const newAlertMetadata = await this.#setAlertMetadata(followUp.data.id, {
      repeatPolicy: policy,
    })

    const messageBlock = slackMsgUtils.msgAlertCreated(
      followUp.data,
      newAlertMetadata ?? undefined
    )

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

    const metadataMap = await this.#buildAlertMetadataMap(alerts)
    const now = new Date()

    let filtered = alerts
    let emptyMessage = 'No hay alertas para mostrar.'

    switch (scope) {
      case 'pending':
        filtered = alerts.filter((alert) => !alert.sent)
        emptyMessage = 'No tienes alertas pendientes.'
        break
      case 'snoozed':
        filtered = alerts.filter((alert) => {
          const metadata = metadataMap[alert.id]
          return !alert.sent && Boolean(metadata?.snoozedAt)
        })
        emptyMessage = 'No tienes alertas snoozeadas.'
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

    return slackMsgUtils.msgAlertsList(filtered, metadataMap)
  }

  #handleAlertResolve = async (
    alertId: number,
    userId: number
  ): Promise<string | { blocks: any[] }> => {
    const res = await this.#alertsServices.markAlertResolved(alertId, userId)

    if (res.error || !res.data) {
      return res.error ?? 'No se pudo marcar la alerta como resuelta. 😅'
    }

    await this.#clearAlertMetadata(alertId)

    return slackMsgUtils.msgAlertDetail(res.data)
  }

  #handleAssistantAction = async (
    operation: string,
    userId: number
  ): Promise<string | { blocks: any[] }> => {
    switch (operation) {
      case 'digest_daily':
        return await this.generateAssistantDigest(userId, 'daily')
      case 'digest_weekly':
        return await this.generateAssistantDigest(userId, 'weekly')
      case 'digest_off': {
        await this.#updateAssistantPreferences(userId, { digestFrequency: 'off' })
        return 'Se desactivaron los resúmenes automáticos.'
      }
      case 'set_snooze_5m': {
        await this.#updateAssistantPreferences(userId, { alertDefaultSnoozeMinutes: 5 })
        return 'Snooze preferido configurado en 5 minutos.'
      }
      case 'set_snooze_10m': {
        await this.#updateAssistantPreferences(userId, { alertDefaultSnoozeMinutes: 10 })
        return 'Snooze preferido configurado en 10 minutos.'
      }
      case 'set_snooze_30m': {
        await this.#updateAssistantPreferences(userId, { alertDefaultSnoozeMinutes: 30 })
        return 'Snooze preferido configurado en 30 minutos.'
      }
      default:
        return 'Acción no reconocida.'
    }
  }

  #handleAlertAction = async (
    operation: string,
    targetId: number,
    userId: number
  ): Promise<string | { blocks: any[] }> => {
    switch (operation) {
      case 'delete': {
        const deleteRes = await this.#alertsServices.deleteAlert(targetId, userId)

        if (deleteRes.error || !deleteRes.data) {
          return `Error al eliminar la alerta, no se encontro la alerta con Id: ${targetId}`
        }

        return `Alerta #${targetId} eliminada correctamente.`
      }

      case 'detail': {
        const alertsRes = await this.#alertsServices.getAlertsByUserId(userId, {})
        if (alertsRes.error) {
          return 'No se pudieron obtener las alertas. 😅'
        }
        const alert = alertsRes.data?.find((item) => item.id === targetId)

        if (!alert) {
          return `No se encontró la alerta con Id: ${targetId}`
        }

        const metadata = await this.#getAlertMetadata(alert.id)
        return slackMsgUtils.msgAlertDetail(alert, metadata ?? undefined)
      }

      case 'snooze_5m':
        return await this.#handleAlertSnooze(targetId, userId, 5)

      case 'snooze_1h':
        return await this.#handleAlertSnooze(targetId, userId, 60)

      case 'snooze_default': {
        const preferences = await this.#getAssistantPreferences(userId)
        const minutes = preferences.alertDefaultSnoozeMinutes ?? 10
        return await this.#handleAlertSnooze(targetId, userId, minutes, { updatePreference: true })
      }

      case 'repeat_daily':
        return await this.#handleAlertRepeat(targetId, userId, 24 * 60, 'daily')

      case 'repeat_weekly':
        return await this.#handleAlertRepeat(targetId, userId, 7 * 24 * 60, 'weekly')

      case 'resolve':
        return await this.#handleAlertResolve(targetId, userId)

      case 'list_overdue':
        return await this.#listAlertsByScope(userId, 'overdue')

      case 'list_snoozed': {
        await this.#updateAssistantPreferences(userId, { preferredAlertScope: 'snoozed' })
        return await this.#listAlertsByScope(userId, 'snoozed')
      }

      case 'list_all': {
        await this.#updateAssistantPreferences(userId, { preferredAlertScope: 'all' })
        return await this.#listAlertsByScope(userId, 'all')
      }

      case 'list_pending': {
        await this.#updateAssistantPreferences(userId, { preferredAlertScope: 'pending' })
        return await this.#listAlertsByScope(userId, 'pending')
      }

      case 'list_resolved':
        return await this.#listAlertsByScope(userId, 'resolved')

      case 'list': {
        const preferences = await this.#getAssistantPreferences(userId)
        return await this.#listAlertsByScope(userId, preferences.preferredAlertScope ?? 'pending')
      }

      default:
        return 'Acción no reconocida.'
    }
  }

  #handleNoteAction = async (
    operation: string,
    targetId: number,
    userId: number
  ): Promise<string | { blocks: any[] }> => {
    switch (operation) {
      case 'delete': {
        const deleteRes = await this.#notesServices.deleteNote(targetId, userId)

        if (deleteRes.error || !deleteRes.data) {
          return `Error al eliminar la nota, no se encontro la nota con Id: ${targetId}`
        }

        return `Nota #${targetId} eliminada correctamente.`
      }

      case 'detail': {
        const notesRes = await this.#notesServices.getNotesByUserId(userId)
        if (notesRes.error) {
          return 'No se pudieron obtener las notas. 😅'
        }
        const note = notesRes.data?.find((item) => item.id === targetId)

        if (!note) {
          return `No se encontró la nota con Id: ${targetId}`
        }

        return this.#formatNoteDetail(note)
      }

      case 'list': {
        const notesRes = await this.#notesServices.getNotesByUserId(userId)
        if (notesRes.error) {
          return 'No se pudieron obtener las notas. 😅'
        }
        const notes = notesRes.data ?? []
        if (!notes.length) {
          return 'No tienes notas guardadas.'
        }
        return slackMsgUtils.msgNotesList(notes)
      }

      default:
        return 'Acción no reconocida.'
    }
  }

  #handleTaskAction = async (
    operation: string,
    targetId: number,
    userId: number
  ): Promise<string | { blocks: any[] }> => {
    switch (operation) {
      case 'delete': {
        const deleteRes = await this.#tasksServices.deleteTask(targetId, userId)

        if (deleteRes.error || !deleteRes.data) {
          return `Error al eliminar la tarea, no se encontro la tarea con Id: ${targetId}`
        }

        return `Tarea #${targetId} eliminada correctamente.`
      }

      case 'detail': {
        const tasksRes = await this.#tasksServices.getTasksByUserId(userId)
        if (tasksRes.error) {
          return 'No se pudieron obtener las tareas. 😅'
        }
        const task = tasksRes.data?.find((item) => item.id === targetId)

        if (!task) {
          return `No se encontró la tarea con Id: ${targetId}`
        }

        return this.#formatTaskDetail(task)
      }

      case 'list': {
        const tasksRes = await this.#tasksServices.getTasksByUserId(userId)
        if (tasksRes.error) {
          return 'No se pudieron obtener las tareas. 😅'
        }
        const tasks = tasksRes.data ?? []
        if (!tasks.length) {
          return 'No tienes tareas guardadas.'
        }
        return slackMsgUtils.msgTasksList(tasks)
      }

      default:
        return 'Acción no reconocida.'
    }
  }

  #formatNoteDetail = (note: Notes): string => {
    const tagLabel = note.tag ? `\n• Etiqueta: ${note.tag}` : ''
    return `Nota #${note.id}\n• Título: ${note.title}\n• Descripción: ${note.description}${tagLabel}`
  }

  #formatTaskDetail = (task: Tasks): string => {
    const dueDate = task.alertDate
      ? formatDateToText(task.alertDate, 'es', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Sin fecha recordatorio'

    return `Tarea #${task.id}\n• Título: ${task.title}\n• Estado: ${task.status}\n• Descripción: ${task.description}\n• Recordatorio: ${dueDate}`
  }

  getAssistantQuickHelp = async (
    userId: number
  ): Promise<{ blocks: any[] } | string | null> => {
    try {
      const [alertsRes, notesRes, tasksRes, preferences] = await Promise.all([
        this.#alertsServices.getAlertsByUserId(userId, {}),
        this.#notesServices.getNotesByUserId(userId),
        this.#tasksServices.getTasksByUserId(userId),
        this.#getAssistantPreferences(userId),
      ])

      const alerts = alertsRes.data ?? []
      const notes = notesRes.data ?? []
      const tasks = tasksRes.data ?? []

      const metadataMap =
        alerts.length > 0 ? await this.#buildAlertMetadataMap(alerts) : {}

      const now = new Date()
      const alertsPending = alerts.filter((alert) => !alert.sent)
      const alertsOverdue = alertsPending.filter((alert) => new Date(alert.date) < now).length
      const alertsResolved = alerts.filter((alert) => alert.sent).length
      const alertsSnoozed = alertsPending.filter((alert) =>
        Boolean(metadataMap[alert.id]?.snoozedAt)
      ).length

      const tasksPending = tasks.filter((task) => {
        const status = (task.status ?? '').toLowerCase()
        return status !== 'completed' && status !== 'canceled'
      }).length

      return slackMsgUtils.msgAssistantQuickHelp({
        alerts: alerts.length,
        alertsPending: alertsPending.length,
        alertsOverdue,
        alertsResolved,
        alertsSnoozed,
        notes: notes.length,
        tasks: tasks.length,
        tasksPending,
        digestFrequency: preferences.digestFrequency ?? 'off',
        lastDigestAt: preferences.lastDigestSentAt,
        defaultSnoozeMinutes: preferences.alertDefaultSnoozeMinutes,
      })
    } catch (error) {
      console.log('getAssistantQuickHelp - error=', error)
      return 'No pude obtener tu resumen en este momento. 😅'
    }
  }

  generateAssistantDigest = async (
    userId: number,
    frequency: 'daily' | 'weekly'
  ): Promise<{ blocks: any[] } | string> => {
    try {
      const now = new Date()
      const rangeHours = frequency === 'daily' ? 24 : 24 * 7
      const rangeMs = rangeHours * 60 * 60 * 1000
      const rangeStart = new Date(now.getTime() - rangeMs)

      const [alertsRes, notesRes, tasksRes] = await Promise.all([
        this.#alertsServices.getAlertsByUserId(userId, {}),
        this.#notesServices.getNotesByUserId(userId),
        this.#tasksServices.getTasksByUserId(userId),
      ])

      if (alertsRes.error || notesRes.error || tasksRes.error) {
        return 'No pude generar tu digest ahora mismo. 😅'
      }

      const alerts = alertsRes.data ?? []
      const notes = notesRes.data ?? []
      const tasks = tasksRes.data ?? []

      const metadataMap =
        alerts.length > 0 ? await this.#buildAlertMetadataMap(alerts) : {}

      const alertsPending = alerts.filter((alert) => !alert.sent)
      const alertsOverdue = alertsPending.filter(
        (alert) => new Date(alert.date).getTime() < now.getTime()
      ).length
      const alertsResolved = alerts.filter((alert) => alert.sent).length

      const highlightAlerts = alerts
        .filter((alert) => {
          if (alert.sent) return false
          const alertTime = new Date(alert.date).getTime()
          const diff = alertTime - now.getTime()
          return diff <= rangeMs && diff >= -rangeMs
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      const highlightTasks = tasks
        .filter((task) => {
          const status = (task.status ?? '').toLowerCase()
          if (status === 'completed' || status === 'canceled') return false
          if (!task.alertDate) return true
          const diff = new Date(task.alertDate).getTime() - now.getTime()
          return diff <= rangeMs && diff >= -rangeMs
        })
        .sort((a, b) => {
          const timeA = a.alertDate ? new Date(a.alertDate).getTime() : Number.MAX_SAFE_INTEGER
          const timeB = b.alertDate ? new Date(b.alertDate).getTime() : Number.MAX_SAFE_INTEGER
          return timeA - timeB
        })

      const highlightNotes = notes
        .filter((note) => {
          if (!note.createdAt) return false
          return new Date(note.createdAt).getTime() >= rangeStart.getTime()
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      const tasksPending = tasks.filter((task) => {
        const status = (task.status ?? '').toLowerCase()
        return status !== 'completed' && status !== 'canceled'
      }).length
      const tasksCompleted = tasks.filter(
        (task) => (task.status ?? '').toLowerCase() === 'completed'
      ).length

      const rangeLabel = `Últimas ${frequency === 'daily' ? '24 horas' : 'semana'} · Desde ${formatDateToText(
        rangeStart,
        'es',
        {
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }
      )}`

      const digest = slackMsgUtils.msgAssistantDigest({
        title: `Resumen ${frequency === 'daily' ? 'diario' : 'semanal'}`,
        rangeLabel,
        stats: {
          alertsPending: alertsPending.length,
          alertsOverdue,
          alertsResolved,
          tasksPending,
          tasksCompleted,
          notes: notes.length,
        },
        highlights: {
          alerts: highlightAlerts,
          tasks: highlightTasks,
          notes: highlightNotes,
        },
        metadata: metadataMap,
      })

      await this.#redisRepository.saveAssistantDigestSnapshot(userId, {
        generatedAt: now.toISOString(),
        blocks: digest.blocks,
      })

      await this.#updateAssistantPreferences(userId, {
        digestFrequency: frequency,
        lastDigestSentAt: now.toISOString(),
      })

      return digest
    } catch (error) {
      console.log('generateAssistantDigest - error=', error)
      return 'No pude generar tu digest ahora mismo. 😅'
    }
  }
}
