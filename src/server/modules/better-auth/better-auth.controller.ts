import {
  BetterAuthService,
  BetterAuthUserMapper,
  ConfigService,
  CoreBetterAuthController,
  RoleEnum,
  Roles,
} from '@lenne.tech/nest-server';
import { Controller } from '@nestjs/common';

/**
 * Server BetterAuth REST Controller
 *
 * This controller extends CoreBetterAuthController and can be customized
 * for project-specific requirements (e.g., sending welcome emails,
 * custom validation, audit logging).
 *
 * @example
 * ```typescript
 * // Add custom behavior after sign-up
 * override async signUp(res: Response, input: BetterAuthSignUpInput) {
 *   const result = await super.signUp(res, input);
 *
 *   if (result.success && result.user) {
 *     await this.emailService.sendWelcomeEmail(result.user.email);
 *   }
 *
 *   return result;
 * }
 * ```
 */
@Controller('iam')
@Roles(RoleEnum.ADMIN)
export class BetterAuthController extends CoreBetterAuthController {
  constructor(
    protected override readonly betterAuthService: BetterAuthService,
    protected override readonly userMapper: BetterAuthUserMapper,
    protected override readonly configService: ConfigService,
  ) {
    super(betterAuthService, userMapper, configService);
  }
}
