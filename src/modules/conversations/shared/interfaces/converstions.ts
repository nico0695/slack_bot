import { ChannelType, ConversationProviders } from '../constants/conversationFlow'
import { roleTypes } from '../constants/openai'

export interface IConversation {
  role: roleTypes
  content: string
  contentBlock?: { blocks: any[] } // For slack block messages
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

export interface IAssistantResponse {
  response: IConversation | null
  skipped: boolean
}

export type ProgressCallback = (message: string) => void
