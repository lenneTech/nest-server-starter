import { CoreAuthSignUpInput, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { Field, InputType } from '@nestjs/graphql';

/**
 * SignUp input
 */
@Restricted(RoleEnum.ADMIN)
@InputType({ description: 'Sign-up input' })
export class AuthSignUpInput extends CoreAuthSignUpInput {
  // ===================================================================================================================
  // Properties
  // ===================================================================================================================

  @Restricted(RoleEnum.S_EVERYONE)
  @Field({ description: 'firstName', nullable: true })
  firstName: string = undefined;

  @Restricted(RoleEnum.S_EVERYONE)
  @Field({ description: 'lastName', nullable: true })
  lastName: string = undefined;
}
