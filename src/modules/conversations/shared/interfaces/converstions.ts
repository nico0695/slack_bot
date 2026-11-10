import { ChannelType, ConversationProviders } from '../constants/conversationFlow'
import { roleTypes } from '../constants/openai'

export interface IConversation {
  role: roleTypes
  content: string
  contentBlock?: { blocks: any[] } // For slack block messages
  plainText?: string // Text version for clients without blocks; ignored by Slack and web
  contentOmitted?: boolean // plainText leaves out content those clients cannot show
  provider: ConversationProviders
}

// Text-only entry of the personal assistant context (no blocks, no binary content)
export interface IAssistantContextEntry {
  role: roleTypes.user | roleTypes.assistant
  content: string
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
