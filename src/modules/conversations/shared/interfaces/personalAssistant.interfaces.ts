import { IConversation } from './converstions'

export interface IProcessMessageResult {
  response: IConversation | null
  shouldSkipAI: boolean
}
