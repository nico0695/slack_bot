import { createModuleLogger } from '../../../config/logger'
import { IConversation, IUserConversation } from '../shared/interfaces/converstions'
import { roleTypes } from '../shared/constants/openai'
import { ConversationProviders } from '../shared/constants/conversationFlow'
import { AssistantMessage } from '../shared/utils/asistantMessage.utils'
import { AssistantsFlags, AssistantsVariables } from '../shared/constants/assistant.constants'
import {
  assistantPromptFlagsLite2,
  assistantPromptLite,
  assistantSearchSummaryLite,
} from '../shared/constants/prompt.constants'

import AlertsServices from '../../alerts/services/alerts.services'
import TasksServices from '../../tasks/services/tasks.services'
import NotesServices from '../../notes/services/notes.services'
import ImagesServices from '../../images/services/images.services'
import SearchRepository from '../repositories/search/search.repository'
import OpenaiRepository from '../repositories/openai/openai.repository'
import GeminiRepository from '../repositories/gemini/gemini.repository'
import { RedisRepository } from '../repositories/redis/conversations.redis'
import { IGeneratedImage, ImageProvider } from '../../images/shared/interfaces/images.interfaces'

import { buildUserDataContext, formatConversationHistory } from '../shared/utils/userContext.utils'

import { formatDateToText } from '../../../shared/utils/dates.utils'
import * as slackMsgUtils from '../../../shared/utils/slackMessages.utils'

const log = createModuleLogger('conversations.messageProcessor')

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
  #imagesServices: ImagesServices
  #defaultSnoozeMinutes = 10

  private constructor(aiToUse = AIRepositoryType.OPENAI) {
    this.#aiRepository = AIRepositoryByType[aiToUse].getInstance()
    this.#redisRepository = RedisRepository.getInstance()
    this.#alertsServices = AlertsServices.getInstance()
    this.#tasksServices = TasksServices.getInstance()
    this.#notesServices = NotesServices.getInstance()
    this.#imagesServices = ImagesServices.getInstance()
  }

  static getInstance(): MessageProcessor {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new MessageProcessor()
    return this.#instance
  }

  processAssistantMessage = async (
    message: string,
    userId: number,
    channelId?: string,
    isChannelContext = false,
    conversationHistory?: IUserConversation[]
  ): Promise<IProcessMessageResult> => {
    const shouldSkipAI = this.shouldSkipAI(message)

    if (shouldSkipAI) {
      return { response: null, shouldSkipAI: true }
    }

    const commandResponse = await this.#handleAssistantCommand(
      userId,
      message,
      channelId,
      isChannelContext
    )
    if (commandResponse) {
      return { response: commandResponse, shouldSkipAI: false }
    }

    const variableResponse = await this.#manageAssistantVariables(
      userId,
      message,
      channelId,
      isChannelContext,
      conversationHistory
    )
    if (variableResponse) {
      return { response: variableResponse, shouldSkipAI: false }
    }

    return { response: null, shouldSkipAI: false }
  }

  #getScopeChannelId = (channelId?: string, isChannelContext = false): string | null => {
    if (!isChannelContext) {
      return null
    }

    if (typeof channelId === 'string') {
      const trimmed = channelId.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
    return null
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
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = dateFormatter.formatToParts(now)
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
    const date = parts
      .filter((p) => p.type !== 'weekday' && p.type !== 'literal')
      .map((p) => p.value)
      .join('-')
    const time = timeFormatter.format(now)
    const formatted = `${weekday}, ${date} ${time}`

    return prompt.replace(/<fecha>/g, formatted)
  }

  #fetchUserDataContext = async (
    userId: number,
    channelId?: string | null,
    options: { maxItems?: number } = {}
  ): Promise<string> => {
    try {
      const [alertsRes, tasksRes, notesRes] = await Promise.all([
        this.#alertsServices.getAlertsByUserId(userId, {
          sent: false,
          channelId: channelId ?? undefined,
        }),
        this.#tasksServices.getTasksByUserId(userId, { channelId: channelId ?? undefined }),
        this.#notesServices.getNotesByUserId(userId, { channelId: channelId ?? undefined }),
      ])

      return buildUserDataContext(
        {
          alerts: alertsRes.data ?? [],
          tasks: tasksRes.data ?? [],
          notes: notesRes.data ?? [],
        },
        { maxItems: options.maxItems ?? 5 }
      )
    } catch (error) {
      log.error({ err: error }, 'fetchUserDataContext failed')
      return ''
    }
  }

  #buildContextBlock = (userDataContext: string, historyContext: string): string => {
    const parts: string[] = []

    if (userDataContext && userDataContext !== '[SIN_DATOS_PREVIOS]') {
      parts.push(`\nDATOS_USUARIO:\n${userDataContext}`)
    }

    if (historyContext) {
      parts.push(`\nHISTORIAL:\n${historyContext}`)
    }

    return parts.length > 0 ? '\n' + parts.join('\n') : ''
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

  /**
   * Build assistant response for image generation
   * Formats image URLs with provider info and metadata
   */
  #buildImageResponse = (
    images: IGeneratedImage[],
    provider: ImageProvider,
    prompt: string,
    options?: { size?: string; quality?: string; style?: string }
  ): IConversation => {
    const imageList = images
      .map((img, index) => {
        const metadata = []
        if (options?.size) metadata.push(`Size: ${options.size}`)
        if (options?.quality) metadata.push(`Quality: ${options.quality}`)
        if (options?.style) metadata.push(`Style: ${options.style}`)

        const metadataStr = metadata.length > 0 ? ` (${metadata.join(', ')})` : ''

        return `• <${img.url}|Image #${index + 1}>${metadataStr}`
      })
      .join('\n')

    const content = `✅ Generated ${images.length} image${
      images.length > 1 ? 's' : ''
    } with ${provider}:\n${imageList}`

    return {
      role: roleTypes.assistant,
      content,
      provider: ConversationProviders.ASSISTANT,
    }
  }

  #handleAssistantCommand = async (
    userId: number,
    message: string,
    channelId: string | undefined,
    isChannelContext: boolean
  ): Promise<IConversation | null> => {
    const trimmed = message.trim()
    if (!trimmed) {
      return null
    }

    const lower = trimmed.toLowerCase()
    const scopeChannelId = this.#getScopeChannelId(channelId, isChannelContext)

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

      const result = await this.#listAlertsByScope(userId, scope, scopeChannelId)

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
    channelId: string | undefined,
    isChannelContext: boolean,
    conversationHistory?: IUserConversation[]
  ): Promise<IConversation | null> => {
    const assistantMessage = new AssistantMessage(message)
    const scopeChannelId = this.#getScopeChannelId(channelId, isChannelContext)

    if (!assistantMessage.variable) {
      return await this.#intentFallbackRouter(
        userId,
        assistantMessage.cleanMessage,
        channelId,
        isChannelContext,
        conversationHistory
      )
    }

    let responseMessage: IConversation | null = null

    switch (assistantMessage.variable) {
      case AssistantsVariables.ALERT: {
        if (assistantMessage.flags[AssistantsFlags.LIST]) {
          const alerts = await this.#alertsServices.getAlertsByUserId(userId, {
            sent: false,
            channelId: scopeChannelId,
          })
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
          const tasks = await this.#tasksServices.getTasksByUserId(userId, {
            channelId: scopeChannelId,
          })

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
            channelId: scopeChannelId,
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
          const notes = await this.#notesServices.getNotesByUserId(userId, {
            channelId: scopeChannelId,
          })

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
            channelId: scopeChannelId,
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

      case AssistantsVariables.IMAGE: {
        // Handle list command (.img -l)
        if (assistantMessage.flags[AssistantsFlags.LIST]) {
          const images = await this.#imagesServices.getImages(1, 10)

          if (images.error || !images.data?.data?.length) {
            responseMessage = {
              role: roleTypes.assistant,
              content: 'No tienes imágenes generadas',
              provider: ConversationProviders.ASSISTANT,
            }
            break
          }

          const imagesList = images.data.data
            .map(
              (img, index) =>
                `${index + 1}. <${img.imageUrl}|${img.prompt}> (${String(
                  img.provider || 'unknown'
                )})`
            )
            .join('\n')

          responseMessage = {
            role: roleTypes.assistant,
            content: `Tus imágenes recientes:\n${imagesList}`,
            provider: ConversationProviders.ASSISTANT,
          }

          break
        }

        // Validate prompt
        if (!assistantMessage.value && !assistantMessage.cleanMessage) {
          throw new Error('Ups! Necesito una descripción de la imagen que quieres generar. 😅')
        }

        // Extract prompt
        const imagePrompt = (assistantMessage.value as string) || assistantMessage.cleanMessage

        if (!imagePrompt.trim()) {
          throw new Error('Ups! La descripción de la imagen no puede estar vacía. 😅')
        }

        // Parse options from flags
        const imageOptions: any = {}

        if (assistantMessage.flags[AssistantsFlags.SIZE]) {
          const size = assistantMessage.flags[AssistantsFlags.SIZE] as string
          const validSizes = ['1024x1024', '1024x1792', '1792x1024', '512x512']
          if (validSizes.includes(size)) {
            imageOptions.size = size
          }
        }

        if (assistantMessage.flags[AssistantsFlags.QUALITY]) {
          const quality = assistantMessage.flags[AssistantsFlags.QUALITY] as string
          if (quality === 'standard' || quality === 'hd') {
            imageOptions.quality = quality
          }
        }

        if (assistantMessage.flags[AssistantsFlags.STYLE]) {
          const style = assistantMessage.flags[AssistantsFlags.STYLE] as string
          if (style === 'vivid' || style === 'natural') {
            imageOptions.style = style
          }
        }

        if (assistantMessage.flags[AssistantsFlags.NUMBER]) {
          const numStr = assistantMessage.flags[AssistantsFlags.NUMBER] as string
          const num = parseInt(numStr, 10)
          if (num >= 1 && num <= 4) {
            imageOptions.numberOfImages = num
          }
        }

        // Generate image
        try {
          const response = await this.#imagesServices.generateImageForAssistant(
            imagePrompt,
            userId,
            imageOptions
          )

          if (!response?.images?.length) {
            throw new Error('No se pudo generar la imagen')
          }

          // Build response with images
          responseMessage = this.#buildImageResponse(
            response.images,
            response.provider,
            imagePrompt,
            {
              size: imageOptions.size,
              quality: imageOptions.quality,
              style: imageOptions.style,
            }
          )
        } catch (error: any) {
          log.error({ err: error }, '#manageAssistantVariables IMAGE generation failed')
          responseMessage = {
            role: roleTypes.assistant,
            content: `❌ ${
              String(error.message) || 'No se pudo generar la imagen. Intenta nuevamente.'
            }`,
            provider: ConversationProviders.ASSISTANT,
          }
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
    channelId: string | undefined,
    isChannelContext: boolean,
    conversationHistory?: IUserConversation[]
  ): Promise<IConversation | null> => {
    try {
      if (!cleanMessage) return null
      const scopeChannelId = this.#getScopeChannelId(channelId, isChannelContext)

      const [userDataContext, historyContext] = await Promise.all([
        this.#fetchUserDataContext(userId, scopeChannelId),
        Promise.resolve(formatConversationHistory(conversationHistory ?? [], 3)),
      ])

      const contextBlock = this.#buildContextBlock(userDataContext, historyContext)

      const classificationPrompt = [
        {
          role: roleTypes.system,
          content: this.#withDateContext(assistantPromptFlagsLite2) + contextBlock,
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
          const alerts = await this.#alertsServices.getAlertsByUserId(userId, {
            channelId: scopeChannelId,
          })
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
          const taskFilters = normalizedTag
            ? { tag: normalizedTag, channelId: scopeChannelId }
            : { channelId: scopeChannelId }
          const tasks = await this.#tasksServices.getTasksByUserId(userId, taskFilters)
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
          const noteFilters = normalizedTag
            ? { tag: normalizedTag, channelId: scopeChannelId }
            : { channelId: scopeChannelId }
          const notes = await this.#notesServices.getNotesByUserId(userId, noteFilters)
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
        case 'image.create': {
          // Validate required fields
          if (!parsed.prompt || typeof parsed.prompt !== 'string') {
            return null
          }

          const imagePrompt = parsed.prompt.trim()

          if (!imagePrompt) {
            return null
          }

          // Parse options
          const imageOptions: any = {}

          if (parsed.size && typeof parsed.size === 'string') {
            const validSizes = ['1024x1024', '1024x1792', '1792x1024', '512x512']
            if (validSizes.includes(parsed.size)) {
              imageOptions.size = parsed.size
            }
          }

          if (parsed.quality && typeof parsed.quality === 'string') {
            if (parsed.quality === 'standard' || parsed.quality === 'hd') {
              imageOptions.quality = parsed.quality
            }
          }

          if (parsed.style && typeof parsed.style === 'string') {
            if (parsed.style === 'vivid' || parsed.style === 'natural') {
              imageOptions.style = parsed.style
            }
          }

          if (parsed.numberOfImages && typeof parsed.numberOfImages === 'number') {
            const num = parsed.numberOfImages
            if (num >= 1 && num <= 4) {
              imageOptions.numberOfImages = num
            }
          }

          // Generate image
          try {
            const response = await this.#imagesServices.generateImageForAssistant(
              imagePrompt,
              userId,
              imageOptions
            )

            if (!response?.images?.length) {
              return null
            }

            // Build and return response
            return this.#buildImageResponse(response.images, response.provider, imagePrompt, {
              size: imageOptions.size,
              quality: imageOptions.quality,
              style: imageOptions.style,
            })
          } catch (error) {
            log.error({ err: error }, 'Intent fallback router - image.create failed')
            return null
          }
        }
        case 'image.list': {
          // Get recent images
          const images = await this.#imagesServices.getImages(1, 10)

          if (images.error || !images.data?.data?.length) {
            return {
              role: roleTypes.assistant,
              content: 'No tienes imágenes generadas todavía.',
              provider: ConversationProviders.ASSISTANT,
            }
          }

          const imagesList = images.data.data
            .map((img, index) => {
              const providerLabel = img.provider ? ` (${String(img.provider)})` : ''
              const truncatedPrompt =
                img.prompt.length > 50 ? img.prompt.substring(0, 47) + '...' : img.prompt
              return `${index + 1}. <${img.imageUrl}|${truncatedPrompt}>${providerLabel}`
            })
            .join('\n')

          return {
            role: roleTypes.assistant,
            content: `Tus últimas imágenes (${images.data.data.length}):\n${imagesList}`,
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
      log.error({ err: e }, '#intentFallbackRouter failed')
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
    scope: 'pending' | 'all' | 'snoozed' | 'overdue' | 'resolved',
    channelId: string | null
  ): Promise<string | { blocks: any[] }> => {
    const alertsRes = await this.#alertsServices.getAlertsByUserId(userId, {
      channelId,
    })
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
