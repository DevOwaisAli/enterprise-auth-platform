# enterprise-auth-platform

Enterprise-grade authentication and authorization platform built on NestJS, PostgreSQL, Redis, BullMQ, and Pino.

Current scope: foundation + core infrastructure + core authentication (register, email verification, login, JWT, refresh-token rotation with family-reuse detection, sessions, password reset, password change). RBAC, MFA, OAuth, SAML, and multi-tenancy are intentionally not implemented yet — see the [roadmap](#roadmap).

## Quick start

```bash
git clone <this-repo> && cd enterprise-auth-platform
copy .env.example .env           # macOS/Linux: cp

docker compose up -d postgres redis
npm install
npm run db:generate
npm run db:migrate
npm run start:dev
```

URLs:

- API: <http://localhost:3000/api/v1>
- Swagger: <http://localhost:3000/api/docs>
- Health: <http://localhost:3000/health>

## Tech stack

| Concern         | Choice                                                          |
| --------------- | --------------------------------------------------------------- |
| Runtime         | Node.js 22 (LTS) + TypeScript 5 (strict)                        |
| Framework       | NestJS 11                                                       |
| Database        | PostgreSQL 16 via Prisma 6 (UUID v7 primary keys)               |
| Cache / KV      | Redis 7 via ioredis 5                                           |
| Queue           | BullMQ (Redis-backed)                                           |
| Mail            | Nodemailer 6 (queue-backed dispatch)                            |
| Logging         | Pino + nestjs-pino (JSON in prod, pretty in dev)                |
| Auth            | passport-jwt, bcrypt, refresh-token rotation with family detection |
| Rate limiting   | @nestjs/throttler (config-driven)                               |
| Validation      | class-validator, class-transformer, Joi (env)                   |
| API docs        | OpenAPI / Swagger at `/api/docs`                                |
| Quality         | ESLint 9 flat, Prettier 3, Husky 9, lint-staged, tsc-alias      |
| Infra           | Docker + docker-compose (app, postgres, redis)                  |

## Architecture at a glance

```
src/
├── common/          # Cross-cutting: filters, interceptors, middleware, decorators, guards, types
├── config/          # @nestjs/config + Joi validation per concern
├── infrastructure/  # Database, Redis, Cache, Queue, Mail, Logger
├── modules/
│   ├── audit/       # AuditService → audit BullMQ queue
│   ├── auth/        # Register, login, JWT, refresh rotation, sessions, password flows
│   └── health/      # GET /health (memory, env, services)
├── app.module.ts
└── main.ts
```

For deeper details, see [docs/architecture.md](docs/architecture.md).

## Documentation

| Doc                                              | What's inside                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)     | Layers, request lifecycle, response envelope, error model, AsyncLocalStorage, audit |
| [docs/configuration.md](docs/configuration.md)   | Every env var, default, validation rule                                             |
| [docs/auth.md](docs/auth.md)                     | Auth module: endpoints, password policy, JWT, refresh-token rotation, sessions      |
| [docs/infrastructure.md](docs/infrastructure.md) | Pino logger, cache abstraction, BullMQ queues, Nodemailer + templates, Prisma       |
| [docs/operations.md](docs/operations.md)         | Docker workflow, npm scripts, deployment, troubleshooting                           |

## Roadmap

- [ ] User profile + organization domain models
- [ ] RBAC (Role / Permission / policy engine)
- [ ] MFA (TOTP, recovery codes)
- [ ] OAuth2 / OIDC providers
- [ ] SAML SSO
- [ ] Multi-tenancy + tenant-scoped JWTs
- [ ] Audit persistence + admin dashboards
- [ ] OpenTelemetry tracing + metrics

## License

UNLICENSED — internal/private project.
