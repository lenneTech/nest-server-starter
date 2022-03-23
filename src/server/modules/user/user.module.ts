import { JSON } from '@lenne.tech/nest-server';
import { Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { AvatarController } from './avatar.controller';
import { User, UserSchema } from './user.model';
import { UserResolver } from './user.resolver';
import { UserService } from './user.service';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * User module
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [AvatarController],
  providers: [
    JSON,
    UserResolver,
    UserService,
    {
      provide: 'PUB_SUB',
      useValue: new PubSub(),
    },
  ],
  exports: [MongooseModule, UserResolver, UserService],
})
export class UserModule {}
