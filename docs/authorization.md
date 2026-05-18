# Authorization — RBAC + ABAC

The platform ships a hybrid authorization model. RBAC handles role/permission grants. ABAC layers dynamic, attribute-driven rules on top. DENY policies always win.

## Quick mental model

```
Request hits guard
   │
   ▼
JwtAuthGuard          — verify JWT, load user, validate session/membership/versions
   │
   ▼
TenantGuard           — block cross-tenant param access
   │
   ▼
AuthorizationGuard    — RBAC (permissions) → ABAC (policies + conditions) → ownership
   │
   ▼
DENY > ALLOW > implicit deny
```

## JWT payload

```jsonc
{
  "sub": "user-id",
  "email": "...",
  "sessionId": "...",
  "tokenVersion": 0,
  "organizationId": "org-id",     // null if user has no active org
  "membershipId": "mem-id",       // null if user has no active org
  "roles": ["admin"],
  "permissionsVersion": 1,
  "attributesVersion": 1
}
```

- `tokenVersion` — bumped by `logout-all` and `reset-password`. Invalidates every access token globally.
- `permissionsVersion` — per-membership. Bumped when roles or role-permissions change.
- `attributesVersion` — per-membership. Bumped when membership attributes change (department / region / clearance / status).

Any version mismatch ⇒ 401 with `PERMISSIONS_VERSION_MISMATCH` / `ATTRIBUTES_VERSION_MISMATCH`. Refresh to mint a token with current versions.

## Switching active organization

```
POST /api/v1/auth/switch-organization   { organizationId }
→ { accessToken, expiresAt, organizationId }
```

Mints a new access token bound to that org's membership. Refresh token is unchanged — the next refresh uses the user's first active membership unless a switch happened. The refresh token itself is not org-scoped.

## RBAC

Models:

| Model            | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `Permission`     | `resource:action` pair (e.g. `users:read`). Global.      |
| `Role`           | A bundle of permissions. Global system or org-scoped.    |
| `RolePermission` | Many-to-many between roles and permissions.              |
| `UserRole`       | Assignment of a role to a `Membership` (user-in-org).    |

System roles seeded by `npm run db:seed`:

| Slug          | Permissions                                                  |
| ------------- | ------------------------------------------------------------ |
| `super-admin` | All permissions (global)                                     |
| `admin`       | All permissions (org)                                        |
| `manager`     | users / members / invitations / audit                        |
| `user`        | `users:read`                                                 |

## ABAC

Models:

| Model              | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `Policy`           | Rule with effect (ALLOW/DENY), resource, action  |
| `PolicyCondition`  | Attribute path + operator + value                |
| `PolicyAssignment` | Bind policy to role / user / organization        |

Attribute sources: `USER`, `MEMBERSHIP`, `RESOURCE`, `ORGANIZATION`, `REQUEST`, `ENVIRONMENT`.

Operators: `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `EXISTS`, `REGEX_MATCH`.

Value types: `STRING`, `NUMBER`, `BOOLEAN`, `ARRAY`, `DATE`, `JSON`.

### Cross-source comparisons

A string value of the form `SOURCE.path` is resolved against the live context, not the literal:

```jsonc
{ "attributeSource": "RESOURCE", "attributePath": "ownerId",
  "operator": "EQUALS", "value": "USER.id" }
```

Reads `RESOURCE.ownerId` and compares to `USER.id`. This is how `edit-own-profile`, `same-organization-access`, and `manager-can-access-department-users` are defined.

### Evaluation

1. Filter policies that match `resource` + `action` (`*` wildcards allowed).
2. Drop disabled policies.
3. Sort by `priority` desc.
4. For each, evaluate all conditions — **all must pass** (AND).
5. First matching DENY → deny everything.
6. Any matching ALLOW (without a DENY) → grant.
7. Otherwise → deny with `reason: "No matching ALLOW policy"`.

RBAC and ABAC are combined: a permitted RBAC permission is granted **unless a DENY policy matches**.

### Default policies (system, seeded)

| Slug                                       | Effect | Resource:Action | Conditions                                      |
| ------------------------------------------ | ------ | --------------- | ----------------------------------------------- |
| `edit-own-profile`                         | ALLOW  | users:update    | `RESOURCE.id == USER.id`                        |
| `same-organization-access`                 | ALLOW  | *:*             | `RESOURCE.organizationId == ORGANIZATION.id`    |
| `manager-can-access-department-users`      | ALLOW  | users:read      | `RESOURCE.department == MEMBERSHIP.department`  |
| `admin-can-access-all-org-resources`       | ALLOW  | *:*             | `MEMBERSHIP.roles CONTAINS "admin"`             |
| `deny-suspended-members`                   | DENY   | *:*             | `MEMBERSHIP.status == "SUSPENDED"`              |
| `enterprise-plan-required-for-sso`         | ALLOW  | sso:manage      | `ORGANIZATION.plan == "ENTERPRISE"`             |

## Decorators

```ts
@RequirePermission('users', 'read')
@RequirePolicy('edit-own-resource')
@RequireAttributes({
  source: 'RESOURCE',
  path: 'ownerId',
  operator: 'EQUALS',
  compareWith: 'USER.id',
})
@RequireOwnership('document')                 // checks RESOURCE.ownerId == USER.id
@Authorization({                              // combine modes
  permissions: ['users:read'],
  policies: ['same-department-access'],
  mode: 'ALL',
})
@Resource('document')                         // tells loader registry which type to fetch
```

Apply the unified guard once on the handler/class:

```ts
@UseGuards(JwtAuthGuard, TenantGuard, AuthorizationGuard)
@RequirePermission('users', 'read')
@Resource('user', 'id')
async findOne(@Param('id') id: string) { ... }
```

## Resource loaders

`AuthorizationGuard` needs the resource's attributes (ownerId, organizationId, department, region, sensitivityLevel) to feed `RESOURCE.*` conditions.

```ts
interface ResourceLoader {
  resourceType: string;
  load(id, ctx): Promise<Record<string, unknown> | null>;
}
```

Default loaders are registered for `user`, `organization`, `membership`, `policy`. Add your own by injecting `ResourceLoaderRegistry` and calling `.register(...)` during `OnModuleInit`.

Loaders are responsible for **tenant scoping** — never return a record that doesn't belong to the caller's organization.

## Caching

Per-membership cache, 5 min TTL:

| Key                                          | Contents             |
| -------------------------------------------- | -------------------- |
| `permissions:user:{userId}:org:{orgId}`      | `ResolvedPermission[]` |
| `policies:user:{userId}:org:{orgId}`         | (resolved at evaluation, not separately cached) |
| `attributes:user:{userId}:org:{orgId}`       | `ResolvedAttributes` |

Invalidated automatically on:

- Role assigned/revoked
- Role permissions changed
- Policy created/updated/deleted
- Policy assignment created/removed
- Membership attributes updated

Cache misses are graceful — Redis outage logs a warning and the resolver hits the DB.

## Tenant isolation

`TenantGuard` blocks cross-tenant access at the route level when an `:orgId` / `:organizationId` param is present and doesn't match the JWT's `organizationId`.

ABAC reinforces this — `same-organization-access` denies any `RESOURCE.organizationId` mismatch by default.

Resource loaders MUST scope queries by `ctx.organizationId`.

## Endpoints

| Method | Path                                                | Purpose                                  |
| ------ | --------------------------------------------------- | ---------------------------------------- |
| POST   | `/organizations`                                    | Create org (creator becomes admin)       |
| GET    | `/organizations`                                    | List orgs current user belongs to        |
| GET    | `/organizations/:id`                                | Fetch org                                |
| PATCH  | `/organizations/:id`                                | Update name / plan / status / settings   |
| DELETE | `/organizations/:id`                                | Soft-delete org                          |
| GET    | `/organizations/:orgId/members`                     | List members                             |
| PATCH  | `/organizations/:orgId/members/:userId`             | Update member attributes / status        |
| DELETE | `/organizations/:orgId/members/:userId`             | Remove member (blocks last admin)        |
| POST   | `/organizations/:orgId/invitations`                 | Send invite (email queued)               |
| GET    | `/organizations/:orgId/invitations`                 | List invitations                         |
| DELETE | `/organizations/:orgId/invitations/:id`             | Revoke invite                            |
| POST   | `/organizations/invitations/accept`                 | Accept invite (auth required)            |
| POST   | `/organizations/:orgId/roles`                       | Create custom role                       |
| GET    | `/organizations/:orgId/roles`                       | List roles (org + global system)         |
| PATCH  | `/organizations/:orgId/roles/:id`                   | Update custom role                       |
| PUT    | `/organizations/:orgId/roles/:id/permissions`       | Replace role permissions                 |
| DELETE | `/organizations/:orgId/roles/:id`                   | Soft-delete role                         |
| POST   | `/organizations/:orgId/roles/:id/members/:mId`      | Assign role to membership                |
| DELETE | `/organizations/:orgId/roles/:id/members/:mId`      | Revoke role                              |
| POST   | `/permissions`                                      | Register a new permission                |
| GET    | `/permissions`                                      | List permissions                         |
| DELETE | `/permissions/:id`                                  | Delete (only if unused)                  |
| POST   | `/policies`                                         | Create policy                            |
| GET    | `/policies`                                         | List policies visible to active org      |
| GET    | `/policies/:id`                                     | Fetch policy with conditions             |
| PATCH  | `/policies/:id`                                     | Update policy                            |
| DELETE | `/policies/:id`                                     | Soft-delete                              |
| POST   | `/policies/:id/conditions`                          | Add condition                            |
| PATCH  | `/policies/:id/conditions/:cId`                     | Update condition                         |
| DELETE | `/policies/:id/conditions/:cId`                     | Remove condition                         |
| POST   | `/policies/:id/assignments`                         | Assign to role/user/organization         |
| DELETE | `/policies/:id/assignments/:aId`                    | Unassign                                 |
| POST   | `/auth/switch-organization`                         | Mint access token bound to a new org     |

All routes require `Authorization: Bearer <jwt>` except `/auth/*` public ones. Org-scoped routes also enforce `TenantGuard` + `AuthorizationGuard`.

## Debug mode

In development, denied decisions include `matchedPolicies` and `failedConditions` so you can see which condition tripped. In production these are stripped — clients get `Access denied` only.

Set `NODE_ENV=development` to see full diagnostics.

## Seeding

```bash
npm run db:seed
```

Idempotent — re-run any time. Upserts permissions, system roles, and default ABAC policies. System rows have `isSystem: true` and cannot be modified through the API.
