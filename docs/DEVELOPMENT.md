# Development Guide

Complete guide for developers working on the Slack Bot project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Structure](#code-structure)
- [Adding New Features](#adding-new-features)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Git Workflow](#git-workflow)
- [Debugging](#debugging)

---

## Getting Started

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd slack_bot

# Install dependencies
npm install

# Copy environment file
cp ".env copy" .env
```

### Environment Configuration

Edit `.env` with your credentials:

```bash
# Minimum required for development
SLACK_SIGNING_SECRET=your_secret
SLACK_BOT_TOKEN=xoxb-your-token
APP_TOKEN=xapp-your-token
OPENAI_API_KEY=sk-your-key

# Optional
GEMINI_API_KEY=
LEAP_API_KEY=
REDIS_HOST=localhost
```

### Start Development Server

```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start application
npm run dev
```

### Verify Setup

```bash
# Check Express server
curl http://localhost:4000

# Check Slack bot logs
# Should see: "~ Slack Bot is running on port 3001!"
```

---

## Development Workflow

### Branch Naming

- `feat/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation changes
- `test/` - Test additions/changes
- `chore/` - Maintenance tasks

**Examples:**

```
feat/image-generation
fix/conversation-memory-leak
refactor/alert-service
docs/api-documentation
```

### Commit Messages

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructure
- `test` - Tests
- `chore` - Maintenance

**Examples:**

```
feat(conversations): add Gemini AI integration
fix(alerts): correct cron job timing
refactor(tasks): extract repository layer
docs(readme): update installation steps
test(notes): add unit tests for service layer
```

---

## Code Structure

### Module Anatomy

When creating a new module, follow this structure:

```
src/modules/{feature}/
├── controller/
│   ├── {feature}.controller.ts       # Slack handlers
│   └── {feature}Web.controller.ts    # Express/Socket.io
├── services/
│   └── {feature}.services.ts         # Business logic
├── repositories/
│   ├── database/
│   │   └── {feature}.dataSource.ts   # TypeORM entity
│   ├── redis/
│   │   └── {feature}.redis.ts        # Redis operations
│   └── {api}/
│       └── {api}.repository.ts       # External API client
├── shared/
│   ├── constants/
│   │   └── {feature}.constants.ts    # Module constants
│   ├── interfaces/
│   │   └── {feature}.interfaces.ts   # TypeScript types
│   └── utils/
│       └── {feature}.utils.ts        # Helper functions
└── __tests__/
    └── {layer}/__tests__/
```

### Layer Responsibilities

**Controller:**

- Handle HTTP requests
- Process Slack events
- Manage Socket.io events
- Validate input
- Return responses

**Services:**

- Implement business logic
- Orchestrate repository calls
- Handle complex operations
- Manage transactions

**Repository:**

- Database operations (CRUD)
- External API calls
- Redis caching
- Data transformation

---

## Adding New Features

### Example: Adding a new "Reminders" module

**1. Create module structure:**

```bash
mkdir -p src/modules/reminders/{controller,services,repositories/database,shared/{constants,interfaces}}
```

**2. Create entity (database model):**

```typescript
// src/modules/reminders/repositories/database/reminders.dataSource.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm'

@Entity('reminders')
export class Reminder {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  message: string

  @Column()
  date: Date

  @Column()
  userId: number
}
```

**3. Create service:**

```typescript
// src/modules/reminders/services/reminders.services.ts
import RemindersDataSource from '../repositories/database/reminders.dataSource'

export default class RemindersServices {
  private static instance: RemindersServices
  private dataSource: RemindersDataSource

  private constructor() {
    this.dataSource = RemindersDataSource.getInstance()
  }

  static getInstance(): RemindersServices {
    if (!this.instance) {
      this.instance = new RemindersServices()
    }
    return this.instance
  }

  async createReminder(data: any) {
    return await this.dataSource.create(data)
  }

  async getReminders(userId: number) {
    return await this.dataSource.findByUserId(userId)
  }
}
```

**4. Create controller:**

```typescript
// src/modules/reminders/controller/remindersWeb.controller.ts
import { Router } from 'express'
import RemindersServices from '../services/reminders.services'

export default class RemindersWebController {
  private static instance: RemindersWebController
  public router: Router
  private service: RemindersServices

  private constructor() {
    this.service = RemindersServices.getInstance()
    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): RemindersWebController {
    if (!this.instance) {
      this.instance = new RemindersWebController()
    }
    return this.instance
  }

  private registerRoutes(): void {
    this.router.get('/', this.getReminders.bind(this))
    this.router.post('/', this.createReminder.bind(this))
  }

  private async getReminders(req: any, res: any) {
    const reminders = await this.service.getReminders(req.user.id)
    res.json(reminders)
  }

  private async createReminder(req: any, res: any) {
    const reminder = await this.service.createReminder(req.body)
    res.json(reminder)
  }
}
```

**5. Register in app.ts:**

```typescript
// src/app.ts
import RemindersWebController from './modules/reminders/controller/remindersWeb.controller'

export default class App {
  private remindersWebController: RemindersWebController

  constructor() {
    // ... other controllers
    this.remindersWebController = RemindersWebController.getInstance()
    // ...
  }

  private router(): void {
    // ... other routes
    this.app.use('/reminders', [this.remindersWebController.router])
  }
}
```

**6. Add tests:**

```typescript
// src/modules/reminders/services/__tests__/reminders.services.test.ts
import RemindersServices from '../reminders.services'

describe('RemindersServices', () => {
  let service: RemindersServices

  beforeAll(() => {
    service = RemindersServices.getInstance()
  })

  it('should create reminder', async () => {
    const data = { message: 'Test', date: new Date(), userId: 1 }
    const result = await service.createReminder(data)
    expect(result).toBeDefined()
  })
})
```

---

## Testing

### Test Structure

Tests are located in `__tests__/` directories within each layer:

```
src/modules/feature/
├── controller/__tests__/
├── services/__tests__/
├── repositories/__tests__/
└── utils/__tests__/
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Run specific test file
npm test -- reminders.services.test.ts
```

### Writing Tests

**Unit test example:**

```typescript
import TasksServices from '../tasks.services'

describe('TasksServices', () => {
  let service: TasksServices

  beforeAll(() => {
    service = TasksServices.getInstance()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('createTask', () => {
    it('should create task successfully', async () => {
      const taskData = {
        title: 'Test task',
        userId: 1,
      }

      const result = await service.createTask(taskData)

      expect(result).toBeDefined()
      expect(result.title).toBe('Test task')
    })

    it('should throw error if title is missing', async () => {
      const taskData = { userId: 1 }

      await expect(service.createTask(taskData)).rejects.toThrow()
    })
  })
})
```

**Mocking external dependencies:**

```typescript
jest.mock('../repositories/openai/openai.repository')
import OpenAIRepository from '../repositories/openai/openai.repository'

const mockOpenAI = OpenAIRepository as jest.MockedClass<typeof OpenAIRepository>

mockOpenAI.prototype.generateConversation.mockResolvedValue({
  content: 'Mocked response',
})
```

### Test Coverage Goals

- **Controllers:** 70%+
- **Services:** 80%+
- **Repositories:** 90%+
- **Utils:** 95%+

---

## Code Quality

### Linting

```bash
# Run linter
npm run lint

# Auto-fix issues
npm run lint -- --fix
```

### ESLint Configuration

Located in `.eslintrc.json`:

```json
{
  "extends": "standard-with-typescript",
  "rules": {
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/strict-boolean-expressions": "off"
  }
}
```

### Code Formatting

Use consistent formatting:

```typescript
// Good
async function getUserData(userId: number): Promise<User> {
  const user = await repository.find(userId)
  return user
}

// Bad
async function getUserData(userId: number) {
  const user = await repository.find(userId)
  return user
}
```

### TypeScript Best Practices

**1. Use explicit types:**

```typescript
// Good
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}

// Avoid
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}
```

**2. Use interfaces for data structures:**

```typescript
interface IAlert {
  id?: number
  message: string
  date: Date
  userId: number
}
```

**3. Use enums for constants:**

```typescript
enum AIProvider {
  OPENAI = 'OPENAI',
  GEMINI = 'GEMINI',
}
```

**4. Use TypeScript private fields (avoid JS `#`):**

```typescript
class Service {
  private repository: Repository // Private field

  constructor() {
    this.repository = new Repository()
  }
}
```

---

## Git Workflow

### Pre-commit Hooks

Husky runs automatically on commit:

```bash
# Runs:
# 1. ESLint
# 2. Jest tests
```

Skipped in production:

```bash
NODE_ENV=production npm install  # Skips Husky
```

### Creating a Pull Request

1. **Ensure tests pass:**

```bash
npm test
npm run lint
```

2. **Create PR with description:**

```markdown
## Changes

- Added reminder module
- Implemented cron job for reminders

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Screenshots

[If applicable]
```

3. **Request review**

4. **Address feedback**

5. **Merge after approval**

### Code Review Checklist

- [ ] Code follows project structure
- [ ] Tests included and passing
- [ ] No console.logs in production code
- [ ] Error handling implemented
- [ ] Documentation updated
- [ ] No sensitive data in code
- [ ] Singleton pattern followed
- [ ] TypeScript types defined

---

## Debugging

### Using VS Code Debugger

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug App",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "preLaunchTask": "npm: dev",
      "outFiles": ["${workspaceFolder}/build/**/*.js"],
      "runtimeArgs": ["--nolazy", "-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### Console Debugging

```typescript
// Temporary debugging (remove before commit)
console.log('Debug:', { variable, data })

// Use in development only
if (process.env.NODE_ENV !== 'production') {
  console.log('Dev debug info')
}
```

### Network Debugging

**Redis:**

```bash
redis-cli MONITOR  # Watch all Redis commands
```

**HTTP:**

```bash
# Test endpoints
curl -v http://localhost:4000/alerts

# Check Socket.io
wscat -c ws://localhost:4000/socket.io/
```

**Slack:**

```bash
# Enable Slack debug logs
DEBUG=@slack/bolt:* npm run dev
```

### Database Debugging

```typescript
// Enable TypeORM logging
// ormconfig.ts
{
  logging: true,
  logger: 'advanced-console'
}
```

---

## Common Development Tasks

### Add new REST endpoint

```typescript
// In Web controller
protected registerRoutes(): void {
  this.router.post('/new-endpoint', this.newHandler.bind(this))
}

private async newHandler(req: any, res: any) {
  const result = await this.service.doSomething(req.body)
  res.json(result)
}
```

### Add new Socket.io event

```typescript
// In app.ts socketListeners
socket.on('new_event', async (data) => {
  const result = await this.controller.handleNewEvent(data)
  io.in(data.channel).emit('new_event_response', result)
})
```

### Add new Slack command

```typescript
// 1. Add regex to slackConfig.ts
export const slackListenersKey = {
  newCommand: /^cmd?\b/,
}

// 2. Add listener in app.ts
this.slackApp.message(
  slackListenersKey.newCommand,
  safeHandler(this.controller.handleCommand)
)

// 3. Implement handler in controller
async handleCommand({ message, say }: any) {
  const response = await this.service.processCommand(message.text)
  await say(response)
}
```

### Add database migration

```typescript
// 1. Update entity
@Entity()
export class Task {
  @Column({ nullable: true })  // New column
  priority: string
}

// 2. Run in development (auto-sync)
npm run dev

// 3. For production, create migration
npm run migration:generate -- -n AddPriority
npm run migration:run
```

---

## Performance Tips

### Optimize queries

```typescript
// Bad - N+1 query problem
for (const task of tasks) {
  task.user = await userRepo.findOne(task.userId)
}

// Good - Single query with join
const tasks = await taskRepo.find({
  relations: ['user'],
})
```

### Cache expensive operations

```typescript
// Check cache first
const cached = await redis.get(`key:${id}`)
if (cached) return JSON.parse(cached)

// Compute and cache
const result = await expensiveOperation()
await redis.setex(`key:${id}`, 3600, JSON.stringify(result))
```

### Limit conversation history

```typescript
// Only send last N messages to AI
const recentMessages = conversation.slice(-10)
```

---

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Slack Bolt SDK](https://slack.dev/bolt-js/)
- [TypeORM Documentation](https://typeorm.io/)
- [Socket.io Documentation](https://socket.io/docs/)
- [OpenAI API Reference](https://platform.openai.com/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

---

## Getting Help

- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Review existing code in similar modules
- Ask in team chat
- Create GitHub issue for bugs
- Read API documentation
