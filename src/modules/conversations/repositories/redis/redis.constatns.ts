export const rConversationKey = (userId: string, channelId?: string): string =>
  channelId ? `cb_${channelId}_${userId}` : `cb_${userId}`

export const conversationFlowPrefix = 'cb_fs_'
export const rConversationFlow = (channelId?: string): string =>
  `${conversationFlowPrefix}${channelId}`

export const rAssistantPreferences = (userId: number): string => `cb_assistant_prefs_${userId}`
export const rAssistantDigestSnapshot = (userId: number): string => `cb_assistant_digest_${userId}`
export const rAlertMetadata = (alertId: number): string => `cb_alert_meta_${alertId}`
