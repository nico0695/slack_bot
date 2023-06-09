import { Router } from 'express'

import ConversationsServices from '../services/conversations.services'
import { roleTypes } from '../shared/constants/openai'
import { IConversation } from '../shared/interfaces/converstions'
import { FlowKeys } from '../shared/constants/conversationFlow'

export default class ConversationsController {
  public router: Router

  #conversationServices: ConversationsServices

  constructor() {
    this.#conversationServices = new ConversationsServices()

    this.generateConversation = this.generateConversation.bind(this)
    this.cleanConversation = this.cleanConversation.bind(this)
    this.showConversation = this.showConversation.bind(this)
  }

  /** Conversation Controllers Methods */

  /**
   *
   * @param data slack response
   */
  public generateConversation = async (data: any): Promise<void> => {
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
  public cleanConversation = async (data: any): Promise<void> => {
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
  public showConversation = async (data: any): Promise<void> => {
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
  public conversationFlow = async (data: any): Promise<void> => {
    const { payload, say, body }: any = data

    const message: string = payload.text

    switch (message) {
      case FlowKeys.START: {
        const response = await this.#conversationServices.startConversationFlow(payload.channel)
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
        say(conversation ?? 'No hay ninguna conversación guardada 🤷‍♂️')
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

          if (newResponse !== null) {
            say(newResponse)
          }
        }

        break
      }
    }
  }
}
