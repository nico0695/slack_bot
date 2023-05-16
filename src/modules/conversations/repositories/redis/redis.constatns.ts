export const rConversationKey = (userId: string, channelId?: string) =>
  channelId ? `cb_${channelId}_${userId}` : `cb_${userId}`;
