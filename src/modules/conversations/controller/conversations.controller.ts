import { Router } from 'express'

import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/genericController'

import ConversationsServices from '../services/conversations.services'
import MessageProcessor from '../services/messageProcessor.service'
import ConversationFlowManager from '../services/conversationFlowManager.service'

import { roleTypes } from '../shared/constants/openai'
import { IConversation, ProgressCallback } from '../shared/interfaces/converstions'
import { ChannelType, ConversationProviders, FlowKeys } from '../shared/constants/conversationFlow'
import { SlackAuth, SlackAuthActions } from '../../../shared/middleware/auth'
import { rPersonalConversationFlow } from '../repositories/redis/redis.constants'

const log = createModuleLogger('conversations.controller')

export default class ConversationsController extends GenericController {
  static #instance: ConversationsController

  public router: Router

  #conversationServices: ConversationsServices
  #messageProcessor: MessageProcessor
  #flowManager: ConversationFlowManager

  private constructor() {
    super()

    this.#conversationServices = ConversationsServices.getInstance()
    this.#messageProcessor = MessageProcessor.getInstance()
    this.#flowManager = ConversationFlowManager.getInstance()

    this.generateConversation = this.generateConversation.bind(this)
    this.cleanConversation = this.cleanConversation.bind(this)
    this.showConversation = this.showConversation.bind(this)
    this.conversationFlow = this.conversationFlow.bind(this)
    this.handleActions = this.handleActions.bind(this)
  }

  static getInstance(): ConversationsController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ConversationsController()
    return this.#instance
  }

  /** Conversation Controllers Methods */

  /**
   *
   * @param data slack response
   */
  @SlackAuth
  public async generateConversation(data: any): Promise<void> {
    const { payload, say }: any = data

    try {
      const newMessage: string = payload.text.replace('cb', '').trimStart()

      const newMessageFormated: IConversation = {
        role: roleTypes.user,
        content: newMessage,
        provider: ConversationProviders.SLACK,
      }

      const newResponse = await this.#conversationServices.generateConversation(
        newMessageFormated,
        payload.user,
        payload.channel
      )

      if (newResponse) {
        say(newResponse)
      } else {
        throw new Error('No se pudo generar la conversación')
      }
    } catch (error) {
      log.error({ err: error }, 'generateConversation failed')
      say('Ups! Ocurrió un error al procesar tu solicitud 🤷‍♂️')
    }
  }

  /**
   * Clean conversation
   * @param data slack response
   */
  @SlackAuth
  public async cleanConversation(data: any): Promise<void> {
    const { payload, say }: any = data

    try {
      const message: string = payload.text

      if (message !== 'clean_cb') {
        await this.#conversationServices.cleanConversation(payload.user, payload.channel)
        say('Se borro la conversación con éxito 🎉')
      }
    } catch (error) {
      log.error({ err: error }, 'Slack conversation action failed')
    }
  }

  /**
   * Clean conversation
   * @param data slack response
   */
  @SlackAuth
  public async showConversation(data: any): Promise<void> {
    const { payload, say, body }: any = data

    try {
      const conversation = await this.#conversationServices.showConversation(
        payload.user,
        payload.channel,
        body.team_id
      )

      say(conversation ?? 'No hay ninguna conversación guardada 🤷‍♂️')
    } catch (error) {
      log.error({ err: error }, 'Slack conversation action failed')
    }
  }

  /**
   * Manage conversation flow between users and bot (unified for personal and channels)
   */
  @SlackAuth
  public async conversationFlow(data: any): Promise<void> {
    const { payload, say, body }: any = data
    try {
      const incomingMessage = String(payload.text ?? '')
      const normalizedMessage = incomingMessage.trim().toLowerCase()

      const isPersonal = payload.channel_type === 'im'
      const userData = this.userData

      if (!userData) {
        say('Ups! No se pudo obtener tu información 🤷‍♂️')
        return
      }

      // Handle help command
      if (normalizedMessage === 'h' || normalizedMessage === 'help') {
        const scopedChannelId =
          !isPersonal && typeof payload.channel === 'string' ? payload.channel.trim() : undefined
        const quickHelp = await this.#conversationServices.getAssistantQuickHelp(userData.id, {
          channelId: scopedChannelId,
          isChannelContext: !isPersonal,
        })
        say(quickHelp ?? 'No pude mostrar tu resumen ahora mismo.')
        return
      }

      // Determine flow key (personal uses userId, channels use channelId)
      const flowKey = isPersonal
        ? rPersonalConversationFlow(userData.id.toString())
        : payload.channel

      // Handle flow commands (start/end/show)
      switch (normalizedMessage) {
        case FlowKeys.START: {
          const response = await this.#flowManager.startFlow(flowKey, ChannelType.SLACK)
          say(response ?? 'No se pudo iniciar la conversación 🤷‍♂️')
          return
        }
        case FlowKeys.END: {
          const response = await this.#flowManager.endFlow(flowKey)
          say(response ?? 'No se pudo finalizar la conversación 🤷‍♂️')
          return
        }
        case FlowKeys.SHOW: {
          const conversation = await this.#conversationServices.showConversationFlow(
            flowKey,
            body.team_id
          )
          say(conversation?.join('\n') ?? 'No hay ninguna conversación guardada 🤷‍♂️')
          return
        }
      }

      // Determine channelId for entity creation (null for IM, channelId for channels)
      const channelId = isPersonal ? undefined : payload.channel

      // Check if flow is active
      const flowActive = await this.#flowManager.isFlowActive(flowKey)

      if (flowActive) {
        // Flow mode: send with context
        await this.#handleFlowMessage(
          incomingMessage,
          payload.user,
          flowKey,
          userData.id,
          channelId,
          say
        )
      } else {
        // Assistant mode: process as single message
        await this.#handleAssistantMessage(incomingMessage, userData.id, isPersonal, channelId, say)
      }
    } catch (error) {
      log.error({ err: error }, 'conversationFlow failed')
      say('Ups! Ocurrió un error al procesar tu solicitud 🤷‍♂️')
    }
  }

  /**
   * Handle message in flow mode (with context)
   */
  #handleFlowMessage = async (
    message: string,
    userSlackId: string,
    flowKey: string,
    userId: number,
    channelId: string | undefined,
    say: any
  ): Promise<void> => {
    // Check if should skip AI generation
    if (this.#messageProcessor.shouldSkipAI(message)) {
      const cleanMessage = this.#messageProcessor.cleanSkipFlag(message)
      await this.#conversationServices.sendMessageToConversationFlow(
        cleanMessage,
        userSlackId,
        flowKey
      )
      return
    }

    // Generate with AI using full context
    const newResponse = await this.#conversationServices.generateConversationFlow(
      message,
      userSlackId,
      flowKey
    )

    if (newResponse) {
      say(newResponse.content)
    }
  }

  /**
   * Handle message in assistant mode (unified with Web)
   * Uses generateAssistantConversation for consistent behavior and history saving
   */
  #handleAssistantMessage = async (
    message: string,
    userId: number,
    isPersonal: boolean,
    channelId: string | undefined,
    say: any
  ): Promise<void> => {
    // Process with MessageProcessor
    const isChannelContext = !isPersonal
    const scopedChannelId =
      typeof channelId === 'string' && channelId.trim().length > 0 ? channelId.trim() : undefined
    const onProgress: ProgressCallback = (msg) => say(msg)
    const result = await this.#messageProcessor.processAssistantMessage(
      message,
      userId,
      scopedChannelId,
      isChannelContext,
      undefined,
      onProgress
    )

    if (result.response) {
      say(result.response.contentBlock ?? result.response.content)
    }
  }

  @SlackAuthActions
  public async handleActions({ ack, body, say }: any): Promise<void> {
    await ack()

    const userData = this.userData
    const actionPayload = body?.actions?.[0]

    if (!actionPayload) {
      await say('Ups! No se encontró la acción en la solicitud 🤷‍♂️')
      return
    }

    const parsedAction = this.parseSlackAction(actionPayload)

    if (!parsedAction) {
      await say('Ups! Acción no reconocida 🤷‍♂️')
      return
    }

    const rawChannelId = String(body?.channel?.id ?? '')
    const channelType = String(body?.channel?.type ?? '')
    const isChannelContext = channelType !== 'im' && rawChannelId.trim().length > 0
    const scopedChannelId = isChannelContext ? rawChannelId.trim() : undefined

    const response = await this.#conversationServices.handleAction(parsedAction, userData.id, {
      channelId: scopedChannelId,
      isChannelContext,
    })

    await say(response ?? 'No se pudo procesar la acción 🤷‍♂️')
  }

  private parseSlackAction(
    action: any
  ): { entity: string; operation: string; targetId: number } | null {
    const actionId = String(action?.action_id ?? '').trim()
    const rawValue = String(action?.selected_option?.value ?? action?.value ?? '').trim()

    if (!actionId) {
      return null
    }

    const normalizeOperation = (operation: string): string => {
      const op = operation.toLowerCase()
      if (op === 'view' || op === 'details' || op === 'detalle') {
        return 'detail'
      }
      if (op === 'list' || op === 'listar' || op === 'lista') {
        return 'list'
      }
      return op
    }

    const normalizedValue = rawValue.toLowerCase()
    const valueTripleMatch = normalizedValue.match(/^([a-z]+):([a-z0-9_-]+):(\d+)$/)

    if (valueTripleMatch) {
      const [, entity, operation, targetId] = valueTripleMatch
      return {
        entity,
        operation: normalizeOperation(operation),
        targetId: Number(targetId),
      }
    }

    const valueDoubleMatch = normalizedValue.match(/^([a-z0-9_-]+):(\d+)$/)
    if (valueDoubleMatch) {
      const [, combined, targetId] = valueDoubleMatch
      const [operationRaw, entityRaw] = combined.split('_')

      if (operationRaw && entityRaw) {
        return {
          entity: entityRaw,
          operation: normalizeOperation(operationRaw),
          targetId: Number(targetId),
        }
      }
    }

    if (/^\d+$/.test(normalizedValue)) {
      const legacyMatch = actionId
        .toLowerCase()
        .match(/^(delete|view)_(alert|note|task)(?:_details)?$/)

      if (legacyMatch) {
        const [, operationRaw, entity] = legacyMatch

        return {
          entity,
          operation: normalizeOperation(operationRaw),
          targetId: Number(normalizedValue),
        }
      }
    }

    const normalizedActionId = actionId.toLowerCase()
    const extendedMatch = normalizedActionId.match(/^([a-z]+)_actions(?::([a-z0-9_-]+))?:(\d+)$/)

    if (extendedMatch) {
      const [, entity, operationRaw, targetId] = extendedMatch

      return {
        entity,
        operation: normalizeOperation(operationRaw ?? 'detail'),
        targetId: Number(targetId),
      }
    }

    const fallbackMatch = normalizedActionId.match(/^([a-z]+)_actions:(\d+)$/)

    if (fallbackMatch && /^\d+$/.test(normalizedValue)) {
      const [, entity, targetId] = fallbackMatch

      return {
        entity,
        operation: 'detail',
        targetId: Number(targetId),
      }
    }

    return null
  }
}
