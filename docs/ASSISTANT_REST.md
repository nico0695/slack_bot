# Assistant REST single-shot (bridge / ESP32) — Spec técnica

> Estado: **implementado** en la rama `feature/assistant-rest`. Tramo bridge ↔ bot del contrato V2 (`contratos.md#bridge-y-slack_bot`); decisiones en §8, notas para el bridge en §9.

## 1. Alcance

Entrada REST al mismo assistant que usan Slack y la web: el bridge envía el texto transcrito y recibe **una** respuesta final, en la misma petición.

| Incluye | Fuera de alcance |
|---------|------------------|
| `POST /conversations/assistant` autenticado | Audio, STT, firmware, bridge |
| Fachada single-shot sobre el processor existente | Historial, repreguntas, confirmación de texto |
| Texto plano para listas, aviso para contenido no mostrable | SSE/webhook de respuesta, jobs, polling, cancelación |
| Errores del parser JSON → `400`/`413` (todas las rutas) | Reintentos, idempotencia, exactly-once |

## 2. Arquitectura

```
src/modules/conversations/
├── controller/conversationsWeb.controller.ts          # POST /assistant (@HttpAuth + @Permission)
├── services/assistantSingleShot.service.ts            # fachada single-shot → envelope
└── shared/
    ├── constants/assistantSingleShot.constants.ts     # estados, mensajes, límites por env
    ├── interfaces/assistantSingleShot.interfaces.ts   # IAssistantSingleShotResult
    ├── schemas/assistantSingleShot.schemas.ts         # zod estricto del body
    └── utils/plainText.utils.ts                       # listas en texto, normalizador, recorte
src/shared/middleware/errors.ts                        # body-parser → 400/413
```

- **Misma ejecución que un DM de Slack:** `processAssistantMessage(message, userId, undefined, false, undefined)`. Sin canal, sin contexto de canal, sin historial, sin `onProgress`. Mismo clasificador, mismos servicios y mismos permisos por usuario.
- **No usa** `ConversationsServices.generateAssistantConversation` (wrapper web): ese camino lee/escribe historial en Redis y usa un canal sintético (`userId.padStart(8, '9')`) que termina guardado en las entidades.
- La fachada depende sólo de `MessageProcessor`: no escribe en Redis ni emite al socket.
- `IConversation` suma dos campos opcionales que Slack y la web ignoran: `plainText` (versión texto) y `contentOmitted` (el texto deja afuera contenido no mostrable). Viajan también por el socket web y quedan en el historial del wrapper web, sin uso.

## 3. Contrato

### Request

```http
POST /conversations/assistant
Authorization: Bearer <sesión Supabase del usuario>
Content-Type: application/json
```
```json
{
  "request_id": "7d9c2b13-2b56-4c88-9b38-f2d9d987a013",
  "message": "Avisame mañana a las diez que tengo que llamar al médico"
}
```

- **Auth:** `@HttpAuth` (token Supabase válido, usuario `enabled`) + `@Permission([USER, USER_PREMIUM, ADMIN])`. El usuario sale del token, nunca del body.
- **Body estricto:** cualquier campo extra (`userId`, `channelId`, `conversation`, …) → `400` sin ejecutar.
- `request_id`: UUID canónico **en minúsculas** (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`). Sólo correlación: el bot no lo persiste ni deduplica.
- `message`: string, `1..ASSISTANT_REST_MAX_INPUT_CHARS` (default 2000) caracteres **tras trim**; se procesa el texto recortado.

### Response (envelope)

```json
{
  "request_id": "7d9c2b13-2b56-4c88-9b38-f2d9d987a013",
  "status": "completed",
  "message": "Alerta creada correctamente para el 29 de octubre de 2026, 10:00 con id: #12",
  "content_omitted": false,
  "error": null
}
```

| Resultado del processor | `status` | `message` | `error` | HTTP |
|-------------------------|----------|-----------|---------|------|
| Respuesta | `completed` | `plainText` ?? `content`, normalizado (§4) | `null` | `200` |
| Mensaje con prefijo `+` (skip deliberado de IA) | `completed` | `Mensaje no procesado.` | `null` | `200` |
| `null` (faltan datos, la IA no clasificó o falló, falló un servicio, excepción atrapada en el router) | `unknown` | `No se pudo confirmar el resultado.` | `{ "code": "result_unconfirmed" }` | `500` |
| Excepción | `unknown` | `No se pudo confirmar el resultado.` | `{ "code": "result_unconfirmed" }` | `500` |

- `completed` = respuesta utilizable, **no** "acción exitosa": incluye respuestas conversacionales y errores que los servicios ya devuelven como texto (snooze, reminders, `❌ Error al generar la imagen`), igual que en Slack.
- `null` es `unknown`: mezcla falta de datos con fallos técnicos y con el `catch` del router, que puede ocurrir después de crear una entidad. Se prefiere no confirmar antes que presentar un fallo como respuesta.
- Toda excepción es `unknown`: una acción pudo haberse ejecutado antes del fallo. Incluye los errores de uso que el processor lanza (`Uso: .qr <texto o URL>`), que en Slack DM también terminan en un mensaje genérico. Nunca se devuelve `error.message`.
- El bot **no emite `failed`**; el estado queda en el contrato para errores del bridge (p. ej. STT).

### Errores previos al handler (formato global, sin envelope)

| Caso | HTTP | Body |
|------|------|------|
| JSON mal formado | `400` | `{ "errors": [{ "message": "Cuerpo JSON inválido" }] }` |
| Body > 100 KB (límite de `express.json()`) | `413` | `{ "errors": [{ "message": "El cuerpo de la solicitud es demasiado grande" }] }` |
| Body inválido (schema) | `400` | `{ "errors": [{ "message": "Datos de entrada no válidos", "context": { "fields": [...] } }] }` |
| Sin token, token inválido o usuario deshabilitado | `401` | `{ "errors": [{ "message": "Unauthorized", "context": {} }] }` |
| Perfil sin acceso | `403` | `{ "message": "You dont have permissions" }` |
| Error no controlado fuera del handler | `500` | `{ "errors": [{ "message": "Something went wrong" }] }` |

En todos estos casos el processor no se ejecutó, salvo el último, que no debería ocurrir dentro del handler (la fachada captura todo). El error de validación nunca incluye el texto enviado.

## 4. Salida textual

Se arma en el bot, que conoce sus respuestas; el bridge y el firmware no interpretan formato.

1. **Fuente:** `plainText` si existe, si no `content`.
   - Listas del clasificador (`alert/task/note/link.list`) y comando `alerts <scope>`: una línea por ítem (`#12 - Llamar al médico (29 de octubre de 2026, 10:00)`, `#3 - Docs: https://…`), máximo **10** + `y N más`. Antes sólo decían `Mostrando N …`.
   - QR (base64), imágenes generadas (URLs) y lista de imágenes (global, sin filtro por usuario): aviso breve + `content_omitted: true`.
2. **Normalización:** `<url|etiqueta>` → `etiqueta: url`; `<url>` → `url`; se quitan `*`, `**`, `_`, `~` y `` ` `` de formato (no los que forman parte de URLs o expresiones); se quitan emojis (incluye compuestos, tonos de piel y banderas); se conservan acentos y `ñ`; se compactan espacios y líneas vacías.
3. **Vacío:** si no queda texto → `La respuesta no tiene contenido para mostrar en este dispositivo.` + `content_omitted: true`.
4. **Recorte:** máximo `ASSISTANT_REST_MAX_OUTPUT_CHARS` (default 2000) caracteres reales (no unidades UTF-16), aviso incluido: `… (respuesta recortada)` + `content_omitted: true`.

## 5. Garantías y límites

- **Una ejecución por request**, sin reintentos ni cola. Los clientes de IA (`openai@3`, Gemini) no reintentan.
- **Sin idempotencia:** dos POST con el mismo `request_id` ejecutan dos veces (p. ej. dos alertas). Deduplicar admisiones es responsabilidad del bridge.
- **Sin cancelación:** cortar la conexión no detiene la acción en curso.
- **Sin timeout propio:** el bot responde al terminar. Peor caso: generación de imagen o búsqueda + resumen (varias llamadas a IA, decenas de segundos).
- **Zona horaria:** no hay zona por usuario; el bot usa `America/Argentina/Buenos_Aires` en todos los clientes.
- **Alertas creadas por esta vía:** del usuario, sin canal, sin `requestId`/`source`/`deviceId`. El cron las notifica por el circuito existente (incluido el webhook del bridge si el usuario lo tiene habilitado, con payload sin `request_id`).
- **Logs:** `requestId`, `userId`, `status`, `contentOmitted`, `durationMs`. Nunca el texto del pedido ni el token (`authorization` ya está redactado en pino).

## 6. Variables de entorno

| Variable | Default | Uso |
|----------|---------|-----|
| `ASSISTANT_REST_MAX_INPUT_CHARS` | `2000` | Máximo de `message` tras trim; más largo → `400` |
| `ASSISTANT_REST_MAX_OUTPUT_CHARS` | `2000` | Máximo del `message` devuelto; más largo → recorte con aviso |

Valores no enteros o ≤ 0 usan el default. Se leen en cada request.

## 7. Pruebas

| Área | Cobertura |
|------|-----------|
| Errores globales | JSON roto → 400 sin eco del body; body grande → 413; `CustomError` y 500 sin cambios |
| Texto plano | Listas (tope 10, `y N más`, vacío, URL de links), comando `alerts <scope>` con los mismos bloques, QR/imágenes omitidos; `content`/`contentBlock` idénticos; paridad Slack/texto de alertas sin cambios |
| Fachada | Llamada única estilo DM; mapeo respuesta/`null`/`+`/excepción; sin mensaje interno; recorte y env; pedidos independientes; con processor real: alerta sin canal ni `requestId`, fallo del servicio → `unknown`, error de imagen sin detalle del proveedor |
| Endpoint | Unitarios: 200/500, 10 bodies inválidos sin ejecutar, límite exacto y por env. Integración (supertest con `HttpAuth`/`Permission`/`errorHandler` reales): usuario del token, 401 sin token/inválido/deshabilitado, 403 por perfil, 400 sin eco, JSON roto |
| Arranque | Resolución del controller con el contenedor DI real: servicio inyectado y ruta registrada |

Validación por commit: `npx tsc --noEmit`, `npm run lint`, `npx jest`, `npm run build` (base: 75 suites / 1015 tests; final: 80 suites / 1086 tests). Ejecutado en Node 22; producción usa Node 18 (las propiedades Unicode del normalizador existen desde Node 12).

**No verificado:** llamadas reales con IA, Supabase y base de datos; latencias reales; integración con el bridge y el ESP32.

## 8. Decisiones

| # | Decisión |
|---|----------|
| A1 | Body y envelope en **snake_case** según el contrato compartido; excepción explícita a D1 de `BRIDGE_INTEGRATION.md` (camelCase en el REST del bot) |
| A2 | `request_id` UUID estricto en minúsculas; mayúsculas → `400` |
| A3 | Perfiles USER, USER_PREMIUM y ADMIN (como `/alerts`), usuario `enabled` |
| A4 | Mismo flujo que Slack DM, sin cambiar la clasificación del processor |
| A5 | `+` → `completed` con aviso; `null` y excepción → `unknown` (revisión del PR); errores como texto de los servicios → `completed`. El error de generación de imagen del comando `.img` responde un mensaje genérico (antes incluía `error.message`, también en Slack y web) |
| A6 | Texto plano opcional en `IConversation` desde los mismos datos que los bloques; máximo 10 ítems |
| A7 | Formato Slack → texto plano; links como `etiqueta: url`; sin emojis, con acentos |
| A8 | QR, imágenes generadas y lista de imágenes → aviso + `content_omitted` |
| A9 | Entrada y salida de hasta 2000 caracteres, configurables por env |
| A10 | Errores del parser JSON → `400`/`413` en `errorHandler` (todas las rutas) |
| A11 | Sin timeout en el bot; presupuesto de espera del bridge ~120 s, menor que el timeout de cualquier proxy delante del bot |

## 9. Notas para el bridge

- Una llamada por pedido admitido. **No reenviar** ante timeout, corte, `500` o renovación de sesión: el mismo `request_id` volvería a ejecutar.
- **Presupuesto de espera:** timeout de cliente ~**120 s**, siempre **menor** que el timeout de cualquier proxy entre bridge y bot (si el proxy corta antes, p. ej. Cloudflare a 100 s, bajar el del bridge por debajo de ese valor). Un corte, timeout o error de red es resultado **no confirmado** (`unknown`), nunca "falló sin efectos".
- Revisar retries por defecto del cliente HTTP y del refresh de sesión: no heredar los del flujo de alerta de prueba.
- Leer el envelope sólo cuando el body lo trae (`200`, y `500` de la fachada). Los errores previos al handler usan el formato global (§3) y no implican nada sobre efectos salvo lo indicado ahí.
- `message` ya llega normalizado y acotado; mostrarlo tal cual. `content_omitted` indica que se omitió o recortó contenido.
- Generar `request_id` en minúsculas.

## 10. Pendientes

- **Proxy delante del bot:** confirmar su timeout y fijar el presupuesto del bridge por debajo (§9).
- **Contrato compartido:** sincronizar `contratos.md` con estas decisiones (snake_case, `null` → `unknown`, el bot no emite `failed`, límites de 2000, formatos de error previos al handler).
- **Charset del ESP32:** se asume UTF-8 con acentos y sin emojis; confirmar con la fuente real.
- **Observaciones fuera de alcance (sin cambios):**
  - el socket `send_assistant_message` toma el `userId` del cliente sin autenticar;
  - la lista de imágenes no filtra por usuario (`Images` no tiene `userId`);
  - el wrapper web guarda su canal sintético en las entidades que crea;
  - el parser de comandos deja un espacio final en el texto (`.a 10m llamar ` → `'llamar '`), también en Slack.
