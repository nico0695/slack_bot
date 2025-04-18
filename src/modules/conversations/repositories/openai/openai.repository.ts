import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'

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

  chatCompletion = async (
    messages: ChatCompletionRequestMessage[]
  ): Promise<IConversation | null> => {
    try {
      const apiRequestBot = {
        model: 'gpt-3.5-turbo',
        messages: messages.map((message: any) => ({
          role: message.role,
          content: message.content,
        })),
        temperature: 0.6,
      }

      const completion = await this.#openai.createChatCompletion(apiRequestBot)

      return completion.data.choices[0].message as IConversation
    } catch (error) {
      if (error.message.includes('429')) {
        console.error('OpenAI API rate limit exceeded. Please try again later.')
      }
      return null
    }
  }
}
