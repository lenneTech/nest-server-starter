import { CoreAuthSignInInput, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { InputType } from '@nestjs/graphql';

/**
 * SignIn input
 */
@Restricted(RoleEnum.ADMIN)
@InputType({ description: 'Sign-in input' })
export class AuthSignInInput extends CoreAuthSignInInput {
  // Extend UserInput here
}
