import { CorePersistenceModel, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { Field, ObjectType } from '@nestjs/graphql';
import { Prop } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import mongoose = require('mongoose');

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
@Restricted(RoleEnum.ADMIN)
export abstract class PersistenceModel extends CorePersistenceModel {
  // ===================================================================================================================
  // Properties
  // ===================================================================================================================

  /**
   * ID of the user who created the object
   *
   * Not set when created by system
   */
  @Field(() => User, {
    description: 'ID of the user who created the object',
    nullable: true,
  })
  @Prop({ ref: 'User', type: mongoose.Schema.Types.ObjectId })
  @Restricted(RoleEnum.ADMIN)
  createdBy?: string | Types.ObjectId;

  /**
   * ID of the user who updated the object
   *
   * Not set when updated by system
   */
  @Field(() => User, {
    description: 'ID of the user who updated the object',
    nullable: true,
  })
  @Prop({ ref: 'User', type: mongoose.Schema.Types.ObjectId })
  @Restricted(RoleEnum.ADMIN)
  updatedBy?: string | Types.ObjectId;

  // ===================================================================================================================
  // Methods
  // ===================================================================================================================

  /**
   * Initialize instance with default values instead of undefined
   */
  override init() {
    super.init();
    // Nothing more to initialize yet
    return this;
  }

  /**
   * Map input
   */
  override map(input) {
    super.map(input);
    // There is nothing to map yet. Non-primitive variables should always be mapped.
    // If something comes up, you can use `mapClasses` / `mapClassesAsync` from ModelHelper.
    return this;
  }
}
