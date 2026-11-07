import { Router } from 'express'
import { Socket } from 'socket.io'
import { injectable } from 'tsyringe'

import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/genericController'
import { HttpAuth, Permission, getAuthenticatedUser } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'
import { validateBody } from '../../../shared/utils/validation'
import ConversationsServices from '../services/conversations.services'
import AssistantSingleShotService from '../services/assistantSingleShot.service'

import { IConversation, IUserConversation } from '../shared/interfaces/converstions'
import { ChannelType } from '../shared/constants/conversationFlow'
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

  public joinAssistantChannel = async (
    userId: number
  ): Promise<{
    message: string
    conversation: IUserConversation[]
  }> => ({
    message: 'Conversación iniciada',
    conversation: await this.conversationServices.getWebAssistantHistory(userId),
  })

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

  /** Assistant events use verified identities; generic anonymous chat stays independent. */
  public registerAssistantSocket = (socket: Socket): void => {
    let generation = 0
    let userId: number | undefined
    const invalidate = (): void => {
      generation++
      userId = undefined
    }
    const isCurrent = (version: number): boolean => generation === version && socket.connected
    const reject = (): void => {
      socket.emit('assistant_error', { message: 'No se pudo procesar la solicitud del asistente.' })
    }
    const allowed = (profile: Profiles | undefined): boolean =>
      profile !== undefined &&
      [Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN].includes(profile)

    socket.on('join_assistant_room', async (data) => {
      invalidate()
      const version = generation
      try {
        const user = await getAuthenticatedUser(data?.accessToken)
        if (!isCurrent(version)) return
        if (!allowed(user.profile)) throw new Error('Assistant access denied')
        userId = user.id
        const response = await this.joinAssistantChannel(user.id)
        if (isCurrent(version)) socket.emit('join_assistant_response', response)
      } catch {
        if (isCurrent(version)) {
          invalidate()
          reject()
        }
      }
    })

    socket.on('send_assistant_message', async (data, acknowledge) => {
      const version = generation
      const ack = (result: { ok: boolean; skipped?: boolean }): void => {
        if (isCurrent(version) && typeof acknowledge === 'function') acknowledge(result)
      }
      try {
        const user = await getAuthenticatedUser(data?.accessToken)
        if (!isCurrent(version)) return
        if (userId !== user.id || !allowed(user.profile)) {
          throw new Error('Assistant session mismatch')
        }
        if (typeof data?.message !== 'string' || !data.message.trim()) {
          throw new Error('Invalid assistant message')
        }
        const result = await this.conversationServices.generateAssistantConversation(
          data.message.trim(),
          user.id,
          (progress) => {
            if (isCurrent(version)) socket.emit('receive_assistant_progress', progress)
          }
        )
        if (!isCurrent(version)) return
        if (result.response) socket.emit('receive_assistant_message', result.response)
        else if (!result.skipped) reject()
        ack({ ok: Boolean(result.response) || result.skipped, skipped: result.skipped })
      } catch {
        if (isCurrent(version)) {
          reject()
          ack({ ok: false })
        }
      }
    })

    socket.on('leave_assistant_room', invalidate)
    socket.on('disconnect', invalidate)
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
