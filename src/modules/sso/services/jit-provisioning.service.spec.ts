import { MembershipStatus, UserStatus } from '@prisma/client';

import { JitProvisioningService } from './jit-provisioning.service';

type AnyMock = jest.Mock;

describe('JitProvisioningService', () => {
  let service: JitProvisioningService;
  let tx: {
    user: { findUnique: AnyMock; create: AnyMock; update: AnyMock };
    membership: { upsert: AnyMock };
    role: { findMany: AnyMock };
    userRole: { upsert: AnyMock };
  };
  let prisma: { $transaction: AnyMock };
  let passwords: { hash: AnyMock };
  let audit: { record: AnyMock };

  beforeEach(() => {
    tx = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      membership: { upsert: jest.fn() },
      role: { findMany: jest.fn() },
      userRole: { upsert: jest.fn() },
    };
    prisma = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
    passwords = { hash: jest.fn().mockResolvedValue('hash') };
    audit = { record: jest.fn() };

    service = new JitProvisioningService(prisma as never, passwords as never, audit as never);
  });

  const attrs = {
    email: 'new@example.com',
    firstName: 'New',
    lastName: 'User',
    department: 'Sales',
    jobTitle: 'Rep',
    groups: ['developers'],
  };

  it('creates a new user, membership, and assigns mapped roles', async () => {
    tx.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({ id: 'u1', email: attrs.email, status: UserStatus.ACTIVE });
    tx.membership.upsert.mockResolvedValue({ id: 'm1' });
    tx.role.findMany.mockResolvedValue([
      { id: 'r-member', slug: 'member' },
      { id: 'r-dev', slug: 'developers' },
    ]);

    const user = await service.provision('org1', attrs, 'member');

    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: MembershipStatus.ACTIVE,
          department: 'Sales',
          jobTitle: 'Rep',
        }),
      }),
    );
    expect(tx.userRole.upsert).toHaveBeenCalledTimes(2);
    expect(user.id).toBe('u1');
  });

  it('reuses an existing user (no duplicate creation)', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'u-existing',
      email: attrs.email,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    tx.membership.upsert.mockResolvedValue({ id: 'm1' });
    tx.role.findMany.mockResolvedValue([]);

    const user = await service.provision('org1', attrs, null);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(user.id).toBe('u-existing');
  });
});
