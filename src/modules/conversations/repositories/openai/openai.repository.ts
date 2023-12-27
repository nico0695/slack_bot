import { Configuration, OpenAIApi } from 'openai'
import { IConversation } from '../../shared/interfaces/converstions'

export default class OpenaiRepository {
  static #instance: OpenaiRepository

  #openai

  private constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
      organization: 'org-dlzE8QUXcRrvBN096fSCdHBf',
    })

    this.#openai = new OpenAIApi(configuration)

    this.chatCompletion = this.chatCompletion.bind(this)
  }

  static getInstance(): OpenaiRepository {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new OpenaiRepository()
    return this.#instance
  }

  chatCompletion = async (messages: any): Promise<IConversation | null> => {
    try {
      const apiRequestBot = {
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.6,
      }

      const completion = await this.#openai.createChatCompletion(apiRequestBot)

      return completion.data.choices[0].message
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }
}
