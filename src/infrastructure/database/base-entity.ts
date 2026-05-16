export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeletableEntity extends BaseEntity {
  deletedAt: Date | null;
}

export const BASE_ENTITY_FIELDS = `
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
`;

export const SOFT_DELETE_FIELDS = `
  deletedAt DateTime?
`;
