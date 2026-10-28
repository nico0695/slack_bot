# Integración con bridge (ESP32) — Spec técnica

> Estado: **implementado** en la rama `feature/bridge-integration` (ver §8). Decisiones en §9, notas para el bridge en §10.
> Referencias: `contrato-slack-bot-bridge.md` (contrato) y `cambios-slack-bot.md` (cambios internos).

## 1. Alcance

| # | Cambio | Incluye |
|---|--------|---------|
| 1 | Configuración bridge por usuario | 3 columnas en `Users`, `GET/PATCH /bridge/config`, validación de URL + secreto, secreto nunca serializado |
| 2 | Creación idempotente de alertas | `requestId` (+ `source`, `deviceId` opcionales) en `Alerts`, índice único, replay → misma alerta, conflicto → `409` |
| 3 | Webhook de alertas vencidas | Outbox SQLite `BridgeDeliveries`, encolado desde el cron de alertas, worker de entrega con reintentos y protección SSRF |

Fuera de alcance: `slack_bot_web`, assistant/classifier, firmware, asociación usuario↔dispositivo en servidor (el `deviceId` es sólo metadata), HMAC, cifrado del secreto en reposo, múltiples integraciones por usuario.

## 2. Arquitectura

Nuevo módulo `src/modules/bridge/` siguiendo la estructura estándar:

```
src/modules/bridge/
├── controller/bridgeWeb.controller.ts          # GET/PATCH /bridge/config
├── services/bridge.services.ts                 # config, encolado, procesamiento de entregas
├── repositories/
│   ├── database/bridgeDeliveries.dataSource.ts # outbox
│   ├── database/bridgeConfig.dataSource.ts     # lectura/escritura de columnas bridge en Users
│   └── http/bridgeWebhook.repository.ts        # POST con axios + agente anti-SSRF
├── shared/
│   ├── constants/bridge.constants.ts           # estados, timeouts, backoff, ruta fija
│   ├── interfaces/bridge.interfaces.ts
│   ├── schemas/bridge.schemas.ts               # zod del PATCH
│   └── utils/
│       ├── bridgeUrl.utils.ts                  # validación de URL, join de path, chequeo de IP, lookup DNS seguro
│       └── bridgeDelivery.utils.ts             # clasificación de respuestas, backoff, Retry-After
└── utils/cronJob.ts                            # bridgeDeliveryCronJob
src/entities/bridgeDeliveries.ts
src/shared/utils/errors/ConflictError.ts        # 409, misma forma que BadRequestError
src/config/typeormLogger.ts                     # logger de TypeORM sin parámetros de query
```

- El módulo `alerts` sólo llama a `BridgeServices.enqueueAlertEvent()` desde su cron; no conoce HTTP ni secretos.
- `app.ts` encadena ambos jobs en el mismo tick: `await alertCronJob(); await bridgeDeliveryCronJob()` (entrega inmediata tras encolar, sin carrera entre dos crons).
- Ambos jobs tienen guard `isRunning` en memoria para evitar solapamiento si un tick dura > 60 s.

## 3. Configuración del usuario

### Entidad `Users` (columnas nuevas, `synchronize` las crea)

| Columna | Tipo | Default | Nota |
|---------|------|---------|------|
| `bridgeBaseUrl` | varchar nullable | `null` | URL base HTTPS, puede tener prefijo de path |
| `bridgeWebhookEnabled` | boolean | `false` | |
| `bridgeWebhookSecret` | varchar nullable | `null` | **`select: false`** → no se carga en `/me`, `GET /users`, login ni ningún `find` normal; sólo se lee explícitamente al enviar |

### Endpoints (`@HttpAuth` + `@Permission([USER, USER_PREMIUM, ADMIN])`, siempre sobre `this.userData.id`)

**`GET /bridge/config`** → `200`
```json
{ "baseUrl": "https://bridge.example.com/api", "enabled": true, "secretConfigured": true }
```

**`PATCH /bridge/config`** — **[D2]** actualización parcial
```json
{ "baseUrl": "https://bridge.example.com/api", "secret": "<32..256 chars>", "enabled": true }
```
Reglas (se valida el **estado resultante** del merge; si falla → `400` sin escribir nada; un único `UPDATE`):
- Campo omitido = se conserva; `null` = se limpia.
- Si se envía `baseUrl` no nulo y se omite `enabled` → `enabled = true`.
- `enabled: true` exige `baseUrl` y `secret` presentes (nuevos o ya guardados).
- `baseUrl: null` o `secret: null` → fuerza `enabled = false`.
- Deshabilitar no reencola ni recupera nada: las entregas pendientes de ese usuario se descartan al intentar enviarlas (§5.3).
- Respuesta: igual que el GET.

### Validación de `baseUrl`
- `https:` obligatorio, sin `username/password`, sin query ni fragmento, longitud ≤ 2048.
- Host rechazado si es `localhost`, `*.localhost`, `*.local`, `*.internal` o una IP literal privada/reservada (ver §5.3).
- Se normaliza quitando la `/` final. **[D3]** env `BRIDGE_WEBHOOK_ALLOW_PRIVATE=true` desactiva estos chequeos de host/IP. Default `false`; sólo hace falta si bot y bridge se despliegan juntos y el bot llama al bridge por IP privada / hostname de red Docker.

### Secreto
- Lo genera el bridge; el bot sólo lo persiste. Nunca aparece en respuestas, logs ni errores (los errores de zod no incluyen el valor).
- Se guarda en texto plano (se necesita para la cabecera). Cifrado en reposo queda fuera del MVP.
- TypeORM usa un logger propio sobre pino (`src/config/typeormLogger.ts`) que registra las queries fallidas **sin parámetros**; el logger por defecto los imprimía y podía exponer el secreto.

## 4. Creación idempotente de alertas (`POST /alerts`)

### Entidad `Alerts` (columnas nuevas nullable)
`requestId`, `source`, `deviceId` + `@Index(['user', 'requestId'], { unique: true })` **[D4]**.
SQLite trata los `NULL` como distintos → las alertas existentes y los clientes sin `requestId` no se ven afectados.

### Body
```json
{
  "message": "Alerta de prueba desde ESP32",
  "date": "2026-10-25T15:10:00.000Z",
  "requestId": "3f2b8c1e-...-uuid",
  "source": "esp32-poc",
  "deviceId": "esp32-02"
}
```
- `requestId`: UUID opcional. `source` (1..50) y `deviceId` (1..64) opcionales, **sólo válidos si viene `requestId`** (sino `400`). **[D1]** nombres camelCase.
- Sin `requestId` → comportamiento actual intacto.

### Flujo con `requestId`
1. `SELECT` por `(userId, requestId)` (camino rápido para reintentos).
2. Si no existe → `INSERT ... ON CONFLICT DO NOTHING` (una sola sentencia, sin transacción) y volver a leer la fila guardada (la propia o la de un pedido concurrente).
   No se usa "INSERT y capturar el error UNIQUE": TypeORM abre una transacción por `save()` sobre la única conexión SQLite y el `ROLLBACK` del pedido perdedor deshacía el insert del ganador (verificado en test: éxito reportado y 0 filas).
3. Existente: comparar normalizado (`message.trim()`, `date.getTime()`, `source`, `deviceId`, con `undefined ≡ null`):
   - igual → `200` con la alerta existente (no se recalcula nada, aunque ya haya vencido o esté `sent`).
   - distinto → `409`:
     ```json
     { "errors": [{ "message": "El requestId ya fue usado con datos distintos", "context": { "code": "ALERT_REQUEST_CONFLICT", "alertId": 123 } }] }
     ```
- Respuesta exitosa: la entidad `Alerts` (incluye `id`, `requestId`, `source`, `deviceId`). Status `200` en creación y replay (compatibilidad).
- Fix incluido: `AlertsDataSource.createAlert` deja de devolver el error como si fuera la entidad (hoy puede responder `200` con un objeto de error); ahora lanza y el controller responde error.
- Borrado: `deleteAlert` es hard delete → un reintento posterior al borrado recrea la alerta. Se acepta para el MVP (documentado).

## 5. Webhook de alertas

### 5.1 Outbox — entidad `BridgeDeliveries`

| Columna | Tipo | Nota |
|---------|------|------|
| `id` | PK | |
| `eventId` | varchar unique | UUID v4 generado al encolar, estable entre reintentos |
| `alertId` | integer | **sin FK** (las alertas se borran en duro) |
| `userId` | integer | destinatario; sin FK |
| `occurrenceAt` | datetime | `alert.date` al vencer → **unique `(alertId, occurrenceAt)`**: reprogramar genera nueva ocurrencia, re-ejecutar el cron no duplica |
| `payload` | simple-json | payload final, inmutable |
| `status` | varchar | `pending` · `sending` · `delivered` · `failed` (final, no se reanuda) |
| `attempts` | integer | default 0 |
| `nextAttemptAt` | datetime | |
| `lockedUntil` | datetime nullable | claim recuperable tras reinicio |
| `lastStatusCode` | integer nullable | |
| `lastError` | varchar nullable | código corto saneado (`timeout`, `http_503`, `bridge_disabled`, …), nunca headers/body |
| `deliveredAt` | datetime nullable | |
| `createdAt` / `updatedAt` | | |

Índice `(status, nextAttemptAt)` para la consulta del worker.

Escrituras de la outbox: sentencias únicas sin transacción (`INSERT ... ON CONFLICT DO NOTHING`, `UPDATE` condicionales). Igual que en §4, una transacción fallida sobre la conexión SQLite compartida deshace escrituras concurrentes de otros pedidos. `ON CONFLICT DO NOTHING` (lo que genera `orIgnore()` de TypeORM en SQLite) sólo omite conflictos de unicidad: cualquier otra violación (p. ej. `NOT NULL`) lanza error y la alerta no se marca `sent`.

### 5.2 Cambios en el cron de alertas
`getAlertsByDate` agrega `requestId`, `deviceId`, `user.bridgeBaseUrl` y `user.bridgeWebhookEnabled` al `select` (nunca el secreto). El job tiene guard `isRunning`: si el tick anterior sigue corriendo, se saltea.

Orden por alerta:
1. Si el usuario tiene bridge habilitado con URL → `INSERT ... ON CONFLICT DO NOTHING` en outbox (idempotente por `(alertId, occurrenceAt)`; si ya existía se conserva el `eventId` y payload originales). Todas las alertas del tick usan el mismo `triggered_at`.
   Si el encolado **falla** → se saltea la alerta completa este tick (no Slack, no se marca `sent`), se reintenta en el próximo.
2. Slack / Web Push sin cambios (independientes del bridge; incluso sin `targetChannel` el paso 1 ya corrió).
3. `updateAlertAsNotified` sólo con las alertas procesadas.

No se filtra por `source`: todas las alertas vencidas del usuario habilitado generan evento. `sent` sigue significando "procesada por el cron".

### 5.3 Worker de entrega (`bridgeDeliveryCronJob`)
1. Recuperar hasta 20 filas con `status = 'pending' AND nextAttemptAt <= now` o `status = 'sending' AND lockedUntil < now`.
2. Claim con `UPDATE ... SET status='sending', lockedUntil=now+2min, attempts=attempts+1 WHERE id=? AND (condición anterior)`; si `affected = 0`, otra pasada la tomó. El intento se cuenta en el claim: si una pasada se corta antes de registrar el resultado (p. ej. error de base), el reclamo siguiente suma otro intento, y al superar el máximo se marca `failed` (`max_attempts`) sin enviar.
3. Leer config actual del usuario (incluye secreto con select explícito). Si deshabilitado/incompleto → `failed` + `lastError: bridge_disabled` (descartada, no se reintenta). **[D5]** se usa la config vigente al enviar, no la del momento de encolar.
4. `POST {baseUrl}/webhooks/alerts` (join conservando el prefijo de path):
   - Headers: `Content-Type: application/json`, `X-Bridge-Webhook-Secret: <secreto del destinatario>`.
   - `timeout: 5000`, `maxRedirects: 0`, `validateStatus: () => true`, `proxy: false` (un proxy resolvería el host por su cuenta y saltearía el `lookup`), respuesta máx. 64 KB.
   - Certificado TLS inválido → error de red, se reintenta como cualquier fallo de conexión.
   - `httpsAgent` con `lookup` propio: resuelve DNS y rechaza IP loopback, privada, link-local, CGNAT, multicast, `0.0.0.0/8`, `::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped (salvo **[D3]**). Se valida la IP real a la que se conecta (evita DNS rebinding).
5. Resultado (fuera de transacciones; si el proceso se corta a mitad, la fila queda `sending` y se reintenta al vencer el lock):

| Respuesta | Estado | Acción |
|-----------|--------|--------|
| `2xx` | `delivered` | `deliveredAt = now` |
| timeout, error de red, `408`, `429`, `5xx` | `pending` | `attempts++`, `nextAttemptAt = now + min(60s·2^(attempts-1), 15min)`; respeta `Retry-After` (cap 15min) |
| `3xx`, `400`, `401`, `403`, `404`, `409`, otro `4xx` | `failed` | final, queda registrado con `lastStatusCode` |
| DNS/IP bloqueada | `failed` | `lastError: blocked_destination` |
| `attempts >= 8` **[D6]** | `failed` | `lastError: max_attempts` — ventana total ≈ 1h (1+2+4+8+15+15+15 min) |

### 5.4 Payload (contrato, versión 1)
```json
{
  "version": 1,
  "event_id": "uuid",
  "type": "alert.triggered",
  "alert_id": 123,
  "scheduled_at": "2026-10-25T15:10:00.000Z",
  "triggered_at": "2026-10-25T15:10:42.000Z",
  "message": "Alerta de prueba desde ESP32",
  "request_id": "uuid",
  "device_id": "esp32-02"
}
```
`request_id` / `device_id` sólo se incluyen si la alerta los tiene. Sin email, Bearer, secreto ni bloques Slack.

### 5.5 Casos de borde (MVP)
- Alerta borrada con evento pendiente → se entrega igual (ya había vencido).
- Alerta resuelta (`markAlertResolved`) → no genera evento (no pasa por el cron).
- Reprogramada (`rescheduleAlert`) → nuevo `date` = nueva ocurrencia = nuevo `eventId`.
- Retención: no se borran filas de outbox en el MVP.

## 6. Variables de entorno
| Variable | Default | Uso |
|----------|---------|-----|
| `BRIDGE_WEBHOOK_ALLOW_PRIVATE` | `false` | Permite hosts/IP privadas (dev o bridge en la misma red) |

## 7. Pruebas
- **Config**: sólo usuario autenticado; merge/validación rechaza sin escribir; `enabled` por defecto al asignar URL; secreto ausente en GET/PATCH/`/me`; URLs inválidas (http, credenciales, localhost, IP privada).
- **Alertas**: cliente sin `requestId` igual que hoy; metadata sin `requestId` → 400; replay idéntico → misma alerta (también vencida); datos distintos → 409; error de DB → no 2xx. Test de integración con SQLite `:memory:` para el índice único y dos creaciones concurrentes.
- **Encolado**: todas las alertas del usuario habilitado (con/sin metadata, con/sin canal Slack); nunca de otro usuario ni deshabilitado; doble ejecución no duplica; fallo al encolar no marca `sent`.
- **Worker**: clasificación de respuestas, backoff y `Retry-After`, claim y recuperación de `sending` vencido, secreto del destinatario correcto, join de URL con prefijo, `maxRedirects: 0`, `lookup` bloquea IP privadas, deshabilitado → descartada sin envío.

## 8. Implementación

Rama `feature/bridge-integration` desde `dev` → PR a `dev`. Validación en cada step: `npx tsc --noEmit`, `npm run lint`, `npx jest` (baseline: 59 suites / 607 tests; final: 71 suites / 803 tests). Un commit por step.

| Step | Contenido | Validación específica |
|------|-----------|-----------------------|
| 1 | Config bridge: columnas en `Users` (`select: false`), módulo `bridge` (schemas, url utils, data source de config, service, controller), ruta `/bridge`, logger de TypeORM sin parámetros, fix `updateUserById` | Tests de schema/url/service/controller; integración SQLite: `find` normal nunca carga el secreto |
| 2 | Idempotencia de alertas: columnas + índice, `ConflictError`, schema, data source (`createAlert` lanza, `insertAlertIfAbsent`, `getAlertByRequestId`), service con replay/409, controller | Tests unitarios + integración SQLite (replay, vencida, por usuario, 5 pedidos concurrentes) |
| 3 | Outbox + encolado: entidad `BridgeDeliveries`, data source, `enqueueAlertEvent`, cambios en `alertCronJob` (orden, skip en fallo, guard) | Tests del cron; integración SQLite del encolado idempotente y del `select` del cron |
| 4 | Worker de entrega: repository HTTP con agente anti-SSRF, clasificación/backoff, `bridgeDeliveryCronJob`, encadenado en `app.ts` | Tests de worker y lookup; integración SQLite del ciclo completo; smoke test manual contra un servidor HTTPS local (TLS, path, headers, sin redirecciones) |
| 5 | Docs (`API_REFERENCE.md`, `ARCHITECTURE.md`, `.env.example`, esta spec), validación completa y PR a `dev` | Suite completa + build |

Además, fuera del plan original: `slackConfig` deshabilita la verificación del token de Slack con `NODE_ENV=test` (la llamada `auth.test` con el token falso tiraba workers de Jest y hacía fallar suites al azar, ya en `dev`).

## 9. Decisiones cerradas

| # | Decisión |
|---|----------|
| D1 | camelCase en el REST del bot; payload del webhook en snake_case (contrato). Excepción: `POST /conversations/assistant` usa snake_case según el contrato V2 (ver `ASSISTANT_REST.md`, A1) |
| D2 | `PATCH /bridge/config` con merge y validación del estado resultante |
| D3 | Bot y bridge separados por ahora; `BRIDGE_WEBHOOK_ALLOW_PRIVATE` (default `false`) queda disponible si se despliegan juntos |
| D4 | Unicidad `(user, requestId)`; `source`/`deviceId` metadata opcional |
| D5 | Sin reencolado: deshabilitar descarta lo pendiente; `failed` es final |
| D6 | Timeout 5s, backoff 1m→15m, máx. 8 intentos (≈1h), luego `failed` |

## 10. Notas para el bridge y diferencias con el contrato

Para actualizar `contrato-slack-bot-bridge.md`:

- **Configuración:** `GET /bridge/config` y `PATCH /bridge/config` con `{ baseUrl, secret, enabled }` (camelCase, D1/D2). Si se reenvía `baseUrl` sin `enabled`, el webhook queda habilitado: si el bridge se re-registra al reiniciar, conviene mandar `enabled` explícito para no rehabilitar algo deshabilitado a mano.
- **Creación:** campos `requestId`, `source`, `deviceId` (camelCase). La unicidad es `(user, requestId)`, no `(user, source, requestId)` (D4). `source`/`deviceId` son opcionales, sólo válidos con `requestId`. Creación y replay responden `200` con la entidad; conflicto `409` con `context.code = "ALERT_REQUEST_CONFLICT"` y `context.alertId`.
- **Webhook:** payload y header como el contrato. La entrega es **al menos una vez**: si el bot se corta después de que el bridge aceptó pero antes de registrar `delivered`, reenvía el mismo `event_id` y payload; el bridge debe deduplicar (200 ante duplicado idéntico).
- **Errores definitivos:** `3xx`, `4xx` (salvo `408`/`429`) y destino bloqueado no se reintentan. Un certificado TLS inválido se reintenta como error de red y, si persiste, se descarta tras ~1h.

Riesgo conocido, previo a este cambio: TypeORM abre una transacción por `save()` sobre la única conexión SQLite, así que un `save()` que falla puede deshacer escrituras concurrentes de otros módulos. Este cambio lo evita en sus propias escrituras (§4, §5.1) pero no lo corrige a nivel global.
