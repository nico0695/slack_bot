# API Reference

Complete reference for all interfaces: REST API, Socket.io events, Slack commands, and external API integrations.

## Table of Contents

- [REST API](#rest-api)
- [Socket.io Events](#socketio-events)
- [Slack Bot Commands](#slack-bot-commands)
- [External API Integrations](#external-api-integrations)

---

## REST API

Base URL: `http://localhost:4000`

### System

#### GET /health
Health check endpoint — no authentication required. Used by load balancers, Docker HEALTHCHECK, and monitoring tools.

**Response (200 — all services up):**
```json
{
  "status": "ok",
  "version": "1.2.0",
  "uptime": 12345,
  "timestamp": "2026-02-08T12:00:00.000Z",
  "services": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

**Response (503 — one or more services down):**
```json
{
  "status": "degraded",
  "version": "1.2.0",
  "uptime": 12345,
  "timestamp": "2026-02-08T12:00:00.000Z",
  "services": {
    "database": { "status": "up" },
    "redis": { "status": "down" }
  }
}
```

### Authentication

Most endpoints require authentication via decorators:
```typescript
@HttpAuth
@Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
```

Pass auth token in request headers.

### Conversations

#### GET /conversations/show-channels
List all active channels.

**Response:**
```json
{
  "channels": ["channel1", "channel2"]
}
```

#### POST /conversations/close-channel
Close a conversation channel.

**Request Body:**
```json
{
  "channel": "channel_name"
}
```

### Alerts

#### GET /alerts
Get alerts for authenticated user.

**Headers:**
- `Authorization`: Bearer token

**Response:**
```json
{
  "alerts": [
    {
      "id": 1,
      "message": "Alert message",
      "date": "2025-10-15T10:00:00Z",
      "userId": 123
    }
  ]
}
```

#### POST /alerts
Create new alert.

**Headers:**
- `Authorization`: Bearer token

**Request Body:**
```json
{
  "message": "Alert message",
  "date": "2025-10-15T10:00:00Z"
}
```

**Response:**
```json
{
  "id": 1,
  "message": "Alert message",
  "date": "2025-10-15T10:00:00Z",
  "userId": 123
}
```

#### DELETE /alerts/:id
Delete alert by ID.

**Headers:**
- `Authorization`: Bearer token

**Params:**
- `id` - Alert ID

### Tasks

#### GET /tasks
Get tasks for authenticated user.

**Headers:**
- `Authorization`: Bearer token

**Query Parameters:**
- `tag` (optional) - Filter by tag

**Response:**
```json
{
  "tasks": [
    {
      "id": 1,
      "title": "Task title",
      "description": "Task description",
      "tags": ["work", "urgent"],
      "completed": false,
      "userId": 123
    }
  ]
}
```

#### POST /tasks
Create new task.

**Headers:**
- `Authorization`: Bearer token

**Request Body:**
```json
{
  "title": "Task title",
  "description": "Optional description",
  "tags": ["tag1", "tag2"]
}
```

#### PUT /tasks/:id
Update task.

**Headers:**
- `Authorization`: Bearer token

**Request Body:**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "completed": true,
  "tags": ["updated"]
}
```

#### DELETE /tasks/:id
Delete task by ID.

### Notes

#### GET /notes
Get notes for authenticated user.

**Headers:**
- `Authorization`: Bearer token

**Query Parameters:**
- `tag` (optional) - Filter by tag

**Response:**
```json
{
  "notes": [
    {
      "id": 1,
      "title": "Note title",
      "content": "Note content",
      "tags": ["personal"],
      "userId": 123
    }
  ]
}
```

#### POST /notes
Create new note.

**Headers:**
- `Authorization`: Bearer token

**Request Body:**
```json
{
  "title": "Note title",
  "content": "Note content",
  "tags": ["tag1"]
}
```

#### PUT /notes/:id
Update note.

#### DELETE /notes/:id
Delete note by ID.

### Images

#### POST /images
Generate image from prompt.

**Headers:**
- `Authorization`: Bearer token

**Request Body:**
```json
{
  "prompt": "A beautiful sunset over mountains",
  "userId": 123
}
```

**Response:**
```json
{
  "id": 1,
  "url": "https://image-url.com/generated.png",
  "prompt": "A beautiful sunset over mountains",
  "userId": 123
}
```

#### GET /images
Get user's generated images.

**Headers:**
- `Authorization`: Bearer token

### Text-to-Speech

#### POST /text-to-speech
Convert text to speech.

**Headers:**
- `Authorization`: Bearer token

**Request Body:**
```json
{
  "text": "Text to convert to speech",
  "language": "en"
}
```

**Response:**
```json
{
  "audioUrl": "https://audio-url.com/speech.mp3"
}
```

### Summary

#### POST /summary
Summarize text.

**Headers:**
- `Authorization`: Bearer token

**Request Body:**
```json
{
  "text": "Long text to summarize..."
}
```

**Response:**
```json
{
  "summary": "Summarized text..."
}
```

### Users

#### POST /users/register
Register new user.

**Request Body:**
```json
{
  "username": "user123",
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### POST /users/login
User login.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 123,
    "username": "user123",
    "email": "user@example.com"
  }
}
```

---

## Socket.io Events

Connection: `http://localhost:4000`

### Public Channel Events

#### Client → Server

**join_room**
Join a public conversation channel.

```javascript
socket.emit('join_room', {
  username: 'user123',
  channel: 'general'
})
```

**send_message**
Send message to channel.

```javascript
socket.emit('send_message', {
  message: 'Hello world',
  username: 'user123',
  channel: 'general',
  iaEnabled: true  // Enable AI response
})
```

#### Server → Client

**join_response**
Confirmation of channel join with conversation history.

```javascript
socket.on('join_response', (data) => {
  // data.message: string
  // data.conversation: IUserConversation[]
})
```

**receive_message**
Receive message in channel.

```javascript
socket.on('receive_message', (data) => {
  // data.content: string
  // data.userSlackId: string
  // data.role: 'user' | 'assistant'
})
```

### Assistant (Private) Events

#### Client → Server

**join_assistant_room**
Join private assistant room.

```javascript
socket.emit('join_assistant_room', {
  username: 'user123',
  channel: userId  // User ID (will be padded internally)
})
```

**send_assistant_message**
Send message to assistant.

```javascript
socket.emit('send_assistant_message', {
  message: 'Help me with...',
  userId: 123,
  iaEnabled: true
})
```

**leave_assistant_room**
Leave assistant room.

```javascript
socket.emit('leave_assistant_room', {
  channel: userId
})
```

#### Server → Client

**join_assistant_response**
Confirmation with conversation history.

```javascript
socket.on('join_assistant_response', (data) => {
  // data.message: string
  // data.conversation: IUserConversation[]
})
```

**receive_assistant_message**
Receive assistant response.

```javascript
socket.on('receive_assistant_message', (data) => {
  // data.content: string
  // data.role: 'user' | 'assistant'
})
```

### Connection Events

**connection**
User connects to Socket.io server.

**disconnect**
User disconnects from server.

```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason)
})
```

---

## Slack Bot Commands

Bot listening on port 3001 via Socket Mode.

### Conversation Commands

#### Basic Conversation
```
cb <message>
```
Send message to AI chatbot.

**Example:**
```
cb What is the weather today?
```

#### Show Conversation History
```
cb_show
```
Display conversation history for current channel.

#### Clear Conversation
```
cb_clean
```
Clear conversation history for current channel.

#### Conversation Flow Mode
```
start conversation
```
Enter flow mode - all subsequent messages processed by AI.

```
end conversation
```
Exit flow mode.

```
+ <message>
```
Add message to conversation without AI response (in flow mode).

**Example:**
```
+ This is context for the next question
```

### Image Generation

```
img <prompt>
```
Generate image using AI.

**Example:**
```
img A futuristic city with flying cars
```

### Assistant Commands (Variables)

Commands prefixed with `.` are assistant variables.

#### Create Alert
```
.alert <time> <message>
.a <time> <message>
```

**Time Format:** `XdYhZm` (days, hours, minutes)

**Example:**
```
.alert 1d14h30m Team meeting reminder
.a 2h Call John
```

#### Create Task
```
.task <title> [-d <description>] [-t <tag>]
.t <title> [-d <description>] [-t <tag>]
```

**Flags:**
- `-d` / `-description` - Task description
- `-t` / `-tag` - Task tag
- `-l` / `-list` - List all tasks
- `-lt` / `-listTag` - List tasks by tag

**Examples:**
```
.task Complete project documentation
.t Fix bug -d "Error in login form" -t urgent
.task -list
.task -lt work
```

#### Create Note
```
.note <title> [-d <description>]
.n <title> [-d <description>]
```

**Flags:**
- `-d` / `-description` - Note content
- `-l` / `-list` - List all notes
- `-lt` / `-listTag` - List notes by tag

**Examples:**
```
.note Meeting notes -d "Discussed Q4 goals"
.n Ideas for blog post
.note -list
```

#### List Items
```
-list
-l
```
List all alerts/tasks/notes (context-dependent).

### Help Command
```
/help
```
Display command list.

### Interactive Actions

Bot responds to Slack Block Kit actions:

**Action Patterns:**
- `alert_actions*` - Alert menu actions
- `note_actions*` - Note menu actions
- `task_actions*` - Task menu actions
- `delete_alert` - Delete alert
- `delete_note` - Delete note
- `delete_task` - Delete task
- `view_alert_details` - View alert details
- `view_note_details` - View note details
- `view_task_details` - View task details

### Message Regex Patterns

Bot listeners configured in `slackConfig.ts`:

```typescript
slackListenersKey = {
  generateConversation: /^cb?\b/,
  cleanConversation: /^cb_clean?\b/,
  showConversation: /^cb_show?\b/,
  generateImages: /^img?\b/
}
```

---

## External API Integrations

### OpenAI API

**Repository:** `src/modules/conversations/repositories/openai/`

**Configuration:**
```typescript
OPENAI_API_KEY=your_api_key
```

**Usage:**
```typescript
openaiRepository.generateConversation({
  messages: conversationHistory,
  tools: toolDefinitions
})
```

**Models Used:**
- GPT-4 (conversation)
- GPT-3.5-turbo (fallback)

**Features:**
- Function calling (tools)
- Conversation history management
- Token counting

### Google Gemini API

**Repository:** `src/modules/conversations/repositories/gemini/`

**Configuration:**
```typescript
GEMINI_API_KEY=your_api_key
```

**Usage:**
```typescript
geminiRepository.generateConversation({
  messages: conversationHistory
})
```

**Models Used:**
- gemini-pro

**Features:**
- Multi-turn conversations
- Content safety settings

### Leap AI (Image Generation)

**Repository:** `src/modules/images/repositories/leap/`

**Configuration:**
```typescript
LEAP_API_KEY=your_api_key
```

**Usage:**
```typescript
leapRepository.generateImage({
  prompt: "Image description"
})
```

**Features:**
- Text-to-image generation
- Style controls
- Webhook callbacks

### Google Search API

**Repository:** `src/modules/conversations/repositories/search/`

**Configuration:**
```typescript
SEARCH_API_KEY=your_api_key
SEARCH_API_KEY_CX=your_custom_search_engine_id
```

**Usage:**
```typescript
searchRepository.search({
  query: "search terms"
})
```

**Features:**
- Custom search engine
- Result filtering
- Safe search

### Transformers.js (Local ML)

**Repositories:**
- `src/modules/textToSpeech/repositories/transformers/`
- `src/modules/summary/repositories/transformers/`

**Usage:**
```typescript
// Text-to-Speech
transformersRepository.synthesize({
  text: "Text to speak"
})

// Summarization
transformersRepository.summarize({
  text: "Long text..."
})
```

**Models:**
- TTS: Xenova models
- Summarization: BART/T5

**Features:**
- Runs locally (no API key)
- Offline capability
- Privacy-friendly

### Slack API

**Repository:** `src/modules/users/repositories/slack/`

**Configuration:**
```typescript
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
APP_TOKEN=xapp-...
```

**Bolt SDK Methods:**
```typescript
// Send message
client.chat.postMessage({
  channel: channelId,
  text: message
})

// Update message
client.chat.update({
  channel: channelId,
  ts: timestamp,
  text: newMessage
})

// Get user info
client.users.info({
  user: userId
})
```

**Features:**
- Socket Mode (WebSocket)
- Interactive components
- Block Kit UI

### Redis Cache

**Configuration:**
```typescript
REDIS_HOST=localhost  // Default
```

**Key Patterns:**
```typescript
// Conversations
`conversationFlow:${channelId}`
`rConvo:${userId}`

// User data
`rUser:${userId}`
```

**Operations:**
```typescript
// Set with expiry
redis.setex(key, ttl, value)

// Get
redis.get(key)

// Delete
redis.del(key)
```

### TypeORM Database

**Configuration:**
```typescript
DB_URL=  // Optional, defaults to SQLite
```

**Entities:**
- Alerts
- Tasks
- Notes
- Users
- Images
- TextToSpeech
- Constants

**Operations:**
```typescript
// Find
repository.find({ where: { userId } })

// Create
repository.create(data)
repository.save(entity)

// Update
repository.update(id, data)

// Delete
repository.delete(id)
```

---

## Error Responses

All APIs return consistent error format:

```json
{
  "errors": [{ "message": "Error description", "context": {} }]
}
```

### Validation Errors

Endpoints validate input with Zod schemas. When validation fails, the response includes field-level detail:

```json
{
  "errors": [
    {
      "message": "Datos de entrada no válidos",
      "context": {
        "fields": [
          { "field": "title", "message": "String must contain at least 1 character(s)" },
          { "field": "url", "message": "Invalid url" }
        ]
      }
    }
  ]
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limits

### External APIs

- **OpenAI:** Per API key tier
- **Gemini:** 60 requests/minute
- **Leap AI:** Per subscription plan
- **Google Search:** 100 queries/day (free tier)

### Internal

No rate limiting implemented (consider adding for production).

---

## Webhook Configuration

### Web Push Notifications

**Configuration:**
```typescript
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

**Subscription Format:**
```json
{
  "endpoint": "https://...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

**Send Notification:**
```typescript
webpush.sendNotification(subscription, JSON.stringify({
  title: "Alert",
  body: "Your alert message",
  icon: "/icon.png"
}))
```

---

## Data Types Reference

### IConversation
```typescript
interface IConversation {
  content: string
  role: 'user' | 'assistant' | 'system'
  userSlackId?: string
}
```

### IAlert
```typescript
interface IAlert {
  id?: number
  message: string
  date: string
  userId: number
}
```

### ITask
```typescript
interface ITask {
  id?: number
  title: string
  description?: string
  tags?: string[]
  completed: boolean
  userId: number
}
```

### INote
```typescript
interface INote {
  id?: number
  title: string
  content: string
  tags?: string[]
  userId: number
}
```
