import { CorePersistenceModel } from '@lenne.tech/nest-server';
import { Field, ObjectType } from '@nestjs/graphql';
import { User } from '../../modules/user/user.model';
import { Schema, Types } from 'mongoose';
import { Prop, Schema as MongooseSchema } from '@nestjs/mongoose';

/**
 * Metadata for persistent objects
 *
 * The models are a combination of MikroORM Entities and TypeGraphQL Types
 */
@ObjectType({
  description: 'Persistence model which will be saved in DB',
  isAbstract: true,
})
@MongooseSchema()
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
  @Prop({ type: Schema.Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId | User = undefined;

  /**
   * User who last updated the object
   *
   * Not set when updated by system
   */
  @Field(() => User, {
    description: 'User who last updated the object',
    nullable: true,
  })
  @Prop({ type: Schema.Types.ObjectId, ref: 'User' })
  updatedBy: Types.ObjectId | User = undefined;
}
