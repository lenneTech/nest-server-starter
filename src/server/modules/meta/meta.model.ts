import { Field, ObjectType } from '@nestjs/graphql';
import { CoreModel } from '@lenne.tech/nest-server';

/**
 * Meta model
 */
@ObjectType({ description: 'Metadata of API' })
export class Meta extends CoreModel {
  // ===================================================================================================================
  // Properties
  // ===================================================================================================================

  /**
   * Environment of API
   */
  @Field({ description: 'Environment of API' })
  environment: string = undefined;

  /**
   * Name of API
   */
  @Field({ description: 'Title of API' })
  title: string = undefined;

  /**
   * Package title of API
   */
  @Field({ description: 'Package name of API' })
  package: string = undefined;

  /**
   * Version of API
   */
  @Field({ description: 'Version of API' })
  version: string = undefined;
}
