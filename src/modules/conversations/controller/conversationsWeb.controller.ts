import { Router } from 'express'
import { injectable } from 'tsyringe'

import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/genericController'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'
import { validateBody } from '../../../shared/utils/validation'
import ConversationsServices from '../services/conversations.services'
import AssistantSingleShotService from '../services/assistantSingleShot.service'

import {
  IConversation,
  IUserConversation,
  ProgressCallback,
} from '../shared/interfaces/converstions'
import { ChannelType, ConversationProviders } from '../shared/constants/conversationFlow'
import { roleTypes } from '../shared/constants/openai'
import UsersServices from '../../users/services/users.services'
import {
  AssistantSingleShotStatus,
  getAssistantRestLimits,
} from '../shared/constants/assistantSingleShot.constants'
import { buildAssistantRequestSchema } from '../shared/schemas/assistantSingleShot.schemas'

const log = createModuleLogger('conversations.webController')

@injectable()
export default class ConversationsWebController extends GenericController {
  public router: Router

  constructor(
    private conversationServices: ConversationsServices,
    private usersServices: UsersServices,
    private assistantSingleShotService: AssistantSingleShotService
  ) {
    super()
    this.assistantMessage = this.assistantMessage.bind(this)

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/show-channels', this.showChannels)
    this.router.post('/close-channel', this.closeChannel)
    this.router.post('/assistant', this.assistantMessage)
  }

  /**
   * Single-shot assistant request (bridge / ESP32): one message, one final result.
   * 200 when completed, 500 when the result could not be confirmed.
   */
  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async assistantMessage(req: any, res: any): Promise<void> {
    // Read the user before any await: the controller instance is shared between requests
    const user = this.userData
    const { maxInputChars } = getAssistantRestLimits()
    const parsed = validateBody(buildAssistantRequestSchema(maxInputChars), req.body)

    const result = await this.assistantSingleShotService.processMessage(
      parsed.request_id,
      parsed.message,
      user.id
    )

    res.status(result.status === AssistantSingleShotStatus.COMPLETED ? 200 : 500).send(result)
  }

  public joinChannel = async (data: {
    channel: string
    username: string
  }): Promise<{
    message: string
    conversation: IUserConversation[]
  }> => {
    const response = await this.conversationServices.startConversationFlow(
      data.channel,
      ChannelType.WEB
    )

    const conversationFlow = await this.conversationServices.showConversationFlowWeb(data.channel)

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
      const conversationFlow = await this.conversationServices.showConversationFlowWeb(data.channel)

      return {
        message: 'Conversación iniciada',
        conversation: conversationFlow?.conversation ?? [],
      }
    } catch (error) {
      log.error({ err: error }, 'joinAssistantChannel failed')
    }
  }

  public generateConversation = async (data: {
    username: string
    channel: string
    message: string
    iaEnabled?: boolean
  }): Promise<IConversation | null> => {
    try {
      const newMessage: string = data.message

      if (data.iaEnabled) {
        const newResponse = await this.conversationServices.generateConversationFlow(
          newMessage,
          data.username,
          data.channel
        )

        return newResponse
      }

      await this.conversationServices.sendMessageToConversationFlow(
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

  public conversationAssistantFlow = async (
    userId: number,
    message: string,
    onProgress?: ProgressCallback
  ): Promise<IConversation | null> => {
    try {
      const userData = await this.usersServices.getUserById(userId)

      if (!userData.data) {
        return {
          role: roleTypes.assistant,
          content: 'No se pudo obtener el usuario 🤷‍♂️',
          provider: ConversationProviders.ASSISTANT,
        }
      }

      const result = await this.conversationServices.generateAssistantConversation(
        message,
        userId,
        userId.toString().padStart(8, '9'),
        ConversationProviders.WEB,
        false,
        onProgress
      )

      return result.response
    } catch (error) {
      log.error({ err: error }, 'conversationAssistantFlow failed')
      return null
    }
  }

  public showChannels = async (req: any, res: any): Promise<void> => {
    const response = await this.conversationServices.showChannelsConversationFlow()
    res.send(response)
  }

  public closeChannel = async (req: any, res: any): Promise<void> => {
    const { channelId } = req.body

    const response = await this.conversationServices.endConversationFlow(channelId)

    res.send(response)
  }
}
