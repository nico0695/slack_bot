# Architecture Documentation

## System Overview

Multi-layered Node.js application with dual interfaces (Slack + Web) using TypeScript, implementing modular architecture with clear separation of concerns.

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                      Entry Point                         │
│                  (src/index.ts → app.ts)                 │
└───────────────┬─────────────────────────────────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
┌───▼──────────┐   ┌────────▼─────────┐
│ Express      │   │  Slack Bot       │
│ (Port 4000)  │   │  (Port 3001)     │
│ + Socket.io  │   │  Socket Mode     │
└──────┬───────┘   └────────┬─────────┘
       │                    │
       └────────┬───────────┘
                │
     ┌──────────▼──────────┐
     │   Controllers       │
     │   (Singleton)       │
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │    Services         │
     │  (Business Logic)   │
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │   Repositories      │
     │  (Data Access)      │
     └──────────┬──────────┘
                │
    ┌───────────┴───────────┐
    │                       │
┌───▼──────┐  ┌─────────┐  ┌──────────┐
│ TypeORM  │  │  Redis  │  │ External │
│ (SQLite) │  │ (Cache) │  │   APIs   │
└──────────┘  └─────────┘  └──────────┘
```

## Application Initialization

### Startup Sequence (src/app.ts)

1. **Controllers Instantiation** - All controllers initialized as singletons
2. **Express Configuration** - Port 4000, middleware setup
3. **Database Connection** - TypeORM auto-sync with entities
4. **HTTP Server Creation** - Express + Socket.io integration
5. **Slack Bot Initialization** - Port 3001, Socket Mode
6. **Cron Jobs** - Alert notifications (every minute)
7. **Web Push Configuration** - VAPID keys setup

## Architectural Patterns

### 1. Singleton Pattern

All controllers and services use singleton pattern for single instance per application lifecycle:

```typescript
class Controller {
  private static instance: Controller

  private constructor() {}

  static getInstance(): Controller {
    if (!Controller.instance) {
      Controller.instance = new Controller()
    }
    return Controller.instance
  }
}
```

**Instantiation Location:** `src/app.ts` constructor

### 2. Layered Architecture

```
Controller Layer  → HTTP/Slack/Socket handlers
      ↓
Service Layer     → Business logic, orchestration
      ↓
Repository Layer  → Data access (DB, Redis, APIs)
```

**Benefits:**
- Clear separation of concerns
- Easy testing and mocking
- Independent layer scaling

### 3. Module Structure

Each feature follows consistent structure:

```
src/modules/{feature}/
├── controller/
│   ├── {feature}.controller.ts       # Slack interactions
│   └── {feature}Web.controller.ts    # Express + Socket.io
├── services/
│   └── {feature}.services.ts         # Business logic
├── repositories/
│   ├── database/                     # TypeORM entities
│   ├── redis/                        # Caching layer
│   ├── openai/                       # AI integration
│   ├── gemini/                       # AI integration
│   └── {external}/                   # External APIs
└── shared/
    ├── constants/                    # Module constants
    ├── interfaces/                   # TypeScript types
    └── utils/                        # Helper functions
```

## Data Flow Patterns

### Slack Message Flow

```
1. User sends message in Slack
   ↓
2. Slack Bolt SDK receives via Socket Mode
   ↓
3. Message regex matcher in slackConfig.ts
   ↓
4. Controller handler invoked (app.ts)
   ↓
5. Service processes business logic
   ↓
6. Repository accesses data (Redis/DB/API)
   ↓
7. Response formatted and sent to Slack
```

### Web Socket Flow

```
1. Client emits Socket.io event
   ↓
2. App.ts socket listener receives
   ↓
3. Controller method called
   ↓
4. Service processes request
   ↓
5. Repository layer operations
   ↓
6. Socket.io emits response to room(s)
```

### REST API Flow

```
1. HTTP request to Express endpoint
   ↓
2. Router forwards to Controller
   ↓
3. Service handles business logic
   ↓
4. Repository operations
   ↓
5. Response returned as JSON
```

## Key Subsystems

### Conversation Management

**Components:**
- `ConversationsServices` - Orchestrates AI interactions
- `ConversationsRedis` - Caches conversation history
- `OpenAIRepository` / `GeminiRepository` - AI API clients

**Conversation Types:**
1. **Flow Conversations** - Channel-based, multiple users
   - Key: `${conversationFlowPrefix}:${channelId}`
   - Used in: Slack channels, web public rooms

2. **Assistant Conversations** - User-specific, private
   - Key: `rConvo:${userId}`
   - Used in: Web assistant interface

**AI Switching:**
```typescript
enum AIRepositoryType {
  OPENAI = 'OPENAI',
  GEMINI = 'GEMINI'
}
```

Services accept `AIRepositoryType` to switch between AI providers.

### Alert System

**Components:**
- `AlertsServices` - Alert management
- `AlertsDataSource` - Database operations
- `alertCronJob` - Scheduled checker (runs every minute)

**Flow:**
1. User creates alert with time specification (e.g., "1d14h12m")
2. Alert stored in database with calculated trigger time
3. Cron job checks every minute for due alerts
4. Web Push notification sent when triggered

### Socket.io Rooms

**Public Channels:**
- Room name: `channel` (e.g., "general")
- Users join/leave freely
- Messages broadcast to all room members

**Assistant Rooms:**
- Room name: `userId.toString().padStart(8, '9')`
- Private 1-1 conversation
- Padded ID ensures unique room identification

### TypeORM Configuration

**Database Initialization:**
```typescript
connectionSource.initialize()
```

**Entity Loading:**
- Path: `src/entities/*{.ts,.js}`
- Auto-sync: Enabled (development)
- Decorators: `experimentalDecorators: true`

**Default Database:**
- Type: SQLite
- Location: `src/database/database.sqlite`

**Production Override:**
- Set `DB_URL` environment variable
- Compatible with: Supabase, PostgreSQL

### Redis Configuration

**Client:** Singleton pattern via `redisConfig.ts`

**Key Patterns:**
- Conversations: `${conversationFlowPrefix}:${channelId}`
- User data: `${rConversationKey}:${userId}`
- User preferences: `rUser:${userId}`

**Purpose:**
- Conversation history caching
- Temporary user preferences
- Session management

## Error Handling

**Global Handler:** `src/shared/middleware/errors.ts`

**Error Types:**
- `CustomError` - Base error class
- `BadRequestError` - 400 errors
- `NotFoundError` - 404 errors
- `UnauthorizedError` - 401 errors

**Async Error Handling:**
```typescript
import 'express-async-errors'
```

Automatically catches async errors in Express routes.

## Security Patterns

**Slack Verification:**
- Signing secret validation
- Socket Mode (no public webhook exposure)

**Environment Variables:**
- All secrets in `.env`
- No hardcoded credentials

**Private Fields:**
Extensive use of TypeScript private fields:
```typescript
#privateField: Type
```

## Testing Architecture

**Test Location:** `__tests__/` directories in each layer

**Testing Layers:**
- Controllers (integration tests)
- Services (unit + integration)
- Repositories (unit with mocks)
- Utils (unit tests)

**Test Tools:**
- Jest - Test runner
- ts-jest - TypeScript preset
- Manual mocks for external APIs

## Scalability Considerations

**Current Architecture:**
- Single instance design
- Suitable for small-to-medium teams

**Scaling Path:**
1. Redis session sharing → Multiple instances
2. Database migration → SQLite to PostgreSQL
3. Message queue → Decouple cron jobs
4. Microservices → Split modules into services

## Configuration Files

| File | Purpose |
|------|---------|
| `src/config/ormconfig.ts` | TypeORM configuration |
| `src/config/slackConfig.ts` | Slack Bolt app setup |
| `src/config/redisConfig.ts` | Redis client singleton |
| `src/config/socketConfig.ts` | Socket.io server setup |
| `.eslintrc.json` | Linting rules |
| `tsconfig.json` | TypeScript configuration |
| `jest.config.js` | Test configuration |

## Module Dependency Graph

```
app.ts
  ├─→ system.controller (health check — no auth, no services layer)
  ├─→ users.controller
  ├─→ conversations.controller
  │     ├─→ conversations.services
  │     │     ├─→ openai.repository
  │     │     ├─→ gemini.repository
  │     │     ├─→ conversations.redis
  │     │     └─→ search.repository
  │     └─→ shared utilities
  ├─→ alerts.controller
  │     ├─→ alerts.services
  │     │     └─→ alerts.dataSource
  │     └─→ cronJob
  ├─→ tasks.controller
  ├─→ notes.controller
  └─→ images.controller
        ├─→ images.services
        │     ├─→ leap.repository
        │     └─→ images.dataSource
        └─→ shared utilities
```

## Design Decisions

### Why Singleton Pattern?
- Simple state management
- No dependency injection overhead
- Suitable for single-instance deployment

### Why Dual Controller Pattern?
- Slack and Web have different concerns
- Cleaner separation of interface logic
- Independent testing and development

### Why Redis for Conversations?
- Fast access for frequent operations
- TTL support for temporary data
- Simple key-value model fits conversation storage

### Why Socket Mode for Slack?
- No public endpoint needed
- Simpler deployment
- Better for development environments

## Performance Considerations

**Optimization Points:**
1. Redis caching reduces DB queries
2. Singleton pattern minimizes object creation
3. TypeScript compilation to optimized JavaScript
4. Express middleware order optimized

**Bottlenecks:**
1. AI API calls (rate limited)
2. Cron job frequency (every minute)
3. SQLite performance (single file)

## Future Architecture Improvements

1. **Repository Abstraction Layer** - Generic repository pattern
2. **Dependency Injection** - Replace singleton pattern
3. **Event-Driven Architecture** - Decouple modules with events
4. **API Gateway** - Centralize REST/Socket routing
5. **Monitoring** - Add APM and logging infrastructure
