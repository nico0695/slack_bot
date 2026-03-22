---
name: new-module
description: Scaffold a complete new feature module for the slack-bot project following the exact layered architecture (Slack controller + Web controller + service + database repository + entity + shared interfaces/constants + Jest tests). Use when creating a new feature module such as "bookmarks", "reminders", "projects", or any domain entity under src/modules/.
---

# New Module Scaffold

## Files to Create

Given a module name `{feature}` (e.g., `bookmarks`), create the following structure under `src/modules/{feature}/`:

```
src/modules/{feature}/
├── controller/
│   ├── {feature}.controller.ts          # Slack event handlers
│   ├── {feature}Web.controller.ts       # Express REST endpoints
│   └── __tests__/
│       └── {feature}Web.controller.test.ts
├── services/
│   ├── {feature}.services.ts
│   └── __tests__/
│       └── {feature}.services.test.ts
├── repositories/
│   └── database/
│       ├── {feature}.dataSource.ts
│       └── __tests__/
│           └── {feature}.dataSource.test.ts
└── shared/
    ├── constants/
    │   └── {feature}.constants.ts
    └── interfaces/
        └── {feature}.interfaces.ts
```

Also create: `src/entities/{feature}.ts`

## Step-by-Step Workflow

### 1. Entity (`src/entities/{feature}.ts`)
See `references/templates.md` → **Entity Template**

### 2. Interface + Constants (`src/modules/{feature}/shared/`)
See `references/templates.md` → **Interface Template** and **Constants Template**

### 3. Database Repository (`src/modules/{feature}/repositories/database/{feature}.dataSource.ts`)
See `references/templates.md` → **DataSource Template**

### 4. Service (`src/modules/{feature}/services/{feature}.services.ts`)
See `references/templates.md` → **Service Template**

### 5. Slack Controller (`src/modules/{feature}/controller/{feature}.controller.ts`)
See `references/templates.md` → **Slack Controller Template**

### 6. Web Controller (`src/modules/{feature}/controller/{feature}Web.controller.ts`)
See `references/templates.md` → **Web Controller Template**

### 7. Register in `src/app.ts`
- Import both controllers
- Add private fields: `#featureController`, `#featureWebController`
- Instantiate in constructor with `getInstance()`
- Add Express route: `this.#app.use('/{feature}s', [this.#featureWebController.router])`

### 8. Register entity in TypeORM
Entities are auto-loaded via glob (`src/entities/*{.ts,.js}`). No manual registration needed.

### 9. Add Slack listeners in `src/app.ts` (if Slack controller is needed)
See `src/app.ts` pattern for `app.message()` and `app.action()` registration.

### 10. Tests
See `references/templates.md` → **Test Templates**

## Key Rules

- **Singleton everywhere**: `static #instance`, `private constructor()`, `static getInstance()`
- **Private fields**: Use `#field` syntax for all instance properties
- **Logger**: `const log = createModuleLogger('{feature}.{layer}')` after all imports
- **GenericResponse<T>**: All service methods return `Promise<GenericResponse<T>>`
- **Error handling**: Services catch and return `{ error: 'message' }`, never throw to caller
- **Repositories throw**: DataSource methods throw on failure; service wraps in try/catch
- **No `console.*`**: Use `log.info/error/warn/debug` only

## Load Templates

Read `references/templates.md` for all boilerplate code.
