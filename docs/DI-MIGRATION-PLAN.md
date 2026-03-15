# Dependency Injection (DI) Migration Plan with TSyringe

## 📋 Document Information
- **Creation Date:** 2026-03-15
- **Status:** PHASE 2 - Pending Confirmation
- **DI Library:** `tsyringe`
- **Scope:** Repositories, Services, and Controllers

---

# PHASE 1: Analysis and Deep Review

## 1.1 Executive Summary of the Current State

The `slack-bot` project is a modular backend built with Node.js, TypeScript, Express, Redis, SQLite (TypeORM), and Socket.io. The architecture follows a layered pattern (Controller → Service → Repository) but is **heavily coupled through the Singleton anti-pattern** (`Class.getInstance()`).

### Key Statistics
| Metric | Value |
|---------|-------|
| Classes using the Singleton pattern | **49** |
| Calls to `getInstance()` | **118+** |
| Main modules | 13 (users, conversations, alerts, tasks, notes, links, images, textToSpeech, summary, system, externalStorage, constants) |
| Dependency nesting levels | Up to 4 levels |

## 1.2 Identifying the Composition Root

### Current Entry Point
```
src/index.ts
    └── new App() → src/app.ts
        └── Constructor initializes 12+ controllers via getInstance()
        └── config() initializes DB connection (TypeORM)
        └── router() registers Express routes
        └── start() starts HTTP server, Socket.io, Slack listeners, Cron jobs
```

### Key Files
| File | Purpose |
|---------|---------|
| `src/index.ts` | Minimal entry point (5 lines) |
| `src/app.ts` | App class - current Composition Root |
| `src/config/ormconfig.ts` | TypeORM configuration (DataSource) |
| `src/config/redisConfig.ts` | RedisConfig singleton |
| `src/config/slackConfig.ts` | Slack Bolt connection |
| `src/config/socketConfig.ts` | Socket.io configuration |

## 1.3 Complete Inventory of Singletons

### Layer 1: Repositories / Data Sources (Infrastructure)

| Class | File | Dependencies |
|-------|---------|--------------|
| `UsersDataSources` | `src/modules/users/repositories/database/users.dataSource.ts` | TypeORM Entity (Users) |
| `UsersRedis` | `src/modules/users/repositories/redis/users.redis.ts` | RedisConfig |
| `SlackRepository` | `src/modules/users/repositories/slack/slack.repository.ts` | connectionSlackApp |
| `AlertsDataSource` | `src/modules/alerts/repositories/database/alerts.dataSource.ts` | TypeORM Entity (Alerts, Users) |
| `TasksDataSource` | `src/modules/tasks/repositories/database/tasks.dataSource.ts` | TypeORM Entity (Tasks) |
| `NotesDataSource` | `src/modules/notes/repositories/database/notes.dataSource.ts` | TypeORM Entity (Notes) |
| `LinksDataSource` | `src/modules/links/repositories/database/links.dataSource.ts` | TypeORM Entity (Links) |
| `LinksMetadataRepository` | `src/modules/links/repositories/metadata/linksMetadata.repository.ts` | axios |
| `ImagesDataSources` | `src/modules/images/repositories/database/images.dataSource.ts` | TypeORM Entity (Images) |
| `RedisRepository` | `src/modules/conversations/repositories/redis/conversations.redis.ts` | RedisConfig |
| `GeminiRepository` | `src/modules/conversations/repositories/gemini/gemini.repository.ts` | GoogleGenAI |
| `OpenaiRepository` | `src/modules/conversations/repositories/openai/openai.repository.ts` | OpenAI |
| `SearchRepository` | `src/modules/conversations/repositories/search/search.repository.ts` | Embeddings API |
| `TransformersRepository` | `src/modules/textToSpeech/repositories/transformers/transformers.repository.ts` | Xenova Transformers |
| `TransformersRepository` | `src/modules/summary/repositories/transformers/transformers.repository.ts` | Xenova Transformers |
| `TextToSpeechDataSources` | `src/modules/textToSpeech/repositories/database/textToSpeech.dataSource.ts` | TypeORM Entity |
| `ConstantsDataSources` | `src/modules/constants/repositories/database/constants.dataSource.ts` | TypeORM Entity |
| `ApiStorageRepository` | `src/modules/externalStorage/repositories/apiStorage/apiStorage.repository.ts` | External API |
| `ExternalStorageDataSource` | `src/modules/externalStorage/repositories/database/externalStorage.dataSource.ts` | TypeORM Entity |
| `GeminiImagesRepository` | `src/modules/images/repositories/gemini/geminiImages.repository.ts` | GoogleGenAI |
| `OpenaiImagesRepository` | `src/modules/images/repositories/openai/openaiImages.repository.ts` | OpenAI |
| `LeapRepository` | `src/modules/images/repositories/leap/leap.repository.ts` | Leap API |

### Layer 2: Services (Business Logic)

| Class | File | Dependencies (getInstance calls) |
|-------|---------|----------------------------------|
| `UsersServices` | `src/modules/users/services/users.services.ts` | UsersDataSource, SlackRepository, UsersRedis |
| `AlertsServices` | `src/modules/alerts/services/alerts.services.ts` | AlertsDataSource, UsersRedis |
| `TasksServices` | `src/modules/tasks/services/tasks.services.ts` | TasksDataSource |
| `NotesServices` | `src/modules/notes/services/notes.services.ts` | NotesDataSource |
| `LinksServices` | `src/modules/links/services/links.services.ts` | LinksDataSource, LinksMetadataRepository |
| `ImagesServices` | `src/modules/images/services/images.services.ts` | ImageRepository (factory), ImagesDataSources, ExternalStorageServices, UsersServices |
| `ConversationsServices` | `src/modules/conversations/services/conversations.services.ts` | AIRepository (factory), RedisRepository, UsersServices, AlertsServices, TasksServices, NotesServices, LinksServices, MessageProcessor |
| `MessageProcessor` | `src/modules/conversations/services/messageProcessor.service.ts` | AIRepository, RedisRepository, AlertsServices, TasksServices, NotesServices, LinksServices, ImagesServices, SearchRepository |
| `ConversationFlowManager` | `src/modules/conversations/services/conversationFlowManager.service.ts` | RedisRepository |
| `TextToSpeechServices` | `src/modules/textToSpeech/services/textToSpeech.services.ts` | TransformersRepository |
| `SummaryServices` | `src/modules/summary/services/summary.services.ts` | TransformersRepository |
| `ConstantsServices` | `src/modules/constants/services/constants.services.ts` | ConstantsDataSources |
| `ExternalStorageServices` | `src/modules/externalStorage/services/externalStorage.services.ts` | ApiStorageRepository, ExternalStorageDataSource |

### Layer 3: Controllers (API/Network)

| Class | File | Dependencies (getInstance calls) |
|-------|---------|----------------------------------|
| `UsersController` | `src/modules/users/controller/users.controller.ts` | UsersServices |
| `ConversationsController` | `src/modules/conversations/controller/conversations.controller.ts` | ConversationsServices, MessageProcessor, ConversationFlowManager |
| `ConversationsWebController` | `src/modules/conversations/controller/conversationsWeb.controller.ts` | ConversationsServices, UsersServices |
| `AlertsWebController` | `src/modules/alerts/controller/alertsWeb.controller.ts` | AlertsServices |
| `TasksWebController` | `src/modules/tasks/controller/tasksWeb.controller.ts` | TasksServices |
| `NotesWebController` | `src/modules/notes/controller/notesWeb.controller.ts` | NotesServices |
| `LinksWebController` | `src/modules/links/controller/linksWeb.controller.ts` | LinksServices |
| `ImagesController` | `src/modules/images/controller/images.controller.ts` | ImagesServices |
| `ImagesWebController` | `src/modules/images/controller/imagesWeb.controller.ts` | ImagesServices |
| `TextToSpeechWebController` | `src/modules/textToSpeech/controller/textToSpeechWeb.controller.ts` | TextToSpeechServices |
| `SummaryWebController` | `src/modules/summary/controller/summary.controller.ts` | SummaryServices |
| `SystemWebController` | `src/modules/system/controller/systemWeb.controller.ts` | (none) |
| `ConstantsController` | `src/modules/constants/controller/constants.controller.ts` | ConstantsServices |

### Infrastructure / Configuration (Out of Direct Scope)

| Class | File | Notes |
|-------|---------|-------|
| `RedisConfig` | `src/config/redisConfig.ts` | Singleton for Redis connection |
| `IoServer` | `src/config/socketConfig.ts` | Static class for Socket.io |

## 1.4 Primary Dependency Tree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPOSITION ROOT (app.ts)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
    ┌─────────────────┐   ┌─────────────────────┐   ┌─────────────────┐
    │  UsersController │   │ConversationsController│  │ AlertsWebCtrl   │
    └────────┬────────┘   └──────────┬──────────┘   └───────┬─────────┘
             │                       │                       │
             ▼                       ▼                       ▼
    ┌─────────────────┐   ┌─────────────────────┐   ┌─────────────────┐
    │  UsersServices  │   │ConversationsServices│   │ AlertsServices  │
    └────────┬────────┘   └──────────┬──────────┘   └───────┬─────────┘
             │                       │                       │
    ┌────────┴────────┐   ┌──────────┴──────────┐   ┌───────┴─────────┐
    ▼        ▼        ▼   ▼          ▼          ▼   ▼                 ▼
┌────────┐┌─────┐┌──────┐┌────────┐┌──────────┐┌──────┐┌─────────────┐┌───────────┐
│UsersDS ││Redis││Slack ││OpenAI/ ││RedisRepo ││Users ││AlertsDS    ││UsersRedis │
│        ││Users││Repo  ││Gemini  ││          ││Serv  ││            ││           │
└────────┘└─────┘└──────┘└────────┘└──────────┘└──────┘└─────────────┘└───────────┘
    │         │                │         │
    ▼         ▼                ▼         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             INFRASTRUCTURE                                  │
│   TypeORM Entities    │    RedisConfig    │    External APIs                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 1.5 Identified Risks

### ⚠️ High Risk

| Risk | Description | Affected Files | Mitigation |
|--------|-------------|-------------------|------------|
| **Circular Dependencies** | `ConversationsServices` ↔ `MessageProcessor` (both reference each other) | `conversations.services.ts`, `messageProcessor.service.ts` | Use lazy injection with TSyringe `delay()` |
| **Services in Auth Decorators** | `HttpAuth`, `SlackAuth`, `SlackAuthActions` call `UsersServices.getInstance()` inside decorators | `src/shared/middleware/auth.ts` | Refactor decorators to accept dependencies or use `container.resolve()` |
| **Cron Jobs with Singletons** | `alertCronJob` calls `AlertsServices.getInstance()` outside the Composition Root | `src/modules/alerts/utils/cronJob.ts` | Inject service from app.ts or use `container.resolve()` |

### ⚠️ Medium Risk

| Risk | Description | Affected Files | Mitigation |
|--------|-------------|-------------------|------------|
| **Factory Pattern in AI Repos** | `ConversationsServices` and `MessageProcessor` use `AIRepositoryByType[type].getInstance()` | Conversation services | Implement factory with DI token |
| **Side Effects in Constructors** | `RedisConfig` and `GeminiRepository` initialize connections in constructors | Repositories | Move connections to `connect()` methods or use `@singleton()` |
| **Global Socket.io** | `IoServer` is a static class used from `app.ts` and `conversationsServices` | `socketConfig.ts`, `conversations.services.ts` | Register as singleton in container |

### ⚠️ Low Risk

| Risk | Description | Affected Files | Mitigation |
|--------|-------------|-------------------|------------|
| **Tests with jest.mock()** | Current tests mock getInstance() with jest.mock | All `__tests__/` | Migrate to constructor-injected mocks |
| **GenericController Base Class** | Controllers extend `GenericController` | All controllers | Keep inheritance, only change injection |

## 1.6 Current Testing Analysis

### Existing Mocking Pattern
```typescript
// Current pattern (src/modules/conversations/services/__tests__/conversations.services.test.ts)
jest.mock('../../repositories/openai/openai.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => aiRepositoryMock,
  },
}))
```

### Migration Impact
- **Before:** Tests mock the static `getInstance()` method for each dependency
- **After:** Tests will create instances directly by passing mocks to the constructor

---

# PHASE 2: Strategy Proposal and Alternatives

## 2.1 Recommended Migration Strategy: Bottom-Up

### Justification
The Bottom-Up strategy (Repositories → Services → Controllers) minimizes risk because:
1. Repositories do not depend on other layers (they are tree leaves)
2. It allows verifying each layer before migrating the next
3. It makes partial rollback easier if problems arise

### Proposed Migration Order

```
Stage 0: TSyringe base configuration
    │
    ▼
Stage 1: Repositories (no internal dependencies)
    │
    ▼
Stage 2: Simple Services (1-2 dependencies)
    │
    ▼
Stage 3: Complex Services (3+ dependencies)
    │
    ▼
Stage 4: Controllers
    │
    ▼
Stage 5: Special Cases (Decorators, Cron, Sockets)
    │
    ▼
Stage 6: Cleanup and Documentation
```

## 2.2 Architectural Decisions

### Decision 1: Handling Auth Decorators

#### Context
The `@HttpAuth`, `@SlackAuth`, `@SlackAuthActions` decorators in `src/shared/middleware/auth.ts` call `UsersServices.getInstance()` internally.

#### Alternatives

| Alternative | Pros | Cons | Recommendation |
|-------------|------|---------|---------------|
| **A) container.resolve() inside the decorator** | Minimal change, compatible with current decorators | Violates the no Service Locator principle | ⭐ Recommended for the initial migration |
| **B) Refactor decorators into Express middleware** | Clean, follows DI best practices | Significant change to code pattern | For a later phase |
| **C) Pass service as a decorator parameter** | Pure DI | Changes the signature of all decorators | Not recommended |

#### Recommendation: Alternative A
Use `container.resolve(UsersServices)` inside the decorators as an acceptable edge case. Document it as technical debt for future refactoring to middleware.

---

### Decision 2: Handling Cron Jobs

#### Context
`alertCronJob` in `src/modules/alerts/utils/cronJob.ts` is a standalone function that calls `AlertsServices.getInstance()`.

#### Alternatives

| Alternative | Pros | Cons | Recommendation |
|-------------|------|---------|---------------|
| **A) container.resolve() inside the cron** | Minimal change | Service Locator pattern | For a quick migration |
| **B) Inject service from app.ts** | Pure DI, easy to test | Requires refactoring cron registration | ⭐ Recommended |
| **C) Create an injectable CronJobManager class** | Organized, scalable | More code | For larger projects |

#### Recommendation: Alternative B
Modify `alertCronJob` to accept `AlertsServices` as a parameter. Resolve the instance in `app.ts` when configuring the cron.

```typescript
// Before
export const alertCronJob = async (): Promise<void> => {
  const alertsServices = AlertsServices.getInstance()
  ...
}

// After
export const createAlertCronJob = (alertsServices: AlertsServices) => {
  return async (): Promise<void> => {
    ...
  }
}
```

---

### Decision 3: Handling Socket.io

#### Context
`IoServer` is a static class that manages the Socket.io instance. It is used in `app.ts` and accessed from `ConversationsServices`.

#### Alternatives

| Alternative | Pros | Cons | Recommendation |
|-------------|------|---------|---------------|
| **A) Keep it static, do not migrate** | No changes | Inconsistent with the rest of the code | For the initial phase |
| **B) Register the Server as a singleton in the container** | Consistent | Requires passing the server as a parameter | ⭐ Recommended |
| **C) Create an injectable SocketService** | Clean abstraction | More code | Ideal long-term |

#### Recommendation: Alternative A for the Initial Phase, B for Phase 2
Keep `IoServer` static initially. In a second iteration, register the `Server` in the container.

---

### Decision 4: Factory Pattern for AI Repositories

#### Context
`ConversationsServices` and `MessageProcessor` use a factory pattern to select between `OpenaiRepository` and `GeminiRepository`:
```typescript
const AIRepositoryByType = {
  [AIRepositoryType.OPENAI]: OpenaiRepository,
  [AIRepositoryType.GEMINI]: GeminiRepository,
}
this.aiRepository = AIRepositoryByType[aiToUse].getInstance()
```

#### Alternatives

| Alternative | Pros | Cons | Recommendation |
|-------------|------|---------|---------------|
| **A) Inject a default repository, factory in config** | Simple | Less runtime flexibility | ⭐ Recommended |
| **B) Dynamic injection token** | Maximum flexibility | Additional complexity | Overengineering |
| **C) Inject both repos, choose at runtime** | Explicit | Unnecessary load | Not recommended |

#### Recommendation: Alternative A
Configure the AI type through environment variables. The container registers the correct repository based on configuration. If it must change at runtime, create a new container scope.

```typescript
// di-container.ts
const aiType = process.env.AI_REPOSITORY_TYPE || 'OPENAI'
if (aiType === 'OPENAI') {
  container.register('AIRepository', { useClass: OpenaiRepository })
} else {
  container.register('AIRepository', { useClass: GeminiRepository })
}
```

---

### Decision 5: Handling Circular Dependencies

#### Context
`ConversationsServices` imports and uses `MessageProcessor`, and `MessageProcessor` imports conversation types/interfaces.

#### Verification Needed
Check whether there is a real circular dependency or only type imports. TSyringe can handle cycles with `delay()`.

#### Recommendation
Use `@inject(delay(() => MessageProcessor))` if the cycle is confirmed. Alternatively, extract shared logic to a common service.

---

## 2.3 Questions for the User

Before proceeding to **PHASE 3: Implementation Plan Generation**, I need confirmation on the following decisions:

### ❓ Question 1: Auth Decorators
Do you agree to use `container.resolve()` inside authentication decorators as a temporary solution? Or do you prefer to refactor them fully into Express middleware from the start?

### ❓ Question 2: Cron Jobs
Do you confirm the strategy of modifying `alertCronJob` to receive the service as a parameter injected from `app.ts`?

### ❓ Question 3: Socket.io
Do you want to keep `IoServer` as a static class in this phase, or do you prefer to migrate it along with everything else?

### ❓ Question 4: AI Repository Factory
Is it acceptable to determine the AI type (OpenAI/Gemini) at load time via environment variables? Or do you need to change it dynamically at runtime?

### ❓ Question 5: Test Scope
Do you want the plan to include migrating all existing tests to constructor injection? This increases effort but improves maintainability.

### ❓ Question 6: Priority Modules
Are there specific modules that should be migrated first for business reasons? The plan currently proposes a layer-based (Bottom-Up) migration, but we can prioritize by functional module if needed.

---

## ⚠️ STOP - Waiting for Confirmation

**Please review the proposed strategy and answer the questions above.**

Once the decisions are confirmed, I will proceed to generate:
- Detailed implementation plan with actionable steps
- "Before and After" code snippets
- Tracking checklist
- DI-GUIDELINES.md documentation
- Testing impact guide

---

# PHASE 3: Implementation Plan (Pending Confirmation)

*This section will be completed after receiving user confirmation on the PHASE 2 decisions.*

## Plan Preview

### A. Plan Summary
*(Will be completed post-confirmation)*

### B. Status Tracking Table

| Stage | Specific Task | Affected Files / Modules | Risk Level | Status |
|:------|:-----------------|:-----------------------------|:----------------|:-------|
| 0 | Install TSyringe and configure | `package.json`, `tsconfig.json`, `src/index.ts` | Low | ⏳ Pending |
| 0 | Create DI container file | `src/di-container.ts` (new) | Low | ⏳ Pending |
| 1 | Migrate DataSources (DB) | `src/modules/*/repositories/database/*.ts` | Medium | ⏳ Pending |
| 1 | Migrate Redis Repositories | `src/modules/*/repositories/redis/*.ts` | Medium | ⏳ Pending |
| 1 | Migrate API Repositories | `src/modules/*/repositories/*.ts` | Medium | ⏳ Pending |
| 2 | Migrate Simple Services | Tasks, Notes, Links, Alerts, Summary | Medium | ⏳ Pending |
| 3 | Migrate Complex Services | Users, Conversations, Images, MessageProcessor | High | ⏳ Pending |
| 4 | Migrate Controllers | All `*.controller.ts` | Medium | ⏳ Pending |
| 5 | Refactor Auth Decorators | `src/shared/middleware/auth.ts` | High | ⏳ Pending |
| 5 | Refactor Cron Jobs | `src/modules/alerts/utils/cronJob.ts` | Medium | ⏳ Pending |
| 5 | (Optional) Migrate Socket.io | `src/config/socketConfig.ts` | Low | ⏳ Pending |
| 6 | Update app.ts (Composition Root) | `src/app.ts` | High | ⏳ Pending |
| 6 | Migrate Tests | All `__tests__/*.ts` | Medium | ⏳ Pending |
| 6 | Documentation | `DI-GUIDELINES.md`, README updates | Low | ⏳ Pending |

### C. Migration Example (Preview)

#### Before: Singleton Pattern
```typescript
// src/modules/users/repositories/database/users.dataSource.ts
export default class UsersDataSources {
  private static instance: UsersDataSources

  private constructor() {}

  static getInstance(): UsersDataSources {
    if (this.instance) {
      return this.instance
    }
    this.instance = new UsersDataSources()
    return this.instance
  }

  public async createUser(data: IUsers): Promise<Users> {
    // ...
  }
}
```

#### After: TSyringe DI
```typescript
// src/modules/users/repositories/database/users.dataSource.ts
import { singleton } from 'tsyringe'

@singleton()
export default class UsersDataSources {
  constructor() {}

  public async createUser(data: IUsers): Promise<Users> {
    // ...
  }
}
```

#### Consumer Service - Before
```typescript
// src/modules/users/services/users.services.ts
export default class UsersServices {
  private static instance: UsersServices
  private usersDataSource: UsersDataSource

  private constructor() {
    this.usersDataSource = UsersDataSource.getInstance()
  }

  static getInstance(): UsersServices {
    if (this.instance) return this.instance
    this.instance = new UsersServices()
    return this.instance
  }
}
```

#### Consumer Service - After
```typescript
// src/modules/users/services/users.services.ts
import { injectable, inject } from 'tsyringe'
import UsersDataSource from '../repositories/database/users.dataSource'

@injectable()
export default class UsersServices {
  constructor(
    private usersDataSource: UsersDataSource
  ) {}
}
```

### D. Documentation to Generate

1. **`docs/DI-GUIDELINES.md`** - Guide for creating new services with TSyringe
2. **`docs/TESTING-WITH-DI.md`** - How to write tests with injected mocks
3. **README update** - Architecture section

### E. Testing Guide (Preview)

#### Before: jest.mock()
```typescript
jest.mock('../../repositories/openai/openai.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => aiRepositoryMock,
  },
}))

const service = ConversationsServices.getInstance()
```

#### After: Direct Injection
```typescript
const mockAIRepo = { chatCompletion: jest.fn() }
const mockRedisRepo = { getConversationMessages: jest.fn() }

const service = new ConversationsServices(
  mockAIRepo as any,
  mockRedisRepo as any,
  // ... other mocks
)
```

---

## Appendix: Reference Files

### Current Folder Structure
```
src/
├── app.ts                          # Current Composition Root
├── index.ts                        # Entry point
├── config/
│   ├── redisConfig.ts              # RedisConfig singleton
│   ├── socketConfig.ts             # Static IoServer
│   ├── slackConfig.ts              # connectionSlackApp
│   └── ormconfig.ts                # TypeORM DataSource
├── entities/                       # TypeORM entities
├── modules/
│   ├── alerts/
│   │   ├── controller/
│   │   ├── repositories/database/
│   │   ├── services/
│   │   ├── shared/
│   │   └── utils/cronJob.ts        # Cron job with getInstance()
│   ├── conversations/
│   │   ├── controller/
│   │   ├── repositories/
│   │   │   ├── gemini/
│   │   │   ├── openai/
│   │   │   ├── redis/
│   │   │   └── search/
│   │   ├── services/
│   │   │   ├── conversations.services.ts
│   │   │   ├── conversationFlowManager.service.ts
│   │   │   └── messageProcessor.service.ts
│   │   └── shared/
│   ├── users/
│   │   ├── controller/
│   │   ├── repositories/
│   │   │   ├── database/
│   │   │   ├── redis/
│   │   │   └── slack/
│   │   └── services/
│   ├── tasks/
│   ├── notes/
│   ├── links/
│   ├── images/
│   ├── textToSpeech/
│   ├── summary/
│   ├── system/
│   ├── externalStorage/
│   └── constants/
├── shared/
│   ├── middleware/
│   │   ├── auth.ts                 # Decorators with getInstance()
│   │   └── errors.ts
│   ├── modules/
│   │   └── genericController.ts    # Base class for controllers
│   ├── interfaces/
│   └── utils/
└── tests/
    └── setup.ts
```

### Current tsconfig.json Configuration
```json
{
  "compilerOptions": {
    "emitDecoratorMetadata": true,    // ✅ Already enabled
    "experimentalDecorators": true,   // ✅ Already enabled
    // ...
  }
}
```

### reflect-metadata Dependency
```json
// package.json - ✅ Already installed
{
  "dependencies": {
    "reflect-metadata": "^0.1.13"
  }
}
```

---

**End of Document - Waiting for Confirmation for PHASE 3**
