export enum AuditAction {
  LOGIN_SUCCESS = 'login.success',
  LOGIN_FAILURE = 'login.failure',
  LOGOUT = 'logout',
  PASSWORD_CHANGED = 'password.changed',
  PASSWORD_RESET_REQUESTED = 'password.reset_requested',
  PASSWORD_RESET_COMPLETED = 'password.reset_completed',
  MFA_ENABLED = 'mfa.enabled',
  MFA_DISABLED = 'mfa.disabled',
  MFA_CHALLENGED = 'mfa.challenged',
  ROLE_ASSIGNED = 'role.assigned',
  ROLE_REVOKED = 'role.revoked',
  ORG_CREATED = 'org.created',
  ORG_MEMBER_ADDED = 'org.member_added',
  ORG_MEMBER_REMOVED = 'org.member_removed',
  TOKEN_ISSUED = 'token.issued',
  TOKEN_REVOKED = 'token.revoked',
}

export enum AuditResource {
  USER = 'user',
  SESSION = 'session',
  ROLE = 'role',
  PERMISSION = 'permission',
  ORGANIZATION = 'organization',
  MFA_FACTOR = 'mfa_factor',
  TOKEN = 'token',
}

export interface AuditActor {
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditEvent {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  actor: AuditActor;
  status: 'success' | 'failure';
  metadata?: Record<string, unknown>;
  correlationId?: string;
  timestamp: string;
}
