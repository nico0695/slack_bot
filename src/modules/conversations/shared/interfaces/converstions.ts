import { ChannelType } from '../constants/conversationFlow'

export interface IConversation {
  role: string
  content: string
}

export interface IUserConversation extends IConversation {
  userSlackId?: string
}

export interface IConversationFlow {
  createdAt: Date
  updatedAt: Date
  chanelId: string
  conversation: IUserConversation[]
  channelType: ChannelType
}
