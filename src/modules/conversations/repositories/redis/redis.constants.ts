export const rConversationKey = (userId: string, channelId?: string): string =>
  channelId ? `cb_${channelId}_${userId}` : `cb_${userId}`

export const conversationFlowPrefix = 'cb_fs_'
export const rConversationFlow = (channelId?: string): string =>
  `${conversationFlowPrefix}${channelId}`

// Personal conversation flow uses the same flow structure
export const personalFlowPrefix = 'cb_pf_'
export const rPersonalConversationFlow = (userId: string): string =>
  `${personalFlowPrefix}${userId}`

export const rAlertSnoozeConfig = (userId: number): string => `cb_alert_snooze_${userId}`
