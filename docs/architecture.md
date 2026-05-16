# Architecture

## Layering

```
┌──────────────────────────────────────────────────────────┐
│ HTTP / Express                                           │
│   helmet · compression · body parser (size-limited)      │
│   global prefix `/api/v{N}` (health is VERSION_NEUTRAL)  │
├──────────────────────────────────────────────────────────┤
│ CorrelationIdMiddleware                                  │
│   reads/creates `X-Correlation-ID`, seeds ALS store      │
│   (correlationId, ip, userAgent, startedAt)              │
├──────────────────────────────────────────────────────────┤
│ pino-http                                                │
│   structured request/response logs, redaction, ALS-bound │
├──────────────────────────────────────────────────────────┤
│ Global guards (in order)                                 │
│   ThrottlerGuard    — rate limiting                      │
│   JwtAuthGuard      — JWT verification (Public-aware)    │
├──────────────────────────────────────────────────────────┤
│ Global pipes / interceptors / filters                    │
│   ValidationPipe    — whitelist + transform              │
│   TransformInterceptor — wraps responses                 │
│   HttpExceptionFilter  — unifies errors                  │
├──────────────────────────────────────────────────────────┤
│ Controllers → Services → Repositories (Prisma) / Redis   │
└──────────────────────────────────────────────────────────┘
```

## Folder layout

```
src/
├── common/
│   ├── constants/         # app-wide string constants
│   ├── decorators/        # @CorrelationId, @CurrentUser, @Public, @ResponseMessage
│   ├── enums/             # Environment, etc.
│   ├── exceptions/        # AppException + typed subclasses (NotFound/Validation/...)
│   ├── filters/           # HttpExceptionFilter (Prisma-aware)
│   ├── guards/            # JwtAuthGuard
│   ├── interceptors/      # TransformInterceptor (response envelope)
│   ├── middleware/        # CorrelationIdMiddleware
│   ├── types/             # ApiSuccessResponse / ApiErrorResponse / PaginationMeta
│   └── utils/
│       └── request-context/   # AsyncLocalStorage store + IP / UA extractors
│
├── config/                # @nestjs/config + Joi
│   ├── env.validation.ts
│   ├── app.config.ts
│   ├── auth.config.ts
│   ├── database.config.ts
│   ├── jwt.config.ts
│   ├── mail.config.ts
│   ├── queue.config.ts
│   ├── redis.config.ts
│   ├── swagger.config.ts
│   └── throttle.config.ts
│
├── infrastructure/        # External-system integrations (all global @Module)
│   ├── database/          # PrismaService (lifecycle, query logging, soft-delete conventions)
│   ├── redis/             # ioredis provider + RedisService (deduped logs, bounded ping)
│   ├── cache/             # CacheService over ioredis (JSON, get/set/exists/ttl/getOrSet)
│   ├── queue/             # BullMQ (email, audit, notification, security-alert)
│   ├── mail/              # Nodemailer transporter + MailService + MailProcessor + templates
│   └── logger/            # nestjs-pino module (redaction, ALS-bound correlation)
│
├── modules/
│   ├── audit/             # AuditService → enqueues structured events on the audit queue
│   ├── auth/              # Register / login / JWT / refresh / sessions / passwords (see docs/auth.md)
│   └── health/            # GET /health
│
├── shared/                # Reserved for cross-module shared kernel
├── app.module.ts
└── main.ts                # Bootstrap, helmet, body limits, versioning, Swagger
```

## Request lifecycle

1. **`CorrelationIdMiddleware`** reads `X-Correlation-ID` from the request (or generates a UUID v7), echoes it on the response header, and opens an `AsyncLocalStorage` context for the request — carrying `correlationId`, client `ip`, `userAgent`, and `startedAt`.
2. **`pino-http`** logs the request line; every subsequent log emitted during this request is automatically tagged with `correlationId` via Pino's `customProps`.
3. **Global guards** run in order:
   - `ThrottlerGuard` — rejects if the per-IP rate limit is exceeded.
   - `JwtAuthGuard` — verifies the `Authorization: Bearer <jwt>` token. Routes annotated with `@Public()` skip JWT verification.
4. **`ValidationPipe`** runs on the controller's input DTOs — strips unknown fields, rejects forbidden ones, transforms types.
5. **Controller handler** runs inside the ALS context. Anywhere in the call tree, `RequestContext.get()` returns the current correlation/ip/userAgent/userId without prop-drilling.
6. **`TransformInterceptor`** wraps the handler's return value into the unified `ApiSuccessResponse` envelope (see below).
7. **`HttpExceptionFilter`** catches everything thrown — application exceptions, NestJS HTTP exceptions, Prisma errors — and serializes into the unified `ApiErrorResponse`.

## Unified API response envelope

Success:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": { },
  "timestamp": "2026-01-01T00:00:00.000Z",
  "correlationId": "uuid-v7"
}
```

- `message` is set per-handler via `@ResponseMessage('User created')` on the controller method; defaults to `"Success"`.
- `data` is the handler's return value. Controllers may also return `{ data, meta }` to attach pagination/metadata to the envelope.

Error:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [{ "field": "email", "code": "isEmail", "message": "email must be an email" }],
  "correlationId": "uuid-v7",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "path": "/api/v1/users"
}
```

- `errors[]` is populated for validation failures and structured `AppException` errors (`ValidationAppException`, etc.).
- `path` is the original request URL.
- The HTTP status code matches `statusCode`.

## Error model

```
HttpExceptionFilter handles, in order:

  AppException                       → status/code/message/errors from the instance
  Prisma.PrismaClientKnownRequestError
    P2002 (unique violation)         → 409 UNIQUE_CONSTRAINT_VIOLATION + field info
    P2025 (record not found)         → 404 RECORD_NOT_FOUND
    P2003 (FK violation)             → 400 FOREIGN_KEY_VIOLATION
    *                                 → 400 PRISMA_<code>
  Prisma.PrismaClientValidationError → 400 DATABASE_VALIDATION_ERROR
  HttpException                      → forwarded with status; message/code preserved
  *                                  → 500 INTERNAL_SERVER_ERROR (stack logged)
```

Typed exceptions for app code:

```ts
import {
  AppException,
  NotFoundAppException,
  ValidationAppException,
  UnauthorizedAppException,
  ForbiddenAppException,
  ConflictAppException,
} from '@common/exceptions';
```

Throwing any of these yields a clean envelope. Avoid `throw new Error()` in handler code; throw an `AppException` subclass.

## AsyncLocalStorage request context

```ts
import { RequestContext } from '@common/utils/request-context';

RequestContext.get();                // { correlationId, ip, userAgent, userId?, startedAt }
RequestContext.getCorrelationId();   // string | undefined
RequestContext.set('userId', '...'); // mutate the active store
```

Seeded by `CorrelationIdMiddleware`. Used by:

- `pino-http customProps` — tags every log line with the correlationId.
- `TransformInterceptor` / `HttpExceptionFilter` — echoes correlationId on responses.
- `AuditService.record(...)` — pulls ip / userAgent / userId for the event actor.
- `AuthService` password-changed mail — pulls ip / userAgent for the notification.

## Audit pipeline

```
AuthService event
   │ AuditService.record({ action, resource, resourceId?, status?, metadata })
   ▼
AuditService.buildEvent — pulls actor (userId/email/ip/userAgent) from RequestContext
   │ QueueService.enqueue(QUEUE_NAMES.AUDIT, action, event)
   ▼
BullMQ "audit" queue — persistence worker lives here in a future phase
```

Action enum lives in [src/modules/audit/audit.types.ts](../src/modules/audit/audit.types.ts) and covers login / MFA / RBAC / org / token events.

## Health endpoint

`GET /health` (version-neutral; outside the `/api/vN` prefix). Returns the unified envelope wrapping:

```json
{
  "status": "up",
  "timestamp": "...",
  "environment": "development",
  "version": "0.3.0",
  "uptimeSeconds": 42,
  "memory": { "rssMb": 110.3, "heapTotalMb": 60.2, "heapUsedMb": 38.7, "externalMb": 2.1 },
  "services": { "database": "up", "redis": "up" }
}
```

- HTTP status is always 200 — the verdict is in the body. Use `data.status === "up"` for K8s readiness probes.
- Redis check is bounded by a 1-second timeout (see [infrastructure.md](infrastructure.md)).

## Conventions

- **UUID v7** everywhere — Prisma defaults to `@default(uuid(7))` and app code uses `import { v7 as uuidv7 } from 'uuid'`.
- **Soft-delete ready** — every domain model carries `createdAt`, `updatedAt`, `deletedAt`.
- **Path aliases** — `@common/*`, `@config/*`, `@infrastructure/*`, `@modules/*`, `@shared/*` (rewritten to relative paths by `tsc-alias` at build).
- **Strict TS** — `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`. Build fails on any warning.
- **No comments unless WHY is non-obvious.** Identifiers, types, and tests are the documentation.
