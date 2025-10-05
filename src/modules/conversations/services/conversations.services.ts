import { GlobalConstants } from '../../../shared/constants/global'
import { IoServer } from '../../../config/socketConfig'

import UsersServices from '../../users/services/users.services'
import AlertsServices from '../../alerts/services/alerts.services'
import TasksServices from '../../tasks/services/tasks.services'
import NotesServices from '../../notes/services/notes.services'

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
import { assistantPromptFlagsLite, assistantPromptLite } from '../shared/constants/prompt.constants'
import * as slackMsgUtils from '../../../shared/utils/slackMessages.utils'

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

  private constructor(aiToUse = AIRepositoryType.OPENAI) {
    this.#aiRepository = AIRepositoryByType[aiToUse].getInstance()
    this.#redisRepository = RedisRepository.getInstance()

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
        content: assistantPromptLite,
        provider: ConversationProviders.ASSISTANT,
      },
      ...requestMessages,
    ]
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

            const messageToResponse =
              alerts?.data?.length > 0
                ? alerts?.data
                    ?.map(
                      (alert) =>
                        `• Id: _#${alert.id}_ - *${alert.message}*: ${formatDateToText(alert.date)}`
                    )
                    .join('\n')
                : 'No tienes alertas'

            const messageBlockToResponse = slackMsgUtils.msgAlertsList(alerts.data ?? [])

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
          content: assistantPromptFlagsLite,
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
          const contentBlock = slackMsgUtils.msgAlertsList(alerts.data ?? [])
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

      const { responseMessage } = await this.#manageAssistantVariables(userId, message)

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

  // Delete actions
  deleteActions = async (
    data: {
      actionId: string
      value: string
    },
    userId: number
  ): Promise<string> => {
    const { actionId, value } = data

    try {
      switch (actionId) {
        case 'delete_note': {
          const deleteRes = await this.#notesServices.deleteNote(parseInt(value), userId)
          return deleteRes.error ?? deleteRes.data
            ? `Nota #${value} eliminada correctamente.`
            : `Error al eliminar la nota, no se encontro la nota con Id: ${value}`
        }

        case 'delete_task': {
          const deleteRes = await this.#tasksServices.deleteTask(parseInt(value), userId)
          return deleteRes.error ?? deleteRes.data
            ? `Tarea #${value} eliminada correctamente.`
            : `Error al eliminar la tarea, no se encontro la tarea con Id: ${value}`
        }

        case 'delete_alert': {
          const deleteRes = await this.#alertsServices.deleteAlert(parseInt(value), userId)
          return deleteRes.error ?? deleteRes.data
            ? `Alerta #${value} eliminada correctamente.`
            : `Error al eliminar la alerta, no se encontro la alerta con Id: ${value}`
        }

        default:
          return 'Acción no reconocida.'
      }
    } catch (error) {
      return 'Error al ejecutar la accion. 😅'
    }
  }
}
