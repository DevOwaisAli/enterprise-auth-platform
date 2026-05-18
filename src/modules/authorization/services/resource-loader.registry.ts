import { Injectable, Logger } from '@nestjs/common';

import { type AuthorizationContext } from '../interfaces';
import { type ResourceLoader } from '../interfaces/resource-loader.interface';

@Injectable()
export class ResourceLoaderRegistry {
  private readonly logger = new Logger(ResourceLoaderRegistry.name);
  private readonly loaders = new Map<string, ResourceLoader>();

  register(loader: ResourceLoader): void {
    if (this.loaders.has(loader.resourceType)) {
      this.logger.warn(`Overwriting resource loader for ${loader.resourceType}`);
    }
    this.loaders.set(loader.resourceType, loader);
  }

  get(resourceType: string): ResourceLoader | undefined {
    return this.loaders.get(resourceType);
  }

  async load(
    resourceType: string,
    resourceId: string,
    context: Pick<AuthorizationContext, 'user' | 'organizationId'>,
  ): Promise<Record<string, unknown> | null> {
    const loader = this.get(resourceType);
    if (!loader) {
      return null;
    }
    return loader.load(resourceId, context);
  }
}
