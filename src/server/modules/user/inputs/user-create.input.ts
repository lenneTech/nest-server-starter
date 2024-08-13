import { CoreUserCreateInput, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { InputType } from '@nestjs/graphql';

/**
 * User input to create a new user
 */
@Restricted(RoleEnum.ADMIN)
@InputType({ description: 'User input to create a new user' })
export class UserCreateInput extends CoreUserCreateInput {
  // Extend UserCreateInput here
}
