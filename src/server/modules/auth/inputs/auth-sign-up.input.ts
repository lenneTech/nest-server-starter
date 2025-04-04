import { CoreAuthSignUpInput, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { Field, InputType } from '@nestjs/graphql';

/**
 * SignUp input
 */
@InputType({ description: 'Sign-up input' })
@Restricted(RoleEnum.ADMIN)
export class AuthSignUpInput extends CoreAuthSignUpInput {
  // ===================================================================================================================
  // Properties
  // ===================================================================================================================

  @Field({ description: 'firstName', nullable: true })
  @Restricted(RoleEnum.S_EVERYONE)
  firstName: string = undefined;

  @Field({ description: 'lastName', nullable: true })
  @Restricted(RoleEnum.S_EVERYONE)
  lastName: string = undefined;
}
