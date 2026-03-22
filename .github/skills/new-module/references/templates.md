# Module Templates

Replace `{Feature}` (PascalCase), `{feature}` (camelCase), `{features}` (plural camelCase) throughout.

---

## Entity Template

**`src/entities/{feature}.ts`**

```typescript
import { BaseEntity, Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { Users } from './users'

@Entity()
export class {Feature}s extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  title: string

  @Column({ default: '' })
  description: string

  @Column({ default: '{Feature}Status.ACTIVE' })
  status: string

  @Column({ nullable: true })
  channelId: string

  @ManyToOne((type) => Users)
  @JoinColumn({ name: 'userId' })
  user: Users

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @DeleteDateColumn()
  deletedAt: Date
}
```

---

## Constants Template

**`src/modules/{feature}/shared/constants/{feature}.constants.ts`**

```typescript
export enum {Feature}Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
```

---

## Interface Template

**`src/modules/{feature}/shared/interfaces/{feature}.interfaces.ts`**

```typescript
import { {Feature}Status } from '../constants/{feature}.constants'

export interface I{Feature} {
  id?: number
  userId: number
  title: string
  description?: string
  status?: {Feature}Status
  channelId?: string
}
```

---

## DataSource Template

**`src/modules/{feature}/repositories/database/{feature}.dataSource.ts`**

```typescript
import { singleton } from 'tsyringe'
import { createModuleLogger } from '../../../../config/logger'
import { {Feature}s } from '../../../../entities/{feature}s'
import { Users } from '../../../../entities/users'
import { I{Feature} } from '../../shared/interfaces/{feature}.interfaces'
import { {Feature}Status } from '../../shared/constants/{feature}.constants'

const log = createModuleLogger('{feature}.dataSource')

@singleton()
export default class {Feature}DataSource {
  constructor() {}

  async create{Feature}(data: I{Feature}): Promise<{Feature}s> {
    try {
      const user = new Users()
      user.id = data.userId

      const new{Feature} = new {Feature}s()
      new{Feature}.title = data.title
      new{Feature}.description = data.description ?? ''
      new{Feature}.status = data.status ?? {Feature}Status.ACTIVE
      new{Feature}.channelId = data.channelId ?? ''
      new{Feature}.user = user

      await new{Feature}.save()
      return new{Feature}
    } catch (error) {
      log.error({ err: error, userId: data.userId }, 'create{Feature} failed')
      throw new Error('Error al crear {feature}')
    }
  }

  async get{Feature}sByUserId(userId: number): Promise<{Feature}s[]> {
    try {
      return await {Feature}s.find({ where: { user: { id: userId } }, order: { createdAt: 'DESC' } })
    } catch (error) {
      log.error({ err: error, userId }, 'get{Feature}sByUserId failed')
      throw new Error('Error al obtener {features}')
    }
  }

  async update{Feature}({feature}Id: number, dataUpdate: Partial<I{Feature}>, userId?: number): Promise<void> {
    try {
      if (userId) {
        await {Feature}s.getRepository().update({ id: {feature}Id, user: { id: userId } }, dataUpdate)
      } else {
        await {Feature}s.update({feature}Id, dataUpdate)
      }
    } catch (error) {
      log.error({ err: error, {feature}Id }, 'update{Feature} failed')
      throw new Error('Error al actualizar {feature}')
    }
  }

  async delete{Feature}({feature}Id: number, userId: number): Promise<number> {
    try {
      const result = await {Feature}s.getRepository().softDelete({
        id: {feature}Id,
        user: { id: userId },
      })
      return result.affected ?? 0
    } catch (error) {
      log.error({ err: error, {feature}Id, userId }, 'delete{Feature} failed')
      throw new Error('Error al eliminar {feature}')
    }
  }
}
```

---

## Service Template

**`src/modules/{feature}/services/{feature}.services.ts`**

```typescript
import { injectable } from 'tsyringe'
import { createModuleLogger } from '../../../config/logger'
import { {Feature}s } from '../../../entities/{feature}s'
import { GenericResponse } from '../../../shared/interfaces/services'
import { I{Feature} } from '../shared/interfaces/{feature}.interfaces'
import {Feature}DataSource from '../repositories/database/{feature}.dataSource'

const log = createModuleLogger('{feature}.services')

@injectable()
export default class {Feature}Services {
  constructor(private dataSource: {Feature}DataSource) {}

  public async create{Feature}(data: I{Feature}): Promise<GenericResponse<{Feature}s>> {
    try {
      const response = await this.dataSource.create{Feature}(data)
      log.info({ userId: data.userId, id: response.id }, '{Feature} created')
      return { data: response }
    } catch (error) {
      log.error({ err: error, userId: data.userId }, 'create{Feature} failed')
      return { error: 'Error al crear {feature}' }
    }
  }

  public async get{Feature}sByUserId(userId: number): Promise<GenericResponse<{Feature}s[]>> {
    try {
      const response = await this.dataSource.get{Feature}sByUserId(userId)
      return { data: response }
    } catch (error) {
      log.error({ err: error, userId }, 'get{Feature}sByUserId failed')
      return { error: 'Error al obtener {features}' }
    }
  }

  public async delete{Feature}({feature}Id: number, userId: number): Promise<GenericResponse<boolean>> {
    try {
      const affected = await this.dataSource.delete{Feature}({feature}Id, userId)
      return { data: affected > 0 }
    } catch (error) {
      log.error({ err: error, {feature}Id, userId }, 'delete{Feature} failed')
      return { error: 'Error al eliminar {feature}' }
    }
  }
}
```

---

## Slack Controller Template

**`src/modules/{feature}/controller/{feature}.controller.ts`**

```typescript
import { injectable } from 'tsyringe'
import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/GenericController'
import { SlackAuth } from '../../../shared/middleware/auth'
import {Feature}Services from '../services/{feature}.services'

const log = createModuleLogger('{feature}.controller')

@injectable()
export default class {Feature}Controller extends GenericController {
  constructor(private {feature}Services: {Feature}Services) {
    super()
    this.create{Feature} = this.create{Feature}.bind(this)
  }

  @SlackAuth
  public async create{Feature}(data: any): Promise<void> {
    const { payload, say }: any = data

    try {
      const text: string = payload.text.replace(/^\.\w+\s*/, '').trim()

      if (!text) {
        say('Por favor ingresa el contenido del {feature}.')
        return
      }

      const response = await this.{feature}Services.create{Feature}({
        userId: this.userData.id,
        title: text,
        channelId: payload.channel,
      })

      if (response.error) {
        say(`Error: ${response.error}`)
        return
      }

      say(`{Feature} creado con ID: ${response.data.id} ✅`)
    } catch (error) {
      log.error({ err: error, slackUserId: payload?.user }, 'create{Feature} slack failed')
      say('Ups! Ocurrió un error al crear el {feature}.')
    }
  }
}
```

---

## Web Controller Template

**`src/modules/{feature}/controller/{feature}Web.controller.ts`**

```typescript
import { Router } from 'express'
import { injectable } from 'tsyringe'
import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/GenericController'
import { HttpAuth, Permission, Profiles } from '../../../shared/middleware/auth'
import { BadRequestError } from '../../../shared/utils/errors/BadRequestError'
import { I{Feature} } from '../shared/interfaces/{feature}.interfaces'
import {Feature}Services from '../services/{feature}.services'

const log = createModuleLogger('{feature}Web.controller')

@injectable()
export default class {Feature}WebController extends GenericController {
  public router: Router

  constructor(private {feature}Services: {Feature}Services) {
    super()
    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/', this.get{Feature}s)
    this.router.post('/', this.create{Feature})
    this.router.delete('/:id', this.delete{Feature})
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async get{Feature}s(req: any, res: any): Promise<void> {
    const user = this.userData
    const response = await this.{feature}Services.get{Feature}sByUserId(user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async create{Feature}(req: any, res: any): Promise<void> {
    const user = this.userData
    const data: I{Feature} = {
      title: req.body.title,
      description: req.body.description ?? '',
      userId: user.id,
    }

    if (!data.title) {
      throw new BadRequestError({ message: 'El título es requerido' })
    }

    const response = await this.{feature}Services.create{Feature}(data)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async delete{Feature}(req: any, res: any): Promise<void> {
    const user = this.userData
    const {feature}Id = Number(req.params.id)

    if (!{feature}Id) {
      throw new BadRequestError({ message: 'ID inválido' })
    }

    const response = await this.{feature}Services.delete{Feature}({feature}Id, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send({ success: response.data })
  }
}
```

---

## Test Templates

### Web Controller Test

**`src/modules/{feature}/controller/__tests__/{feature}Web.controller.test.ts`**

```typescript
import {Feature}WebController from '../{feature}Web.controller'
import { BadRequestError } from '../../../../shared/utils/errors/BadRequestError'

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (_t: any, _k: string, d: PropertyDescriptor) => d
  return {
    HttpAuth: identityDecorator,
    Permission: () => identityDecorator,
    Profiles: { USER: 'USER', USER_PREMIUM: 'USER_PREMIUM', ADMIN: 'ADMIN' },
  }
})

const create{Feature}Mock = jest.fn()
const get{Feature}sByUserIdMock = jest.fn()
const delete{Feature}Mock = jest.fn()

const mockServices = {
  create{Feature}: create{Feature}Mock,
  get{Feature}sByUserId: get{Feature}sByUserIdMock,
  delete{Feature}: delete{Feature}Mock,
} as any

describe('{Feature}WebController', () => {
  let controller: {Feature}WebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new {Feature}WebController(mockServices)
    controller.userData = { id: 1 } as any
    res = { send: jest.fn() }
  })

  describe('create{Feature}', () => {
    it('creates {feature} successfully', async () => {
      const req: any = { body: { title: 'Test {Feature}', description: 'desc' } }
      create{Feature}Mock.mockResolvedValue({ data: { id: 1, title: 'Test {Feature}' } })

      await controller.create{Feature}(req, res)

      expect(create{Feature}Mock).toHaveBeenCalledWith({
        title: 'Test {Feature}',
        description: 'desc',
        userId: 1,
      })
      expect(res.send).toHaveBeenCalledWith({ id: 1, title: 'Test {Feature}' })
    })

    it('throws BadRequestError when title missing', async () => {
      const req: any = { body: { title: '' } }
      await expect(controller.create{Feature}(req, res)).rejects.toThrow(BadRequestError)
    })

    it('throws BadRequestError on service error', async () => {
      const req: any = { body: { title: 'Test' } }
      create{Feature}Mock.mockResolvedValue({ error: 'Error al crear {feature}' })
      await expect(controller.create{Feature}(req, res)).rejects.toThrow(BadRequestError)
    })
  })
})
```

### Service Test

**`src/modules/{feature}/services/__tests__/{feature}.services.test.ts`**

```typescript
import {Feature}Services from '../{feature}.services'

const create{Feature}Mock = jest.fn()

const mockDataSource = {
  create{Feature}: create{Feature}Mock,
} as any

describe('{Feature}Services', () => {
  let services: {Feature}Services

  beforeEach(() => {
    jest.clearAllMocks()
    services = new {Feature}Services(mockDataSource)
  })

  describe('create{Feature}', () => {
    it('returns data on success', async () => {
      create{Feature}Mock.mockResolvedValue({ id: 1, title: 'Test' })
      const result = await services.create{Feature}({ userId: 1, title: 'Test' })
      expect(result.data).toEqual({ id: 1, title: 'Test' })
      expect(result.error).toBeUndefined()
    })

    it('returns error when dataSource throws', async () => {
      create{Feature}Mock.mockRejectedValue(new Error('DB error'))
      const result = await services.create{Feature}({ userId: 1, title: 'Test' })
      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
    })
  })
})
```
