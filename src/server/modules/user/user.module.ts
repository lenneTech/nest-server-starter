import { ConfigService } from '@lenne.tech/nest-server';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
// #region graphql
import { PubSub } from 'graphql-subscriptions';
// #endregion graphql

// #region rest
import { AvatarController } from './avatar.controller';
import { UserController } from './user.controller';
// #endregion rest
import { User, UserSchema } from './user.model';
// #region graphql
import { UserResolver } from './user.resolver';
// #endregion graphql
import { UserService } from './user.service';

/**
 * User module
 */
@Module({
  // #region rest
  controllers: [AvatarController, UserController],
  // #endregion rest
  exports: [
    MongooseModule,
    // #region graphql
    UserResolver,
    // #endregion graphql
    UserService,
    'USER_CLASS',
  ],
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [
    // #region graphql
    UserResolver,
    // #endregion graphql
    ConfigService,
    UserService,
    {
      provide: 'USER_CLASS',
      useValue: User,
    },
    // #region graphql
    {
      provide: 'PUB_SUB',
      useValue: new PubSub(),
    },
    // #endregion graphql
  ],
})
export class UserModule {}
