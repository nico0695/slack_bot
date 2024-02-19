import { GlobalConstants } from '../../../shared/constants/global'
import { IoServer } from '../../../config/socketConfig'

import UsersServices from '../../users/services/users.services'
import AlertsServices from '../../alerts/services/alerts.services'

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
import { extractVariablesAndFlags } from '../shared/utils/conversation.utils'

import { formatDateToText } from '../../../shared/utils/dates.utils'

type TMembersNames = Record<string, string>

interface IManageAssistantMessage {
  cleanMessage: string
  variables: Record<string, string>
  flags: string[]
  responseMessage?: IConversation
}

export default class ConversationsServices {
  static #instance: ConversationsServices

  #openaiRepository: OpenaiRepository
  #redisRepository: RedisRepository

  #usersServices: UsersServices
  #alertsServices: AlertsServices

  private constructor() {
    this.#openaiRepository = OpenaiRepository.getInstance()
    this.#redisRepository = RedisRepository.getInstance()

    this.#usersServices = UsersServices.getInstance()
    this.#alertsServices = AlertsServices.getInstance()
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

    const initialPrompt =
      'Eres un asistente basado en IA con el que puedes chatear sobre cualquier cosa.'

    return [
      {
        role: roleTypes.system,
        content: initialPrompt,
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
      const messageResponse = await this.#openaiRepository.chatCompletion(promptGenerated)

      const newConversationGenerated = [...newConversation, messageResponse]

      /** Save conversation */
      await this.#redisRepository.saveConversationMessages(
        conversationKey,
        newConversationGenerated
      )

      return messageResponse.content
    } catch (error) {
      console.log('error= ', error.message)
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
    const { cleanMessage, variables, flags } = extractVariablesAndFlags(message)

    const returnValue: IManageAssistantMessage = { cleanMessage, variables, flags }

    for (const [key, value] of Object.entries(variables)) {
      console.log(`${key}: ${value}`)

      if (key === 'alert' || key === 'a') {
        const alert = await this.#alertsServices.createAssistantAlert(userId, value, cleanMessage)

        if (alert.error) {
          throw new Error(alert.error)
        }

        returnValue.responseMessage = {
          role: roleTypes.assistant,
          content: `Alerta creada correctamente para el ${formatDateToText(
            alert.data.date
          )} con id: #${alert.data.id}`,
          provider: ConversationProviders.ASSISTANT,
        }
      }

      if (key === 'question' || key === 'q') {
        const promptGenerated = await this.#generatePrompt([
          {
            role: roleTypes.user,
            content: cleanMessage,
            provider: ConversationProviders.ASSISTANT,
          },
        ])

        /** Generate conversation */
        const messageResponse = await this.#openaiRepository.chatCompletion(promptGenerated)

        if (messageResponse) {
          returnValue.responseMessage = messageResponse
        } else {
          throw new Error('No se pudo generar la respuesta')
        }
      }
    }

    return returnValue
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

      const newConversationUser = [...conversationStored, newConversation]

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
        content: 'Ups! No pude procesar tu mensaje. 😅',
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

      console.log('message= ', message)
      let skipGeneration = false
      if (message.startsWith('+')) {
        skipGeneration = true
      }
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
      const messageResponse = await this.#openaiRepository.chatCompletion(promptGenerated)

      const newConversationGenerated: IConversationFlow = {
        ...conversationFlow,
        conversation: [...newConversationUser, messageResponse],
        updatedAt: new Date(),
      }

      /** Save conversation */
      await this.#redisRepository.saveConversationFlow(channelId, newConversationGenerated)

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
}
