# Plan de Migración a Inyección de Dependencias (DI) con TSyringe

## 📋 Información del Documento
- **Fecha de Creación:** 2026-03-15
- **Estado:** FASE 2 - Pendiente de Confirmación
- **Librería de DI:** `tsyringe`
- **Alcance:** Repositorios, Servicios y Controladores

---

# FASE 1: Análisis y Relevamiento Profundo

## 1.1 Resumen Ejecutivo del Estado Actual

El proyecto `slack-bot` es un backend modular construido con Node.js, TypeScript, Express, Redis, SQLite (TypeORM), y Socket.io. La arquitectura sigue un patrón de capas (Controller → Service → Repository) pero está **fuertemente acoplado mediante el anti-patrón Singleton** (`Clase.getInstance()`).

### Estadísticas Clave
| Métrica | Valor |
|---------|-------|
| Clases con patrón Singleton | **49** |
| Llamadas a `getInstance()` | **118+** |
| Módulos Principales | 13 (users, conversations, alerts, tasks, notes, links, images, textToSpeech, summary, system, externalStorage, constants) |
| Niveles de Anidamiento de Dependencias | Hasta 4 niveles |

## 1.2 Identificación del Composition Root

### Entry Point Actual
```
src/index.ts
    └── new App() → src/app.ts
        └── Constructor inicializa 12+ controladores via getInstance()
        └── config() inicializa conexión a BD (TypeORM)
        └── router() registra rutas Express
        └── start() inicia servidor HTTP, Socket.io, Slack listeners, Cron jobs
```

### Archivos Clave
| Archivo | Función |
|---------|---------|
| `src/index.ts` | Entry point mínimo (5 líneas) |
| `src/app.ts` | Clase App - Composition Root actual |
| `src/config/ormconfig.ts` | Configuración TypeORM (DataSource) |
| `src/config/redisConfig.ts` | Singleton RedisConfig |
| `src/config/slackConfig.ts` | Conexión Slack Bolt |
| `src/config/socketConfig.ts` | Configuración Socket.io |

## 1.3 Inventario Completo de Singletons

### Capa 1: Repositorios / Data Sources (Infraestructura)

| Clase | Archivo | Dependencias |
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

### Capa 2: Servicios (Lógica de Negocio)

| Clase | Archivo | Dependencias (getInstance calls) |
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

### Capa 3: Controladores (API/Red)

| Clase | Archivo | Dependencias (getInstance calls) |
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
| `SystemWebController` | `src/modules/system/controller/systemWeb.controller.ts` | (ninguna) |
| `ConstantsController` | `src/modules/constants/controller/constants.controller.ts` | ConstantsServices |

### Infraestructura / Configuración (Fuera de Alcance Directo)

| Clase | Archivo | Notas |
|-------|---------|-------|
| `RedisConfig` | `src/config/redisConfig.ts` | Singleton para conexión Redis |
| `IoServer` | `src/config/socketConfig.ts` | Static class para Socket.io |

## 1.4 Árbol de Dependencias Principal

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
│                        INFRAESTRUCTURA                                       │
│   TypeORM Entities    │    RedisConfig    │    External APIs                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 1.5 Riesgos Identificados

### ⚠️ Riesgo Alto

| Riesgo | Descripción | Archivos Afectados | Mitigación |
|--------|-------------|-------------------|------------|
| **Dependencias Circulares** | `ConversationsServices` ↔ `MessageProcessor` (ambos se referencian mutuamente) | `conversations.services.ts`, `messageProcessor.service.ts` | Usar Lazy Injection con `delay()` de TSyringe |
| **Servicios en Auth Decorators** | `HttpAuth`, `SlackAuth`, `SlackAuthActions` llaman a `UsersServices.getInstance()` dentro de decoradores | `src/shared/middleware/auth.ts` | Refactorizar decoradores para recibir dependencias o usar `container.resolve()` |
| **Cron Jobs con Singletons** | `alertCronJob` llama a `AlertsServices.getInstance()` fuera del Composition Root | `src/modules/alerts/utils/cronJob.ts` | Inyectar servicio desde app.ts o usar `container.resolve()` |

### ⚠️ Riesgo Medio

| Riesgo | Descripción | Archivos Afectados | Mitigación |
|--------|-------------|-------------------|------------|
| **Factory Pattern en AI Repos** | `ConversationsServices` y `MessageProcessor` usan `AIRepositoryByType[type].getInstance()` | Servicios de conversación | Implementar factory con DI token |
| **Efectos Secundarios en Constructores** | `RedisConfig` y `GeminiRepository` inicializan conexiones en constructor | Repositorios | Mover conexiones a métodos `connect()` o usar `@singleton()` |
| **Socket.io Global** | `IoServer` es un static class usado desde `app.ts` y `conversationsServices` | `socketConfig.ts`, `conversations.services.ts` | Registrar como singleton en contenedor |

### ⚠️ Riesgo Bajo

| Riesgo | Descripción | Archivos Afectados | Mitigación |
|--------|-------------|-------------------|------------|
| **Tests con jest.mock()** | Tests actuales mockean getInstance() con jest.mock | Todos los `__tests__/` | Migrar a inyección de mocks en constructor |
| **GenericController Base Class** | Controladores extienden `GenericController` | Todos los controladores | Mantener herencia, solo cambiar inyección |

## 1.6 Análisis de Testing Actual

### Patrón de Mocking Existente
```typescript
// Patrón actual (src/modules/conversations/services/__tests__/conversations.services.test.ts)
jest.mock('../../repositories/openai/openai.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => aiRepositoryMock,
  },
}))
```

### Impacto de la Migración
- **Antes:** Los tests mockean el método estático `getInstance()` de cada dependencia
- **Después:** Los tests crearán instancias directamente pasando mocks al constructor

---

# FASE 2: Propuesta de Estrategia y Alternativas

## 2.1 Estrategia de Migración Recomendada: Bottom-Up

### Justificación
La estrategia Bottom-Up (Repositorios → Servicios → Controladores) minimiza el riesgo porque:
1. Los repositorios no dependen de otras capas (son hojas del árbol)
2. Permite verificar que cada capa funciona antes de migrar la siguiente
3. Facilita rollback parcial si hay problemas

### Orden de Migración Propuesto

```
Etapa 0: Configuración Base TSyringe
    │
    ▼
Etapa 1: Repositorios (sin dependencias internas)
    │
    ▼
Etapa 2: Servicios Simples (1-2 dependencias)
    │
    ▼
Etapa 3: Servicios Complejos (3+ dependencias)
    │
    ▼
Etapa 4: Controladores
    │
    ▼
Etapa 5: Casos Especiales (Decorators, Cron, Sockets)
    │
    ▼
Etapa 6: Cleanup y Documentación
```

## 2.2 Decisiones Arquitectónicas

### Decisión 1: Manejo de Auth Decorators

#### Contexto
Los decoradores `@HttpAuth`, `@SlackAuth`, `@SlackAuthActions` en `src/shared/middleware/auth.ts` llaman a `UsersServices.getInstance()` internamente.

#### Alternativas

| Alternativa | Pros | Contras | Recomendación |
|-------------|------|---------|---------------|
| **A) container.resolve() dentro del decorator** | Mínimo cambio, compatible con decoradores actuales | Viola principio de no usar Service Locator | ⭐ Recomendado para migración inicial |
| **B) Refactorizar decoradores a middleware Express** | Limpio, sigue mejor prácticas DI | Cambio significativo en patrón de código | Para fase posterior |
| **C) Pasar servicio como parámetro del decorator** | DI puro | Cambia la firma de todos los decoradores | No recomendado |

#### Recomendación: Alternativa A
Usar `container.resolve(UsersServices)` dentro de los decoradores como caso límite aceptable. Documentar como deuda técnica para refactorizar a middlewares en el futuro.

---

### Decisión 2: Manejo de Cron Jobs

#### Contexto
`alertCronJob` en `src/modules/alerts/utils/cronJob.ts` es una función standalone que llama a `AlertsServices.getInstance()`.

#### Alternativas

| Alternativa | Pros | Contras | Recomendación |
|-------------|------|---------|---------------|
| **A) container.resolve() dentro del cron** | Mínimo cambio | Service Locator pattern | Para migración rápida |
| **B) Inyectar servicio desde app.ts** | DI puro, fácil de testear | Requiere refactorizar cómo se registra el cron | ⭐ Recomendado |
| **C) Crear clase CronJobManager inyectable** | Organizado, escalable | Más código | Para proyectos grandes |

#### Recomendación: Alternativa B
Modificar `alertCronJob` para recibir `AlertsServices` como parámetro. La instancia se resuelve en `app.ts` al configurar el cron.

```typescript
// Antes
export const alertCronJob = async (): Promise<void> => {
  const alertsServices = AlertsServices.getInstance()
  ...
}

// Después
export const createAlertCronJob = (alertsServices: AlertsServices) => {
  return async (): Promise<void> => {
    ...
  }
}
```

---

### Decisión 3: Manejo de Socket.io

#### Contexto
`IoServer` es una clase estática que gestiona la instancia de Socket.io. Se usa en `app.ts` y es accedida desde `ConversationsServices`.

#### Alternativas

| Alternativa | Pros | Contras | Recomendación |
|-------------|------|---------|---------------|
| **A) Mantener como static, no migrar** | Sin cambios | Inconsistente con resto del código | Para fase inicial |
| **B) Registrar Server como singleton en container** | Consistente | Requiere pasar server como parámetro | ⭐ Recomendado |
| **C) Crear SocketService inyectable** | Abstracción limpia | Más código | Ideal a largo plazo |

#### Recomendación: Alternativa A para Fase Inicial, B para Fase 2
Mantener `IoServer` como static inicialmente. En una segunda iteración, registrar el `Server` en el contenedor.

---

### Decisión 4: Factory Pattern para AI Repositories

#### Contexto
`ConversationsServices` y `MessageProcessor` usan un patrón factory para seleccionar entre `OpenaiRepository` y `GeminiRepository`:
```typescript
const AIRepositoryByType = {
  [AIRepositoryType.OPENAI]: OpenaiRepository,
  [AIRepositoryType.GEMINI]: GeminiRepository,
}
this.aiRepository = AIRepositoryByType[aiToUse].getInstance()
```

#### Alternativas

| Alternativa | Pros | Contras | Recomendación |
|-------------|------|---------|---------------|
| **A) Inyectar repositorio por defecto, factory en config** | Simple | Menos flexible en runtime | ⭐ Recomendado |
| **B) Token de inyección dinámico** | Máxima flexibilidad | Complejidad adicional | Overengineering |
| **C) Inyectar ambos repos, elegir en runtime** | Explícito | Carga innecesaria | No recomendado |

#### Recomendación: Alternativa A
Configurar el tipo de AI en variables de entorno. El contenedor registra el repositorio correcto basado en la configuración. Si se necesita cambiar en runtime, se crea un nuevo scope del contenedor.

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

### Decisión 5: Manejo de Dependencias Circulares

#### Contexto
`ConversationsServices` importa y usa `MessageProcessor`, y `MessageProcessor` importa tipos/interfaces de conversations.

#### Verificación Necesaria
Revisar si hay dependencia circular real o solo de tipos. TSyringe puede manejar ciclos con `delay()`.

#### Recomendación
Usar `@inject(delay(() => MessageProcessor))` si se confirma el ciclo. Alternativamente, extraer la lógica compartida a un servicio común.

---

## 2.3 Preguntas para el Usuario

Antes de proceder a la **FASE 3: Generación del Plan de Implementación**, necesito confirmación sobre las siguientes decisiones:

### ❓ Pregunta 1: Auth Decorators
¿Está de acuerdo con usar `container.resolve()` dentro de los decoradores de autenticación como solución temporal? ¿O prefiere que se refactorizen completamente a middlewares Express desde el inicio?

### ❓ Pregunta 2: Cron Jobs
¿Confirma la estrategia de modificar `alertCronJob` para recibir el servicio como parámetro inyectado desde `app.ts`?

### ❓ Pregunta 3: Socket.io
¿Desea mantener `IoServer` como static class en esta fase, o prefiere migrarlo junto con el resto?

### ❓ Pregunta 4: AI Repository Factory
¿Es aceptable determinar el tipo de AI (OpenAI/Gemini) en tiempo de carga vía variable de entorno? ¿O necesita cambiar dinámicamente durante la ejecución?

### ❓ Pregunta 5: Alcance de Tests
¿Desea que el plan incluya la migración de todos los tests existentes a inyección por constructor? Esto aumentará el esfuerzo pero mejorará la mantenibilidad.

### ❓ Pregunta 6: Módulos Prioritarios
¿Hay módulos específicos que deban migrarse primero por razones de negocio? Actualmente el plan propone migrar por capas (Bottom-Up), pero podemos priorizar por módulo funcional si es necesario.

---

## ⚠️ STOP - Esperando Confirmación

**Por favor, revise la propuesta de estrategia y responda las preguntas anteriores.**

Una vez confirmadas las decisiones, procederé a generar:
- Plan de implementación detallado con pasos accionables
- Snippets de código "Antes y Después"
- Checklist de seguimiento
- Documentación DI-GUIDELINES.md
- Guía de impacto en testing

---

# FASE 3: Plan de Implementación (Pendiente de Confirmación)

*Esta sección se completará después de recibir confirmación del usuario en las decisiones de FASE 2.*

## Vista Previa del Plan

### A. Resumen del Plan
*(Se completará post-confirmación)*

### B. Tabla de Seguimiento de Status

| Etapa | Tarea Específica | Archivos / Módulos Afectados | Nivel de Riesgo | Estado |
|:------|:-----------------|:-----------------------------|:----------------|:-------|
| 0 | Instalar TSyringe y configurar | `package.json`, `tsconfig.json`, `src/index.ts` | Bajo | ⏳ Pendiente |
| 0 | Crear archivo de contenedor DI | `src/di-container.ts` (nuevo) | Bajo | ⏳ Pendiente |
| 1 | Migrar DataSources (BD) | `src/modules/*/repositories/database/*.ts` | Medio | ⏳ Pendiente |
| 1 | Migrar Redis Repositories | `src/modules/*/repositories/redis/*.ts` | Medio | ⏳ Pendiente |
| 1 | Migrar API Repositories | `src/modules/*/repositories/*.ts` | Medio | ⏳ Pendiente |
| 2 | Migrar Servicios Simples | Tasks, Notes, Links, Alerts, Summary | Medio | ⏳ Pendiente |
| 3 | Migrar Servicios Complejos | Users, Conversations, Images, MessageProcessor | Alto | ⏳ Pendiente |
| 4 | Migrar Controladores | Todos los `*.controller.ts` | Medio | ⏳ Pendiente |
| 5 | Refactorizar Auth Decorators | `src/shared/middleware/auth.ts` | Alto | ⏳ Pendiente |
| 5 | Refactorizar Cron Jobs | `src/modules/alerts/utils/cronJob.ts` | Medio | ⏳ Pendiente |
| 5 | (Opcional) Migrar Socket.io | `src/config/socketConfig.ts` | Bajo | ⏳ Pendiente |
| 6 | Actualizar app.ts (Composition Root) | `src/app.ts` | Alto | ⏳ Pendiente |
| 6 | Migrar Tests | Todos los `__tests__/*.ts` | Medio | ⏳ Pendiente |
| 6 | Documentación | `DI-GUIDELINES.md`, README updates | Bajo | ⏳ Pendiente |

### C. Ejemplo de Migración (Preview)

#### Antes: Patrón Singleton
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

#### Después: TSyringe DI
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

#### Servicio Consumidor - Antes
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

#### Servicio Consumidor - Después
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

### D. Documentación a Generar

1. **`docs/DI-GUIDELINES.md`** - Guía para crear nuevos servicios con TSyringe
2. **`docs/TESTING-WITH-DI.md`** - Cómo escribir tests con inyección de mocks
3. **Actualización de `README.md`** - Sección de arquitectura

### E. Guía de Testing (Preview)

#### Antes: jest.mock()
```typescript
jest.mock('../../repositories/openai/openai.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => aiRepositoryMock,
  },
}))

const service = ConversationsServices.getInstance()
```

#### Después: Inyección directa
```typescript
const mockAIRepo = { chatCompletion: jest.fn() }
const mockRedisRepo = { getConversationMessages: jest.fn() }

const service = new ConversationsServices(
  mockAIRepo as any,
  mockRedisRepo as any,
  // ... otros mocks
)
```

---

## Apéndice: Archivos de Referencia

### Estructura de Carpetas Actual
```
src/
├── app.ts                          # Composition Root actual
├── index.ts                        # Entry point
├── config/
│   ├── redisConfig.ts              # Singleton RedisConfig
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
│   │   └── utils/cronJob.ts        # Cron job con getInstance()
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
│   │   ├── auth.ts                 # Decoradores con getInstance()
│   │   └── errors.ts
│   ├── modules/
│   │   └── genericController.ts    # Base class para controladores
│   ├── interfaces/
│   └── utils/
└── tests/
    └── setup.ts
```

### Configuración tsconfig.json Actual
```json
{
  "compilerOptions": {
    "emitDecoratorMetadata": true,    // ✅ Ya habilitado
    "experimentalDecorators": true,   // ✅ Ya habilitado
    // ...
  }
}
```

### Dependencia reflect-metadata
```json
// package.json - ✅ Ya instalada
{
  "dependencies": {
    "reflect-metadata": "^0.1.13"
  }
}
```

---

**Fin del Documento - Esperando Confirmación para FASE 3**
