import {
  ConfigService,
  CoreAuthResolver,
  GraphQLServiceOptions,
  RoleEnum, Roles,
  ServiceOptions,
} from '@lenne.tech/nest-server';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { Response as ResponseType } from 'express';

import { Auth } from './auth.model';
import { AuthService } from './auth.service';
import { AuthSignInInput } from './inputs/auth-sign-in.input';
import { AuthSignUpInput } from './inputs/auth-sign-up.input';

/**
 * Authentication resolver for the sign in
 */
@Resolver(() => Auth)
@Roles(RoleEnum.ADMIN)
export class AuthResolver extends CoreAuthResolver {
  /**
   * Integrate services
   */
  constructor(
    protected override readonly authService: AuthService,
    protected override readonly configService: ConfigService,
  ) {
    super(authService, configService);
  }

  /**
   * SignIn for User
   */
  @Mutation(() => Auth, { description: 'Sign in and get JWT token' })
  @Roles(RoleEnum.S_EVERYONE)
  override async signIn(
    @GraphQLServiceOptions({ gqlPath: 'signIn.user' }) serviceOptions: ServiceOptions,
    @Context() ctx: { res: ResponseType },
    @Args('input') input: AuthSignInInput,
  ): Promise<Auth> {
    const result = await this.authService.signIn(input, {
      ...serviceOptions,
      inputType: AuthSignInInput,
    });
    return this.processCookies(ctx, result);
  }

  /**
   * Sign up for user
   */
  @Mutation(() => Auth, {
    description: 'Sign up user and get JWT token',
  })
  @Roles(RoleEnum.S_EVERYONE)
  override async signUp(
    @GraphQLServiceOptions({ gqlPath: 'signUp.user' }) serviceOptions: ServiceOptions,
    @Context() ctx: { res: ResponseType },
    @Args('input') input: AuthSignUpInput,
  ): Promise<Auth> {
    const result = await this.authService.signUp(input, serviceOptions);
    return this.processCookies(ctx, result);
  }
}
