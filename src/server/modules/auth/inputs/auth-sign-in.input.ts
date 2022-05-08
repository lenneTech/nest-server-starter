import { CoreAuthSignInInput } from '@lenne.tech/nest-server';
import { InputType } from '@nestjs/graphql';

/**
 * SignIn input
 */
@InputType({ description: 'Sign-in input' })
export class AuthSignInInput extends CoreAuthSignInInput {
  // Extend UserInput here
}
