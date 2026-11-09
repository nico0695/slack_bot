import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'
import { singleton } from 'tsyringe'

import { createModuleLogger } from '../../../../config/logger'
import { IConversation } from '../../shared/interfaces/converstions'

const log = createModuleLogger('openai.conversations')

@singleton()
export default class OpenaiRepository {
  private openai: OpenAIApi

  constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
      organization: 'org-dlzE8QUXcRrvBN096fSCdHBf',
    })

    this.openai = new OpenAIApi(configuration)

    this.chatCompletion = this.chatCompletion.bind(this)
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
        max_tokens: isClassification ? 400 : undefined,
      }

      const completion = await this.openai.createChatCompletion(apiRequestBot)

      const choice = completion.data.choices[0]

      // Metadata only: a cut-off classification yields invalid JSON downstream
      if (isClassification && choice.finish_reason !== 'stop') {
        log.warn(
          {
            finishReason: choice.finish_reason,
            model: apiRequestBot.model,
            promptTokens: completion.data.usage?.prompt_tokens,
            completionTokens: completion.data.usage?.completion_tokens,
            totalTokens: completion.data.usage?.total_tokens,
          },
          'OpenAI classification did not finish normally'
        )
      }

      return choice.message as IConversation
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
