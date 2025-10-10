import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'

import ConversationsServices from '../services/conversations.services'

import { roleTypes } from '../shared/constants/openai'
import { IConversation } from '../shared/interfaces/converstions'
import { ChannelType, ConversationProviders, FlowKeys } from '../shared/constants/conversationFlow'
import { SlackAuth, SlackAuthActions } from '../../../shared/middleware/auth'

export default class ConversationsController extends GenericController {
  static #instance: ConversationsController

  public router: Router

  #conversationServices: ConversationsServices

  private constructor() {
    super()

    this.#conversationServices = ConversationsServices.getInstance()

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
      console.log('err= ', error)
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
      console.log('err= ', error)
    }
  }

  /**
   * Manage conversation flow between users and bot
   */
  @SlackAuth
  public async conversationFlow(data: any): Promise<void> {
    console.log('## Conversation Flow ##')
    const { payload, say, body }: any = data
    try {
      const incomingMessage = String(payload.text ?? '')
      const normalizedMessage = incomingMessage.trim().toLowerCase()

      // Personal conversation
      if (payload.channel_type === 'im') {
        const userData = this.userData

        if (!userData) {
          say('Ups! No se pudo obtener tu información 🤷‍♂️')
          return
        }

        if (normalizedMessage === 'h' || normalizedMessage === 'help') {
          const quickHelp = await this.#conversationServices.getAssistantQuickHelp(userData.id)
          say(quickHelp ?? 'No pude mostrar tu resumen ahora mismo.')
          return
        }

        const newMessage: string = incomingMessage

        const newResponse = await this.#conversationServices.generateAssistantConversation(
          newMessage,
          userData?.id ?? payload.user,
          userData?.id.toString().padStart(8, '9') ?? payload.user,
          ConversationProviders.SLACK
        )

        if (newResponse) {
          say(newResponse?.contentBlock ?? newResponse.content)
        }
        return
      }

      // Channel conversation
      if (normalizedMessage === 'h' || normalizedMessage === 'help') {
        const userData = this.userData
        if (!userData) {
          say('Ups! No se pudo obtener tu información 🤷‍♂️')
          return
        }

        const quickHelp = await this.#conversationServices.getAssistantQuickHelp(userData.id)
        say(quickHelp ?? 'No pude mostrar tu resumen ahora mismo.')
        return
      }

      const message: string = incomingMessage

      switch (message.toLocaleLowerCase()) {
        case FlowKeys.START: {
          const response = await this.#conversationServices.startConversationFlow(
            payload.channel,
            ChannelType.SLACK
          )
          say(response ?? 'No se pudo iniciar la conversación 🤷‍♂️')
          break
        }
        case FlowKeys.END: {
          const response = await this.#conversationServices.endConversationFlow(payload.channel)
          say(response ?? 'No se pudo finalizar la conversación 🤷‍♂️')
          break
        }
        case FlowKeys.SHOW: {
          const conversation = await this.#conversationServices.showConversationFlow(
            payload.channel,
            body.team_id
          )
          say(conversation?.join('\n') ?? 'No hay ninguna conversación guardada 🤷‍♂️')
          break
        }

        default: {
          const conversationStarted = await this.#conversationServices.conversationFlowStarted(
            payload.channel
          )

          if (conversationStarted) {
            const newResponse = await this.#conversationServices.generateConversationFlow(
              message,
              payload.user,
              payload.channel
            )

            say(newResponse?.content ?? 'No existe una conversación en curso en este canal.')
          }

          break
        }
      }
    } catch (error) {
      say('Ups! Ocurrió un error al procesar tu solicitud 🤷‍♂️')
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

    const response = await this.#conversationServices.handleAction(parsedAction, userData.id)

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
