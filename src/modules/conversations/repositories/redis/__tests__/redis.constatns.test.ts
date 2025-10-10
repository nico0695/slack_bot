import {
  rConversationKey,
  rConversationFlow,
  rAssistantPreferences,
  rAssistantDigestSnapshot,
  rAlertMetadata,
  conversationFlowPrefix,
} from '../redis.constatns'

describe('redis.constatns', () => {
  it('builds conversation key with channel when provided', () => {
    expect(rConversationKey('user', 'chan')).toBe('cb_chan_user')
  })

  it('builds conversation key without channel', () => {
    expect(rConversationKey('user')).toBe('cb_user')
  })

  it('generates conversation flow key prefix', () => {
    expect(rConversationFlow('chan')).toBe(`${conversationFlowPrefix}chan`)
  })

  it('generates assistant preferences key with TTL prefix', () => {
    expect(rAssistantPreferences(5)).toBe('cb_assistant_prefs_5')
  })

  it('generates assistant digest snapshot key', () => {
    expect(rAssistantDigestSnapshot(7)).toBe('cb_assistant_digest_7')
  })

  it('generates alert metadata key', () => {
    expect(rAlertMetadata(3)).toBe('cb_alert_meta_3')
  })
})
