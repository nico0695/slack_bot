import {
  rConversationKey,
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
})
