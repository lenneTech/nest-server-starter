import { check, FilterArgs, GraphQLUser, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Inject } from '@nestjs/common';
import { Args, Info, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { UserCreateInput } from './inputs/user-create.input';
import { UserInput } from './inputs/user.input';
import { User } from './user.model';
import { UserService } from './user.service';

/**
 * Resolver to process with user data
 */
@Resolver(() => User)
export class UserResolver {
  /**
   * Import services
   */
  constructor(protected readonly userService: UserService, @Inject('PUB_SUB') protected readonly pubSub: PubSub) {}

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get users (via filter)
   */
  @Roles(RoleEnum.ADMIN)
  @Query(() => [User], { description: 'Find users (via filter)' })
  async findUsers(@Info() info: GraphQLResolveInfo, @Args() args?: FilterArgs) {
    return await this.userService.find(args, { fieldSelection: { info, select: 'findUsers' } });
  }

  /**
   * Get user via ID
   */
  @Roles(RoleEnum.OWNER, RoleEnum.ADMIN)
  @Query(() => User, { description: 'Get user with specified ID' })
  async getUser(@Args('id') id: string, @Info() info: GraphQLResolveInfo): Promise<User> {
    return await this.userService.get(id, { fieldSelection: { info, select: 'getUser' } });
  }

  /**
   * Get verified state of user with token
   */
  @Query(() => Boolean, { description: 'Get verified state of user with token' })
  async getVerifiedState(@Args('token') token: string) {
    return await this.userService.getVerifiedState(token);
  }

  /**
   * Request new password for user with email
   */
  @Query(() => Boolean, { description: 'Request new password for user with email' })
  async requestPasswordResetMail(@Args('email') email: string): Promise<boolean> {
    return !!(await this.userService.sendPasswordResetMail(email));
  }

  // ===========================================================================
  // Mutations
  // ===========================================================================

  /**
   * Create new user
   */
  @Mutation(() => User, { description: 'Create a new user' })
  async createUser(
    @Args('input') input: UserCreateInput,
    @GraphQLUser() user: User,
    @Info() info: GraphQLResolveInfo
  ): Promise<User> {
    // Check input
    // Hint: necessary as long as global CheckInputPipe can't access context for current user
    // (see https://github.com/nestjs/graphql/issues/325)
    input = await check(input, user, UserCreateInput);

    return await this.userService.create(input, { currentUser: user, fieldSelection: { info, select: 'createUser' } });
  }

  /**
   * Delete existing user
   */
  @Roles(RoleEnum.ADMIN, RoleEnum.OWNER)
  @Mutation(() => User, { description: 'Delete existing user' })
  async deleteUser(@Args('id') id: string, @Info() info: GraphQLResolveInfo): Promise<User> {
    return await this.userService.delete(id, { fieldSelection: { info, select: 'deleteUser' } });
  }

  /**
   * Set new password for user with token
   */
  @Mutation(() => Boolean, { description: 'Set new password for user with token' })
  async resetPassword(@Args('token') token: string, @Args('password') password: string): Promise<boolean> {
    return !!(await this.userService.resetPassword(token, password));
  }

  /**
   * Update existing user
   */
  @Roles(RoleEnum.ADMIN, RoleEnum.OWNER)
  @Mutation(() => User, { description: 'Update existing user' })
  async updateUser(
    @Args('input') input: UserInput,
    @Args('id') id: string,
    @GraphQLUser() user: User,
    @Info() info: GraphQLResolveInfo
  ): Promise<User> {
    // Check input
    // Hint: necessary as long as global CheckInputPipe can't access context for current user
    // (see https://github.com/nestjs/graphql/issues/325)
    input = await check(input, user, UserInput);

    // Update user
    return await this.userService.update(id, input, {
      currentUser: user,
      fieldSelection: { info, select: 'updateUser' },
    });
  }

  /**
   * Verify user with email
   */
  @Mutation(() => Boolean, { description: 'Verify user with email' })
  async verifyUser(@Args('token') token: string): Promise<boolean> {
    return !!(await this.userService.verify(token));
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscription for created user
   */
  @Subscription(() => User, {
    filter(this: UserResolver, payload, variables, context) {
      return context.user.roles.include(RoleEnum.ADMIN);
    },
    resolve: (user) => user,
  })
  async userCreated() {
    return this.pubSub.asyncIterator('userCreated');
  }
}
