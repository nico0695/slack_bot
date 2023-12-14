export const rConversationKey = (userId: string, channelId?: string): string =>
  channelId ? `cb_${channelId}_${userId}` : `cb_${userId}`

export const conversationFlowPrefix = 'cb_fs_'
export const rConversationFlow = (channelId?: string): string =>
  `${conversationFlowPrefix}${channelId}`
