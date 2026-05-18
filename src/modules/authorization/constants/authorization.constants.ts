export const AUTHZ_METADATA_KEYS = {
  PERMISSIONS: 'authz:permissions',
  POLICIES: 'authz:policies',
  ATTRIBUTES: 'authz:attributes',
  AUTHORIZATION: 'authz:authorization',
  RESOURCE: 'authz:resource',
  OWNERSHIP: 'authz:ownership',
} as const;

export const AUTHZ_ERROR_CODES = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  POLICY_DENIED: 'POLICY_DENIED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  RESOURCE_NOT_LOADED: 'RESOURCE_NOT_LOADED',
  OWNERSHIP_DENIED: 'OWNERSHIP_DENIED',
  MISSING_ORGANIZATION_CONTEXT: 'MISSING_ORGANIZATION_CONTEXT',
  POLICY_NOT_FOUND: 'POLICY_NOT_FOUND',
  POLICY_VALIDATION_FAILED: 'POLICY_VALIDATION_FAILED',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_SLUG_TAKEN: 'ROLE_SLUG_TAKEN',
  PERMISSION_NOT_FOUND: 'PERMISSION_NOT_FOUND',
} as const;

export const AUTHZ_CACHE_TTL_SECONDS = 300;

export const DEFAULT_PERMISSIONS = [
  { resource: 'users', action: 'read', description: 'Read users in the organization' },
  { resource: 'users', action: 'create', description: 'Create users in the organization' },
  { resource: 'users', action: 'update', description: 'Update users in the organization' },
  { resource: 'users', action: 'delete', description: 'Delete users in the organization' },
  { resource: 'roles', action: 'manage', description: 'Manage roles and assignments' },
  { resource: 'permissions', action: 'manage', description: 'Manage permissions' },
  { resource: 'organizations', action: 'manage', description: 'Manage organization settings' },
  { resource: 'members', action: 'read', description: 'View organization members' },
  { resource: 'members', action: 'manage', description: 'Manage organization members' },
  { resource: 'invitations', action: 'manage', description: 'Manage organization invitations' },
  { resource: 'policies', action: 'manage', description: 'Manage ABAC policies' },
  { resource: 'audit', action: 'read', description: 'Read audit logs' },
] as const;

export const SYSTEM_ROLE_DEFAULTS = {
  'super-admin': {
    name: 'Super Admin',
    description: 'Cross-organization administrator (global)',
    permissionPredicate: () => true,
  },
  admin: {
    name: 'Admin',
    description: 'Organization administrator',
    permissionPredicate: () => true,
  },
  manager: {
    name: 'Manager',
    description: 'Department / team manager',
    permissionPredicate: (resource: string) =>
      ['users', 'members', 'invitations', 'audit'].includes(resource),
  },
  user: {
    name: 'User',
    description: 'Standard organization user',
    permissionPredicate: (resource: string, action: string) =>
      resource === 'users' && action === 'read',
  },
} as const;
