export const SSO_ERROR_CODES = {
  SSO_CONFIG_NOT_FOUND: 'SSO_CONFIG_NOT_FOUND',
  SSO_CONFIG_DISABLED: 'SSO_CONFIG_DISABLED',
  SSO_NOT_CONFIGURED: 'SSO_NOT_CONFIGURED',
  SSO_INVALID_METADATA: 'SSO_INVALID_METADATA',
  SSO_INVALID_ASSERTION: 'SSO_INVALID_ASSERTION',
  SSO_ASSERTION_EXPIRED: 'SSO_ASSERTION_EXPIRED',
  SSO_REPLAY_DETECTED: 'SSO_REPLAY_DETECTED',
  SSO_IDP_INITIATED_DISABLED: 'SSO_IDP_INITIATED_DISABLED',
  SSO_EMAIL_MISSING: 'SSO_EMAIL_MISSING',
  SSO_ORG_NOT_FOUND: 'SSO_ORG_NOT_FOUND',
  SSO_RELAY_STATE_INVALID: 'SSO_RELAY_STATE_INVALID',
} as const;

export const SSO_CACHE_KEYS = {
  relayState: (state: string) => `sso:relay:${state}`,
  assertionReplay: (assertionId: string) => `sso:assertion:${assertionId}`,
};

export const SSO_RELAY_STATE_BYTES = 32;

export const DEFAULT_ATTRIBUTE_MAPPING: Record<string, string> = {
  email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
  department: 'department',
  jobTitle: 'jobTitle',
  groups: 'http://schemas.xmlsoap.org/claims/Group',
};
