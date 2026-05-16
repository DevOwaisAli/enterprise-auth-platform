# Configuration

All environment variables are validated with Joi at boot via [src/config/env.validation.ts](../src/config/env.validation.ts). Invalid env fails fast with a list of every violation.

See [.env.example](../.env.example) for the full template.

## Application

| Variable              | Default                  | Required | Notes                                                  |
| --------------------- | ------------------------ | -------- | ------------------------------------------------------ |
| `NODE_ENV`            | `development`            | no       | `development` / `test` / `staging` / `production`      |
| `PORT`                | `3000`                   | no       | TCP port the HTTP server binds to                      |
| `API_PREFIX`          | `api`                    | no       | URL prefix; combined with versioning → `/api/v1/...`   |
| `API_DEFAULT_VERSION` | `1`                      | no       | URI versioning default — `@Controller('users')` → v1   |
| `CORS_ORIGIN`         | `*`                      | no       | Comma-separated origins or `*`                         |
| `BODY_LIMIT`          | `10mb`                   | no       | Max request body size (JSON + urlencoded)              |
| `APP_URL`             | `http://localhost:3000`  | no       | Public base URL used to build email links              |

## Database (PostgreSQL)

| Variable               | Default                                                                | Required | Notes                                   |
| ---------------------- | ---------------------------------------------------------------------- | -------- | --------------------------------------- |
| `DATABASE_URL`         | —                                                                      | **yes**  | Must use `postgresql://` or `postgres://` |
| `DATABASE_LOG_QUERIES` | `false`                                                                | no       | Set `true` to log every SQL query (dev only) |

## Redis

| Variable         | Default     | Required | Notes                          |
| ---------------- | ----------- | -------- | ------------------------------ |
| `REDIS_HOST`     | `localhost` | no       |                                |
| `REDIS_PORT`     | `6379`      | no       |                                |
| `REDIS_PASSWORD` | empty       | no       | Empty string means no auth     |
| `REDIS_DB`       | `0`         | no       | Numeric database index         |

## JWT

| Variable                 | Default                              | Required | Notes                                                  |
| ------------------------ | ------------------------------------ | -------- | ------------------------------------------------------ |
| `JWT_ACCESS_SECRET`      | —                                    | **yes**  | Min 16 chars. **Use 256-bit hex / random.**            |
| `JWT_REFRESH_SECRET`     | —                                    | **yes**  | Reserved for future signed refresh tokens; required.   |
| `JWT_ACCESS_EXPIRES_IN`  | `15m`                                | no       | `ms`-style duration string                             |
| `JWT_REFRESH_EXPIRES_IN` | `7d`                                 | no       | Currently used as session TTL                          |
| `JWT_ISSUER`             | `enterprise-auth-platform`           | no       | Validated on every request                             |
| `JWT_AUDIENCE`           | `enterprise-auth-platform-clients`   | no       | Validated on every request                             |

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Authentication & password policy

| Variable                          | Default     | Required | Notes                                                |
| --------------------------------- | ----------- | -------- | ---------------------------------------------------- |
| `BCRYPT_SALT_ROUNDS`              | `12`        | no       | 4–20. Higher = slower hashing.                       |
| `PASSWORD_MIN_LENGTH`             | `12`        | no       | Hard floor of `8` enforced by DTOs.                  |
| `PASSWORD_REQUIRE_UPPERCASE`      | `true`      | no       |                                                      |
| `PASSWORD_REQUIRE_LOWERCASE`      | `true`      | no       |                                                      |
| `PASSWORD_REQUIRE_NUMBER`         | `true`      | no       |                                                      |
| `PASSWORD_REQUIRE_SPECIAL`        | `true`      | no       | Special chars: ``!@#$%^&*()_-+=[]{};:'",.<>/?\|`~``  |
| `PASSWORD_HISTORY_LIMIT`          | `5`         | no       | Reject any of the last N passwords. `0` disables.    |
| `MAX_LOGIN_ATTEMPTS`              | `5`         | no       | Failed attempts before lockout                        |
| `LOCK_DURATION_MS`                | `900000`    | no       | Lock duration (15 min). `0` means lock forever.       |
| `EMAIL_VERIFICATION_TOKEN_TTL_MS` | `86400000`  | no       | 24 h                                                  |
| `PASSWORD_RESET_TOKEN_TTL_MS`     | `3600000`   | no       | 1 h                                                   |
| `SESSION_TTL_MS`                  | `604800000` | no       | 7 d — also bounds refresh-token lifetime              |

## Mail (SMTP)

| Variable         | Default                          | Required | Notes                                                          |
| ---------------- | -------------------------------- | -------- | -------------------------------------------------------------- |
| `MAIL_HOST`      | `localhost`                      | no       | SMTP host                                                      |
| `MAIL_PORT`      | `587`                            | no       | Use `465` for implicit TLS, `587` for STARTTLS                 |
| `MAIL_SECURE`    | `false`                          | no       | `true` for port 465 implicit TLS                               |
| `MAIL_USER`      | empty                            | no       | SMTP auth user                                                 |
| `MAIL_PASSWORD`  | empty                            | no       | SMTP auth password / app password                              |
| `MAIL_FROM`      | `no-reply@example.com`           | no       | Must match the authenticated user for many providers (Gmail)   |
| `MAIL_FROM_NAME` | `Enterprise Auth Platform`       | no       | Display name in the From header                                |

## Queue (BullMQ)

| Variable                   | Default | Required | Notes                                                |
| -------------------------- | ------- | -------- | ---------------------------------------------------- |
| `QUEUE_PREFIX`             | `eap`   | no       | Redis key namespace for all queues                   |
| `QUEUE_DEFAULT_ATTEMPTS`   | `3`     | no       | Default retry count per job                          |
| `QUEUE_DEFAULT_BACKOFF_MS` | `5000`  | no       | Exponential backoff base in ms                       |

## Throttling / rate limit

| Variable          | Default | Required | Notes                                                  |
| ----------------- | ------- | -------- | ------------------------------------------------------ |
| `THROTTLE_TTL_MS` | `60000` | no       | Rolling window in ms                                   |
| `THROTTLE_LIMIT`  | `100`   | no       | Max requests per IP per window. Applies to all routes. |

## Swagger / OpenAPI

| Variable              | Default                                          | Required | Notes                                       |
| --------------------- | ------------------------------------------------ | -------- | ------------------------------------------- |
| `SWAGGER_ENABLED`     | `true`                                           | no       | Set `false` in production if undesired      |
| `SWAGGER_PATH`        | `api/docs`                                       | no       | UI path                                     |
| `SWAGGER_TITLE`       | `Enterprise Auth Platform API`                   | no       |                                             |
| `SWAGGER_DESCRIPTION` | `Enterprise authentication and authorization API` | no       |                                             |
| `SWAGGER_VERSION`     | `0.3.0`                                          | no       | Bump in concert with `package.json` version |

## Logger

| Variable     | Default | Required | Notes                                                                |
| ------------ | ------- | -------- | -------------------------------------------------------------------- |
| `LOG_LEVEL`  | `debug` | no       | `fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent`   |
| `LOG_PRETTY` | `true`  | no       | Pretty-print in dev. Forced off in production (JSON only).           |

## Accessing config in code

```ts
import { ConfigService } from '@nestjs/config';
import { type AuthConfig, AUTH_CONFIG_KEY } from '@config/auth.config';

constructor(configService: ConfigService) {
  const auth = configService.getOrThrow<AuthConfig>(AUTH_CONFIG_KEY);
  // auth.bcryptSaltRounds, auth.passwordPolicy.minLength, etc.
}
```

Each config module is registered with `registerAs` and exposes a typed namespace. The full list:

| Key            | Symbol               | File                                                      |
| -------------- | -------------------- | --------------------------------------------------------- |
| `app`          | `APP_CONFIG_KEY`     | [app.config.ts](../src/config/app.config.ts)              |
| `auth`         | `AUTH_CONFIG_KEY`    | [auth.config.ts](../src/config/auth.config.ts)            |
| `database`     | `DATABASE_CONFIG_KEY`| [database.config.ts](../src/config/database.config.ts)    |
| `jwt`          | `JWT_CONFIG_KEY`     | [jwt.config.ts](../src/config/jwt.config.ts)              |
| `mail`         | `MAIL_CONFIG_KEY`    | [mail.config.ts](../src/config/mail.config.ts)            |
| `queue`        | `QUEUE_CONFIG_KEY`   | [queue.config.ts](../src/config/queue.config.ts)          |
| `redis`        | `REDIS_CONFIG_KEY`   | [redis.config.ts](../src/config/redis.config.ts)          |
| `swagger`      | `SWAGGER_CONFIG_KEY` | [swagger.config.ts](../src/config/swagger.config.ts)      |
| `throttle`     | `THROTTLE_CONFIG_KEY`| [throttle.config.ts](../src/config/throttle.config.ts)    |
