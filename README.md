# enterprise-auth-platform

Enterprise-grade authentication and authorization platform built with NestJS, PostgreSQL, Redis, and a production-ready architecture. This repository currently contains the **foundation only** — authentication, RBAC, MFA, OAuth2, SAML SSO and multi-tenancy will be layered on top in subsequent tasks.

## Tech stack

| Concern          | Choice                                                          |
| ---------------- | --------------------------------------------------------------- |
| Runtime          | Node.js 22 (LTS) + TypeScript 5 (strict mode)                   |
| Framework        | NestJS 11 (modular, DI, decorators)                             |
| Database         | PostgreSQL 16 via Prisma ORM 6                                  |
| Cache / KV       | Redis 7 via ioredis 5                                           |
| Validation       | class-validator, class-transformer, Joi (env)                   |
| Docs             | OpenAPI / Swagger (`@nestjs/swagger`) at `/api/docs`            |
| Security         | helmet, compression, CORS, global validation pipe               |
| Quality          | ESLint 9 (flat config), Prettier 3, Husky 9, lint-staged        |
| Infra            | Docker + docker-compose (app, postgres, redis)                  |

## Architecture overview

```
src/
├── common/            # Cross-cutting: filters, interceptors, middleware, decorators, types
│   ├── constants/
│   ├── decorators/
│   ├── dto/
│   ├── enums/
│   ├── exceptions/    # AppException base class
│   ├── filters/       # Global HTTP exception filter
│   ├── guards/
│   ├── interceptors/  # Response envelope transformer
│   ├── middleware/    # Correlation IDs, request logger
│   ├── pipes/
│   ├── types/         # Shared API types
│   └── utils/
│
├── config/            # @nestjs/config + Joi validation, registered namespaces
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── jwt.config.ts
│   └── env.validation.ts
│
├── infrastructure/    # External system integrations
│   ├── database/      # PrismaService, DatabaseModule
│   ├── redis/         # ioredis provider, RedisService, RedisModule
│   ├── logger/        # AppLoggerService
│   ├── cache/         # (placeholder — caching strategy later)
│   └── docker/        # (placeholder)
│
├── modules/           # Feature modules
│   └── health/        # GET /health → API / DB / Redis status
│
├── shared/            # Reserved for cross-module shared kernel
│
├── app.module.ts
└── main.ts            # Bootstrapping, Swagger, helmet, compression, global pipes
```

Architectural guarantees:

- **Strict TS** — `strict`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` all on. Project compiles with zero TS errors.
- **Config-driven** — no hardcoded secrets or hosts. Env is validated on boot via Joi; the app fails fast on invalid configuration.
- **Path aliases** — `@common/*`, `@config/*`, `@infrastructure/*`, `@modules/*`, `@shared/*`.
- **Global response envelope** — every successful response is wrapped as `{ success, data, meta }`. Every error is mapped to `{ success: false, error, meta }` by the global filter.
- **Correlation IDs** — every request gets an `x-correlation-id` (echoed in responses) and is threaded into logs.

## Local setup (without Docker)

Prerequisites: Node.js 22+, npm 10+, a reachable PostgreSQL 16 and Redis 7.

```bash
# 1. Install dependencies
npm install

# 2. Copy and edit env
cp .env.example .env

# 3. Generate Prisma client
npm run prisma:generate

# 4. Run migrations (creates the database schema)
npm run prisma:migrate

# 5. Start in watch mode
npm run start:dev
```

The API will be available at <http://localhost:3000/api>, Swagger UI at <http://localhost:3000/api/docs>, health at <http://localhost:3000/health>.

## Docker setup

Spin up the full stack (app, PostgreSQL, Redis) with one command:

```bash
docker compose up --build
```

Services:

| Service  | Image                | Host port |
| -------- | -------------------- | --------- |
| app      | (built from source)  | `3000`    |
| postgres | `postgres:16-alpine` | `5432`    |
| redis    | `redis:7-alpine`     | `6379`    |

Data is persisted in named volumes (`postgres-data`, `redis-data`). The app container mounts source for hot reload via `nest start --watch`.

## Available scripts

| Script                       | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `npm run start:dev`          | Start the API in watch mode                   |
| `npm run start:prod`         | Run the compiled app                          |
| `npm run build`              | Compile TypeScript → `dist/`                  |
| `npm run lint` / `lint:fix`  | ESLint                                        |
| `npm run format` / `:check`  | Prettier write / check                        |
| `npm run type-check`         | `tsc --noEmit`                                |
| `npm run prisma:generate`    | Generate the Prisma client                    |
| `npm run prisma:migrate`     | Create + apply a dev migration                |
| `npm run prisma:studio`      | Open Prisma Studio                            |
| `npm test`                   | Run unit tests (Jest)                         |
| `npm run test:e2e`           | Run end-to-end tests                          |

## Quality gates

- **Husky pre-commit hook** runs `tsc --noEmit` + `lint-staged` (ESLint + Prettier on staged `.ts`).
- ESLint flat config enforces import ordering, no unused imports, consistent type imports, no floating promises.
- Prettier formats with `singleQuote`, `trailingComma: all`, `printWidth: 100`.

## Health endpoint

`GET /health` returns:

```json
{
  "status": "up",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptimeSeconds": 42,
  "components": {
    "api":      { "status": "up" },
    "database": { "status": "up" },
    "redis":    { "status": "up" }
  }
}
```

`status` is `down` if any component is unhealthy.

## Roadmap

The following will be added in subsequent tasks (foundation only in this commit):

- [ ] User, Role, Permission domain models (Prisma)
- [ ] Password-based authentication + refresh tokens
- [ ] RBAC guards and policy engine
- [ ] MFA (TOTP, recovery codes)
- [ ] OAuth2 / OIDC providers
- [ ] SAML SSO
- [ ] Multi-tenancy (tenant isolation, per-tenant config)
- [ ] Audit logging (DB + structured logs)
- [ ] Rate limiting + brute-force protection
- [ ] Session management + device fingerprinting
- [ ] Production observability (OpenTelemetry, metrics)

## License

UNLICENSED — internal/private project.
