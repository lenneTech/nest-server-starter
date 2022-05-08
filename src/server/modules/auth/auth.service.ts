import { EmailService, JwtPayload, prepareServiceOptions, ServiceOptions } from '@lenne.tech/nest-server';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import envConfig from '../../../config.env';
import { Auth } from './auth.model';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthSignInInput } from './inputs/auth-sign-in.input';
import { AuthSignUpInput } from './inputs/auth-sign-up.input';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    protected readonly jwtService: JwtService,
    protected readonly emailService: EmailService,
    protected readonly userService: UserService
  ) {}

  /**
   * Sign in for user
   */
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
    if (!user) {
      throw new UnauthorizedException();
    }

    // Check password
    if (!(await bcrypt.compare(input.password, user.password))) {
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
      templateData: { name: user.username, link: envConfig.email.verificationLink + '/' + user.verificationToken },
    });

    // Create JWT and return sign-in data
    const payload: JwtPayload = { email: user.email };
    return Auth.map({
      token: this.jwtService.sign(payload),
      user: user,
    });
  }
}