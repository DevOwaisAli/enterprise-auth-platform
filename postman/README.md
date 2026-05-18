# Postman — enterprise-auth-platform

Postman collection + environment + automated test suite for the local API.

| File | Purpose |
| ---- | ------- |
| [enterprise-auth-platform.postman_collection.json](enterprise-auth-platform.postman_collection.json) | All endpoints, grouped into folders, with auto-binding test scripts. |
| [enterprise-auth-platform.local.postman_environment.json](enterprise-auth-platform.local.postman_environment.json) | Default values for `baseUrl`, plus empty placeholders the test scripts populate at runtime. |
| README.md | This file. |

## Import

In Postman:

1. **Import** → drop both JSON files (or use *File → Import*).
2. Top-right environment switcher → **enterprise-auth-platform — local**.
3. Make sure the API is reachable at `http://localhost:3000` (see [docs/operations.md](../docs/operations.md) for Docker / Workflow B).

Or with the Postman CLI:

```bash
postman collection import postman/enterprise-auth-platform.postman_collection.json
postman environment import postman/enterprise-auth-platform.local.postman_environment.json
```

## Recommended execution order

The collection is grouped into folders, but for a full end-to-end run, follow this order — each step writes the environment variables the next step needs:

1. **Health → GET /health** — sanity check.
2. **Auth → POST /auth/register** — generates a fresh `email`, saves `userId`.
3. **Auth → POST /auth/verify-email** — paste the raw token from the verification email (or read it from the dev mail-job payload) into the `emailVerificationToken` env var first.
4. **Auth → POST /auth/login** — saves `accessToken`, `refreshToken`, `sessionId`. Every protected request from here on uses these automatically.
5. **Organizations → POST /organizations** — saves `organizationId`. Caller becomes the first admin.
6. **Auth → POST /auth/switch-organization** — re-mints `accessToken` bound to that org's membership.
7. **Members → GET /organizations/:orgId/members** — saves `membershipId` for the current user.
8. **RBAC Permissions → GET /permissions** — saves a sample `permissionId` (the `users:read` permission, seeded by `npm run db:seed`).
9. **RBAC Roles → POST /organizations/:orgId/roles** — saves `roleId`.
10. **RBAC Roles → PUT /organizations/:orgId/roles/:id/permissions** — attach the saved permission to the new role.
11. **RBAC Roles → POST /organizations/:orgId/roles/:id/members/:membershipId** — assign the role.
12. **ABAC Policies → POST /policies** — saves `policyId`.
13. **ABAC Conditions → POST /policies/:id/conditions** — saves `conditionId`.
14. **ABAC Assignments → POST /policies/:id/assignments** — saves `assignmentId`.
15. **Authorization Tests** — run the whole folder; passes/failures map directly to RBAC + ABAC behaviour.
16. **Auth → POST /auth/refresh** — rotates the token pair. Old refresh token is now single-use; replaying it triggers reuse detection (see Negative Tests).
17. **Auth → POST /auth/logout** — revokes the current session.

## How token auto-binding works

The collection-level **pre-request script** sets a fresh `X-Correlation-ID` on every call and seeds `email` / `password` if missing. The collection uses bearer auth with `{{accessToken}}` at the root, so every request inherits it unless explicitly overridden to `noauth` (e.g. register/login/refresh/forgot-password/reset-password/verify-email/health).

The collection-level **test script** verifies the unified API envelope (`success`, `timestamp`) on JSON responses.

Per-request **test scripts** persist key fields:

| Request                          | Variables written |
| -------------------------------- | ----------------- |
| `POST /auth/register`            | `userId`          |
| `POST /auth/login`               | `accessToken`, `refreshToken`, `userId`, `sessionId` |
| `POST /auth/refresh`             | `accessToken`, `refreshToken` |
| `POST /auth/switch-organization` | `accessToken`, `organizationId` |
| `POST /organizations`            | `organizationId`  |
| `GET /organizations/:orgId/members` | `membershipId` (current user's) |
| `POST /organizations/:orgId/invitations` | `invitationId` |
| `POST /organizations/:orgId/roles` | `roleId`        |
| `POST /permissions`              | `permissionId`    |
| `GET /permissions`               | `permissionId` (binds to seeded `users:read`) |
| `POST /policies`                 | `policyId`        |
| `POST /policies/:id/conditions`  | `conditionId`     |
| `POST /policies/:id/assignments` | `assignmentId`    |

Once `accessToken` is set, you don't have to touch the **Authorization** tab on individual requests — bearer auth resolves it from the active environment.

## Correlation IDs

Every request gets a unique `X-Correlation-ID` header (UUID v4 or v7). The server echoes it on both the response body (`data.correlationId` or top-level `correlationId`) and the `X-Correlation-ID` response header. To trace a single request in the logs, copy the value and grep `docker compose logs app | grep <uuid>`.

## Running the suite with Newman

CLI execution for CI or local repeat runs:

```bash
npx newman run postman/enterprise-auth-platform.postman_collection.json \
  -e postman/enterprise-auth-platform.local.postman_environment.json \
  --reporters cli,json \
  --reporter-json-export newman-report.json
```

Skip folders that need manual setup (verify-email, accept-invitation) by passing `--folder`:

```bash
# Smoke-test just Auth + Organizations
npx newman run postman/enterprise-auth-platform.postman_collection.json \
  -e postman/enterprise-auth-platform.local.postman_environment.json \
  --folder "Auth" --folder "Organizations"
```

To export the populated environment after a run (handy when chaining runs):

```bash
npx newman run ... --export-environment ./newman-env.json
```

CI tip: a fresh database + `npm run db:seed` + `npm run start:dev` in the background is the cleanest pre-condition.

## Test conventions

Each request includes baseline tests:

- Status code is the expected success / error code for the verb.
- Response is JSON (where applicable) and matches the unified envelope.
- Where a follow-up step needs an id/token, it's persisted to the environment.

Negative tests assert the **exact** status code documented in [docs/auth.md](../docs/auth.md) and [docs/authorization.md](../docs/authorization.md):

| Status | When |
| ------ | ---- |
| 400    | DTO validation failure |
| 401    | Missing/invalid JWT, wrong password, refresh-token reuse |
| 403    | Tenant mismatch, permission/policy denial, suspended membership |
| 404    | Resource not found |
| 409    | Slug conflict, duplicate email, last-admin removal |
| 423    | Account locked (too many failed logins) |

## Future-resource tests

Several Authorization Tests reference resources that aren't shipped yet — they're stubs that will start passing as the matching modules land. The assertion in each tolerates the 404 today.

| Request | Will work once... |
| ------- | ----------------- |
| `ABAC ownership — edit own profile` | a `PATCH /users/:id` endpoint ships and registers a `user` resource loader (already registered as a default loader, just no controller). |
| `ABAC department-based — manager reads same-department user` | same — needs a `users` resource controller. |
| `ABAC Enterprise-plan-required-for-sso` | SSO module ships (`/sso/...` routes). |

The underlying policies (`edit-own-profile`, `manager-can-access-department-users`, `enterprise-plan-required-for-sso`) are already seeded by `npm run db:seed`, so the engine side is fully testable in isolation via the unit tests under [src/modules/authorization/services/](../src/modules/authorization/services/).

## Pre-flight checklist

Before running anything:

- [ ] `docker compose up -d postgres redis` (or your own Postgres/Redis reachable on `localhost:5432` / `localhost:6379`).
- [ ] `npm run db:migrate` — schema is up to date.
- [ ] `npm run db:seed` — system roles, permissions, and default ABAC policies exist.
- [ ] `npm run start:dev` — app reachable at `http://localhost:3000`.
- [ ] Environment **enterprise-auth-platform — local** selected in Postman.

## Security notes

- All secret-type variables (`accessToken`, `refreshToken`, `invitationToken`, `passwordResetToken`, `emailVerificationToken`) are flagged with `type: secret` in the environment — Postman masks them in the UI and excludes them from shared exports by default.
- The environment ships with empty values; nothing sensitive is committed.
- `password` defaults to `StrongPass123!` for local dev only. Change it before pointing the collection at a non-local environment.
- This collection is for the **local** environment. Do not point it at staging or production without changing `baseUrl` and removing any populated tokens.
