# Guía de Inyección de Dependencias con TSyringe

Este documento describe cómo utilizar el patrón de Inyección de Dependencias (DI) en este proyecto usando **TSyringe**.

> **Nota:** Este documento se aplica después de completar la migración descrita en `DI-MIGRATION-PLAN.md`.

## Tabla de Contenidos

1. [Principios Básicos](#principios-básicos)
2. [Configuración Inicial](#configuración-inicial)
3. [Decoradores Disponibles](#decoradores-disponibles)
4. [Crear un Nuevo Repositorio](#crear-un-nuevo-repositorio)
5. [Crear un Nuevo Servicio](#crear-un-nuevo-servicio)
6. [Crear un Nuevo Controlador](#crear-un-nuevo-controlador)
7. [Patrones Comunes](#patrones-comunes)
8. [Testing con DI](#testing-con-di)
9. [Anti-patrones a Evitar](#anti-patrones-a-evitar)

---

## Principios Básicos

### ¿Qué es Inyección de Dependencias?

La Inyección de Dependencias es un patrón de diseño donde las dependencias de una clase son proporcionadas externamente en lugar de ser creadas internamente. Esto mejora:

- **Testabilidad:** Fácil de inyectar mocks para testing
- **Mantenibilidad:** Cambios en dependencias no requieren modificar consumidores
- **Desacoplamiento:** Las clases no conocen cómo se crean sus dependencias

### Reglas del Proyecto

1. **Usa inyección por constructor exclusivamente**
2. **Nunca uses `getInstance()` en código nuevo**
3. **Usa `container.resolve()` solo en el Composition Root (`app.ts`) o casos límite documentados**
4. **Los repositorios son `@singleton()`**
5. **Los servicios son `@injectable()`**
6. **Los controladores son `@injectable()`**

---

## Configuración Inicial

### Requisitos en tsconfig.json

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Import en Entry Point

El archivo `src/index.ts` debe importar `reflect-metadata` antes de cualquier otra cosa:

```typescript
import 'reflect-metadata'
import './di-container' // Registros del contenedor
import App from './app'

const app = new App()
void app.start()
```

---

## Decoradores Disponibles

### `@singleton()`

Registra la clase como singleton. La misma instancia se usa en toda la aplicación.

```typescript
import { singleton } from 'tsyringe'

@singleton()
export default class UsersDataSource {
  // Una sola instancia para toda la app
}
```

**Usar para:**
- Repositorios de base de datos
- Repositorios de Redis
- Clientes de APIs externas

### `@injectable()`

Marca la clase como inyectable. Se crea una nueva instancia por cada resolución (a menos que se registre explícitamente como singleton).

```typescript
import { injectable } from 'tsyringe'

@injectable()
export default class UsersServices {
  // Nueva instancia por cada resolución
}
```

**Usar para:**
- Servicios de negocio
- Controladores

### `@inject(token)`

Especifica qué token usar para resolver una dependencia.

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

Resuelve dependencias circulares usando carga diferida.

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

## Crear un Nuevo Repositorio

Los repositorios son la capa de acceso a datos (BD, Redis, APIs externas).

### Template: Repository de Base de Datos

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

### Template: Repository de Redis

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

### Template: Repository de API Externa

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

## Crear un Nuevo Servicio

Los servicios contienen la lógica de negocio.

### Template: Servicio Básico

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
      return { error: 'Error al crear la entidad' }
    }
  }

  async getById(id: number): Promise<GenericResponse<IMyEntity>> {
    try {
      const result = await this.dataSource.findById(id)
      
      if (!result) {
        return { error: 'Entidad no encontrada' }
      }
      
      return { data: result }
    } catch (error) {
      log.error({ err: error, id }, 'getById failed')
      return { error: 'Error al obtener la entidad' }
    }
  }
}
```

### Template: Servicio con Múltiples Dependencias

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
    // Usa las dependencias inyectadas
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

## Crear un Nuevo Controlador

Los controladores manejan las peticiones HTTP.

### Template: Controlador Web

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

## Patrones Comunes

### Registrar en el Contenedor

Para registros especiales (interfaces, tokens, factories), edita `src/di-container.ts`:

```typescript
// src/di-container.ts
import { container } from 'tsyringe'

// Registro básico (automático con decoradores)
// No necesitas registrar clases decoradas con @singleton() o @injectable()

// Registro con token personalizado
container.register('AIRepository', { useClass: GeminiRepository })

// Registro de valor
container.register('API_KEY', { useValue: process.env.API_KEY })

// Registro con factory
container.register('DatabaseConnection', {
  useFactory: () => {
    return connectionSource.isInitialized ? connectionSource : null
  }
})
```

### Resolver desde el Composition Root

```typescript
// src/app.ts
import 'reflect-metadata'
import { container } from 'tsyringe'

export default class App {
  private usersController: UsersController
  private alertsController: AlertsWebController

  constructor() {
    // Resolver desde el contenedor
    this.usersController = container.resolve(UsersController)
    this.alertsController = container.resolve(AlertsWebController)
    
    // ... resto de la inicialización
  }
}
```

---

## Testing con DI

### Crear Tests con Mocks Inyectados

```typescript
// src/modules/my/services/__tests__/my.services.test.ts
import MyServices from '../my.services'
import MyDataSource from '../../repositories/database/my.dataSource'

describe('MyServices', () => {
  let service: MyServices
  let mockDataSource: jest.Mocked<MyDataSource>

  beforeEach(() => {
    // Crear mock
    mockDataSource = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any

    // Inyectar mock en constructor
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

      expect(result.error).toBe('Entidad no encontrada')
    })
  })
})
```

### Tests de Integración con Contenedor

```typescript
// src/modules/my/services/__tests__/my.services.integration.test.ts
import 'reflect-metadata'
import { container } from 'tsyringe'
import MyServices from '../my.services'

describe('MyServices Integration', () => {
  beforeEach(() => {
    // Crear child container para aislamiento
    container.clearInstances()
    
    // Registrar mocks
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

## Anti-patrones a Evitar

### ❌ NO: Usar getInstance()

```typescript
// INCORRECTO
export default class MyServices {
  private static instance: MyServices
  
  static getInstance(): MyServices {
    if (!this.instance) this.instance = new MyServices()
    return this.instance
  }
}
```

### ❌ NO: Usar container.resolve() dentro de clases de negocio

```typescript
// INCORRECTO
@injectable()
export default class MyServices {
  doSomething() {
    const otherService = container.resolve(OtherService) // ❌ Service Locator
    otherService.process()
  }
}
```

### ✅ SÍ: Inyectar dependencias en constructor

```typescript
// CORRECTO
@injectable()
export default class MyServices {
  constructor(
    private otherService: OtherService // ✅ Inyección por constructor
  ) {}

  doSomething() {
    this.otherService.process()
  }
}
```

### ❌ NO: Crear instancias manualmente

```typescript
// INCORRECTO
@injectable()
export default class MyServices {
  private dataSource = new MyDataSource() // ❌ Instancia manual
}
```

### ✅ SÍ: Dejar que TSyringe resuelva dependencias

```typescript
// CORRECTO
@injectable()
export default class MyServices {
  constructor(
    private dataSource: MyDataSource // ✅ TSyringe resuelve automáticamente
  ) {}
}
```

---

## Referencias

- [TSyringe Documentation](https://github.com/microsoft/tsyringe)
- [Dependency Injection Principles](https://en.wikipedia.org/wiki/Dependency_injection)
- [SOLID Principles - Dependency Inversion](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
