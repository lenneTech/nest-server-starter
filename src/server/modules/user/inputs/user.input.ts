import { CoreUserInput, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { InputType } from '@nestjs/graphql';

/**
 * User input to update a user
 */
@InputType({ description: 'User input' })
@Restricted(RoleEnum.ADMIN)
export class UserInput extends CoreUserInput {
  // Extend UserInput here
}
