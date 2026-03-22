---
name: slack-feature
description: Add a new Slack command or event handler to the slack-bot project. Covers the @SlackAuth decorator on the controller method, registering the regex pattern in slackConfig.ts, and wiring it up in app.ts. Use when adding commands like ".bookmark", ".remind", "img2", or any message-triggered bot interaction.
---

# Add a Slack Feature

## Overview

A Slack command requires 3 touch points:
1. **Handler method** on a controller (with `@SlackAuth`)
2. **Regex pattern** in `src/config/slackConfig.ts`
3. **Listener registration** in `src/app.ts`

---

## Step 1: Add handler to controller

In `src/modules/{feature}/controller/{feature}.controller.ts`, add the method:

```typescript
@SlackAuth
public async myCommand(data: any): Promise<void> {
  const { payload, say }: any = data

  try {
    // Parse text: strip the command prefix
    const text: string = payload.text.replace(/^\.\w+\s*/, '').trim()

    // Access authenticated user
    const user = this.userData  // set by @SlackAuth

    const response = await this.#featureServices.doSomething({
      userId: user.id,
      content: text,
      channelId: payload.channel,
    })

    if (response.error) {
      say(`Error: ${response.error}`)
      return
    }

    say(`Done! ID: ${response.data.id} ✅`)
  } catch (error) {
    log.error({ err: error, slackUserId: payload?.user }, 'myCommand failed')
    say('Ups! Ocurrió un error.')
  }
}
```

**Bind in constructor:**
```typescript
private constructor() {
  super()
  this.myCommand = this.myCommand.bind(this)
}
```

**Key rules:**
- Always use `@SlackAuth` — it resolves the user and sets `this.userData`
- Always check `response.error` before using `response.data`
- Use `say(message)` for Slack replies
- Log errors with `log.error({ err: error, slackUserId: payload?.user }, ...)`

---

## Step 2: Add regex pattern in `src/config/slackConfig.ts`

```typescript
export const slackListenersKey = {
  // ... existing patterns ...
  myCommand: /^\.my_command?\b/i,  // matches ".my_command" or ".mycommand"
}
```

Common pattern conventions in this project:
- `.feature` command: `/^\.feat?\b/i`
- Prefix match: `/^feature?\b/i`
- Multi-word: `/^feature\s/i`

---

## Step 3: Register listener in `src/app.ts`

In the `startSlack()` or `#slackListeners()` method:

```typescript
this.#slackApp.message(
  slackListenersKey.myCommand,
  async (data) => this.#featureController.myCommand(data)
)
```

For action handlers (button clicks, overflow menus):
```typescript
this.#slackApp.action(
  /^feature_actions:/,
  async ({ ack, payload, say }) => {
    await ack()
    this.#featureController.handleAction({ payload, say })
  }
)
```

---

## Parsing Slack Command Arguments

Common flag parsing patterns used in this project:

```typescript
// Simple: ".link https://example.com -tt My Title -t tag"
const args = text.split(' ')
const urlArg = args[0]
const titleIndex = args.indexOf('-tt')
const title = titleIndex !== -1 ? args[titleIndex + 1] : ''
const tagIndex = args.indexOf('-t')
const tag = tagIndex !== -1 ? args[tagIndex + 1] : ''

// List flag: ".feature -l" or ".feature -list"
const isList = text.includes('-l') || text.includes('-list')
```

---

## Block Kit Response

For rich Slack UI (overflow menus, buttons), see `src/shared/utils/slackMessages.utils.ts` for existing helper functions.

Basic block structure:
```typescript
say({
  blocks: [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${title}*\n${description}` },
      accessory: {
        type: 'overflow',
        action_id: `feature_actions:${id}`,
        options: [
          { text: { type: 'plain_text', text: 'Ver Detalles' }, value: `detail:${id}` },
          { text: { type: 'plain_text', text: 'Eliminar' }, value: `delete:${id}` },
        ],
      },
    },
  ],
})
```

---

## Checklist

- [ ] Handler method added with `@SlackAuth` and `bind(this)` in constructor
- [ ] Regex pattern added to `slackListenersKey` in `slackConfig.ts`
- [ ] Listener registered in `app.ts`
- [ ] Error path returns `say(errorMessage)`, never throws
- [ ] Logger uses `createModuleLogger('{feature}.controller')`
