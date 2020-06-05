import { CorePersistenceModel } from '@lenne.tech/nest-server';
import { Field, ObjectType } from '@nestjs/graphql';
import { Column } from 'typeorm';
import { User } from '../../modules/user/user.model';

/**
 * Metadata for persistent objects
 *
 * The models are a combination of TypeORM Entities and TypeGraphQL Types
 */
@ObjectType({
  description: 'Persistence model which will be saved in DB',
  isAbstract: true,
})
export abstract class PersistenceModel extends CorePersistenceModel {
  /**
   * User who created the object
   *
   * Not set when created by system
   */
  @Field((type) => User, {
    description: 'User who created the object',
    nullable: true,
  })
  @Column('varchar')
  createdBy?: string | User;

  /**
   * IDs of the Owners
   */
  @Field((type) => [String], {
    description: 'Users who own the object',
    nullable: 'items',
  })
  @Column('simple-array')
  ownerIds: string[] = [];

  /**
   * User who last updated the object
   *
   * Not set when updated by system
   */
  @Field((type) => User, {
    description: 'User who last updated the object',
    nullable: true,
  })
  @Column('varchar')
  updatedBy?: string | User;
}
