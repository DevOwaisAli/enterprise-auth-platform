# Infrastructure

All under [src/infrastructure/](../src/infrastructure/). Every module is `@Global()`, so injection works anywhere without re-importing.

## Database (Prisma)

`PrismaService` extends `PrismaClient` with NestJS lifecycle hooks.

- **Connect on boot** via `OnModuleInit` — fails fast if the DB is unreachable.
- **Disconnect on shutdown** via `OnModuleDestroy`.
- **Optional query logging** — set `DATABASE_LOG_QUERIES=true` to log every SQL statement + duration.
- **Warn / error events** are forwarded to the NestJS logger (which is wired through Pino).
- **Health probe** — `prisma.isHealthy()` runs `SELECT 1`. Bounded by Prisma's pool timeout.

Conventions:

- All domain models use `@default(uuid(7))` primary keys.
- All models carry `createdAt`, `updatedAt`, and (where applicable) `deletedAt` — soft-delete-ready without enforcing it at the ORM layer.
- Use `Prisma.TransactionClient` for cross-service atomic flows (see `AuthService.register` / `AuthService.changePassword`).

Migrations live in [prisma/migrations/](../prisma/migrations/) — created via `npm run db:migrate`, applied in production via `npm run db:migrate:deploy`.

## Redis

`RedisService` wraps an `ioredis` client.

- **Provider** ([redis.provider.ts](../src/infrastructure/redis/redis.provider.ts)) builds the client from `redis.config.ts`, with deduped error logging and exponential backoff (capped at 30 s).
- **Health probe** — `redis.isHealthy()` checks `client.status === 'ready'` first (instant), then races `client.ping()` against a 1-second timeout. Avoids the 15+ second hang you'd otherwise get from BullMQ's default `maxRetriesPerRequest`.
- **Graceful shutdown** — `quit()` if connected, `disconnect()` otherwise, errors swallowed during shutdown.

To inject the raw client: `@Inject(REDIS_CLIENT) private client: Redis`.

## Cache

Higher-level wrapper on top of `RedisService` with JSON serialization. Path: [src/infrastructure/cache/](../src/infrastructure/cache/).

```ts
class CacheService {
  get<T>(key): Promise<T | null>
  set<T>(key, value, { ttlSeconds? }): Promise<boolean>
  delete(...keys): Promise<number>
  exists(key): Promise<boolean>
  ttl(key): Promise<number>
  expire(key, ttlSeconds): Promise<boolean>
  getOrSet<T>(key, loader, { ttlSeconds? }): Promise<T>
  buildKey(namespace, ...parts): string   // 'auth:session:abc-123'
}
```

All methods are **error-safe**: a Redis outage logs a warning and falls through (`get` → `null`, `set` → `false`). Cache is treated as a best-effort accelerator, never a source of truth.

`AUTH_CACHE_KEYS` in [auth.constants.ts](../src/modules/auth/constants/auth.constants.ts) defines the namespaces used by auth (`auth:session:`, `auth:blocklist:`, `auth:user:{id}:sessions`).

## Queue (BullMQ)

[src/infrastructure/queue/](../src/infrastructure/queue/).

Four queues are pre-registered, named in [queue.constants.ts](../src/infrastructure/queue/queue.constants.ts):

| Queue            | Purpose                                       |
| ---------------- | --------------------------------------------- |
| `email`          | Outbound email — consumed by `MailProcessor`  |
| `audit`          | Audit events — consumer is a future phase     |
| `notification`   | In-app / push / webhook notifications         |
| `security-alert` | Suspicious-activity alerts, lockouts          |

`QueueService.enqueue(name, jobName, payload, options?)` is the single producer entry point. Job defaults (per `QUEUE_DEFAULT_*` env):

- 3 attempts
- exponential backoff with 5 s base
- 1-hour retention for successful jobs
- 24-hour retention for failed jobs

Consumer workers extend `WorkerHost`:

```ts
@Processor(QUEUE_NAMES.X)
export class XProcessor extends WorkerHost {
  override async process(job: Job): Promise<void> { ... }
}
```

`MailProcessor` is the only worker in this phase. `audit`, `notification`, and `security-alert` will get workers in future phases.

## Mail

[src/infrastructure/mail/](../src/infrastructure/mail/).

```
AuthService (or anywhere)
   │ QueueService.enqueue(QUEUE_NAMES.EMAIL, MailJobType.X, payload)
   ▼
BullMQ "email" queue ──▶ MailProcessor (WorkerHost)
                              │ MailService.dispatch(type, payload)
                              ▼
                         MailService.dispatch
                              │ renderX(payload) → { subject, html, text }
                              │ sendMail(...)
                              ▼
                         Nodemailer transporter (SMTP)
```

### Pieces

| File                                                            | Role                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| [mail.provider.ts](../src/infrastructure/mail/mail.provider.ts) | Builds the Nodemailer transporter from `MAIL_*` env, calls `verify()` on boot. |
| [mail.service.ts](../src/infrastructure/mail/mail.service.ts)   | `sendMail()` + `dispatch(type, payload)` switch over template renderers. |
| [mail.processor.ts](../src/infrastructure/mail/mail.processor.ts) | BullMQ worker — pulls jobs from the `email` queue and calls `MailService.dispatch`. |
| [mail.types.ts](../src/infrastructure/mail/mail.types.ts)       | `MailJobType` enum + per-job payload interfaces.      |
| [templates/](../src/infrastructure/mail/templates/)             | Inline HTML/text renderers with shared layout + HTML escaping. |

### Templates

Three templates ship:

- `verify-email.template.ts` — verification link with branded button + plain-text fallback.
- `reset-password.template.ts` — same shape, reset link.
- `password-changed.template.ts` — notification with IP / UA / timestamp from `RequestContext`.

All take typed payloads (`VerifyEmailJobData`, `ResetPasswordJobData`, `PasswordChangedJobData`) and return `{ subject, html, text }`. HTML escaping is explicit via [escape.ts](../src/infrastructure/mail/templates/escape.ts).

### Adding a new template

1. Add a `MailJobType` enum entry + payload interface in [mail.types.ts](../src/infrastructure/mail/mail.types.ts).
2. Create a `renderX(payload)` function in `templates/x.template.ts`.
3. Add a switch case in [`MailService.dispatch`](../src/infrastructure/mail/mail.service.ts) for the new type.
4. Producer side: `queueService.enqueue(QUEUE_NAMES.EMAIL, MailJobType.X, payload)`.

## Logger

[src/infrastructure/logger/](../src/infrastructure/logger/).

`nestjs-pino` wraps `pino` and `pino-http`. Wired as the app-wide Nest logger in `main.ts`:

```ts
app.useLogger(app.get(Logger));
```

After this, every `new Logger(name).log(...)` call (and Nest's internal logs) routes through Pino.

### Output format

- **Development** (`LOG_PRETTY=true`) — colored single-line via `pino-pretty`. Compact, readable.
- **Production** (or `LOG_PRETTY=false`) — newline-delimited JSON. One log per line, ready for any log shipper (Datadog, Loki, CloudWatch, etc.).

### Levels

`fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent`. Controlled by `LOG_LEVEL`.

### Correlation IDs

Pino's `customProps` reads from the AsyncLocalStorage `RequestContext` and adds `correlationId` (plus `userId` if set) to every log line emitted during that request. There's no manual plumbing — any log from any service inside an HTTP request gets tagged automatically.

### Request logs

`pino-http` emits one log per request with method/URL/status/duration. `genReqId` reads `X-Correlation-ID` from the request header (or generates a UUID v7) and echoes it on the response. `customLogLevel` downgrades 4xx to `warn` and 5xx to `error`.

### Redaction

The following paths are auto-redacted with `[REDACTED]` before logging:

- `req.headers.authorization`
- `req.headers.cookie`
- `req.body.password`
- `req.body.refreshToken`
- `req.body.accessToken`
- `*.password`
- `*.token`
- `*.secret`

Configured in [logger.module.ts](../src/infrastructure/logger/logger.module.ts). Add more paths there if you add new sensitive fields.

### Grepping by correlation ID

Every successful response carries `correlationId` in both the body and the `X-Correlation-ID` header. To pull every log line for one request:

```bash
docker compose logs app | findstr <correlation-id>   # Windows
docker compose logs app | grep <correlation-id>      # Unix
```

In JSON-log production, point a log query at `correlationId = '<uuid>'`.
