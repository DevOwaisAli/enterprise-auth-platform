# Authentication

Module: [src/modules/auth/](../src/modules/auth/).

## Endpoints

All under `/api/v1/auth/...`. JWT-protected routes require `Authorization: Bearer <accessToken>`.

| Method | Path                       | Auth   | Purpose                                           |
| ------ | -------------------------- | ------ | ------------------------------------------------- |
| POST   | `/auth/register`           | public | Create account, enqueue verification email        |
| POST   | `/auth/verify-email`       | public | Consume verification token, mark email verified   |
| POST   | `/auth/login`              | public | Email + password, returns access + refresh tokens |
| POST   | `/auth/refresh`            | public | Rotate refresh token, issue new access + refresh  |
| POST   | `/auth/logout`             | JWT    | Revoke current session                            |
| POST   | `/auth/logout-all`         | JWT    | Revoke every session for the user, bump tokenVersion |
| POST   | `/auth/change-password`    | JWT    | Verify current password, set new                  |
| POST   | `/auth/forgot-password`    | public | Issue reset token, enqueue email                  |
| POST   | `/auth/reset-password`     | public | Consume reset token, set new password             |
| GET    | `/auth/sessions`           | JWT    | List active sessions for the current user         |
| DELETE | `/auth/sessions/:id`       | JWT    | Revoke a specific session (or current)            |

Full OpenAPI: <http://localhost:3000/api/docs>.

## Data model

Prisma models in [prisma/schema.prisma](../prisma/schema.prisma):

```
User              ─┬─ id, email, passwordHash, firstName, lastName, status (enum),
                   │  isEmailVerified, tokenVersion, failedLoginAttempts, lockUntil,
                   │  lastLoginAt, createdAt, updatedAt, deletedAt
                   │
                   ├─ Session                ─┬─ id, userId, familyId, ip, ua, deviceName,
                   │                          │  lastActivityAt, expiresAt, revokedAt
                   │                          └─ has many RefreshToken
                   │
                   ├─ RefreshToken           ─── id, userId, sessionId, familyId,
                   │                              tokenHash (sha256), expiresAt, revokedAt,
                   │                              replacedByTokenId, reuseDetectedAt
                   │
                   ├─ EmailVerificationToken ─── id, userId, tokenHash, expiresAt, usedAt
                   ├─ PasswordResetToken     ─── id, userId, tokenHash, expiresAt, usedAt
                   └─ PasswordHistory        ─── id, userId, passwordHash, createdAt
```

All primary keys are UUID v7. All tables soft-delete-ready via `createdAt` / `updatedAt`.

`UserStatus` enum: `ACTIVE` (default) / `INACTIVE` / `SUSPENDED` / `LOCKED`.

## Password policy

Lives in [auth.config.ts](../src/config/auth.config.ts). Enforced by `PasswordService.enforcePolicy()` on every password-setting flow (register, change, reset). DTOs additionally enforce a hard floor of 8 characters and a ceiling of 128.

Defaults (overridable via env):

- length ≥ `PASSWORD_MIN_LENGTH` (default 12; configurable down to 8)
- at least one uppercase, one lowercase, one digit, one special character
- not equal to any of the last `PASSWORD_HISTORY_LIMIT` passwords (default 5)

Violations return `400 VALIDATION_FAILED` with one error entry per failed rule.

## JWT access tokens

- Signed by `TokenService.signAccessToken` (HS256 by default via `@nestjs/jwt`).
- Payload: `{ sub: userId, email, sessionId, tokenVersion, iat, exp, iss, aud }`.
- Verified on every protected request by `JwtStrategy.validate`, which additionally checks:
  - User exists, not soft-deleted, status `ACTIVE`.
  - `user.tokenVersion === payload.tokenVersion`. Mismatch → `401 TOKEN_VERSION_MISMATCH`.
  - Session exists, not revoked, not expired. Otherwise → `401 SESSION_REVOKED`.

### `tokenVersion` semantics

`tokenVersion` is a nuclear-option counter on the User row. Incrementing it invalidates **every** outstanding access token across all sessions.

It is bumped on:

| Trigger              | Why                                                           |
| -------------------- | ------------------------------------------------------------- |
| `logout-all`         | User explicitly destroys all sessions globally                |
| `reset-password`     | Anonymous reset via email — assume credentials are compromised |

It is **not** bumped on `change-password`. Self-service change of an authenticated user should leave their current session alive; other sessions are revoked via `revokeAllSessionsForUser(userId, exceptCurrent)` instead.

## Refresh-token rotation

Refresh tokens are **opaque random hex** (48 bytes → 96 hex chars), not JWTs. The DB stores only `SHA-256(rawToken)`; the raw token only exists in the response and on the client. There is no list of "valid" refresh tokens — the absence of a matching `tokenHash` is the invalid signal.

### Rotation flow

```
client → POST /auth/refresh { refreshToken: raw }
   │
   ▼
SessionService.rotateRefreshToken (single Prisma transaction):

  1. tokenHash = sha256(raw)
  2. existing = RefreshToken.findUnique({ tokenHash })
     ├─ not found              → 401 INVALID_REFRESH_TOKEN
     ├─ existing.revokedAt set → REUSE DETECTED
     │                            revoke every RefreshToken in family
     │                            revoke every Session in family
     │                            → 401 REFRESH_TOKEN_REUSE_DETECTED
     ├─ expired                → 401 INVALID_REFRESH_TOKEN
     └─ session.revokedAt set  → 401 SESSION_REVOKED
  3. issue new RefreshToken (same familyId, fresh tokenHash, expiresAt = session.expiresAt)
  4. mark existing.revokedAt = now, existing.replacedByTokenId = new.id
  5. update session.lastActivityAt, ip, ua
   │
   ▼
AuthService.refresh:
   re-fetch user (must be ACTIVE)
   sign new access token with current tokenVersion
   return { accessToken, refreshToken (new raw), accessExp, refreshExp }
```

### Family + reuse detection

Every Session has a unique `familyId`. Every RefreshToken belongs to that family. A successful rotation issues a new token *in the same family* and revokes the previous one.

If a refresh-token row is already revoked when presented again, that's a reuse attempt — either the attacker is replaying a stolen token, or the legitimate client is replaying a previous response after rotation. Either way, we cannot tell which is which, so we kill the entire family: every token + the session.

This is the OAuth 2.0 refresh-token-rotation pattern (RFC 6819 § 5.2.2.3 + IETF draft "OAuth 2.0 Security BCP" § 4.13).

## Sessions

```
POST  /auth/login        → creates Session + first RefreshToken
GET   /auth/sessions     → list active (non-revoked, non-expired) sessions
DELETE /auth/sessions/:id → revoke a specific session (or current)
POST  /auth/logout       → revoke current session
POST  /auth/logout-all   → revoke every session (+ bump tokenVersion)
```

Each session row carries `ipAddress`, `userAgent`, `deviceName`, `lastActivityAt`, `expiresAt`, `revokedAt`. The session list is suitable for a "logged-in devices" management UI. The `isCurrent` boolean on `SessionResponseDto` flags the requester's own session.

## Account lockout

Failed-login tracking lives on the User row:

- Each failed `login` (wrong password) → `failedLoginAttempts++`.
- When `failedLoginAttempts >= MAX_LOGIN_ATTEMPTS` → set `status = LOCKED` and `lockUntil = now + LOCK_DURATION_MS`.
- A successful login resets `failedLoginAttempts = 0` and clears `lockUntil`.
- Login attempts during lock return `423 ACCOUNT_LOCKED`.

The bcrypt compare is run *before* the lockout check, so timing-side-channel exposure is limited. Failed attempts are emitted as `AuditAction.LOGIN_FAILURE` audit events with the IP / UA / attempt count.

## Verification + reset tokens

Both classes of tokens behave identically:

- Generated as `crypto.randomBytes(32).toString('hex')` (64 hex chars).
- Stored as `SHA-256(rawToken)` in DB. Raw token only exists in the email link.
- Single-use: `usedAt` is stamped on first consumption.
- Time-bounded: `expiresAt` per `EMAIL_VERIFICATION_TOKEN_TTL_MS` / `PASSWORD_RESET_TOKEN_TTL_MS`.
- On reset request, any prior unused reset tokens for the user are pre-emptively marked used.

## Email enumeration protection

`POST /auth/forgot-password` returns the same `202 Accepted` whether or not the email belongs to a real account. The reset email only goes to actual accounts. This prevents attackers from learning which addresses have accounts on the platform.

## Emails

Emails are dispatched **asynchronously** via the `email` BullMQ queue, processed by `MailProcessor` (queue worker) in [src/infrastructure/mail/mail.processor.ts](../src/infrastructure/mail/mail.processor.ts).

| Mail job          | Sent on                          | Carries                                          |
| ----------------- | -------------------------------- | ------------------------------------------------ |
| `verify-email`    | `register`                       | One-time link `${APP_URL}/auth/verify-email?token=…` |
| `reset-password`  | `forgot-password` (if user exists) | One-time link `${APP_URL}/auth/reset-password?token=…` |
| `password-changed` | `change-password`, `reset-password` | Notification with IP / UA / timestamp           |

Templates live in [src/infrastructure/mail/templates/](../src/infrastructure/mail/templates/) — small inline HTML helpers with shared layout and explicit HTML escaping. No template engine.

See [infrastructure.md → Mail](infrastructure.md#mail) for the wiring details.

## Audit emissions

Auth services emit structured audit events on the `audit` queue:

| `AuditAction`                | Trigger                              |
| ---------------------------- | ------------------------------------ |
| `LOGIN_SUCCESS`              | login OK                             |
| `LOGIN_FAILURE`              | login wrong password / locked / inactive |
| `LOGOUT`                     | `logout` and `logout-all`            |
| `PASSWORD_CHANGED`           | `change-password`                    |
| `PASSWORD_RESET_REQUESTED`   | `forgot-password` for real account   |
| `PASSWORD_RESET_COMPLETED`   | `reset-password` success             |
| `TOKEN_ISSUED`               | register (verification token issued) |

Actor / IP / UA / correlationId come from `RequestContext`. Persistence to a Postgres audit log is intentionally deferred to a future phase.

## Error codes

Centralised in [src/modules/auth/constants/auth.constants.ts](../src/modules/auth/constants/auth.constants.ts):

```
INVALID_CREDENTIALS             — bad email/password OR user missing (no distinction)
ACCOUNT_LOCKED                  — lockUntil > now or status = LOCKED
ACCOUNT_INACTIVE                — status = INACTIVE / SUSPENDED
EMAIL_NOT_VERIFIED              — reserved for future use
EMAIL_ALREADY_REGISTERED        — register with existing email
WEAK_PASSWORD                   — policy violation (one error per failed rule)
PASSWORD_RECENTLY_USED          — matches one of the last N hashes
INVALID_REFRESH_TOKEN           — unknown / expired refresh token
REFRESH_TOKEN_REUSE_DETECTED    — replayed an already-rotated refresh token
SESSION_REVOKED                 — session revoked or expired
SESSION_NOT_FOUND               — DELETE /sessions/:id on non-existent session
INVALID_VERIFICATION_TOKEN      — bad/expired/used verification token
INVALID_RESET_TOKEN             — bad/expired/used reset token
TOKEN_VERSION_MISMATCH          — access-token tokenVersion ≠ user.tokenVersion
```

Each is returned in the unified error envelope under `message` (the human string) — currently the code itself is used as the message for some 401 errors so clients can map by code.

## End-to-end test flow

```bash
# 1. Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"u@example.com","password":"Hunter2-Long!","firstName":"U"}'

# 2. Read verify token from email inbox (MailHog at :8025 in dev), then:
curl -X POST http://localhost:3000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token":"<paste-from-email>"}'

# 3. Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"u@example.com","password":"Hunter2-Long!"}'
# → { tokens: { accessToken, refreshToken, ... }, sessionId }

# 4. Use access token
curl http://localhost:3000/api/v1/auth/sessions \
  -H "Authorization: Bearer <accessToken>"

# 5. Refresh
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<from step 3>"}'

# 6. Logout (current session)
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```
