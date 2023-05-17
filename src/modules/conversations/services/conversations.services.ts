import { GlobalConstants } from '../../../shared/constants/global'

import UsersServices from '../../users/services/users.services'

import OpenaiRepository from '../repositories/openai/openai.repository'
import { roleTypes } from '../shared/constants/openai'

import RedisRepository from '../repositories/redis/redis.repository'
import { rConversationKey } from '../repositories/redis/redis.constatns'

import { IConversation } from '../shared/interfaces/converstions'

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
}
