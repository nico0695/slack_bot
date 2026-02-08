# Slack Bot with AI Integration

Multi-functional Slack bot integrating AI services (OpenAI, Gemini) for conversational AI, image generation, task management, alerts, and notes. Includes web interface with real-time Socket.io communication.

## Features

### Core Capabilities
- **AI Conversations** - OpenAI and Gemini integration with conversation history
- **Image Generation** - AI-powered image creation (OpenAI DALL-E 3, Gemini Imagen 3, Leap)
- **Task Management** - Create, view, and manage tasks
- **Alert System** - Time-based notifications with cron scheduling
- **Notes** - Simple note-taking system
- **Links** - Save URLs/links for later reading (read-later / Wallabag-style)
- **Text-to-Speech** - TTS functionality using Transformers.js
- **Summarization** - Text summarization capabilities
- **External Storage** - File persistence via external storage service (Backblaze B2)
- **Web Interface** - Real-time web dashboard with Socket.io

### Technical Features
- Slack Socket Mode (no webhook required)
- Redis conversation caching
- TypeORM with SQLite (Supabase compatible)
- Web Push notifications
- Modular architecture with singleton pattern
- Full TypeScript implementation
- Comprehensive test coverage

## Quick Start

### Prerequisites
- Node.js (LTS)
- Redis Server
- Slack workspace with bot configured

### Installation

```bash
# Clone and install
git clone <repository-url>
cd slack_bot
npm install

# Configure environment
cp ".env copy" .env
# Edit .env with your credentials

# Start Redis
redis-server

# Development mode
npm run dev

# Production build
npm run build
npm start
```

### Environment Variables

```bash
# Slack
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
APP_TOKEN=

# AI Services
OPENAI_API_KEY=
GEMINI_API_KEY=
LEAP_API_KEY=

# Database (optional, defaults to SQLite)
DB_URL=
SUPABASE_URL=
SUPABASE_TOKEN=

# Redis (optional, defaults to localhost)
REDIS_HOST=

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Search (optional)
SEARCH_API_KEY=
SEARCH_API_KEY_CX=

# External Storage (optional, api-storage service)
STORAGE_API_URL=
STORAGE_API_KEY=

# Logging (optional)
# Overrides default level (test=silent, production=info, development=debug)
# One of: fatal | error | warn | info | debug | trace | silent
LOG_LEVEL=
```

## Usage

### Slack Commands

**Conversations:**
```
cb <message>          - Send message to AI
cb_show               - Show conversation history
cb_clean              - Clear conversation
start conversation    - Enter flow mode (all messages processed)
end conversation      - Exit flow mode
+ <message>           - Add to conversation without AI response
```

**Utilities:**
```
img <prompt>          - Generate image
/help                 - Show command list
```

**Task/Alert/Note Creation:**
```
.alert/.a <time> <message>  - Create alert (e.g., ".alert 1d14h12m Reminder")
.task/.t <time> <message>   - Create task
.note/.n <message>          - Create note
.link/.lk <url>             - Save link (e.g., ".link https://example.com -tt Title -d Desc -t tag")
-list/-l                    - List all items
```

### Web API Endpoints

- `GET /health` - Health check (no auth — returns service status for DB and Redis)
- `POST /conversations` - Create conversation
- `GET /alerts` - List alerts
- `POST /tasks` - Create task
- `GET /notes` - List notes
- `GET /links` - List links
- `POST /links` - Save link
- `PUT /links/:id` - Update link
- `DELETE /links/:id` - Delete link
- `POST /images` - Generate image
- `POST /text-to-speech` - Generate TTS
- `POST /summary` - Summarize text

### Socket.io Events

**Public Channels:**
```javascript
socket.emit('join_room', { username, channel })
socket.emit('send_message', { message, username, channel, iaEnabled })
socket.on('receive_message', (data) => {})
```

**Assistant (Private):**
```javascript
socket.emit('join_assistant_room', { username, channel: userId })
socket.emit('send_assistant_message', { message, userId, iaEnabled })
socket.on('receive_assistant_message', (data) => {})
```

## Architecture

### Module Structure
```
src/modules/{feature}/
├── controller/
│   ├── {feature}.controller.ts       # Slack handlers
│   └── {feature}Web.controller.ts    # REST/Socket.io handlers
├── services/
│   └── {feature}.services.ts         # Business logic
├── repositories/
│   ├── database/                     # TypeORM entities
│   ├── redis/                        # Caching
│   └── {api}/                        # External API clients
└── shared/
    ├── constants/
    └── interfaces/
```

### Available Modules
- `conversations` - AI chat management
- `alerts` - Time-based reminders
- `tasks` - Task tracking
- `notes` - Note storage
- `links` - URL/link storage (read-later)
- `images` - Image generation (multi-provider)
- `textToSpeech` - TTS
- `summary` - Text summarization
- `externalStorage` - File persistence via external storage API
- `users` - User management
- `constants` - System constants
- `system` - Infrastructure endpoints (health check)

### Key Technologies
- **Backend:** Node.js, Express, TypeScript
- **Slack:** Bolt SDK (Socket Mode)
- **Real-time:** Socket.io
- **Database:** TypeORM, SQLite/Supabase
- **Cache:** Redis
- **AI:** OpenAI, Gemini, Leap API, Transformers.js
- **Testing:** Jest
- **Linting:** ESLint
- **Hooks:** Husky

## Development

### Commands
```bash
npm run dev              # Development with hot reload
npm run build            # Compile TypeScript
npm start                # Run production build
npm run lint             # Run ESLint
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

### Logging
- The app uses Pino for structured logs. In development, logs are pretty-printed; in production, JSON is emitted to stdout.
- Default levels by environment:
  - test: `silent`
  - production: `info`
  - development: `debug`
- Override with `LOG_LEVEL`.

Examples:
- `LOG_LEVEL=warn npm run dev` runs dev server logging only warnings and errors.
- `NODE_ENV=production npm start` emits JSON logs (no pretty printing).

Pretty logging is enabled automatically in development (when `NODE_ENV` is not `production` or `test`).

### Project Structure
```
src/
├── app.ts              # Application setup
├── index.ts            # Entry point
├── config/             # Configuration (Slack, Redis, DB, Socket.io)
├── database/           # Database files
├── entities/           # TypeORM entities
├── modules/            # Feature modules
└── shared/             # Utilities, middleware, constants
```

### Redis Keys
- Conversations: `${conversationFlowPrefix}:${channelId}`
- User conversations: `rConvo:${userId}`

### Database
Default: SQLite at `src/database/database.sqlite`
Override: Set `DB_URL` for Supabase/Postgres

## Docker Deployment

```bash
# Build image
./build-docker.sh

# Run container
docker run -p 4000:4000 -p 3001:3001 \
  -e SLACK_BOT_TOKEN=... \
  -e OPENAI_API_KEY=... \
  slack-bot
```

## Testing

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Generate coverage
```

Tests located in `__tests__/` directories within each module layer.

## Documentation

Detailed documentation available in `/doc`:
- [Architecture](doc/ARCHITECTURE.md) - System design and patterns
- [API Reference](doc/API_REFERENCE.md) - Complete API documentation
- [Development Guide](doc/DEVELOPMENT.md) - Development workflows
- [Deployment Guide](doc/DEPLOYMENT.md) - Docker and production setup
- [Troubleshooting](doc/TROUBLESHOOTING.md) - Common issues and solutions

## Recent Updates

- Added `links` module for saving URLs/links to read later (Wallabag-style), with Slack commands (`.link/.lk`), REST API, assistant intent fallback, and overflow menu actions (detail, mark read, delete)
- Added `externalStorage` module for persistent file storage via api-storage (Backblaze B2)
- Fixed Redis digest and assistant preference handling
- Improved Docker configuration
- Enhanced CI/CD with error handling
- Husky production build optimization
- Task datasource linting improvements

## License

ISC
