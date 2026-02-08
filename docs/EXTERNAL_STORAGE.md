# External Storage Module

Client module that communicates with **api-storage**, an external REST service that persists files in Backblaze B2. It provides a centralized interface for other modules to upload, query, and delete files, while keeping a local record in the database.

## Configuration

Requires two environment variables:

```bash
STORAGE_API_URL=https://example.com/api-storage   # api-storage base URL
STORAGE_API_KEY=sk_...                             # API key for authentication
```

Both are validated at startup; the repository throws if either is missing.

## Module Structure

```
src/modules/externalStorage/
├── repositories/
│   ├── apiStorage/
│   │   └── apiStorage.repository.ts       # HTTP client (Axios)
│   └── database/
│       └── externalStorage.dataSource.ts  # Local DB CRUD
├── services/
│   └── externalStorage.services.ts        # Business logic
└── shared/
    ├── constants/
    │   └── externalStorage.constants.ts   # Enums and path mapping
    └── interfaces/
        └── externalStorage.interfaces.ts  # Types

src/entities/
└── storedFile.ts                          # TypeORM entity
```

## Entity: StoredFile

Located in `src/entities/storedFile.ts`, auto-loaded by the ORM config. Tracks every file uploaded to api-storage.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `number` | Auto-generated primary key |
| `storageFileId` | `string` | ID returned by api-storage |
| `fileName` | `string` | Original file name |
| `path` | `string` | Virtual directory path |
| `fullPath` | `string` | Full key in storage (path + name) |
| `mimeType` | `string` | MIME type |
| `size` | `number` | File size in bytes |
| `downloadUrl` | `string` | Cached presigned URL (nullable) |
| `metadata` | `simple-json` | Arbitrary key-value data (nullable) |
| `sourceModule` | `string` | Module that uploaded the file |
| `createdAt` | `Date` | Creation timestamp |
| `updatedAt` | `Date` | Last update timestamp |

## Source Modules

Each consuming module has a predefined enum value and default storage path:

| Enum | Value | Default Path |
|------|-------|--------------|
| `StorageSourceModule.IMAGES` | `IMAGES` | `images/generated` |
| `StorageSourceModule.TEXT_TO_SPEECH` | `TEXT_TO_SPEECH` | `tts/audio` |
| `StorageSourceModule.CONVERSATIONS` | `CONVERSATIONS` | `conversations/files` |
| `StorageSourceModule.SLACK` | `SLACK` | `slack/uploads` |

## Repository Layer

### ApiStorageRepository

Singleton HTTP client using Axios, configured with `X-API-Key` header authentication.

| Method | HTTP Call | Returns |
|--------|-----------|---------|
| `uploadFile(buffer, fileName, options?)` | `POST /files/upload` (multipart via native `FormData`) | `IStorageApiFile \| null` |
| `getFile(fileId)` | `GET /files/:id` | `IStorageApiFile \| null` |
| `listFiles(options?)` | `GET /files` with query params | `IStorageApiListResponse \| null` |
| `deleteFile(fileId)` | `DELETE /files/:id` | `boolean` |
| `downloadFromUrl(url)` | `GET` (direct axios, any URL) | `Buffer \| null` |

All methods return `null` (or `false`) on error with structured logging. File upload uses native `FormData` and `Blob` (Node 18+), no external dependencies.

### ExternalStorageDataSource

Singleton CRUD for the `StoredFile` entity using TypeORM BaseEntity methods.

Methods: `createStoredFile`, `getStoredFileById`, `getStoredFileByStorageId`, `getStoredFilesByModule`, `updateDownloadUrl`, `deleteStoredFile`.

## Service Layer

`ExternalStorageServices` orchestrates both repositories and returns `GenericResponse<T>` (with `data` or `error`).

### Methods

**`uploadFile(options: IStorageUploadOptions)`**
Uploads a buffer to api-storage and persists the record locally. Uses the module's default path unless a custom one is provided.

**`uploadFromUrl(options: IStorageUploadFromUrlOptions)`**
Downloads a file from an external URL into a buffer, then delegates to `uploadFile`. Designed for persisting AI-generated images from temporary URLs.

**`getFileDetails(localId: number)`**
Fetches a fresh presigned download URL from api-storage and updates the local cache.

**`getDownloadUrl(localId: number)`**
Convenience wrapper that returns only the download URL string.

**`listFiles(options?: IStorageListOptions)`**
Lists files directly from api-storage with optional filters (search, path, mime, size range, date range, pagination).

**`listFilesByModule(sourceModule: string)`**
Lists files filtered by the module's default path.

**`deleteFile(localId: number)`**
Deletes from api-storage first, then removes the local record. If the remote deletion fails, the local record is preserved.

## Integration Test

A standalone script verifies the full cycle against a running api-storage instance:

```bash
npx tsx scripts/testStorage.ts
```

Tests: upload → get → download (content verification) → list (path filter) → delete → confirm 404.

## Tests

- `repositories/apiStorage/__tests__/apiStorage.repository.test.ts` — 14 tests (HTTP methods, error handling, env validation)
- `services/__tests__/externalStorage.services.test.ts` — 18 tests (business logic flows, error propagation)
