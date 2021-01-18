import { CorePersistenceModel, CoreUserModel, JSON } from '@lenne.tech/nest-server';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { AvatarController } from './avatar.controller';
import { User } from './user.model';
import { UserResolver } from './user.resolver';
import { UserService } from './user.service';

/**
 * User module
 */
@Module({
  imports: [MikroOrmModule.forFeature([CorePersistenceModel, CoreUserModel, User])],
  controllers: [AvatarController],
  providers: [JSON, UserResolver, UserService],
  exports: [MikroOrmModule, UserResolver, UserService],
})
export class UserModule {}
