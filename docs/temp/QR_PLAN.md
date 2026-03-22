# QR Code Generator Module — Implementation Plan (Phase 1)

## Overview

Generate QR codes from text/URL via Slack (`.qr` command) and Web (Socket.io `generate_qr` event).  
No database persistence — images are returned directly to the caller.

---

## Stage 1: Dependencies

- [x] **1.1** Install `qrcode` (npm) and `@types/qrcode`
- **Check:** `npm ls qrcode` shows installed version

---

## Stage 2: Shared Layer (`src/modules/qr/shared/`)

- [x] **2.1** Interfaces (`shared/interfaces/qr.interfaces.ts`)
  - `IQrVisualOptions`, `IQrParsedInput`, `IQrShortcut`, `IQrGenerateOptions`, `IQrResult`
- [x] **2.2** Constants (`shared/constants/qr.constants.ts`)
  - `QR_DEFAULTS` (fg: `#000000`, bg: `#FFFFFF`, ecl: `M`)
  - `QR_SHORTCUTS` registry: `wa`, `tl`, `ig`, `wifi`, `mail`
  - **Architecture choice:** Dictionary registry (Record<string, IQrShortcut>) — adding a shortcut is a single object entry
- [x] **2.3** Parser utility (`shared/utils/qrParser.utils.ts`)
  - `parseQrInput(raw)` → extracts visual flags (`-fg`, `-bg`, `-e`) and shortcut flags
  - `resolveVisualOptions(partial)` → merges with defaults
- **Check:** 18 unit tests for parser pass

---

## Stage 3: Service Layer (`src/modules/qr/services/qr.services.ts`)

- [x] **3.1** Singleton service `QrServices`
- [x] **3.2** `generateQr(options)` → `GenericResponse<IQrResult>`
  - Validates content is non-empty
  - Calls `QRCode.toBuffer()` with visual options
  - Returns `{ data: { buffer, content } }` or `{ error: string }`
- **Check:** 6 unit tests for service pass

---

## Stage 4: Slack Controller (`src/modules/qr/controller/qr.controller.ts`)

- [x] **4.1** `@SlackAuth` handler `generateQr(data)`
  - Strips `.qr` prefix, parses input, calls service
  - Uploads image via `client.files.uploadV2`
- [x] **4.2** Regex in `slackConfig.ts`: `generateQr: /^\.qr?\b/i`
- [x] **4.3** Listener in `app.ts`: `slackApp.message(slackListenersKey.generateQr, ...)`
- [x] **4.4** Updated `conversationFlow` regex to exclude `.qr`
- **Check:** 7 unit tests for Slack controller pass

---

## Stage 5: Web Controller (`src/modules/qr/controller/qrWeb.controller.ts`)

- [x] **5.1** `QrWebController.generateQr(data)` → returns `{ data: { image: base64, content } }`
- [x] **5.2** Socket.io listener `generate_qr` in `app.ts` → supports both callback and emit patterns
- **Check:** 8 unit tests for Web controller pass

---

## Stage 6: Tests

- [x] **6.1** Parser utility: 18 tests (`qrParser.utils.test.ts`)
- [x] **6.2** Service: 6 tests (`qr.services.test.ts`)
- [x] **6.3** Slack controller: 7 tests (`qr.controller.test.ts`)
- [x] **6.4** Web controller: 8 tests (`qrWeb.controller.test.ts`)
- **Total:** 39 tests, all passing

---

## Stage 7: Verification

- [x] **7.1** Lint passes (`npx eslint --ext .ts`)
- [x] **7.2** Full test suite: 506/507 pass (1 pre-existing failure unrelated)
- [ ] **7.3** Security scan (CodeQL)

---

## Summary Index

| Stage | Key Files | Critical Notes |
|-------|-----------|----------------|
| 2 | `shared/constants/qr.constants.ts` | Shortcut registry — add new shortcuts here only |
| 2 | `shared/utils/qrParser.utils.ts` | Input parsing — visual flags + shortcut resolution |
| 3 | `services/qr.services.ts` | Core logic — `qrcode.toBuffer()` |
| 4 | `controller/qr.controller.ts` | Slack — uses `client.files.uploadV2` |
| 4 | `config/slackConfig.ts` | Regex `generateQr` + updated `conversationFlow` exclusion |
| 5 | `controller/qrWeb.controller.ts` | Socket.io — returns base64 |
| 5 | `app.ts` | Socket listener `generate_qr` + Slack listener registration |

## Post-Step Checks

1. After Stage 2: run `npx jest src/modules/qr/shared`
2. After Stage 3: run `npx jest src/modules/qr/services`
3. After Stage 4: run `npx jest src/modules/qr/controller` + verify slackConfig regex
4. After Stage 5: run full test suite + lint
5. After Stage 7: run CodeQL security scan

## Status Table

| # | Stage | Status |
|---|-------|--------|
| 1 | Dependencies | ✅ Done |
| 2 | Shared Layer | ✅ Done |
| 3 | Service Layer | ✅ Done |
| 4 | Slack Controller | ✅ Done |
| 5 | Web Controller | ✅ Done |
| 6 | Tests | ✅ Done (39/39) |
| 7 | Lint + Tests | ✅ Done |
| 8 | Security Scan | ⏳ Pending |
