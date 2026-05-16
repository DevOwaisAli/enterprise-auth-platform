# Operations

Local development, Docker, scripts, deployment, and troubleshooting.

## Local development — two workflows

Pick one. **Do not run both** (port conflict on 3000).

### Workflow A — Everything in Docker

Zero host setup beyond Docker Desktop.

```bash
copy .env.example .env       # Windows;  cp on macOS/Linux
npm run docker:up:build
npm run docker:logs
```

The app container runs `npm run start:dev` internally — code changes auto-reload via mounted volumes. Slower file-watch on Windows.

### Workflow B — App on host, dependencies in Docker (recommended for active development)

```bash
copy .env.example .env
docker compose up -d postgres redis
npm install
npm run db:generate
npm run db:migrate
npm run start:dev
```

Native file-watch speed, easy debugger attach with `npm run start:debug`.

URLs (either workflow):

- API: <http://localhost:3000/api/v1>
- Swagger: <http://localhost:3000/api/docs>
- Health: <http://localhost:3000/health>
- MailHog (if you run it): <http://localhost:8025>

## Docker reference

| Command                          | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `npm run docker:up`              | Bring up all services in the background          |
| `npm run docker:up:build`        | Same, but rebuild the app image first            |
| `npm run docker:logs`            | Tail logs from all services                      |
| `npm run docker:down`            | Stop and remove containers (volumes survive)     |
| `docker compose down -v`         | Stop **and** wipe Postgres / Redis data          |
| `docker compose ps`              | Show container status + health                   |
| `docker compose stop app`        | Stop just the app, keep deps (for Workflow B)    |

Persistent state lives in named volumes `postgres-data` and `redis-data`.

## npm scripts

### Dev / build / run

| Script           | What it does                                |
| ---------------- | ------------------------------------------- |
| `start:dev`      | `nest start --watch` — hot-reload dev       |
| `start:debug`    | `--debug --watch` — opens `:9229` inspector |
| `start`          | One-off run (no watch)                      |
| `start:prod`     | `node dist/main` — production launcher      |
| `build`          | `nest build && tsc-alias`                   |

### Quality gates

| Script           | What it does                                |
| ---------------- | ------------------------------------------- |
| `lint`           | ESLint check                                |
| `lint:fix`       | ESLint with `--fix`                         |
| `format`         | Prettier `--write` on `src/` + `test/`      |
| `format:check`   | Prettier `--check`                          |
| `type-check`     | `tsc --noEmit`                              |

### Tests

| Script           | What it does                                |
| ---------------- | ------------------------------------------- |
| `test`           | All unit specs                              |
| `test:watch`     | Re-run on save                              |
| `test:cov`       | Coverage report → `coverage/`               |
| `test:e2e`       | End-to-end Jest suite                       |

### Database / Prisma

| Script                       | When                                                   |
| ---------------------------- | ------------------------------------------------------ |
| `db:generate`                | After changing `schema.prisma`                         |
| `db:migrate`                 | Create + apply a new dev migration                     |
| `db:migrate:deploy`          | Apply existing migrations (production)                 |
| `db:reset`                   | Drop, re-migrate, re-seed. Local-only "fresh start"    |
| `db:studio`                  | Open Prisma Studio at `localhost:5555`                 |

## Quality gates and pre-commit

Husky runs on every commit (after `npm install`):

```
pre-commit:
  npm run type-check        # tsc --noEmit
  npx lint-staged           # eslint --fix + prettier --write on staged *.ts
```

The hook cannot be bypassed without `--no-verify`. If it blocks you:

```bash
npm run type-check   # see TS errors
npm run lint         # see lint errors
```

Fix, re-stage, commit again.

## Deployment

This codebase is a long-running Node HTTP server. Suitable targets:

| Platform | Notes                                                                                      |
| -------- | ------------------------------------------------------------------------------------------ |
| Railway  | Native Node, addon Postgres + Redis, one-click GitHub deploys                              |
| Render   | Same shape, generous free tier, native Postgres                                            |
| Fly.io   | Container-based — uses your existing `Dockerfile` production stage as-is                   |
| AWS ECS  | Build `Dockerfile` → push to ECR → deploy via ECS service / task                           |
| K8s      | Use the `production` stage. Set readiness probe to `GET /health` checking `data.status==="up"` |

**Not suitable**: Vercel and other serverless function platforms. NestJS expects a persistent process, persistent DB connections, and supports WebSockets / scheduled jobs / graceful shutdown — none of which fit a 10-second function model. See the earlier discussion in the project history.

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] `LOG_PRETTY=false` (forced internally, but be explicit)
- [ ] `SWAGGER_ENABLED=false` if you don't want public API docs
- [ ] Strong JWT secrets — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Real SMTP credentials, `MAIL_FROM` matching the authenticated sender or with verified send-as
- [ ] `APP_URL` set to your public URL (used in email links)
- [ ] `CORS_ORIGIN` restricted to your frontend origin(s), not `*`
- [ ] Redis password set (`REDIS_PASSWORD`) and/or Redis in a private network
- [ ] Postgres connection over TLS
- [ ] `npm run db:migrate:deploy` runs as part of release, before traffic
- [ ] Health probe wired to `GET /health` with `data.status === "up"` matcher

## Troubleshooting

### `EADDRINUSE: address already in use :::3000`

Another process owns port 3000. Usually a Docker app container is still running while you tried `npm run start:dev`, or a previous Node process was orphaned by Ctrl+C without confirming `Y` on the "Terminate batch job" prompt.

```bash
npx kill-port 3000
# or
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

On Windows `cmd.exe`, after Ctrl+C answer `Y` + Enter to actually kill the child Node process. PowerShell handles this cleaner.

### `P1001: Can't reach database server`

Postgres isn't running or `DATABASE_URL` doesn't match. Verify:

```bash
docker compose ps                  # is eap-postgres healthy?
netstat -ano | findstr :5432
```

If you're using a local Postgres (pgAdmin-managed) and the Docker container is also running, both fight over 5432 — stop one.

### `Redis error (localhost:6379): ECONNREFUSED`

Redis isn't running. The app still boots; `/health` reports `redis: "down"`.

```bash
docker compose up -d redis
```

### `Mail transporter verify failed: getaddrinfo ENOTFOUND smtp.example.com`

`.env` `MAIL_HOST` placeholder still set. Either configure real SMTP, run MailHog locally, or leave it — mail will fail to send but the rest of the app works fine.

```bash
docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
# then in .env
MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_SECURE=false
```

### `LegacyRouteConverter: Unsupported route path: "/api/*"`

Cosmetic. NestJS 11's path-to-regexp v8 wants named wildcards; the framework auto-converts and logs the warning. Behavior is correct — ignore.

### `TOKEN_VERSION_MISMATCH` on a "fresh" access token

You're using an access token that pre-dates a `logout-all` or `reset-password`. Both bump `tokenVersion`, invalidating every prior access token. Refresh to get a new one, or re-login. `change-password` does **not** bump `tokenVersion` — the current session stays valid after a self-service password change.

### Pre-commit hook fails

Run the same commands manually:

```bash
npm run type-check
npm run lint
```

Fix, re-stage, commit. To temporarily bypass (not recommended): `git commit --no-verify`.

### Swagger page blank / 5xx

App likely failed during startup. Tail logs:

```bash
docker compose logs app | findstr ERROR     # Windows
docker compose logs app | grep ERROR        # Unix
```

Common causes: missing required env (Joi will print every missing key in red), DB unreachable, port conflict.

### Email enumeration paranoia

`/auth/forgot-password` always returns `202 Accepted` with the same body whether the email exists or not. This is intentional — see [auth.md → Email enumeration protection](auth.md#email-enumeration-protection). Real accounts get the email; unknown emails get nothing.
