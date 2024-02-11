import { Router } from 'express'

import ConversationsServices from '../services/conversations.services'
import UsersServices from '../../users/services/users.services'

import { roleTypes } from '../shared/constants/openai'
import { IConversation } from '../shared/interfaces/converstions'
import { ChannelType, FlowKeys } from '../shared/constants/conversationFlow'

export default class ConversationsController {
  static #instance: ConversationsController

  public router: Router

  #conversationServices: ConversationsServices
  #usersServices: UsersServices

  private constructor() {
    this.#conversationServices = ConversationsServices.getInstance()
    this.#usersServices = UsersServices.getInstance()

    this.generateConversation = this.generateConversation.bind(this)
    this.cleanConversation = this.cleanConversation.bind(this)
    this.showConversation = this.showConversation.bind(this)
    this.conversationFlow = this.conversationFlow.bind(this)
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
  public async generateConversation(data: any): Promise<void> {
    console.log('### generateConversation ###')
    const { payload, say }: any = data

    try {
      const newMessage: string = payload.text.replace('cb', '').trimStart()

      const newMessageFormated: IConversation = {
        role: roleTypes.user,
        content: newMessage,
      }

      const newResponse = await this.#conversationServices.generateConversation(
        newMessageFormated,
        payload.user,
        payload.channel
      )

      say(newResponse)
    } catch (error) {
      console.log('err= ', error)
    }
  }

  /**
   * Clean conversation
   * @param data slack response
   */
  public async cleanConversation(data: any): Promise<void> {
    console.log('### cleanConversation ###')
    const { payload, say }: any = data

    try {
      const message: string = payload.text

      if (message !== 'clean_cb') {
        const newResponse = await this.#conversationServices.cleanConversation(
          payload.user,
          payload.channel
        )

        console.log('newResponse= ', newResponse)
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
  public async showConversation(data: any): Promise<void> {
    console.log('### showConversation ###')
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
  public async conversationFlow(data: any): Promise<void> {
    const { payload, say, body }: any = data

    if (payload.channel_type === 'im') {
      const newMessage: string = payload.text.replace('cb', '').trimStart()

      const newMessageFormated: IConversation = {
        role: roleTypes.user,
        content: newMessage,
      }

      const userData = await this.#usersServices.getOrCreateUserBySlackId(payload.user)

      if (!userData.data) {
        say('Ups! No se pudo obtener tu información 🤷‍♂️')
        return
      }

      const newResponse = await this.#conversationServices.generateAssistantConversation(
        newMessageFormated,
        userData?.data?.id ?? payload.user
      )

      say(newResponse)
      return
    }

    const message: string = payload.text

    switch (message) {
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
          console.log('### generateConversationFlow ###')

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
  }
}
