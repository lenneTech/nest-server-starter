import {
  ConfigService,
  CoreBetterAuthController,
  CoreBetterAuthService,
  CoreBetterAuthUserMapper,
  RoleEnum,
  Roles,
} from '@lenne.tech/nest-server';
import { Controller } from '@nestjs/common';

/**
 * Project-specific IAM Controller extending CoreBetterAuthController.
 * Override methods to add custom behavior (e.g., welcome emails, audit logging).
 */
@Controller('iam')
@Roles(RoleEnum.ADMIN)
export class IamController extends CoreBetterAuthController {
  constructor(
    protected override readonly betterAuthService: CoreBetterAuthService,
    protected override readonly userMapper: CoreBetterAuthUserMapper,
    protected override readonly configService: ConfigService,
  ) {
    super(betterAuthService, userMapper, configService);
  }
}
