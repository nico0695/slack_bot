import {
  rConversationKey,
  rPersonalAssistantKey,
  rConversationFlow,
  rAlertSnoozeConfig,
  conversationFlowPrefix,
} from '../redis.constants'

describe('redis.constants', () => {
  it('builds conversation key with channel when provided', () => {
    expect(rConversationKey('user', 'chan')).toBe('cb_chan_user')
  })

  it('builds conversation key without channel', () => {
    expect(rConversationKey('user')).toBe('cb_user')
  })

  it('generates conversation flow key prefix', () => {
    expect(rConversationFlow('chan')).toBe(`${conversationFlowPrefix}chan`)
  })

  it('generates alert snooze config key', () => {
    expect(rAlertSnoozeConfig(5)).toBe('cb_alert_snooze_5')
  })

  it('uses unpadded internal IDs for shared personal assistant keys', () => {
    expect(rPersonalAssistantKey(1)).toBe('cb_assistant_user_1')
    expect(rPersonalAssistantKey(91)).toBe('cb_assistant_user_91')
    expect(rPersonalAssistantKey(1)).not.toBe(rPersonalAssistantKey(91))
  })
})
