import {
  CoreBetterAuth2FASetupModel,
  CoreBetterAuthAuthModel,
  CoreBetterAuthFeaturesModel,
  CoreBetterAuthMigrationStatusModel,
  CoreBetterAuthPasskeyChallengeModel,
  CoreBetterAuthPasskeyModel,
  CoreBetterAuthResolver,
  CoreBetterAuthService,
  CoreBetterAuthSessionModel,
  CoreBetterAuthUserMapper,
  RoleEnum,
  Roles,
} from '@lenne.tech/nest-server';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request, Response } from 'express';

/**
 * Server IAM GraphQL Resolver (Reference Implementation)
 *
 * This resolver extends CoreBetterAuthResolver and can be customized
 * for project-specific requirements (e.g., additional fields, custom responses).
 *
 * NOTE: This is kept as a reference implementation. For new projects,
 * REST-only via IamController is recommended.
 *
 * The `isAbstract: true` pattern in NestJS GraphQL requires concrete classes
 * to explicitly override and decorate methods for them to be registered in the schema.
 *
 * @example
 * ```typescript
 * // Add custom behavior after sign-in
 * override async betterAuthSignIn(
 *   email: string,
 *   password: string,
 *   ctx: { req: Request; res: Response },
 * ) {
 *   const result = await super.betterAuthSignIn(email, password, ctx);
 *
 *   if (result.success) {
 *     await this.auditService.log('user_signed_in', result.user.email);
 *   }
 *
 *   return result;
 * }
 * ```
 */
@Resolver(() => CoreBetterAuthAuthModel)
@Roles(RoleEnum.ADMIN)
export class IamResolver extends CoreBetterAuthResolver {
  constructor(
    protected override readonly betterAuthService: CoreBetterAuthService,
    protected override readonly userMapper: CoreBetterAuthUserMapper,
  ) {
    super(betterAuthService, userMapper);
  }

  // -----------------------------------------------------------------------------------------------------------------
  // Public Queries
  // -----------------------------------------------------------------------------------------------------------------

  @Query(() => CoreBetterAuthSessionModel, {
    description: 'Get current IAM session',
    nullable: true,
  })
  @Roles(RoleEnum.S_USER)
  override async betterAuthSession(@Context() ctx: { req: Request }): Promise<CoreBetterAuthSessionModel | null> {
    return super.betterAuthSession(ctx);
  }

  @Query(() => CoreBetterAuthFeaturesModel, { description: 'Get enabled IAM features' })
  @Roles(RoleEnum.S_EVERYONE)
  override betterAuthFeatures(): CoreBetterAuthFeaturesModel {
    return super.betterAuthFeatures();
  }

  @Query(() => CoreBetterAuthMigrationStatusModel, {
    description: 'Get migration status from Legacy Auth to IAM - Admin only',
  })
  @Roles(RoleEnum.ADMIN)
  override async betterAuthMigrationStatus(): Promise<CoreBetterAuthMigrationStatusModel> {
    return super.betterAuthMigrationStatus();
  }

  @Query(() => [CoreBetterAuthPasskeyModel], {
    description: 'List passkeys for the current user',
    nullable: true,
  })
  @Roles(RoleEnum.S_USER)
  override async betterAuthListPasskeys(
    @Context() ctx: { req: Request },
  ): Promise<CoreBetterAuthPasskeyModel[] | null> {
    return super.betterAuthListPasskeys(ctx);
  }

  // -----------------------------------------------------------------------------------------------------------------
  // Authentication Mutations
  // -----------------------------------------------------------------------------------------------------------------

  @Mutation(() => CoreBetterAuthAuthModel, {
    description: 'Sign in via IAM (email/password)',
  })
  @Roles(RoleEnum.S_EVERYONE)
  override async betterAuthSignIn(
    @Args('email') email: string,
    @Args('password') password: string,
    @Context() ctx: { req: Request; res: Response },
  ): Promise<CoreBetterAuthAuthModel> {
    return super.betterAuthSignIn(email, password, ctx);
  }

  @Mutation(() => CoreBetterAuthAuthModel, {
    description: 'Sign up via IAM (email/password)',
  })
  @Roles(RoleEnum.S_EVERYONE)
  override async betterAuthSignUp(
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('name', { nullable: true }) name?: string,
  ): Promise<CoreBetterAuthAuthModel> {
    return super.betterAuthSignUp(email, password, name);
  }

  @Mutation(() => Boolean, { description: 'Sign out from IAM session' })
  @Roles(RoleEnum.S_USER)
  override async betterAuthSignOut(@Context() ctx: { req: Request }): Promise<boolean> {
    return super.betterAuthSignOut(ctx);
  }

  // -----------------------------------------------------------------------------------------------------------------
  // 2FA Mutations
  // -----------------------------------------------------------------------------------------------------------------

  @Mutation(() => CoreBetterAuthAuthModel, {
    description: 'Verify 2FA code during sign-in',
  })
  @Roles(RoleEnum.S_EVERYONE)
  override async betterAuthVerify2FA(
    @Args('code') code: string,
    @Context() ctx: { req: Request },
  ): Promise<CoreBetterAuthAuthModel> {
    return super.betterAuthVerify2FA(code, ctx);
  }

  @Mutation(() => CoreBetterAuth2FASetupModel, {
    description: 'Enable 2FA for the current user',
  })
  @Roles(RoleEnum.S_USER)
  override async betterAuthEnable2FA(
    @Args('password') password: string,
    @Context() ctx: { req: Request },
  ): Promise<CoreBetterAuth2FASetupModel> {
    return super.betterAuthEnable2FA(password, ctx);
  }

  @Mutation(() => Boolean, { description: 'Disable 2FA for the current user' })
  @Roles(RoleEnum.S_USER)
  override async betterAuthDisable2FA(
    @Args('password') password: string,
    @Context() ctx: { req: Request },
  ): Promise<boolean> {
    return super.betterAuthDisable2FA(password, ctx);
  }

  @Mutation(() => [String], {
    description: 'Generate new backup codes for 2FA',
    nullable: true,
  })
  @Roles(RoleEnum.S_USER)
  override async betterAuthGenerateBackupCodes(@Context() ctx: { req: Request }): Promise<null | string[]> {
    return super.betterAuthGenerateBackupCodes(ctx);
  }

  // -----------------------------------------------------------------------------------------------------------------
  // Passkey Mutations
  // -----------------------------------------------------------------------------------------------------------------

  @Mutation(() => CoreBetterAuthPasskeyChallengeModel, {
    description: 'Get passkey registration challenge for WebAuthn',
  })
  @Roles(RoleEnum.S_USER)
  override async betterAuthGetPasskeyChallenge(
    @Context() ctx: { req: Request },
  ): Promise<CoreBetterAuthPasskeyChallengeModel> {
    return super.betterAuthGetPasskeyChallenge(ctx);
  }

  @Mutation(() => Boolean, { description: 'Delete a passkey by ID' })
  @Roles(RoleEnum.S_USER)
  override async betterAuthDeletePasskey(
    @Args('passkeyId') passkeyId: string,
    @Context() ctx: { req: Request },
  ): Promise<boolean> {
    return super.betterAuthDeletePasskey(passkeyId, ctx);
  }
}
