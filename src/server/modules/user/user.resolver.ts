import { FilterArgs, GraphQLServiceOptions, RoleEnum, Roles, ServiceOptions } from '@lenne.tech/nest-server';
import { Inject } from '@nestjs/common';
import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { PubSub } from 'graphql-subscriptions';

import { UserCreateInput } from './inputs/user-create.input';
import { UserInput } from './inputs/user.input';
import { FindAndCountUsersResult } from './outputs/find-and-count-users-result.output';
import { User } from './user.model';
import { UserService } from './user.service';

/**
 * Resolver to process with user data
 */
@Resolver(() => User)
@Roles(RoleEnum.ADMIN)
export class UserResolver {
  /**
   * Import services
   */
  constructor(protected readonly userService: UserService, @Inject('PUB_SUB') protected readonly pubSub: PubSub) {}

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get users and total count (via filter)
   */
  @Query(() => FindAndCountUsersResult, { description: 'Find users (via filter)' })
  @Roles(RoleEnum.ADMIN)
  async findAndCountUsers(
    @GraphQLServiceOptions({ gqlPath: 'findAndCountUsers.items' }) serviceOptions: ServiceOptions,
    @Args() args?: FilterArgs,
  ) {
    return await this.userService.findAndCount(args, {
      ...serviceOptions,
      inputType: FilterArgs,
    });
  }

  /**
   * Get users (via filter)
   */
  @Query(() => [User], { description: 'Find users (via filter)' })
  @Roles(RoleEnum.ADMIN)
  async findUsers(@GraphQLServiceOptions() serviceOptions: ServiceOptions, @Args() args?: FilterArgs) {
    return await this.userService.find(args, {
      ...serviceOptions,
      inputType: FilterArgs,
    });
  }

  /**
   * Get user via ID
   */
  @Query(() => User, { description: 'Get user with specified ID' })
  @Roles(RoleEnum.S_USER)
  async getUser(@GraphQLServiceOptions() serviceOptions: ServiceOptions, @Args('id') id: string): Promise<User> {
    return await this.userService.get(id, {
      ...serviceOptions,
      roles: [RoleEnum.ADMIN, RoleEnum.S_CREATOR, RoleEnum.S_SELF],
    });
  }

  /**
   * Get verified state of user with token
   */
  @Query(() => Boolean, { description: 'Get verified state of user with token' })
  @Roles(RoleEnum.S_EVERYONE)
  async getVerifiedState(@Args('token') token: string) {
    return await this.userService.getVerifiedState(token);
  }

  // ===========================================================================
  // Mutations
  // ===========================================================================

  /**
   * Create new user
   */
  @Mutation(() => User, { description: 'Create a new user' })
  @Roles(RoleEnum.ADMIN)
  async createUser(
    @GraphQLServiceOptions() serviceOptions: ServiceOptions,
    @Args('input') input: UserCreateInput,
  ): Promise<User> {
    return await this.userService.create(input, {
      ...serviceOptions,
      inputType: UserCreateInput,
    });
  }

  /**
   * Delete existing user
   */
  @Mutation(() => User, { description: 'Delete existing user' })
  @Roles(RoleEnum.S_USER)
  async deleteUser(@GraphQLServiceOptions() serviceOptions: ServiceOptions, @Args('id') id: string): Promise<User> {
    return await this.userService.delete(id, {
      ...serviceOptions,
      roles: [RoleEnum.ADMIN, RoleEnum.S_CREATOR, RoleEnum.S_SELF],
    });
  }

  /**
   * Set new password for user with token
   */
  @Mutation(() => Boolean, { description: 'Set new password for user with token' })
  @Roles(RoleEnum.S_EVERYONE)
  async resetPassword(@Args('token') token: string, @Args('password') password: string): Promise<boolean> {
    return !!(await this.userService.resetPassword(token, password));
  }

  /**
   * Request new password for user with email
   */
  @Mutation(() => Boolean, { description: 'Request new password for user with email' })
  @Roles(RoleEnum.S_EVERYONE)
  async requestPasswordResetMail(@Args('email') email: string): Promise<boolean> {
    return !!(await this.userService.sendPasswordResetMail(email));
  }

  /**
   * Update existing user
   */
  @Mutation(() => User, { description: 'Update existing user' })
  @Roles(RoleEnum.S_USER)
  async updateUser(
    @GraphQLServiceOptions() serviceOptions: ServiceOptions,
    @Args('input') input: UserInput,
    @Args('id') id: string,
  ): Promise<User> {
    // Update user
    return await this.userService.update(id, input, {
      ...serviceOptions,
      inputType: UserInput,
      roles: [RoleEnum.ADMIN, RoleEnum.S_CREATOR, RoleEnum.S_SELF],
    });
  }

  /**
   * Verify user with email
   */
  @Mutation(() => Boolean, { description: 'Verify user with email' })
  @Roles(RoleEnum.S_EVERYONE)
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
      return context?.user?.hasRole?.(RoleEnum.ADMIN);
    },
    resolve: user => user,
  })
  async userCreated() {
    return this.pubSub.asyncIterableIterator('userCreated');
  }
}
