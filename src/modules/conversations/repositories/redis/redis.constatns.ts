export const rConversationKey = (userId: string, channelId?: string): string =>
  channelId ? `cb_${channelId}_${userId}` : `cb_${userId}`

export const rConversationFlow = (channelId?: string): string => `cb_fs_${channelId}`
