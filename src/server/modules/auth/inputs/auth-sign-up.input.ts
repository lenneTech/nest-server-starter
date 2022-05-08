import { CoreAuthSignUpInput } from '@lenne.tech/nest-server';
import { Field, InputType } from '@nestjs/graphql';

/**
 * SignUp input
 */
@InputType({ description: 'Description for AuthSignUpInput' })
export class AuthSignUpInput extends CoreAuthSignUpInput {
  // ===================================================================================================================
  // Properties
  // ===================================================================================================================

  @Field({ description: 'firstName', nullable: true })
  firstName: string = undefined;

  @Field({ description: 'lastName', nullable: true })
  lastName: string = undefined;
}
