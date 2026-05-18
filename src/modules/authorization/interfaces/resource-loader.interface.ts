import { type AuthorizationContext } from './authorization.interfaces';

export interface ResourceLoader {
  resourceType: string;
  load(
    resourceId: string,
    context: Pick<AuthorizationContext, 'user' | 'organizationId'>,
  ): Promise<Record<string, unknown> | null>;
}
