export enum AuditAction {
  LOGIN_SUCCESS = 'login.success',
  LOGIN_FAILURE = 'login.failure',
  LOGOUT = 'logout',
  PASSWORD_CHANGED = 'password.changed',
  PASSWORD_RESET_REQUESTED = 'password.reset_requested',
  PASSWORD_RESET_COMPLETED = 'password.reset_completed',
  MFA_SETUP_INITIATED = 'mfa.setup_initiated',
  MFA_ENABLED = 'mfa.enabled',
  MFA_DISABLED = 'mfa.disabled',
  MFA_CHALLENGED = 'mfa.challenged',
  MFA_VERIFIED = 'mfa.verified',
  MFA_FAILED = 'mfa.failed',
  MFA_BACKUP_CODE_USED = 'mfa.backup_code_used',
  MFA_BACKUP_CODES_REGENERATED = 'mfa.backup_codes_regenerated',
  OAUTH_LOGIN_SUCCESS = 'oauth.login_success',
  OAUTH_LOGIN_FAILURE = 'oauth.login_failure',
  OAUTH_ACCOUNT_LINKED = 'oauth.account_linked',
  OAUTH_ACCOUNT_UNLINKED = 'oauth.account_unlinked',
  SSO_LOGIN_SUCCESS = 'sso.login_success',
  SSO_LOGIN_FAILURE = 'sso.login_failure',
  SSO_CONFIG_CREATED = 'sso.config_created',
  SSO_CONFIG_UPDATED = 'sso.config_updated',
  SSO_CONFIG_DELETED = 'sso.config_deleted',
  SSO_JIT_PROVISIONED = 'sso.jit_provisioned',
  SUSPICIOUS_AUTH_FLOW = 'auth.suspicious_flow',
  ROLE_ASSIGNED = 'role.assigned',
  ROLE_REVOKED = 'role.revoked',
  ROLE_CREATED = 'role.created',
  ROLE_UPDATED = 'role.updated',
  ROLE_DELETED = 'role.deleted',
  PERMISSION_CREATED = 'permission.created',
  PERMISSION_DELETED = 'permission.deleted',
  POLICY_CREATED = 'policy.created',
  POLICY_UPDATED = 'policy.updated',
  POLICY_DELETED = 'policy.deleted',
  POLICY_ASSIGNED = 'policy.assigned',
  POLICY_UNASSIGNED = 'policy.unassigned',
  POLICY_DENIED = 'policy.denied',
  ORG_CREATED = 'org.created',
  ORG_UPDATED = 'org.updated',
  ORG_DELETED = 'org.deleted',
  ORG_MEMBER_ADDED = 'org.member_added',
  ORG_MEMBER_UPDATED = 'org.member_updated',
  ORG_MEMBER_REMOVED = 'org.member_removed',
  ORG_INVITATION_CREATED = 'org.invitation_created',
  ORG_INVITATION_ACCEPTED = 'org.invitation_accepted',
  ORG_INVITATION_REVOKED = 'org.invitation_revoked',
  ORG_SWITCHED = 'org.switched',
  TOKEN_ISSUED = 'token.issued',
  TOKEN_REVOKED = 'token.revoked',
}

export enum AuditResource {
  USER = 'user',
  SESSION = 'session',
  ROLE = 'role',
  PERMISSION = 'permission',
  POLICY = 'policy',
  ORGANIZATION = 'organization',
  MEMBERSHIP = 'membership',
  INVITATION = 'invitation',
  MFA_FACTOR = 'mfa_factor',
  TOKEN = 'token',
  OAUTH_ACCOUNT = 'oauth_account',
  SSO_CONFIGURATION = 'sso_configuration',
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
