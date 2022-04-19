import { CorePersistenceModel } from '@lenne.tech/nest-server';
import { Field, ObjectType } from '@nestjs/graphql';
import { User } from '../../modules/user/user.model';
import * as mongoose from 'mongoose';
import { Prop, Schema } from '@nestjs/mongoose';

/**
 * Metadata for persistent objects
 *
 * The models are a combination of MikroORM Entities and TypeGraphQL Types
 */
@ObjectType({
  description: 'Persistence model which will be saved in DB',
  isAbstract: true,
})
@Schema()
export abstract class PersistenceModel extends CorePersistenceModel {
  /**
   * User who created the object
   *
   * Not set when created by system
   */
  @Field(() => User, {
    description: 'User who created the object',
    nullable: true,
  })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  createdBy?: User = undefined;

  /**
   * IDs of the Owners
   */
  @Field(() => [String], {
    description: 'Users who own the object',
    nullable: 'items',
  })
  @Prop([String])
  ownerIds: string[] = [];

  /**
   * User who last updated the object
   *
   * Not set when updated by system
   */
  @Field(() => User, {
    description: 'User who last updated the object',
    nullable: true,
  })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  updatedBy: User = undefined;
}
