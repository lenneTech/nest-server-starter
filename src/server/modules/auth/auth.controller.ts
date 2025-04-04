import { ConfigService, CoreAuthController, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller } from '@nestjs/common';

import { AuthService } from './auth.service';

@Controller('auth')
@Roles(RoleEnum.ADMIN)
export class AuthController extends CoreAuthController {
  /**
   * Import project services
   */
  constructor(
    protected override readonly authService: AuthService,
    protected override readonly configService: ConfigService,
  ) {
    super(authService, configService);
  }
}
