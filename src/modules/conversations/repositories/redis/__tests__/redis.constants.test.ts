import {
  rConversationKey,
  rConversationFlow,
  rAlertSnoozeConfig,
  rAssistantContext,
  rPersonalConversationFlow,
  personalFlowPrefix,
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

  it('generates assistant context key without colliding with other prefixes', () => {
    const key = rAssistantContext(5)

    expect(key).toBe('cb_actx_5')
    expect(key.startsWith(conversationFlowPrefix)).toBe(false)
    expect(key.startsWith(personalFlowPrefix)).toBe(false)
    expect(key.startsWith('cb_alert_snooze_')).toBe(false)
    expect([
      rConversationFlow('5'),
      rPersonalConversationFlow('5'),
      rAlertSnoozeConfig(5),
      rConversationKey('5'),
      rConversationKey('5', 'C0ACTX'),
      rConversationKey('U5', 'D0ACTX'),
    ]).not.toContain(key)
  })
})
