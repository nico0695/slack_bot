import { GlobalConstants } from '../../../shared/constants/global'

import UsersServices from '../../users/services/users.services'

import OpenaiRepository from '../repositories/openai/openai.repository'
import { roleTypes } from '../shared/constants/openai'

import RedisRepository from '../repositories/redis/redis.repository'
import { rConversationKey } from '../repositories/redis/redis.constatns'

import {
  IConversation,
  IConversationFlow,
  IUserConversation,
} from '../shared/interfaces/converstions'

type TMembersNames = Record<string, string>

export default class ConversationsServices {
  #openaiRepository: OpenaiRepository
  #redisRepository: RedisRepository

  #usersServices: UsersServices

  constructor() {
    this.#openaiRepository = new OpenaiRepository()
    this.#redisRepository = new RedisRepository()

    this.#usersServices = new UsersServices()

    this.generateConversation = this.generateConversation.bind(this)
  }

  #generatePrompt = async (conversation: IConversation[]): Promise<IConversation[]> => {
    const requestMessages = conversation.map((message) => {
      return { role: message.role, content: message.content }
    })

    const initialPrompt =
      'Eres un asistente basado en IA con el que puedes chatear sobre cualquier cosa.'

    return [{ role: roleTypes.system, content: initialPrompt }, ...requestMessages]
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

  startConversationFlow = async (channelId?: string): Promise<string | null> => {
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
  ): Promise<string | null> => {
    try {
      /** Get conversation */
      const conversationFlow = await this.#redisRepository.getConversationFlow(channelId)

      if (conversationFlow === null) {
        return 'No existe una conversación en curso en este canal.'
      }

      let skipGeneration = false
      if (message.startsWith('+')) {
        skipGeneration = true
      }
      const messageFormated = message.replace('+', '').trimStart()

      const newConversation: IUserConversation = {
        role: roleTypes.user,
        content: messageFormated,
        userSlackId,
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

      return messageResponse.content
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  showConversationFlow = async (channelId: string, teamId?: string): Promise<string | null> => {
    try {
      /** Get conversation */
      const conversationFlow = await this.#redisRepository.getConversationFlow(channelId)

      if (conversationFlow === null) {
        return 'No existe una conversación en curso en este canal.'
      }

      const { conversation: conversationStored } = conversationFlow

      const membersNames = await this.#getTeamMembers(teamId)

      return conversationStored
        .map((message) => {
          return `${
            message.role === roleTypes.assistant
              ? GlobalConstants.BOT_NAME
              : membersNames[message.userSlackId] ?? message.userSlackId
          }: ${message.content}`
        })
        .join('\n')
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }
}
