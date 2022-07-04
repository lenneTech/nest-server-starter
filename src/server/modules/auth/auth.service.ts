import {
  ConfigService,
  EmailService,
  JwtPayload,
  prepareServiceOptions,
  RoleEnum,
  Roles,
  ServiceOptions,
} from '@lenne.tech/nest-server';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { sha256 } from 'js-sha256';
import { UserService } from '../user/user.service';
import { Auth } from './auth.model';
import { AuthSignInInput } from './inputs/auth-sign-in.input';
import { AuthSignUpInput } from './inputs/auth-sign-up.input';

@Injectable()
@Roles(RoleEnum.ADMIN)
export class AuthService {
  constructor(
    protected readonly jwtService: JwtService,
    protected readonly emailService: EmailService,
    protected readonly userService: UserService,
    protected readonly configService: ConfigService
  ) {}

  /**
   * Sign in for user
   */
  @Roles(RoleEnum.S_EVERYONE)
  async signIn(input: AuthSignInInput, serviceOptions?: ServiceOptions): Promise<Auth> {
    // Prepare service options
    const serviceOptionsForUserService = prepareServiceOptions(serviceOptions, {
      // We need password, so we can't use prepare output handling and have to deactivate it
      prepareOutput: null,

      // Select user field for automatic populate handling via user service
      subFieldSelection: 'user',
    });

    // Get and check user
    const user = await this.userService.getViaEmail(input.email, serviceOptionsForUserService);
    if (
      !user ||
      !(
        (await bcrypt.compare(input.password, user.password)) ||
        (await bcrypt.compare(sha256(input.password), user.password))
      )
    ) {
      throw new UnauthorizedException();
    }

    // Create JWT and return sign-in data
    const payload: JwtPayload = { email: user.email };
    return Auth.map({
      token: this.jwtService.sign(payload),
      user,
    });
  }

  /**
   * Register a new user Account
   */
  @Roles(RoleEnum.S_EVERYONE)
  async signUp(input: AuthSignUpInput, serviceOptions?: ServiceOptions): Promise<Auth> {
    // Prepare service options
    const serviceOptionsForUserService = prepareServiceOptions(serviceOptions, {
      // Select user field for automatic populate handling via user service
      subFieldSelection: 'user',
    });

    // Get and check user
    const user = await this.userService.create(input, serviceOptionsForUserService);
    if (!user) {
      throw Error('Email Address already in use');
    }

    // Send email
    await this.emailService.sendMail(user.email, 'Welcome', {
      htmlTemplate: 'welcome',
      templateData: {
        name: user.username,
        link: this.configService.configFastButReadOnly.email.verificationLink + '/' + user.verificationToken,
      },
    });

    // Create JWT and return sign-in data
    const payload: JwtPayload = { email: user.email };
    return Auth.map({
      token: this.jwtService.sign(payload),
      user: user,
    });
  }
}
