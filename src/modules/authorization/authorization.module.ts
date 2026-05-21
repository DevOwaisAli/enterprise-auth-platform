import { Module } from '@nestjs/common';

import { OrganizationsModule } from '@modules/organizations';

import { PermissionController } from './controllers/permission.controller';
import { PolicyController } from './controllers/policy.controller';
import { RoleController } from './controllers/role.controller';
import { AuthorizationGuard } from './guards/authorization.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { DefaultResourceLoaders } from './loaders/default-loaders';
import { AttributeResolverService } from './services/attribute-resolver.service';
import { AuthorizationService } from './services/authorization.service';
import { ConditionEvaluatorService } from './services/condition-evaluator.service';
import { PermissionService } from './services/permission.service';
import { PolicyEvaluatorService } from './services/policy-evaluator.service';
import { PolicyService } from './services/policy.service';
import { ResourceLoaderRegistry } from './services/resource-loader.registry';
import { RoleService } from './services/role.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [PermissionController, PolicyController, RoleController],
  providers: [
    AttributeResolverService,
    AuthorizationService,
    ConditionEvaluatorService,
    PermissionService,
    PolicyEvaluatorService,
    PolicyService,
    ResourceLoaderRegistry,
    RoleService,
    AuthorizationGuard,
    PermissionsGuard,
    DefaultResourceLoaders,
  ],
  exports: [
    AuthorizationService,
    PermissionService,
    PolicyService,
    RoleService,
    ResourceLoaderRegistry,
    // ConditionEvaluatorService is a constructor dependency of AuthorizationGuard;
    // it must be exported so the guard resolves when used in modules that import
    // AuthorizationModule (e.g. MfaModule, SsoModule).
    ConditionEvaluatorService,
    AuthorizationGuard,
    PermissionsGuard,
  ],
})
export class AuthorizationModule {}
