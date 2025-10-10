export interface AssistantPreferences {
  alertDefaultSnoozeMinutes?: number
  preferredAlertScope?: 'pending' | 'all' | 'snoozed'
  preferredTaskScope?: 'pending' | 'all' | 'completed'
  preferredNoteScope?: 'all' | 'withTag'
  digestFrequency?: 'off' | 'daily' | 'weekly'
  digestChannelId?: string
  lastDigestSentAt?: string
}
