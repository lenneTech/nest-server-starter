import { CoreAuthSignInInput, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { InputType } from '@nestjs/graphql';

/**
 * SignIn input
 */
@InputType({ description: 'Sign-in input' })
@Restricted(RoleEnum.ADMIN)
export class AuthSignInInput extends CoreAuthSignInInput {
  // Extend UserInput here
}
