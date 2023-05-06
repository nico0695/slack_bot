import OpenaiRepository from '../repository/openai/openai.repository';
import RedisRepository from '../repository/redis/redis.repository';
import { roleTypes } from '../shared/constants/openai';
import { IConversation } from '../shared/interfaces/converstions';

export default class ConversationsServices {
  #openaiRepository: OpenaiRepository;
  #redisRepository: RedisRepository;

  constructor() {
    this.#openaiRepository = new OpenaiRepository();
    this.#redisRepository = new RedisRepository();

    this.generateConversation = this.generateConversation.bind(this);
  }

  #generatePrompt = async (
    conversation: IConversation[]
  ): Promise<IConversation[]> => {
    const requestMessages = conversation.map((message) => {
      return { role: message.role, content: message.content };
    });

    const initialPrompt =
      'Eres un asistente basado en IA con el que puedes chatear sobre cualquier cosa.';

    return [
      { role: roleTypes.system, content: initialPrompt },
      ...requestMessages,
    ];
  };

  generateConversation = async (
    conversation: IConversation,
    userId: string,
    channelId?: string
  ): Promise<string | null> => {
    try {
      const conversationKey = channelId
        ? `cb_${channelId}_${userId}`
        : `cb_${userId}`;

      /** Get conversation */
      const conversationStored =
        await this.#redisRepository.getConversationMessages(conversationKey);

      const newConversation = [...(conversationStored ?? []), conversation];

      const promptGenerated = await this.#generatePrompt(newConversation);

      /** Generate conversation */
      const messageResponse = await this.#openaiRepository.chatCompletion(
        promptGenerated
      );

      const newConversationGenerated = [...newConversation, messageResponse];

      /** Save conversation */
      await this.#redisRepository.saveConversationMessages(
        conversationKey,
        newConversationGenerated
      );

      return messageResponse.content;
    } catch (error) {
      console.log('error= ', error.message);
      return null;
    }
  };

  cleanConversation = async (
    userId: string,
    channelId?: string
  ): Promise<boolean> => {
    try {
      const conversationKey = channelId
        ? `cb_${channelId}_${userId}`
        : `cb_${userId}`;

      await this.#redisRepository.saveConversationMessages(conversationKey, []);

      return true;
    } catch (error) {
      console.log('error= ', error.message);
      return false;
    }
  };

  showConversation = async (
    userId: string,
    channelId?: string
  ): Promise<string | null> => {
    try {
      const conversationKey = channelId
        ? `cb_${channelId}_${userId}`
        : `cb_${userId}`;

      const conversationStored =
        await this.#redisRepository.getConversationMessages(conversationKey);

      if (conversationStored.length === 0) return null;

      return conversationStored
        .map((message) => {
          return `${message.role === roleTypes.assistant ? 'bot' : userId}: ${
            message.content
          }`;
        })
        .join('\n');
    } catch (error) {
      console.log('error= ', error.message);
      return null;
    }
  };
}
