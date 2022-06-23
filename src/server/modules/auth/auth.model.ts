import { CoreAuthModel, mapClasses } from '@lenne.tech/nest-server';
import { Field, ObjectType } from '@nestjs/graphql';
import { User } from '../user/user.model';

/**
 * Authentication data
 */
@ObjectType({ description: 'Authentication data' })
export class Auth extends CoreAuthModel {
  // ===================================================================================================================
  // Properties
  // ===================================================================================================================

  /**
   * Signed-in user
   */
  @Field(() => User, { description: 'User who signed in' })
  user: User = undefined;

  // ===================================================================================================================
  // Methods
  // ===================================================================================================================

  /**
   * Initialize instance with default values instead of undefined
   */
  init() {
    super.init();
    // Nothing more to initialize yet
    return this;
  }

  /**
   * Map input
   */
  map(input) {
    super.map(input);
    return mapClasses(input, { user: User }, this);
  }
}
