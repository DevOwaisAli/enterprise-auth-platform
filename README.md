# enterprise-auth-platform

Enterprise-grade authentication and authorization platform built on NestJS, PostgreSQL, Redis, BullMQ, and Pino. This repository currently contains the **foundation + core infrastructure** layers. Auth, RBAC, MFA, OAuth, SAML and multi-tenancy will be layered on top in subsequent phases.

## Tech stack

| Concern         | Choice                                                          |
| --------------- | --------------------------------------------------------------- |
| Runtime         | Node.js 22 (LTS) + TypeScript 5 (strict)                        |
| Framework       | NestJS 11                                                       |
| Database        | PostgreSQL 16 via Prisma 6                                      |
| Cache / KV      | Redis 7 via ioredis 5                                           |
| Queue           | BullMQ (Redis-backed) via `@nestjs/bullmq`                      |
| Mail            | Nodemailer 6                                                    |
| Logging         | Pino + `nestjs-pino` (JSON in prod, pretty in dev)              |
| Validation      | class-validator, class-transformer, Joi (env)                   |
| Rate limiting   | `@nestjs/throttler` (config-driven)                             |
| API docs        | OpenAPI / Swagger at `/api/docs`                                |
| Security        | helmet, compression, CORS, body-size limit, global validation   |
| Quality         | ESLint 9 flat config, Prettier 3, Husky 9, lint-staged          |
| Infra           | Docker + docker-compose (app, postgres, redis)                  |

## Architecture overview

```
src/
├── common/
│   ├── constants/
│   ├── decorators/        # @CorrelationId, @ResponseMessage
│   ├── enums/
│   ├── exceptions/        # AppException + typed subclasses
│   ├── filters/           # Global HttpExceptionFilter (Prisma-aware)
│   ├── interceptors/      # TransformInterceptor (response envelope)
│   ├── middleware/        # CorrelationIdMiddleware (seeds AsyncLocalStorage)
│   ├── types/             # ApiSuccessResponse / ApiErrorResponse / Pagination
│   └── utils/
│       └── request-context/   # AsyncLocalStorage store + IP / UA extractors
│
├── config/                # @nestjs/config + Joi
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── jwt.config.ts
│   ├── mail.config.ts
│   ├── queue.config.ts
│   ├── swagger.config.ts
│   ├── throttle.config.ts
│   └── env.validation.ts
│
├── infrastructure/        # External systems
│   ├── database/          # PrismaService (query logging, soft-delete conventions)
│   ├── redis/             # ioredis provider + RedisService (deduped logs)
│   ├── cache/             # CacheService (get/set/delete/exists/ttl/getOrSet)
│   ├── queue/             # BullMQ (email, audit, notification, security-alert)
│   ├── mail/              # Nodemailer transporter + MailService
│   └── logger/            # Pino module (transport, redaction, ALS-bound correlation)
│
├── modules/
│   ├── audit/             # AuditService → queues structured events
│   └── health/            # GET /health (memory, env, services)
│
├── shared/
├── app.module.ts
└── main.ts                # Bootstrap, helmet, body limits, versioning, Swagger
```

## Request lifecycle

1. **`CorrelationIdMiddleware`** reads `X-Correlation-ID` (or generates a UUID v4), sets it on the response header and into an `AsyncLocalStorage` store. The store also carries IP, user-agent and `startedAt`.
2. **Pino `pinoHttp`** logs the request/response, automatically merging `correlationId` from the request context onto every log line.
3. **Controllers** run inside the ALS context, so any code path can call `RequestContext.get()` without prop-drilling.
4. **`TransformInterceptor`** wraps the controller's return value into the unified `ApiSuccessResponse` envelope (see below).
5. **`HttpExceptionFilter`** catches anything thrown — application exceptions, NestJS HTTP exceptions, Prisma errors (P2002, P2025, P2003, ...) — and serializes them into the unified `ApiErrorResponse`.

## Unified API response envelope

Success:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": { },
  "timestamp": "2026-01-01T00:00:00.000Z",
  "correlationId": "uuid-v4"
}
```

Error:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [{ "field": "email", "code": "isEmail", "message": "email must be an email" }],
  "correlationId": "uuid-v4",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "path": "/api/v1/users"
}
```

Per-handler messages: `@ResponseMessage('User created')` on the controller method.

## Logging

Pino is wired as the app-wide Nest logger. In development with `LOG_PRETTY=true` you get colored single-line output; in production you get JSON ready for log shipping.

- **Levels**: `fatal`, `error`, `warn`, `info`, `debug`, `trace`
- **Redaction**: `Authorization` / `Cookie` headers, `password`, `*.token`, `*.secret` are auto-replaced with `[REDACTED]`.
- **Correlation IDs** are attached to every line via `customProps`, read from `AsyncLocalStorage`.

## Queue system

BullMQ on top of Redis, with four pre-registered queues:

| Queue            | Purpose                                       |
| ---------------- | --------------------------------------------- |
| `email`          | Async outbound email                          |
| `audit`          | Audit event persistence + downstream sinks    |
| `notification`   | In-app / push / webhook notifications         |
| `security-alert` | Suspicious-activity alerts, lockouts, etc.    |

`QueueService.enqueue(name, jobName, payload, options?)` is the single entry point. Defaults: exponential backoff, 3 attempts, 1-hour retention on success, 24-hour retention on failure. Workers/processors are intentionally not wired yet — they come with each feature phase.

## Cache abstraction

`CacheService` over ioredis with JSON serialization. Methods: `get`, `set`, `delete`, `exists`, `ttl`, `expire`, `getOrSet`, plus `buildKey(namespace, ...parts)`. All operations are error-safe — a Redis outage logs a warning and falls through (`get` returns `null`, `set` returns `false`).

## Audit foundation

`AuditService.record({ action, resource, resourceId, status, metadata })` builds an `AuditEvent` from the current request context (actor IP / UA / userId / correlationId) and enqueues it on the `audit` queue. Actions are typed via the `AuditAction` enum (login.success, mfa.enabled, role.assigned, ...). Persistence to a Postgres audit table will arrive with the auth phase.

## Health endpoint

`GET /health` (version-neutral, outside the `/api/vN` prefix):

```json
{
  "status": "up",
  "timestamp": "...",
  "environment": "development",
  "version": "0.2.0",
  "uptimeSeconds": 42,
  "memory": { "rssMb": 110.3, "heapTotalMb": 60.2, "heapUsedMb": 38.7, "externalMb": 2.1 },
  "services": { "database": "up", "redis": "up" }
}
```

Returns `200` even when components are `down` — the response body carries the verdict.

## API versioning

URI versioning is enabled globally with `API_DEFAULT_VERSION=1`. Routes registered under `@Controller('users')` are reachable at `/api/v1/users`. To pin a controller to a specific version: `@Controller({ path: 'users', version: '2' })`. `/health` is `VERSION_NEUTRAL`.

## Local setup

```bash
npm install
cp .env.example .env

# Bring up Postgres + Redis
npm run docker:up

# Apply schema + generate client
npm run db:migrate

# Start in watch mode (Pino pretty logs)
npm run start:dev
```

URLs:

- API: <http://localhost:3000/api/v1>
- Swagger: <http://localhost:3000/api/docs>
- Health: <http://localhost:3000/health>

## Docker setup

```bash
npm run docker:up:build   # full stack with rebuild
npm run docker:logs       # follow logs
npm run docker:down       # stop everything
```

## Scripts

| Script                          | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `start:dev` / `start:debug`     | Watch / debug mode                            |
| `start:prod`                    | Run compiled `dist/main`                      |
| `build`                         | `nest build` + `tsc-alias` (path-alias fix)   |
| `lint` / `lint:fix`             | ESLint                                        |
| `format` / `format:check`       | Prettier                                      |
| `type-check`                    | `tsc --noEmit`                                |
| `docker:up` / `:down` / `:logs` | Docker compose orchestration                  |
| `db:migrate` / `db:reset`       | Prisma dev migrate / reset                    |
| `db:studio`                     | Prisma Studio                                 |
| `db:generate`                   | Generate Prisma client                        |

## Development standards

- **Zero TS errors** with `strict + noUncheckedIndexedAccess + noUnusedLocals/Parameters`.
- **ESLint clean** — no unused imports, alphabetized import groups, consistent type-imports, no floating promises.
- **Husky pre-commit** runs `tsc --noEmit` + lint-staged (eslint --fix + prettier --write on `*.ts`).
- **Path aliases**: `@common/*`, `@config/*`, `@infrastructure/*`, `@modules/*`, `@shared/*` (resolved by `tsc-alias` at build).
- **No comments unless WHY is non-obvious.** Identifiers, types and tests are the documentation.

## Roadmap (upcoming phases)

- [ ] User / Role / Permission / Org domain models
- [ ] Password-based auth + refresh token rotation
- [ ] RBAC guards + policy engine
- [ ] MFA (TOTP, recovery codes)
- [ ] OAuth2 / OIDC, SAML SSO
- [ ] Multi-tenancy + tenant-scoped JWTs
- [ ] Audit persistence + dashboards
- [ ] Email templates + transactional flows
- [ ] OpenTelemetry tracing + metrics

## License

UNLICENSED — internal/private project.
