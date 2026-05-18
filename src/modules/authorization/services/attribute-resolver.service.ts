import { Injectable } from '@nestjs/common';
import { AttributeSource } from '@prisma/client';

import { type AuthorizationContext } from '../interfaces';

@Injectable()
export class AttributeResolverService {
  resolve(context: AuthorizationContext, source: AttributeSource, path: string): unknown {
    const root = this.rootFor(context, source);
    return this.readPath(root, path);
  }

  resolveCompareTarget(context: AuthorizationContext, expression: string): unknown {
    const match = expression.match(/^([A-Z]+)\.(.+)$/);
    if (!match) {
      return expression;
    }
    const [, sourceName, path] = match;
    if (!sourceName || !path) {
      return expression;
    }
    if (!(sourceName in AttributeSource)) {
      return expression;
    }
    return this.resolve(context, sourceName as AttributeSource, path);
  }

  private rootFor(context: AuthorizationContext, source: AttributeSource): unknown {
    switch (source) {
      case AttributeSource.USER:
        return { id: context.user.id, email: context.user.email, ...context.attributes.user };
      case AttributeSource.MEMBERSHIP:
        return context.attributes.membership;
      case AttributeSource.ORGANIZATION:
        return context.attributes.organization;
      case AttributeSource.RESOURCE:
        return context.resourceData ?? {};
      case AttributeSource.REQUEST:
        return context.request;
      case AttributeSource.ENVIRONMENT:
        return {
          nodeEnv: process.env.NODE_ENV,
          now: new Date().toISOString(),
        };
      default: {
        const _exhaustive: never = source;
        return _exhaustive;
      }
    }
  }

  private readPath(root: unknown, path: string): unknown {
    if (root === null || root === undefined) {
      return undefined;
    }
    const parts = path.split('.');
    let cursor: unknown = root;
    for (const part of parts) {
      if (cursor === null || cursor === undefined) {
        return undefined;
      }
      if (typeof cursor !== 'object') {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return cursor;
  }
}
