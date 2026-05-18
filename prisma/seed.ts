import {
  AttributeSource,
  AttributeValueType,
  PolicyEffect,
  PolicyOperator,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSIONS = [
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

interface SystemRoleDef {
  slug: string;
  name: string;
  description: string;
  permissions: Array<{ resource: string; action: string }> | '*';
}

const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    slug: 'super-admin',
    name: 'Super Admin',
    description: 'Cross-organization administrator',
    permissions: '*',
  },
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Organization administrator',
    permissions: '*',
  },
  {
    slug: 'manager',
    name: 'Manager',
    description: 'Department / team manager',
    permissions: [
      { resource: 'users', action: 'read' },
      { resource: 'users', action: 'update' },
      { resource: 'members', action: 'read' },
      { resource: 'members', action: 'manage' },
      { resource: 'invitations', action: 'manage' },
      { resource: 'audit', action: 'read' },
    ],
  },
  {
    slug: 'user',
    name: 'User',
    description: 'Standard organization user',
    permissions: [{ resource: 'users', action: 'read' }],
  },
];

async function seedPermissions() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      create: { resource: p.resource, action: p.action, description: p.description },
      update: { description: p.description },
    });
  }
}

async function seedSystemRoles() {
  const allPermissions = await prisma.permission.findMany();
  for (const def of SYSTEM_ROLES) {
    // Prisma rejects compound-unique upsert when one field is nullable (organizationId? + slug).
    // Find-then-update/create instead.
    const existing = await prisma.role.findFirst({
      where: { organizationId: null, slug: def.slug },
    });
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: def.name, description: def.description, isSystem: true },
        })
      : await prisma.role.create({
          data: {
            organizationId: null,
            name: def.name,
            slug: def.slug,
            description: def.description,
            isSystem: true,
          },
        });
    const permissions =
      def.permissions === '*'
        ? allPermissions
        : allPermissions.filter((p) =>
            (def.permissions as Array<{ resource: string; action: string }>).some(
              (rp) => rp.resource === p.resource && rp.action === p.action,
            ),
          );
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }
}

async function seedDefaultPolicies() {
  await upsertPolicy(
    {
      slug: 'edit-own-profile',
      name: 'Users can edit their own profile',
      effect: PolicyEffect.ALLOW,
      resource: 'users',
      action: 'update',
      priority: 200,
    },
    [
      {
        attributeSource: AttributeSource.RESOURCE,
        attributePath: 'id',
        operator: PolicyOperator.EQUALS,
        value: 'USER.id',
        valueType: AttributeValueType.STRING,
      },
    ],
  );

  await upsertPolicy(
    {
      slug: 'same-organization-access',
      name: 'Members access resources within their organization',
      effect: PolicyEffect.ALLOW,
      resource: '*',
      action: '*',
      priority: 100,
    },
    [
      {
        attributeSource: AttributeSource.RESOURCE,
        attributePath: 'organizationId',
        operator: PolicyOperator.EQUALS,
        value: 'ORGANIZATION.id',
        valueType: AttributeValueType.STRING,
      },
    ],
  );

  await upsertPolicy(
    {
      slug: 'manager-can-access-department-users',
      name: 'Managers can access users in their department',
      effect: PolicyEffect.ALLOW,
      resource: 'users',
      action: 'read',
      priority: 150,
    },
    [
      {
        attributeSource: AttributeSource.RESOURCE,
        attributePath: 'department',
        operator: PolicyOperator.EQUALS,
        value: 'MEMBERSHIP.department',
        valueType: AttributeValueType.STRING,
      },
    ],
  );

  await upsertPolicy(
    {
      slug: 'admin-can-access-all-org-resources',
      name: 'Admins access all resources within their organization',
      effect: PolicyEffect.ALLOW,
      resource: '*',
      action: '*',
      priority: 500,
    },
    [
      {
        attributeSource: AttributeSource.MEMBERSHIP,
        attributePath: 'roles',
        operator: PolicyOperator.CONTAINS,
        value: 'admin',
        valueType: AttributeValueType.STRING,
      },
    ],
  );

  await upsertPolicy(
    {
      slug: 'deny-suspended-members',
      name: 'Suspended members are denied any access',
      effect: PolicyEffect.DENY,
      resource: '*',
      action: '*',
      priority: 10000,
    },
    [
      {
        attributeSource: AttributeSource.MEMBERSHIP,
        attributePath: 'status',
        operator: PolicyOperator.EQUALS,
        value: 'SUSPENDED',
        valueType: AttributeValueType.STRING,
      },
    ],
  );

  await upsertPolicy(
    {
      slug: 'enterprise-plan-required-for-sso',
      name: 'SSO management requires Enterprise plan',
      effect: PolicyEffect.ALLOW,
      resource: 'sso',
      action: 'manage',
      priority: 300,
    },
    [
      {
        attributeSource: AttributeSource.ORGANIZATION,
        attributePath: 'plan',
        operator: PolicyOperator.EQUALS,
        value: 'ENTERPRISE',
        valueType: AttributeValueType.STRING,
      },
    ],
  );
}

async function upsertPolicy(
  policy: {
    slug: string;
    name: string;
    effect: PolicyEffect;
    resource: string;
    action: string;
    priority: number;
  },
  conditions: Array<{
    attributeSource: AttributeSource;
    attributePath: string;
    operator: PolicyOperator;
    value: unknown;
    valueType: AttributeValueType;
  }>,
) {
  const existing = await prisma.policy.findFirst({
    where: { organizationId: null, slug: policy.slug },
  });
  const created = existing
    ? await prisma.policy.update({
        where: { id: existing.id },
        data: {
          name: policy.name,
          effect: policy.effect,
          resource: policy.resource,
          action: policy.action,
          priority: policy.priority,
          isSystem: true,
        },
      })
    : await prisma.policy.create({
        data: {
          organizationId: null,
          slug: policy.slug,
          name: policy.name,
          effect: policy.effect,
          resource: policy.resource,
          action: policy.action,
          priority: policy.priority,
          isSystem: true,
          isEnabled: true,
        },
      });
  await prisma.policyCondition.deleteMany({ where: { policyId: created.id } });
  if (conditions.length > 0) {
    await prisma.policyCondition.createMany({
      data: conditions.map((c) => ({
        policyId: created.id,
        attributeSource: c.attributeSource,
        attributePath: c.attributePath,
        operator: c.operator,
        value: c.value as object,
        valueType: c.valueType,
      })),
    });
  }
}

async function main() {
  console.log('Seeding permissions...');
  await seedPermissions();
  console.log('Seeding system roles...');
  await seedSystemRoles();
  console.log('Seeding default ABAC policies...');
  await seedDefaultPolicies();
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
