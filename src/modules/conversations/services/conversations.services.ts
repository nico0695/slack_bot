import { createModuleLogger } from '../../../config/logger'
import { GlobalConstants } from '../../../shared/constants/global'
import { IoServer } from '../../../config/socketConfig'

import UsersServices from '../../users/services/users.services'
import AlertsServices from '../../alerts/services/alerts.services'
import TasksServices from '../../tasks/services/tasks.services'
import NotesServices from '../../notes/services/notes.services'
import { Tasks } from '../../../entities/tasks'
import { Notes } from '../../../entities/notes'

// AI
import GeminiRepository from '../repositories/gemini/gemini.repository'
import OpenaiRepository from '../repositories/openai/openai.repository'
import { roleTypes } from '../shared/constants/openai'

import { RedisRepository } from '../repositories/redis/conversations.redis'
import { conversationFlowPrefix, rConversationKey } from '../repositories/redis/redis.constants'

import {
  IAssistantResponse,
  IConversation,
  IConversationFlow,
  IUserConversation,
} from '../shared/interfaces/converstions'
import { ChannelType, ConversationProviders } from '../shared/constants/conversationFlow'

import { formatDateToText } from '../../../shared/utils/dates.utils'
import { assistantPromptLite } from '../shared/constants/prompt.constants'
import * as slackMsgUtils from '../../../shared/utils/slackMessages.utils'
import MessageProcessor from './messageProcessor.service'

const log = createModuleLogger('conversations.service')

type TMembersNames = Record<string, string>

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
  #messageProcessor: MessageProcessor
  #defaultSnoozeMinutes = 10
  #maxContextMessages = 20

  private constructor(aiToUse = AIRepositoryType.OPENAI) {
    this.#aiRepository = AIRepositoryByType[aiToUse].getInstance()
    this.#redisRepository = RedisRepository.getInstance()
    this.#messageProcessor = MessageProcessor.getInstance()

    this.#usersServices = UsersServices.getInstance()
    this.#alertsServices = AlertsServices.getInstance()
    this.#tasksServices = TasksServices.getInstance()
    this.#notesServices = NotesServices.getInstance()
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

  #getSnoozeMinutes = async (userId: number): Promise<number> => {
    const config = await this.#redisRepository.getAlertSnoozeConfig(userId)
    return config?.defaultSnoozeMinutes ?? this.#defaultSnoozeMinutes
  }

  #setSnoozeMinutes = async (userId: number, minutes: number): Promise<void> => {
    await this.#redisRepository.saveAlertSnoozeConfig(userId, { defaultSnoozeMinutes: minutes })
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
      log.error({ err: error }, 'generateConversation failed')
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

  generateAssistantConversation = async (
    message: string,
    userId: number,
    channelId: string,
    provider: ConversationProviders,
    isChannelContext = false
  ): Promise<IAssistantResponse> => {
    try {
      // Check skip FIRST (message starts with "+")
      const shouldSkip = this.#messageProcessor.shouldSkipAI(message)
      const cleanMessage = shouldSkip
        ? this.#messageProcessor.cleanSkipFlag(message)
        : message

      const conversationFlow = await this.#getOrInitConversationFlow(channelId)

      const newConversation: IUserConversation = {
        role: roleTypes.user,
        content: cleanMessage,
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

      // If skip requested, save message and return without processing
      if (shouldSkip) {
        const updatedConversation = [
          ...conversationStored.slice(-(this.#maxContextMessages - 1)),
          newConversation,
        ]

        await this.#redisRepository.saveConversationFlow(channelId, {
          ...conversationFlow,
          conversation: updatedConversation,
          updatedAt: new Date(),
        })

        return { response: null, skipped: true }
      }

      const trimmedChannelId = channelId.trim()

      const result = await this.#messageProcessor.processAssistantMessage(
        cleanMessage,
        userId,
        trimmedChannelId,
        isChannelContext,
        conversationStored
      )
      const responseMessage = result.response

      // Add messages to conversation history (limit to last N)
      const updatedConversation = [
        ...conversationStored.slice(-(this.#maxContextMessages - 1)),
        newConversation,
      ]

      if (responseMessage) {
        updatedConversation.push(responseMessage)
      }

      const newConversationGenerated: IConversationFlow = {
        ...conversationFlow,
        conversation: updatedConversation,
        updatedAt: new Date(),
      }

      /** Save conversation */
      await this.#redisRepository.saveConversationFlow(channelId, newConversationGenerated)

      return { response: responseMessage, skipped: false }
    } catch (error) {
      log.error({ err: error }, 'generateAssistantConversation failed')
      return {
        response: {
          role: roleTypes.assistant,
          content: error.message ?? 'Ups! Ocurrió un error al procesar tu solicitud 🤷‍♂️',
          provider: ConversationProviders.ASSISTANT,
        },
        skipped: false,
      }
    }
  }

  cleanConversation = async (userId: string, channelId?: string): Promise<boolean> => {
    try {
      const conversationKey = rConversationKey(userId, channelId)

      await this.#redisRepository.saveConversationMessages(conversationKey, [])

      return true
    } catch (error) {
      log.error({ err: error }, 'cleanConversation failed')
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
      log.error({ err: error }, 'showConversation failed')
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
      log.error({ err: error }, 'startConversationFlow failed')
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
      log.error({ err: error }, 'endConversationFlow failed')
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

      // Limit context sent to AI to last N messages to avoid overwhelming the model
      const limitedConversation = conversationStored.slice(-this.#maxContextMessages)
      const contextForAI = [...limitedConversation, newConversation]

      const promptGenerated = await this.#generatePrompt(
        contextForAI.map((message) => ({
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
      log.error({ err: error }, 'generateConversationFlow failed')
      throw new Error('No se pudo generar la respuesta')
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
      log.error({ err: error }, 'sendMessageToConversationFlow failed')
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
      log.error({ err: error }, 'showConversationFlow failed')
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
      log.error({ err: error }, 'showConversationFlowWeb failed')
      return null
    }
  }

  showChannelsConversationFlow = async (): Promise<string[] | null> => {
    try {
      /** Get conversation */
      const channels = await this.#redisRepository.getChannelsConversationFlow()

      return channels.map((channel) => channel.replace(conversationFlowPrefix, ''))
    } catch (error) {
      log.error({ err: error }, 'showChannelsConversationFlow failed')
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
    userId: number,
    context: {
      channelId?: string
      isChannelContext?: boolean
    } = {}
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
          return await this.#handleAlertAction(operation, targetId, userId, context)
        case 'note':
          return await this.#handleNoteAction(operation, targetId, userId, context)
        case 'task':
          return await this.#handleTaskAction(operation, targetId, userId, context)
        case 'assistant':
          return await this.#handleAssistantAction(operation, userId)
        default:
          return 'Acción no reconocida.'
      }
    } catch (error) {
      log.error({ err: error }, 'handleAction failed')
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
        // Snoozed scope removed - show pending alerts instead
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

  #handleAlertResolve = async (
    alertId: number,
    userId: number
  ): Promise<string | { blocks: any[] }> => {
    const res = await this.#alertsServices.markAlertResolved(alertId, userId)

    if (res.error || !res.data) {
      return res.error ?? 'No se pudo marcar la alerta como resuelta. 😅'
    }

    return slackMsgUtils.msgAlertDetail(res.data)
  }

  #handleAssistantAction = async (
    operation: string,
    userId: number
  ): Promise<string | { blocks: any[] }> => {
    switch (operation) {
      case 'set_snooze_5m': {
        await this.#setSnoozeMinutes(userId, 5)
        return 'Snooze preferido configurado en 5 minutos.'
      }
      case 'set_snooze_10m': {
        await this.#setSnoozeMinutes(userId, 10)
        return 'Snooze preferido configurado en 10 minutos.'
      }
      case 'set_snooze_30m': {
        await this.#setSnoozeMinutes(userId, 30)
        return 'Snooze preferido configurado en 30 minutos.'
      }
      default:
        return 'Acción no reconocida.'
    }
  }

  #handleAlertAction = async (
    operation: string,
    targetId: number,
    userId: number,
    context: { channelId?: string; isChannelContext?: boolean }
  ): Promise<string | { blocks: any[] }> => {
    const scopeChannelId = this.#getScopeChannelId(
      context.channelId,
      context.isChannelContext ?? false
    )

    switch (operation) {
      case 'delete': {
        const deleteRes = await this.#alertsServices.deleteAlert(targetId, userId)

        if (deleteRes.error || !deleteRes.data) {
          return `Error al eliminar la alerta, no se encontro la alerta con Id: ${targetId}`
        }

        return `Alerta #${targetId} eliminada correctamente.`
      }

      case 'detail': {
        const alertsRes = await this.#alertsServices.getAlertsByUserId(userId, {
          channelId: scopeChannelId,
        })
        if (alertsRes.error) {
          return 'No se pudieron obtener las alertas. 😅'
        }
        const alert = alertsRes.data?.find((item) => item.id === targetId)

        if (!alert) {
          return `No se encontró la alerta con Id: ${targetId}`
        }

        return slackMsgUtils.msgAlertDetail(alert)
      }

      case 'snooze_5m':
        return await this.#handleAlertSnooze(targetId, userId, 5)

      case 'snooze_1h':
        return await this.#handleAlertSnooze(targetId, userId, 60)

      case 'snooze_default': {
        const minutes = await this.#getSnoozeMinutes(userId)
        return await this.#handleAlertSnooze(targetId, userId, minutes, { updatePreference: true })
      }

      case 'repeat_daily':
        return await this.#handleAlertRepeat(targetId, userId, 24 * 60, 'daily')

      case 'repeat_weekly':
        return await this.#handleAlertRepeat(targetId, userId, 7 * 24 * 60, 'weekly')

      case 'resolve':
        return await this.#handleAlertResolve(targetId, userId)

      case 'list_overdue':
        return await this.#listAlertsByScope(userId, 'overdue', scopeChannelId)

      case 'list_snoozed':
        return await this.#listAlertsByScope(userId, 'snoozed', scopeChannelId)

      case 'list_all':
        return await this.#listAlertsByScope(userId, 'all', scopeChannelId)

      case 'list_pending':
        return await this.#listAlertsByScope(userId, 'pending', scopeChannelId)

      case 'list_resolved':
        return await this.#listAlertsByScope(userId, 'resolved', scopeChannelId)

      case 'list':
        return await this.#listAlertsByScope(userId, 'pending', scopeChannelId)

      default:
        return 'Acción no reconocida.'
    }
  }

  #handleNoteAction = async (
    operation: string,
    targetId: number,
    userId: number,
    context: { channelId?: string; isChannelContext?: boolean }
  ): Promise<string | { blocks: any[] }> => {
    const scopeChannelId = this.#getScopeChannelId(
      context.channelId,
      context.isChannelContext ?? false
    )

    switch (operation) {
      case 'delete': {
        const deleteRes = await this.#notesServices.deleteNote(targetId, userId)

        if (deleteRes.error || !deleteRes.data) {
          return `Error al eliminar la nota, no se encontro la nota con Id: ${targetId}`
        }

        return `Nota #${targetId} eliminada correctamente.`
      }

      case 'detail': {
        const notesRes = await this.#notesServices.getNotesByUserId(userId, {
          channelId: scopeChannelId,
        })
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
        const notesRes = await this.#notesServices.getNotesByUserId(userId, {
          channelId: scopeChannelId,
        })
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
    userId: number,
    context: { channelId?: string; isChannelContext?: boolean }
  ): Promise<string | { blocks: any[] }> => {
    const scopeChannelId = this.#getScopeChannelId(
      context.channelId,
      context.isChannelContext ?? false
    )

    switch (operation) {
      case 'delete': {
        const deleteRes = await this.#tasksServices.deleteTask(targetId, userId)

        if (deleteRes.error || !deleteRes.data) {
          return `Error al eliminar la tarea, no se encontro la tarea con Id: ${targetId}`
        }

        return `Tarea #${targetId} eliminada correctamente.`
      }

      case 'detail': {
        const tasksRes = await this.#tasksServices.getTasksByUserId(userId, {
          channelId: scopeChannelId,
        })
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
        const tasksRes = await this.#tasksServices.getTasksByUserId(userId, {
          channelId: scopeChannelId,
        })
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
    userId: number,
    options: { channelId?: string; isChannelContext?: boolean } = {}
  ): Promise<{ blocks: any[] } | string | null> => {
    try {
      const scopeChannelId = this.#getScopeChannelId(
        options.channelId,
        options.isChannelContext ?? false
      )

      const [alertsRes, notesRes, tasksRes] = await Promise.all([
        this.#alertsServices.getAlertsByUserId(userId, { channelId: scopeChannelId }),
        this.#notesServices.getNotesByUserId(userId, { channelId: scopeChannelId }),
        this.#tasksServices.getTasksByUserId(userId, { channelId: scopeChannelId }),
      ])

      const alerts = alertsRes.data ?? []
      const notes = notesRes.data ?? []
      const tasks = tasksRes.data ?? []

      const now = new Date()
      const alertsPending = alerts.filter((alert) => !alert.sent)
      const alertsOverdue = alertsPending.filter((alert) => new Date(alert.date) < now).length
      const alertsResolved = alerts.filter((alert) => alert.sent).length

      const tasksPending = tasks.filter((task) => {
        const status = (task.status ?? '').toLowerCase()
        return status !== 'completed' && status !== 'canceled'
      }).length

      const defaultSnoozeMinutes = await this.#getSnoozeMinutes(userId)

      return slackMsgUtils.msgAssistantQuickHelp({
        alerts: alerts.length,
        alertsPending: alertsPending.length,
        alertsOverdue,
        alertsResolved,
        alertsSnoozed: 0,
        notes: notes.length,
        tasks: tasks.length,
        tasksPending,
        defaultSnoozeMinutes,
      })
    } catch (error) {
      log.error({ err: error }, 'getAssistantQuickHelp failed')
      return 'No pude obtener tu resumen en este momento. 😅'
    }
  }
}
