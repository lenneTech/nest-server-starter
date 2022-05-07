import { CoreAuthResolver } from '@lenne.tech/nest-server';
import { Args, Info, Query, Resolver } from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { Auth } from './auth.model';

/**
 * Authentication resolver for the sign in
 */
@Resolver(() => Auth)
export class AuthResolver extends CoreAuthResolver {
  /**
   * Get user via ID
   */
  @Query(() => Auth, { description: 'Get JWT token' })
  async signIn(
    @Args('email') email: string,
    @Args('password') password: string,
    @Info() info: GraphQLResolveInfo
  ): Promise<Auth> {
    return (await this.authService.signIn(email, password, { fieldSelection: { info, select: 'signIn' } })) as Auth;
  }
}
