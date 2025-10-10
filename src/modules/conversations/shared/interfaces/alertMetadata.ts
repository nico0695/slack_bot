export interface AlertMetadata {
  snoozedAt?: string
  snoozedUntil?: string
  repeatPolicy?: 'daily' | 'weekly' | 'custom'
}
