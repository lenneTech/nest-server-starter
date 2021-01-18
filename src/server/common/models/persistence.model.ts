import { CorePersistenceModel } from '@lenne.tech/nest-server';
import { Entity, ManyToOne, Property } from '@mikro-orm/core';
import { Field, ObjectType } from '@nestjs/graphql';
import { User } from '../../modules/user/user.model';

/**
 * Metadata for persistent objects
 *
 * The models are a combination of MikroORM Entities and TypeGraphQL Types
 */
@ObjectType({
  description: 'Persistence model which will be saved in DB',
  isAbstract: true,
})
@Entity()
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
  @ManyToOne()
  createdBy?: User = undefined;

  /**
   * IDs of the Owners
   */
  @Field((type) => [String], {
    description: 'Users who own the object',
    nullable: 'items',
  })
  @Property()
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
  @ManyToOne()
  updatedBy: User = undefined;
}
