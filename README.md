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

Every successful response is wrapped:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": { /* whatever the controller returned */ },
  "timestamp": "2026-01-01T00:00:00.000Z",
  "correlationId": "uuid-v4"
}
```

Every error response:

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

Per-handler success message: `@ResponseMessage('User created')` on the controller method.

## Logging

Pino is wired as the app-wide Nest logger. In development with `LOG_PRETTY=true` you get colored single-line output; in production you get JSON ready for log shipping.

- **Levels**: `fatal`, `error`, `warn`, `info`, `debug`, `trace`
- **Redaction**: `Authorization` / `Cookie` headers, `password`, `*.token`, `*.secret` are auto-replaced with `[REDACTED]`.
- **Correlation IDs** are attached to every line via `customProps`, read from `AsyncLocalStorage`.

### Debugging with correlation IDs

Every response carries an `X-Correlation-ID` header and a `correlationId` field in the body. When a user reports a problem, ask for the correlation ID, then grep the logs:

```bash
docker compose logs app | findstr <correlation-id>
```

Every log line emitted during that single request — middleware, service, DB query, exception — will share the same ID.

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

`GET /health` (version-neutral, outside the `/api/vN` prefix). Returns the unified envelope wrapping a health report. Full example:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Health check succeeded",
  "data": {
    "status": "up",
    "timestamp": "2026-05-16T20:07:18.895Z",
    "environment": "development",
    "version": "0.2.0",
    "uptimeSeconds": 25,
    "memory": {
      "rssMb": 125.78,
      "heapTotalMb": 40.43,
      "heapUsedMb": 37.14,
      "externalMb": 4.71
    },
    "services": {
      "database": "up",
      "redis": "up"
    }
  },
  "timestamp": "2026-05-16T20:07:18.906Z",
  "correlationId": "7e3a94d3-65bb-4dcc-a95f-cc2d3b6f57af"
}
```

Field meanings:

| Field                     | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `data.status`             | Overall verdict. `"up"` only when all components are healthy.               |
| `data.environment`        | `NODE_ENV` of the running process.                                          |
| `data.version`            | App version from `package.json`.                                            |
| `data.uptimeSeconds`      | Seconds since the Node process started. Resets on restart.                  |
| `data.memory.rssMb`       | Resident Set Size — total physical RAM owned by this Node process.          |
| `data.memory.heapTotalMb` | V8 heap reservation.                                                        |
| `data.memory.heapUsedMb`  | V8 heap actually in use. Trends upward on leaks.                            |
| `data.memory.externalMb`  | C++-bound memory (Buffers, native modules, socket queues).                  |
| `data.services.database`  | Result of `PrismaService.isHealthy()` (runs `SELECT 1`).                    |
| `data.services.redis`     | Result of `RedisService.isHealthy()` (runs `PING`, 1s timeout).             |

The endpoint always returns HTTP `200` — the verdict is in the body. Use `data.status === "up"` for readiness probes.

## API versioning

URI versioning is enabled globally with `API_DEFAULT_VERSION=1`. Routes registered under `@Controller('users')` are reachable at `/api/v1/users`. To pin a controller to a specific version: `@Controller({ path: 'users', version: '2' })`. `/health` is `VERSION_NEUTRAL`.

## Environment variables

All keys are validated with Joi at boot via [env.validation.ts](src/config/env.validation.ts) — invalid env fails fast with a clear error.

| Group       | Key                          | Default                            | Required |
| ----------- | ---------------------------- | ---------------------------------- | -------- |
| App         | `NODE_ENV`                   | `development`                      | no       |
| App         | `PORT`                       | `3000`                             | no       |
| App         | `API_PREFIX`                 | `api`                              | no       |
| App         | `API_DEFAULT_VERSION`        | `1`                                | no       |
| App         | `CORS_ORIGIN`                | `*`                                | no       |
| App         | `BODY_LIMIT`                 | `10mb`                             | no       |
| Database    | `DATABASE_URL`               | —                                  | **yes**  |
| Database    | `DATABASE_LOG_QUERIES`       | `false`                            | no       |
| Redis       | `REDIS_HOST`                 | `localhost`                        | no       |
| Redis       | `REDIS_PORT`                 | `6379`                             | no       |
| Redis       | `REDIS_PASSWORD`             | empty                              | no       |
| Redis       | `REDIS_DB`                   | `0`                                | no       |
| JWT         | `JWT_ACCESS_SECRET`          | —                                  | **yes**  |
| JWT         | `JWT_REFRESH_SECRET`         | —                                  | **yes**  |
| JWT         | `JWT_ACCESS_EXPIRES_IN`      | `15m`                              | no       |
| JWT         | `JWT_REFRESH_EXPIRES_IN`     | `7d`                               | no       |
| Mail (SMTP) | `MAIL_HOST` ... `MAIL_FROM`  | sane defaults                      | no       |
| Queue       | `QUEUE_PREFIX`               | `eap`                              | no       |
| Queue       | `QUEUE_DEFAULT_ATTEMPTS`     | `3`                                | no       |
| Queue       | `QUEUE_DEFAULT_BACKOFF_MS`   | `5000`                             | no       |
| Throttle    | `THROTTLE_TTL_MS`            | `60000`                            | no       |
| Throttle    | `THROTTLE_LIMIT`             | `100`                              | no       |
| Swagger     | `SWAGGER_ENABLED`            | `true`                             | no       |
| Swagger     | `SWAGGER_PATH`               | `api/docs`                         | no       |
| Logger      | `LOG_LEVEL`                  | `debug`                            | no       |
| Logger      | `LOG_PRETTY`                 | `true`                             | no       |

Required keys must be set in `.env`. See [.env.example](.env.example) for the full template.

## Local setup

Two valid workflows — pick whichever fits how you work. **Don't run both** (port conflict on 3000).

### Workflow A — Everything in Docker

Zero host setup beyond Docker Desktop. Slower file-watch on Windows.

```bash
copy .env.example .env       # Windows;  cp on macOS/Linux
npm run docker:up:build      # build + start app, postgres, redis
npm run docker:logs          # follow logs
```

The container runs `npm run start:dev` internally — code changes auto-reload via the mounted volume.

### Workflow B — App on host, deps in Docker (recommended for daily dev)

Faster watch, native debugging.

```bash
copy .env.example .env
docker compose up -d postgres redis    # only the dependencies
npm install                            # local node_modules for IDE + runtime
npm run db:generate
npm run db:migrate                     # create the placeholder schema
npm run start:dev                      # app on host, hot reload
```

URLs (either workflow):

- API: <http://localhost:3000/api/v1>
- Swagger: <http://localhost:3000/api/docs>
- Health: <http://localhost:3000/health>

## Docker workflow

| Command                          | What it does                                          |
| -------------------------------- | ----------------------------------------------------- |
| `npm run docker:up`              | Start all services in the background                  |
| `npm run docker:up:build`        | Same, but rebuilds the app image first                |
| `npm run docker:logs`            | Tail logs from all services                           |
| `npm run docker:down`            | Stop and remove containers (volumes survive)          |
| `docker compose down -v`         | Stop **and** wipe Postgres / Redis volumes            |
| `docker compose ps`              | Show which containers are up + health                 |
| `docker compose stop app`        | Stop just the app, keep deps running (for Workflow B) |

Persistent data lives in named volumes `postgres-data` and `redis-data`.

## Scripts

| Script                          | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `start:dev` / `start:debug`     | Watch / debug mode                            |
| `start:prod`                    | Run compiled `dist/main`                      |
| `build`                         | `nest build` + `tsc-alias` (path-alias fix)   |
| `lint` / `lint:fix`             | ESLint                                        |
| `format` / `format:check`       | Prettier                                      |
| `type-check`                    | `tsc --noEmit`                                |
| `test` / `test:watch` / `:cov`  | Jest                                          |
| `test:e2e`                      | End-to-end Jest suite                         |
| `docker:up` / `:down` / `:logs` | Docker compose orchestration                  |
| `db:migrate` / `db:reset`       | Prisma dev migrate / full reset               |
| `db:studio`                     | Prisma Studio at <http://localhost:5555>      |
| `db:generate`                   | Generate Prisma client                        |

## Development standards

- **Zero TS errors** with `strict + noUncheckedIndexedAccess + noUnusedLocals/Parameters`.
- **ESLint clean** — no unused imports, alphabetized import groups, consistent type-imports, no floating promises.
- **Husky pre-commit** runs `tsc --noEmit` + lint-staged (eslint --fix + prettier --write on `*.ts`).
- **Path aliases**: `@common/*`, `@config/*`, `@infrastructure/*`, `@modules/*`, `@shared/*` (resolved by `tsc-alias` at build).
- **No comments unless WHY is non-obvious.** Identifiers, types and tests are the documentation.

## Troubleshooting

### `EADDRINUSE: address already in use :::3000`

Another process owns port 3000. Usually the Docker app container is still running while you tried `npm run start:dev`, or a previous Node process was orphaned by Ctrl+C without confirming `Y` to terminate the batch job.

```bash
npx kill-port 3000
# or
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

### `P1001: Can't reach database server`

Postgres isn't running, or `DATABASE_URL` doesn't match. Verify:

```bash
docker compose ps                         # is eap-postgres healthy?
netstat -ano | findstr :5432              # is something listening?
```

If you're running a *local* Postgres (pgAdmin) instead of the Docker one, make sure `docker compose stop postgres` first — only one can bind 5432.

### `Redis error (localhost:6379): ECONNREFUSED`

Redis isn't running. The app will still boot but `/health` will report `redis: "down"`.

```bash
docker compose up -d redis
```

### Pre-commit hook fails on commit

The hook runs `type-check` + `lint-staged`. Run them manually to see what's failing:

```bash
npm run type-check
npm run lint
```

Fix issues, re-stage, and commit again. The hook can't be bypassed without `--no-verify`.

### Swagger page is blank or times out

Either `SWAGGER_ENABLED=false`, or the app crashed during startup. Check logs:

```bash
docker compose logs app | findstr ERROR
```

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
