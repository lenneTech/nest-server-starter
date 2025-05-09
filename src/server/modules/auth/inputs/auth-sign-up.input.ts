import { CoreAuthSignUpInput, Restricted, RoleEnum, UnifiedField } from '@lenne.tech/nest-server';
import { InputType } from '@nestjs/graphql';

/**
 * SignUp input
 */
@InputType({ description: 'Sign-up input' })
@Restricted(RoleEnum.ADMIN)
export class AuthSignUpInput extends CoreAuthSignUpInput {
  // ===================================================================================================================
  // Properties
  // ===================================================================================================================

  @UnifiedField({
    description: 'firstName',
    isOptional: true,
    roles: RoleEnum.S_EVERYONE,
  })
  firstName: string = undefined;

  @UnifiedField({
    description: 'lastName',
    isOptional: true,
    roles: RoleEnum.S_EVERYONE,
  })
  lastName: string = undefined;
}
