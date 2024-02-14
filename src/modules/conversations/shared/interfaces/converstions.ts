import { ChannelType, ConversationProviders } from '../constants/conversationFlow'

export interface IConversation {
  role: string
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
