import { ApiCommonErrorResponses, ConfigService, CoreAuthController, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';

/**
 * Controller to handle authentication REST API endpoints
 */
@ApiCommonErrorResponses()
@ApiTags('auth')
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
