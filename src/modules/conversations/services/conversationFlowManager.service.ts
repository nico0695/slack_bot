import { createModuleLogger } from '../../../config/logger'
import { RedisRepository } from '../repositories/redis/conversations.redis'
import { IConversationFlow } from '../shared/interfaces/converstions'
import { ChannelType } from '../shared/constants/conversationFlow'

const log = createModuleLogger('conversations.flowManager')

export default class ConversationFlowManager {
  static #instance: ConversationFlowManager

  #redisRepository: RedisRepository

  private constructor() {
    this.#redisRepository = RedisRepository.getInstance()
  }

  static getInstance(): ConversationFlowManager {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ConversationFlowManager()
    return this.#instance
  }

  /**
   * Check if conversation flow is active for a given channel/user
   */
  isFlowActive = async (channelId: string): Promise<boolean> => {
    const conversationFlow = await this.#redisRepository.getConversationFlow(channelId)
    return conversationFlow !== null
  }

  /**
   * Start conversation flow
   */
  startFlow = async (channelId: string, channelType: ChannelType): Promise<string> => {
    try {
      const flowActive = await this.isFlowActive(channelId)

      if (flowActive) {
        return 'Ya existe una conversación en curso en este canal.'
      }

      const newConversation: IConversationFlow = {
        createdAt: new Date(),
        updatedAt: new Date(),
        chanelId: channelId ?? '',
        conversation: [],
        channelType,
      }

      const response = await this.#redisRepository.saveConversationFlow(channelId, newConversation)

      if (!response) {
        return 'No se pudo iniciar la conversación 🤷‍♂️'
      }

      return 'Conversación iniciada correctamente.'
    } catch (error) {
      log.error({ err: error }, 'startFlow failed')
      return null
    }
  }

  /**
   * End conversation flow
   */
  endFlow = async (channelId: string): Promise<string | null> => {
    try {
      const flowActive = await this.isFlowActive(channelId)

      if (!flowActive) {
        return 'No existe una conversación en curso en este canal.'
      }

      const response = await this.#redisRepository.deleteConversationFlow(channelId)

      if (!response) {
        return 'No se pudo finalizar la conversación 🤷‍♂️'
      }

      return 'Conversación finalizada correctamente.'
    } catch (error) {
      log.error({ err: error }, 'endFlow failed')
      return null
    }
  }

  /**
   * Get conversation flow context
   */
  getFlowContext = async (channelId: string): Promise<IConversationFlow | null> => {
    try {
      return await this.#redisRepository.getConversationFlow(channelId)
    } catch (error) {
      log.error({ err: error }, 'getFlowContext failed')
      return null
    }
  }
}
