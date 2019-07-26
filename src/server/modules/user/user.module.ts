import { ConfigService, JSON } from '@lenne.tech/nest-server';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvatarController } from './avatar.controller';
import { User } from './user.model';
import { UserResolver } from './user.resolver';
import { UserService } from './user.service';

/**
 * User module
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AvatarController],
  providers: [JSON, UserResolver, UserService, ConfigService],
  exports: [JSON, TypeOrmModule, UserResolver, UserService],
})
export class UserModule {
}
