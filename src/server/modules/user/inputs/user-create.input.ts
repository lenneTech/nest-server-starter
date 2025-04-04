import { CoreUserCreateInput, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { InputType } from '@nestjs/graphql';

/**
 * User input to create a new user
 */
@InputType({ description: 'User input to create a new user' })
@Restricted(RoleEnum.ADMIN)
export class UserCreateInput extends CoreUserCreateInput {
  // Extend UserCreateInput here
}
