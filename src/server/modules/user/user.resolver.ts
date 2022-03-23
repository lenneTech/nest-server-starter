import { FilterArgs, GraphQLUser, InputHelper, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Inject } from '@nestjs/common';
import { Args, Info, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { UserCreateInput } from './inputs/user-create.input';
import { UserInput } from './inputs/user.input';
import { User } from './user.model';
import { UserService } from './user.service';

// Subscription
const pubSub = new PubSub();

/**
 * Resolver to process with user data
 */
@Resolver((of) => User)
export class UserResolver {
  /**
   * Import services
   */
  constructor(private readonly usersService: UserService, @Inject('PUB_SUB') protected readonly pubSub: PubSub) {}

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get user via ID
   */
  @Query((returns) => User, { description: 'Get user with specified ID' })
  async getUser(@Args('id') id: string, @Info() info: GraphQLResolveInfo): Promise<User> {
    return await this.usersService.get(id, info);
  }

  /**
   * Get users (via filter)
   */
  @Roles(RoleEnum.USER)
  @Query((returns) => [User], { description: 'Find users (via filter)' })
  async findUsers(@Info() info: GraphQLResolveInfo, @Args() args?: FilterArgs) {
    return await this.usersService.find(args, info);
  }

  /**
   * Request new password for user with email
   */
  @Query((returns) => Boolean, { description: 'Request new password for user with email' })
  async requestPasswordResetMail(@Args('email') email: string): Promise<boolean> {
    return !!(await this.usersService.sendPasswordResetMail(email));
  }

  // ===========================================================================
  // Mutations
  // ===========================================================================
  /**
   * Verify user with email
   */
  @Mutation((returns) => Boolean, { description: 'Verify user with email' })
  async verifyUser(@Args('token') token: string): Promise<boolean> {
    return !!(await this.usersService.verify(token));
  }

  /**
   * Set new password for user with token
   */
  @Mutation((returns) => Boolean, { description: 'Set new password for user with token' })
  async resetPassword(@Args('token') token: string, @Args('password') password: string): Promise<boolean> {
    return !!(await this.usersService.resetPassword(token, password));
  }

  /**
   * Create new user
   */
  @Mutation((returns) => User, { description: 'Create a new user' })
  async createUser(@Args('input') input: UserCreateInput, @GraphQLUser() user: User): Promise<User> {
    // Check input
    // Hint: necessary as long as global CheckInputPipe can't access context for current user
    // (see https://github.com/nestjs/graphql/issues/325)
    input = await InputHelper.check(input, user, UserCreateInput);

    return await this.usersService.create(input, user);
  }

  /**
   * Update existing user
   */
  @Roles(RoleEnum.ADMIN, RoleEnum.OWNER)
  @Mutation((returns) => User, { description: 'Update existing user' })
  async updateUser(@Args('input') input: UserInput, @Args('id') id: string, @GraphQLUser() user: User): Promise<User> {
    // Check input
    // Hint: necessary as long as global CheckInputPipe can't access context for current user
    // (see https://github.com/nestjs/graphql/issues/325)
    input = await InputHelper.check(input, user, UserInput);

    // Update user
    return await this.usersService.update(id, input, user);
  }

  /**
   * Delete existing user
   */
  @Roles(RoleEnum.ADMIN, RoleEnum.OWNER)
  @Mutation((returns) => User, { description: 'Delete existing user' })
  async deleteUser(@Args('id') id: string, @Info() info: GraphQLResolveInfo): Promise<User> {
    return await this.usersService.delete(id, info);
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscritption for create user
   */
  @Subscription((returns) => User, {
    resolve: (value) => value,
  })
  async userCreated() {
    return this.pubSub.asyncIterator('userCreated');
  }
}
