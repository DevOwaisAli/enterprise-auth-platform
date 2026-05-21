import { type Profile } from '@node-saml/node-saml';

import { mapSamlAttributes } from './attribute-mapper.util';

describe('mapSamlAttributes', () => {
  const mapping = {
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    department: 'dept',
    jobTitle: 'title',
    groups: 'memberOf',
  };

  it('maps configured attributes from the profile', () => {
    const profile = {
      nameID: 'user@example.com',
      email: 'user@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      dept: 'Engineering',
      title: 'Staff Engineer',
      memberOf: ['admins', 'developers'],
    } as unknown as Profile;

    const attrs = mapSamlAttributes(profile, mapping);
    expect(attrs.email).toBe('user@example.com');
    expect(attrs.firstName).toBe('Jane');
    expect(attrs.lastName).toBe('Doe');
    expect(attrs.department).toBe('Engineering');
    expect(attrs.jobTitle).toBe('Staff Engineer');
    expect(attrs.groups).toEqual(['admins', 'developers']);
  });

  it('falls back to nameID for email when claim is missing', () => {
    const profile = { nameID: 'fallback@example.com' } as unknown as Profile;
    const attrs = mapSamlAttributes(profile, mapping);
    expect(attrs.email).toBe('fallback@example.com');
  });

  it('lowercases and trims email', () => {
    const profile = { nameID: 'x', email: '  USER@Example.COM ' } as unknown as Profile;
    const attrs = mapSamlAttributes(profile, mapping);
    expect(attrs.email).toBe('user@example.com');
  });

  it('normalizes a single group to an array', () => {
    const profile = { nameID: 'x', email: 'a@b.com', memberOf: 'admins' } as unknown as Profile;
    const attrs = mapSamlAttributes(profile, mapping);
    expect(attrs.groups).toEqual(['admins']);
  });
});
