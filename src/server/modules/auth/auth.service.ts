import { ConfigService, CoreAuthService, EmailService, RoleEnum, Roles, ServiceOptions } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { Auth } from './auth.model';
import { AuthSignInInput } from './inputs/auth-sign-in.input';
import { AuthSignUpInput } from './inputs/auth-sign-up.input';

@Injectable()
@Roles(RoleEnum.ADMIN)
export class AuthService extends CoreAuthService {
  constructor(
    protected override readonly configService: ConfigService,
    protected readonly emailService: EmailService,
    protected override readonly jwtService: JwtService,
    protected override readonly userService: UserService
  ) {
    super(userService, jwtService, configService);
  }

  /**
   * Sign in for user
   */
  @Roles(RoleEnum.S_EVERYONE)
  override async signIn(input: AuthSignInInput, serviceOptions?: ServiceOptions): Promise<Auth> {
    return Auth.map(await super.signIn(input, serviceOptions));
  }

  /**
   * Register a new user Account
   */
  @Roles(RoleEnum.S_EVERYONE)
  override async signUp(input: AuthSignUpInput, serviceOptions?: ServiceOptions): Promise<Auth> {
    const result = await super.signUp(input, serviceOptions);
    const { user } = result;

    // Send email
    await this.emailService.sendMail(user.email, 'Welcome', {
      htmlTemplate: 'welcome',
      templateData: {
        name: user.username,
        link: this.configService.configFastButReadOnly.email.verificationLink + '/' + user.verificationToken,
      },
    });

    // Return mapped result
    return Auth.map(result);
  }
}
