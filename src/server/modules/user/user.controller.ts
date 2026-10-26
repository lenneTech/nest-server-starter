import { ApiCommonErrorResponses, CurrentUser, RoleEnum, Roles, ServiceOptions } from '@lenne.tech/nest-server';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { UserCreateInput } from './inputs/user-create.input.js';
import { UserInput } from './inputs/user.input.js';
import { FindAndCountUsersResult } from './outputs/find-and-count-users-result.output.js';
import { User } from './user.model.js';
import { UserService } from './user.service.js';

/**
 * Controller to handle user REST API endpoints
 *
 * Access control lives in `@Roles()`, on the class and on each endpoint. It authenticates as well as
 * authorizes, so no `@UseGuards(AuthGuard(...))` belongs next to it. Add such a guard only to switch
 * to a different strategy, e.g. `AuthGuardStrategy.JWT_REFRESH` on a refresh-token endpoint. A second
 * guard for the same strategy is a second check that can disagree with the first: until nest-server
 * 11.42.14 it refused API tokens on routes that `@ApiTokenScopes()` had released.
 */
@ApiCommonErrorResponses()
@ApiTags('users')
@Controller('users')
@Roles(RoleEnum.ADMIN)
export class UserController {
  /**
   * Import services
   */
  constructor(protected readonly userService: UserService) {}

  // ===========================================================================
  // GET Endpoints (Queries)
  // ===========================================================================

  /**
   * Get users (via filter)
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Users found successfully', type: [User] })
  @ApiOperation({ description: 'Find users (via filter)', summary: 'Get all users' })
  @Get()
  @Roles(RoleEnum.ADMIN)
  async findUsers(@CurrentUser() currentUser: User): Promise<User[]> {
    const serviceOptions: ServiceOptions = {
      currentUser,
    };
    return await this.userService.find({}, serviceOptions);
  }

  /**
   * Get users and total count (via filter)
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Users and count found successfully', type: FindAndCountUsersResult })
  @ApiOperation({
    description: 'Find users and total count (via filter)',
    summary: 'Get users with count',
  })
  @Get('count')
  @Roles(RoleEnum.ADMIN)
  async findAndCountUsers(@CurrentUser() currentUser: User): Promise<FindAndCountUsersResult> {
    const serviceOptions: ServiceOptions = {
      currentUser,
    };
    return await this.userService.findAndCount({}, serviceOptions);
  }

  /**
   * Get verified state of user with token
   */
  @ApiOkResponse({ description: 'Verified state retrieved successfully', type: Boolean })
  @ApiOperation({
    description: 'Get verified state of user with token',
    summary: 'Check if user is verified',
  })
  @ApiQuery({ description: 'Verification token', name: 'token', type: String })
  @Get('verified-state')
  @Roles(RoleEnum.S_EVERYONE)
  async getVerifiedState(@Query('token') token: string): Promise<boolean> {
    return await this.userService.getVerifiedState(token);
  }

  /**
   * Get user via ID
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'User found successfully', type: User })
  @ApiOperation({ description: 'Get user with specified ID', summary: 'Get user by ID' })
  @ApiParam({ description: 'User ID', name: 'id', type: String })
  @Get(':id')
  @Roles(RoleEnum.S_USER)
  async getUser(@CurrentUser() currentUser: User, @Param('id') id: string): Promise<User> {
    const serviceOptions: ServiceOptions = {
      currentUser,
      roles: [RoleEnum.ADMIN, RoleEnum.S_CREATOR, RoleEnum.S_SELF],
    };
    return await this.userService.get(id, serviceOptions);
  }

  // ===========================================================================
  // POST Endpoints (Mutations)
  // ===========================================================================

  /**
   * Create new user
   */
  @ApiBearerAuth()
  @ApiBody({ type: UserCreateInput })
  @ApiCreatedResponse({ description: 'User created successfully', type: User })
  @ApiOperation({ description: 'Create a new user', summary: 'Create user' })
  @Post()
  @Roles(RoleEnum.ADMIN)
  async createUser(@CurrentUser() currentUser: User, @Body() input: UserCreateInput): Promise<User> {
    const serviceOptions: ServiceOptions = {
      currentUser,
      inputType: UserCreateInput,
    };
    return await this.userService.create(input, serviceOptions);
  }

  /**
   * Request new password for user with email
   */
  @ApiBody({
    description: 'User email',
    schema: {
      properties: {
        email: { type: 'string' },
      },
      type: 'object',
    },
  })
  @ApiOkResponse({ description: 'Password reset email sent successfully', type: Boolean })
  @ApiOperation({
    description: 'Request new password for user with email',
    summary: 'Request password reset',
  })
  @Post('password/reset-request')
  @Roles(RoleEnum.S_EVERYONE)
  async requestPasswordResetMail(@Body('email') email: string): Promise<boolean> {
    // Always true, whatever the lookup found. `sendPasswordResetMail` returns `null` for an address
    // without an account, and passing that through would answer `false` for unknown and `true` for
    // known — an account oracle in the response body, which for a B2B product also answers who
    // works at which customer. The equal status code is worth nothing while the body differs.
    await this.userService.sendPasswordResetMail(email);
    return true;
  }

  /**
   * Set new password for user with token
   */
  @ApiBody({
    description: 'Password reset data',
    schema: {
      properties: {
        password: { type: 'string' },
        token: { type: 'string' },
      },
      type: 'object',
    },
  })
  @ApiOkResponse({ description: 'Password reset successfully', type: Boolean })
  @ApiOperation({ description: 'Set new password for user with token', summary: 'Reset password' })
  @Post('password/reset')
  @Roles(RoleEnum.S_EVERYONE)
  async resetPassword(@Body('token') token: string, @Body('password') password: string): Promise<boolean> {
    return !!(await this.userService.resetPassword(token, password));
  }

  /**
   * Verify user with email
   */
  @ApiBody({
    description: 'Verification token',
    schema: {
      properties: {
        token: { type: 'string' },
      },
      type: 'object',
    },
  })
  @ApiOkResponse({ description: 'User verified successfully', type: Boolean })
  @ApiOperation({ description: 'Verify user with email', summary: 'Verify user' })
  @Post('verify')
  @Roles(RoleEnum.S_EVERYONE)
  async verifyUser(@Body('token') token: string): Promise<boolean> {
    return !!(await this.userService.verify(token));
  }

  // ===========================================================================
  // PATCH Endpoints (Updates)
  // ===========================================================================

  /**
   * Update existing user
   */
  @ApiBearerAuth()
  @ApiBody({ type: UserInput })
  @ApiOkResponse({ description: 'User updated successfully', type: User })
  @ApiOperation({ description: 'Update existing user', summary: 'Update user' })
  @ApiParam({ description: 'User ID', name: 'id', type: String })
  @Patch(':id')
  @Roles(RoleEnum.S_USER)
  async updateUser(@CurrentUser() currentUser: User, @Param('id') id: string, @Body() input: UserInput): Promise<User> {
    const serviceOptions: ServiceOptions = {
      currentUser,
      inputType: UserInput,
      roles: [RoleEnum.ADMIN, RoleEnum.S_CREATOR, RoleEnum.S_SELF],
    };
    return await this.userService.update(id, input, serviceOptions);
  }

  // ===========================================================================
  // DELETE Endpoints
  // ===========================================================================

  /**
   * Delete existing user
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'User deleted successfully', type: User })
  @ApiOperation({ description: 'Delete existing user', summary: 'Delete user' })
  @ApiParam({ description: 'User ID', name: 'id', type: String })
  @Delete(':id')
  @Roles(RoleEnum.S_USER)
  async deleteUser(@CurrentUser() currentUser: User, @Param('id') id: string): Promise<User> {
    const serviceOptions: ServiceOptions = {
      currentUser,
      roles: [RoleEnum.ADMIN, RoleEnum.S_CREATOR, RoleEnum.S_SELF],
    };
    return await this.userService.delete(id, serviceOptions);
  }
}
