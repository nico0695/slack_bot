import { ChannelType, ConversationProviders } from '../constants/conversationFlow'
import { roleTypes } from '../constants/openai'

export interface IConversation {
  role: roleTypes
  content: string
  provider: ConversationProviders
}

export interface IUserConversation extends IConversation {
  userSlackId?: string
  userId?: number
}

export interface IConversationFlow {
  createdAt: Date
  updatedAt: Date
  chanelId: string
  conversation: IUserConversation[]
  channelType: ChannelType
  socketChannel?: string
}
