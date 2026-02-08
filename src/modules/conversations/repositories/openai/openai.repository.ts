import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'

import { createModuleLogger } from '../../../../config/logger'
import { IConversation } from '../../shared/interfaces/converstions'

const log = createModuleLogger('openai.conversations')

export default class OpenaiRepository {
  private static instance: OpenaiRepository

  private openai: OpenAIApi

  private constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
      organization: 'org-dlzE8QUXcRrvBN096fSCdHBf',
    })

    this.openai = new OpenAIApi(configuration)

    this.chatCompletion = this.chatCompletion.bind(this)
  }

  static getInstance(): OpenaiRepository {
    if (this.instance) {
      return this.instance
    }

    this.instance = new OpenaiRepository()
    return this.instance
  }

  chatCompletion = async (
    messages: ChatCompletionRequestMessage[],
    options?: { mode?: 'classification' | 'default' }
  ): Promise<IConversation | null> => {
    try {
      const mode = options?.mode || 'default'

      const isClassification = mode === 'classification'

      const apiRequestBot = {
        model: isClassification ? 'gpt-4o-mini' : 'gpt-4o-mini',
        messages: messages.map((message: any) => ({
          role: message.role,
          content: message.content,
        })),
        temperature: isClassification ? 0 : 0.4,
        max_tokens: isClassification ? 200 : undefined,
      }

      const completion = await this.openai.createChatCompletion(apiRequestBot)

      return completion.data.choices[0].message as IConversation
    } catch (error) {
      if (error.message.includes('429')) {
        log.warn('OpenAI API rate limit exceeded')
      } else {
        log.error({ err: error }, 'OpenAI API chatCompletion failed')
      }
      return null
    }
  }
}
