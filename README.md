# IA Slack Bot

### ia api

* OpenIA
* Leap
* transformers.js
---

## Config

#### Env

```
# SLACK
SLACK_SIGNING_SECRET="SLACK_SECRET"
SLACK_BOT_TOKEN="SLACK_BOT_TOKEN"
APP_TOKEN="SLACK_APP_TOKEN"

# OPEN AI
OPENAI_API_KEY="OPENAI_API_KEY"

# LEAP // tryleap.ai
LEAP_API_KEY="LEAP_API_KEY"
```

## Install


```
// Redis (linux - macos)
sudo apt-get install redis-

// Dependence
npm install
```

## Initialize

```
// Start redis
redis-server

// Start Backend
npm run dev
```

---

## Slack Simple Conversation

**_Generate user conversation with the openai bot._**

**Prefix:**

```
    cb $message // send message to open ai chatbot
    cb_show // show conversation with user
    cb_clean // clean conversation with user
```

## Slack Flow Conversation

**_Any message sent between the two tags in the channel generates a conversation._**

**Messages:**

```
    start conversation // Start conversation flow
    end conversation // Finished conversation flow
    show conversation // show chanel/user conversation
    clean conversation // clean flow conversation
    # Prefixs
    + $message // add message to conversation store without generating a bot response
```

## Slack Generate Image

**_Generate image with a prompt._**

**Prefix:**

```
    img ${prompt} // generate and response an image
```
