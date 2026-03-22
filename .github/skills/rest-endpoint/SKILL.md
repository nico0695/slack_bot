---
name: rest-endpoint
description: Add REST API endpoints to an existing web controller in the slack-bot project. Covers proper @HttpAuth + @Permission decorator stacking, input validation with BadRequestError, route registration in registerRoutes(), and matching test patterns. Use when adding GET/POST/PUT/DELETE routes to any *Web.controller.ts.
---

# Add REST Endpoints

## Endpoint Anatomy

Every endpoint in this project follows this exact structure:

```typescript
@HttpAuth
@Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
public async myEndpoint(req: any, res: any): Promise<void> {
  const user = this.userData  // injected by @HttpAuth

  // 1. Validate input
  if (!req.body.requiredField) {
    throw new BadRequestError({ message: 'El campo X es requerido' })
  }

  // 2. Call service
  const response = await this.#featureServices.doSomething({
    userId: user.id,
    ...req.body,
  })

  // 3. Handle service error
  if (response.error) {
    throw new BadRequestError({ message: response.error })
  }

  // 4. Send success response
  res.send(response.data)
}
```

**Decorator order is fixed:** `@HttpAuth` always above `@Permission`.

---

## Route Registration

In `registerRoutes()` inside the constructor chain:

```typescript
protected registerRoutes(): void {
  this.router.get('/', this.getItems)
  this.router.get('/:id', this.getItemById)
  this.router.post('/', this.createItem)
  this.router.put('/:id', this.updateItem)
  this.router.delete('/:id', this.deleteItem)
}
```

Bind each method in `private constructor()`:
```typescript
private constructor() {
  super()
  this.#services = FeatureServices.getInstance()
  this.router = Router()
  this.registerRoutes()
  // No need to bind — arrow functions or using class method binding via registerRoutes
}
```

> Note: Methods decorated with `@HttpAuth` do NOT need `.bind(this)` because the decorator wraps them. But verify if the project uses bound methods elsewhere.

---

## Common Patterns

### GET list
```typescript
@HttpAuth
@Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
public async getItems(req: any, res: any): Promise<void> {
  const user = this.userData
  const { tag, status } = req.query  // optional filters

  const response = await this.#services.getItemsByUserId(user.id, { tag, status })

  if (response.error) {
    throw new BadRequestError({ message: response.error })
  }

  res.send(response.data)
}
```

### GET by ID
```typescript
@HttpAuth
@Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
public async getItemById(req: any, res: any): Promise<void> {
  const user = this.userData
  const itemId = Number(req.params.id)

  if (!itemId) {
    throw new BadRequestError({ message: 'ID inválido' })
  }

  const response = await this.#services.getItemById(itemId, user.id)

  if (response.error) {
    throw new BadRequestError({ message: response.error })
  }

  if (!response.data) {
    throw new BadRequestError({ message: 'No encontrado' })
  }

  res.send(response.data)
}
```

### PUT (update)
```typescript
@HttpAuth
@Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
public async updateItem(req: any, res: any): Promise<void> {
  const user = this.userData
  const itemId = Number(req.params.id)

  if (!itemId) {
    throw new BadRequestError({ message: 'ID inválido' })
  }

  const response = await this.#services.updateItem(itemId, req.body, user.id)

  if (response.error) {
    throw new BadRequestError({ message: response.error })
  }

  res.send(response.data)
}
```

### DELETE
```typescript
@HttpAuth
@Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
public async deleteItem(req: any, res: any): Promise<void> {
  const user = this.userData
  const itemId = Number(req.params.id)

  if (!itemId) {
    throw new BadRequestError({ message: 'ID inválido' })
  }

  const response = await this.#services.deleteItem(itemId, user.id)

  if (response.error) {
    throw new BadRequestError({ message: response.error })
  }

  res.send({ success: response.data })
}
```

---

## Register Route in `app.ts`

```typescript
// In App constructor, after other routes:
this.#app.use('/feature-name', [this.#featureWebController.router])
```

---

## Imports Required

```typescript
import { Router } from 'express'
import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/GenericController'
import { HttpAuth, Permission, Profiles } from '../../../shared/middleware/auth'
import { BadRequestError } from '../../../shared/utils/errors/BadRequestError'
```

---

## Test Pattern

Mock auth decorators and service in controller tests:

```typescript
jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (_t: any, _k: string, d: PropertyDescriptor) => d
  return {
    HttpAuth: identityDecorator,
    Permission: () => identityDecorator,
    Profiles: { USER: 'USER', USER_PREMIUM: 'USER_PREMIUM', ADMIN: 'ADMIN' },
  }
})

const serviceMock = jest.fn()

jest.mock('../../services/feature.services', () => ({
  __esModule: true,
  default: { getInstance: () => ({ myMethod: serviceMock }) },
}))

describe('endpoint', () => {
  beforeEach(() => {
    controller = FeatureWebController.getInstance()
    controller.userData = { id: 1 } as any
    res = { send: jest.fn() }
  })

  it('throws BadRequestError on missing field', async () => {
    await expect(controller.createItem({ body: {} }, res)).rejects.toThrow(BadRequestError)
  })

  it('throws BadRequestError on service error', async () => {
    serviceMock.mockResolvedValue({ error: 'fail' })
    await expect(controller.createItem({ body: { title: 'x' } }, res)).rejects.toThrow(BadRequestError)
  })
})
```

---

## Checklist

- [ ] `@HttpAuth` decorator above `@Permission`
- [ ] `const user = this.userData` for authenticated user
- [ ] Input validated, throw `BadRequestError` with Spanish message
- [ ] Service response checked for `.error` before `.data`
- [ ] Route registered in `registerRoutes()` and `app.ts`
- [ ] Controller and service tests written with mocked auth
