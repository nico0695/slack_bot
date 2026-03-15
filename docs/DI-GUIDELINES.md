# Dependency Injection Guide with TSyringe

This document describes how to use the Dependency Injection (DI) pattern in this project using **TSyringe**.

> **Note:** This document applies after completing the migration described in `DI-MIGRATION-PLAN.md`.

## Table of Contents

1. [Basic Principles](#basic-principles)
2. [Initial Configuration](#initial-configuration)
3. [Available Decorators](#available-decorators)
4. [Create a New Repository](#create-a-new-repository)
5. [Create a New Service](#create-a-new-service)
6. [Create a New Controller](#create-a-new-controller)
7. [Common Patterns](#common-patterns)
8. [Testing with DI](#testing-with-di)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Basic Principles

### What is Dependency Injection?

Dependency Injection is a design pattern where a class's dependencies are provided externally instead of being created internally. This improves:

- **Testability:** Easy to inject mocks for testing
- **Maintainability:** Dependency changes don't require modifying consumers
- **Decoupling:** Classes do not know how their dependencies are created

### Project Rules

1. **Use constructor injection exclusively**
2. **Never use `getInstance()` in new code**
3. **Use `container.resolve()` only in the Composition Root (`app.ts`) or documented edge cases**
4. **Repositories are `@singleton()`**
5. **Services are `@injectable()`**
6. **Controllers are `@injectable()`**

---

## Initial Configuration

### Requirements in tsconfig.json

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Import in the Entry Point

The `src/index.ts` file must import `reflect-metadata` before anything else:

```typescript
import 'reflect-metadata'
import './di-container' // Container registrations
import App from './app'

const app = new App()
void app.start()
```

---

## Available Decorators

### `@singleton()`

Registers the class as a singleton. The same instance is used throughout the application.

```typescript
import { singleton } from 'tsyringe'

@singleton()
export default class UsersDataSource {
  // A single instance for the whole app
}
```

**Use for:**
- Database repositories
- Redis repositories
- External API clients

### `@injectable()`

Marks the class as injectable. A new instance is created for each resolution (unless explicitly registered as a singleton).

```typescript
import { injectable } from 'tsyringe'

@injectable()
export default class UsersServices {
  // New instance per resolution
}
```

**Use for:**
- Business services
- Controllers

### `@inject(token)`

Specifies which token to use to resolve a dependency.

```typescript
import { injectable, inject } from 'tsyringe'

@injectable()
export default class MyService {
  constructor(
    @inject('AIRepository') private aiRepo: OpenaiRepository | GeminiRepository
  ) {}
}
```

### `@delay(() => Class)`

Resolves circular dependencies using lazy loading.

```typescript
import { injectable, inject, delay } from 'tsyringe'

@injectable()
export default class ServiceA {
  constructor(
    @inject(delay(() => ServiceB)) private serviceB: ServiceB
  ) {}
}
```

---

## Create a New Repository

Repositories are the data access layer (DB, Redis, external APIs).

### Template: Database Repository

> **Naming Convention:** Replace `{module}` with your module name. For example, if creating a repository for the "products" module, the path would be `src/modules/products/repositories/database/products.dataSource.ts`.

```typescript
// src/modules/{module}/repositories/database/{module}.dataSource.ts
import { singleton } from 'tsyringe'
import { Entity } from '../../../../entities/{entity}'

@singleton()
export default class MyDataSource {
  constructor() {}

  async findAll(): Promise<Entity[]> {
    return await Entity.find()
  }

  async findById(id: number): Promise<Entity | null> {
    return await Entity.findOne({ where: { id } })
  }

  async create(data: Partial<Entity>): Promise<Entity> {
    const entity = new Entity()
    Object.assign(entity, data)
    await entity.save()
    return entity
  }

  async update(id: number, data: Partial<Entity>): Promise<Entity | null> {
    await Entity.update(id, data)
    return await this.findById(id)
  }

  async delete(id: number): Promise<boolean> {
    const result = await Entity.delete(id)
    return (result.affected ?? 0) > 0
  }
}
```

### Template: Redis Repository

```typescript
// src/modules/{module}/repositories/redis/{module}.redis.ts
import { singleton, inject } from 'tsyringe'
import { RedisConfig } from '../../../../config/redisConfig'

@singleton()
export default class MyRedisRepository {
  private redisClient

  constructor() {
    this.redisClient = RedisConfig.getClient()
  }

  async get(key: string): Promise<string | null> {
    return await this.redisClient.get(key)
  }

  async set(key: string, value: string): Promise<void> {
    await this.redisClient.set(key, value)
  }
}
```

### Template: External API Repository

> **Naming Convention:** Replace `{api}` with the external API name. Examples: `openai.repository.ts`, `gemini.repository.ts`, `stripe.repository.ts`.

```typescript
// src/modules/{module}/repositories/external/{api}.repository.ts
import { singleton } from 'tsyringe'
import axios from 'axios'
import { createModuleLogger } from '../../../../config/logger'

const log = createModuleLogger('myApi.repository')

@singleton()
export default class MyApiRepository {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor() {
    this.baseUrl = process.env.MY_API_URL ?? ''
    this.apiKey = process.env.MY_API_KEY ?? ''
  }

  async fetchData(id: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/data/${id}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      })
      return response.data
    } catch (error) {
      log.error({ err: error }, 'API call failed')
      throw error
    }
  }
}
```

---

## Create a New Service

Services contain the business logic.

### Template: Basic Service

```typescript
// src/modules/{module}/services/{module}.services.ts
import { injectable } from 'tsyringe'
import { GenericResponse } from '../../../shared/interfaces/services'
import { createModuleLogger } from '../../../config/logger'
import MyDataSource from '../repositories/database/my.dataSource'
import { IMyEntity } from '../shared/interfaces/my.interfaces'

const log = createModuleLogger('my.service')

@injectable()
export default class MyServices {
  constructor(
    private dataSource: MyDataSource
  ) {}

  async create(data: IMyEntity): Promise<GenericResponse<IMyEntity>> {
    try {
      const result = await this.dataSource.create(data)
      
      log.info({ id: result.id }, 'Entity created')
      
      return { data: result }
    } catch (error) {
      log.error({ err: error }, 'create failed')
      return { error: 'Error creating the entity' }
    }
  }

  async getById(id: number): Promise<GenericResponse<IMyEntity>> {
    try {
      const result = await this.dataSource.findById(id)
      
      if (!result) {
        return { error: 'Entity not found' }
      }
      
      return { data: result }
    } catch (error) {
      log.error({ err: error, id }, 'getById failed')
      return { error: 'Error retrieving the entity' }
    }
  }
}
```

### Template: Service with Multiple Dependencies

```typescript
// src/modules/{module}/services/{module}.services.ts
import { injectable } from 'tsyringe'
import MyDataSource from '../repositories/database/my.dataSource'
import MyRedisRepository from '../repositories/redis/my.redis'
import OtherServices from '../../other/services/other.services'

@injectable()
export default class MyServices {
  constructor(
    private dataSource: MyDataSource,
    private redisRepo: MyRedisRepository,
    private otherServices: OtherServices
  ) {}

  async complexOperation(id: number): Promise<any> {
    // Use injected dependencies
    const cached = await this.redisRepo.get(`entity:${id}`)
    
    if (cached) {
      return JSON.parse(cached)
    }
    
    const data = await this.dataSource.findById(id)
    const enriched = await this.otherServices.enrich(data)
    
    await this.redisRepo.set(`entity:${id}`, JSON.stringify(enriched))
    
    return enriched
  }
}
```

---

## Create a New Controller

Controllers handle HTTP requests.

### Template: Web Controller

```typescript
// src/modules/{module}/controller/{module}Web.controller.ts
import { Router } from 'express'
import { injectable } from 'tsyringe'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody, validateParams, idParamSchema } from '../../../shared/utils/validation'

import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

import MyServices from '../services/my.services'
import { createSchema, updateSchema } from '../shared/schemas/my.schemas'

@injectable()
export default class MyWebController extends GenericController {
  public router: Router

  constructor(
    private myServices: MyServices
  ) {
    super()
    this.create = this.create.bind(this)
    this.getAll = this.getAll.bind(this)
    this.getById = this.getById.bind(this)
    this.update = this.update.bind(this)
    this.delete = this.delete.bind(this)

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/', this.getAll)
    this.router.get('/:id', this.getById)
    this.router.post('/', this.create)
    this.router.put('/:id', this.update)
    this.router.delete('/:id', this.delete)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.ADMIN])
  public async create(req: any, res: any): Promise<void> {
    const user = this.userData
    const parsed = validateBody(createSchema, req.body)

    const response = await this.myServices.create({ ...parsed, userId: user.id })

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.status(201).send(response.data)
  }

  @HttpAuth
  public async getAll(req: any, res: any): Promise<void> {
    const user = this.userData

    const response = await this.myServices.getByUserId(user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  public async getById(req: any, res: any): Promise<void> {
    const { id } = validateParams(idParamSchema, req.params)
    const user = this.userData

    const response = await this.myServices.getById(id, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  public async update(req: any, res: any): Promise<void> {
    const { id } = validateParams(idParamSchema, req.params)
    const user = this.userData
    const parsed = validateBody(updateSchema, req.body)

    const response = await this.myServices.update(id, user.id, parsed)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  public async delete(req: any, res: any): Promise<void> {
    const { id } = validateParams(idParamSchema, req.params)
    const user = this.userData

    const response = await this.myServices.delete(id, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send({ success: response.data })
  }
}
```

---

## Common Patterns

### Register in the Container

For special registrations (interfaces, tokens, factories), edit `src/di-container.ts`:

```typescript
// src/di-container.ts
import { container } from 'tsyringe'

// Basic registration (automatic with decorators)
// You do not need to register classes decorated with @singleton() or @injectable()

// Registration with custom token
container.register('AIRepository', { useClass: GeminiRepository })

// Value registration
container.register('API_KEY', { useValue: process.env.API_KEY })

// Factory registration
container.register('DatabaseConnection', {
  useFactory: () => {
    return connectionSource.isInitialized ? connectionSource : null
  }
})
```

### Resolve from the Composition Root

```typescript
// src/app.ts
import 'reflect-metadata'
import { container } from 'tsyringe'

export default class App {
  private usersController: UsersController
  private alertsController: AlertsWebController

  constructor() {
    // Resolve from the container
    this.usersController = container.resolve(UsersController)
    this.alertsController = container.resolve(AlertsWebController)
    
    // ... rest of the initialization
  }
}
```

---

## Testing with DI

### Create Tests with Injected Mocks

```typescript
// src/modules/my/services/__tests__/my.services.test.ts
import MyServices from '../my.services'
import MyDataSource from '../../repositories/database/my.dataSource'

describe('MyServices', () => {
  let service: MyServices
  let mockDataSource: jest.Mocked<MyDataSource>

  beforeEach(() => {
    // Create mock
    mockDataSource = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any

    // Inject mock into constructor
    service = new MyServices(mockDataSource)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getById', () => {
    it('should return entity when found', async () => {
      const mockEntity = { id: 1, name: 'Test' }
      mockDataSource.findById.mockResolvedValue(mockEntity)

      const result = await service.getById(1)

      expect(result.data).toEqual(mockEntity)
      expect(mockDataSource.findById).toHaveBeenCalledWith(1)
    })

    it('should return error when not found', async () => {
      mockDataSource.findById.mockResolvedValue(null)

      const result = await service.getById(999)

      expect(result.error).toBe('Entity not found')
    })
  })
})
```

### Integration Tests with the Container

```typescript
// src/modules/my/services/__tests__/my.services.integration.test.ts
import 'reflect-metadata'
import { container } from 'tsyringe'
import MyServices from '../my.services'

describe('MyServices Integration', () => {
  beforeEach(() => {
    // Create child container for isolation
    container.clearInstances()
    
    // Register mocks
    container.register(MyDataSource, {
      useValue: {
        findById: jest.fn().mockResolvedValue({ id: 1 }),
      }
    })
  })

  it('should resolve with dependencies', () => {
    const service = container.resolve(MyServices)
    expect(service).toBeDefined()
  })
})
```

---

## Anti-Patterns to Avoid

### ❌ NO: Use getInstance()

```typescript
// INCORRECT
export default class MyServices {
  private static instance: MyServices
  
  static getInstance(): MyServices {
    if (!this.instance) this.instance = new MyServices()
    return this.instance
  }
}
```

### ❌ NO: Use container.resolve() inside business classes

```typescript
// INCORRECT
@injectable()
export default class MyServices {
  doSomething() {
    const otherService = container.resolve(OtherService) // ❌ Service Locator
    otherService.process()
  }
}
```

### ✅ YES: Inject dependencies in the constructor

```typescript
// CORRECT
@injectable()
export default class MyServices {
  constructor(
    private otherService: OtherService // ✅ Constructor injection
  ) {}

  doSomething() {
    this.otherService.process()
  }
}
```

### ❌ NO: Create instances manually

```typescript
// INCORRECT
@injectable()
export default class MyServices {
  private dataSource = new MyDataSource() // ❌ Manual instance
}
```

### ✅ YES: Let TSyringe resolve dependencies

```typescript
// CORRECT
@injectable()
export default class MyServices {
  constructor(
    private dataSource: MyDataSource // ✅ TSyringe resolves automatically
  ) {}
}
```

---

## References

- [TSyringe Documentation](https://github.com/microsoft/tsyringe)
- [Dependency Injection Principles](https://en.wikipedia.org/wiki/Dependency_injection)
- [SOLID Principles - Dependency Inversion](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
