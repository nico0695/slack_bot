import { Router } from 'express'

import { createModuleLogger } from '../../../config/logger'
import ConversationsServices from '../services/conversations.services'

import { IConversation, IUserConversation } from '../shared/interfaces/converstions'
import { ChannelType, ConversationProviders } from '../shared/constants/conversationFlow'
import { roleTypes } from '../shared/constants/openai'
import UsersServices from '../../users/services/users.services'

const log = createModuleLogger('conversations.webController')

export default class ConversationsWebController {
  static #instance: ConversationsWebController

  public router: Router

  #conversationServices: ConversationsServices
  #usersServices: UsersServices

  private constructor() {
    this.#conversationServices = ConversationsServices.getInstance()
    this.#usersServices = UsersServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): ConversationsWebController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ConversationsWebController()
    return this.#instance
  }

  protected registerRoutes(): void {
    this.router.get('/show-channels', this.showChannels)
    this.router.post('/close-channel', this.closeChannel)
  }

  /** Conversation Controllers Methods */

  public joinChannel = async (data: {
    channel: string
    username: string
  }): Promise<{
    message: string
    conversation: IUserConversation[]
  }> => {
    const response = await this.#conversationServices.startConversationFlow(
      data.channel,
      ChannelType.WEB
    )

    const conversationFlow = await this.#conversationServices.showConversationFlowWeb(data.channel)

    return {
      message: response ?? 'No se pudo iniciar la conversación 🤷‍♂️',
      conversation: conversationFlow.conversation ?? [],
    }
  }

  public joinAssistantChannel = async (data: {
    channel: string
    username: string
  }): Promise<{
    message: string
    conversation: IUserConversation[]
  }> => {
    try {
      const conversationFlow = await this.#conversationServices.showConversationFlowWeb(
        data.channel
      )

      return {
        message: 'Conversación iniciada',
        conversation: conversationFlow?.conversation ?? [],
      }
    } catch (error) {
      log.error({ err: error }, 'joinAssistantChannel failed')
    }
  }

  /**
   *
   * @param data { username, channel, message, iaEnabled }
   */
  public generateConversation = async (data: {
    username: string
    channel: string
    message: string
    iaEnabled?: boolean
  }): Promise<IConversation | null> => {
    try {
      const newMessage: string = data.message

      if (data.iaEnabled) {
        const newResponse = await this.#conversationServices.generateConversationFlow(
          newMessage,
          data.username,
          data.channel
        )

        return newResponse
      }

      await this.#conversationServices.sendMessageToConversationFlow(
        newMessage,
        data.username,
        data.channel
      )

      return null
    } catch (error) {
      log.error({ err: error }, 'generateConversation failed')
      return null
    }
  }

  /**
   * Manage assistant conversation (unified with Slack)
   * Skip AI by prefixing message with "+"
   */
  public conversationAssistantFlow = async (
    userId: number,
    message: string
  ): Promise<IConversation | null> => {
    try {
      const userData = await this.#usersServices.getUserById(userId)

      if (!userData.data) {
        return {
          role: roleTypes.assistant,
          content: 'No se pudo obtener el usuario 🤷‍♂️',
          provider: ConversationProviders.ASSISTANT,
        }
      }

      const result = await this.#conversationServices.generateAssistantConversation(
        message,
        userId,
        userId.toString().padStart(8, '9'),
        ConversationProviders.WEB
      )

      // Return response (null if skipped with "+")
      return result.response
    } catch (error) {
      log.error({ err: error }, 'conversationAssistantFlow failed')
      return null
    }
  }

  // ROUTES

  public showChannels = async (req: any, res: any): Promise<void> => {
    const response = await this.#conversationServices.showChannelsConversationFlow()

    res.send(response)
  }

  public closeChannel = async (req: any, res: any): Promise<void> => {
    const { channelId } = req.body

    const response = await this.#conversationServices.endConversationFlow(channelId)

    res.send(response)
  }
}
