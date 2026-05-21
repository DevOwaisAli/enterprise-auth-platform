import { type Profile } from '@node-saml/node-saml';

import { DEFAULT_ATTRIBUTE_MAPPING } from '../constants';
import { type MappedSamlAttributes } from '../services/jit-provisioning.service';

function readClaim(profile: Profile, key: string): unknown {
  if (key in profile) {
    return (profile as Record<string, unknown>)[key];
  }
  const attributes = (profile as { attributes?: Record<string, unknown> }).attributes;
  if (attributes && key in attributes) {
    return attributes[key];
  }
  return undefined;
}

function toStringValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : null;
  }
  return String(value);
}

function toStringArray(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  return [String(value)];
}

export function mapSamlAttributes(
  profile: Profile,
  mapping: Record<string, string>,
): MappedSamlAttributes {
  const effective: Record<string, string> = { ...DEFAULT_ATTRIBUTE_MAPPING, ...mapping };
  const key = (name: string): string => effective[name] ?? DEFAULT_ATTRIBUTE_MAPPING[name] ?? name;

  const email =
    toStringValue(readClaim(profile, key('email'))) ??
    profile.email ??
    profile.mail ??
    (typeof profile.nameID === 'string' && profile.nameID.includes('@') ? profile.nameID : null);

  return {
    email: (email ?? '').trim().toLowerCase(),
    firstName: toStringValue(readClaim(profile, key('firstName'))),
    lastName: toStringValue(readClaim(profile, key('lastName'))),
    department: toStringValue(readClaim(profile, key('department'))),
    jobTitle: toStringValue(readClaim(profile, key('jobTitle'))),
    groups: toStringArray(readClaim(profile, key('groups'))),
  };
}
