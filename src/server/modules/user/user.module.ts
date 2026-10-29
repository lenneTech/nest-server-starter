import { ConfigService, CorePersistenceModule } from '@lenne.tech/nest-server';
// #region graphql
import { CoreRedisPubSub, CoreRedisService } from '@lenne.tech/nest-server';
// #endregion graphql
import { Module } from '@nestjs/common';
// #region graphql
import { PubSub } from 'graphql-subscriptions';
// #endregion graphql

// #region rest
import { FileModule } from '../file/file.module.js';
import { AvatarController } from './avatar.controller.js';
import { UserController } from './user.controller.js';
// #endregion rest
import { User, UserSchema } from './user.model.js';
// #region graphql
import { UserResolver } from './user.resolver.js';
// #endregion graphql
import { UserService } from './user.service.js';

/**
 * The user model, registered database-neutrally: `@InjectModel()` keeps working, and `database` in the configuration
 * decides whether users are stored in MongoDB or a SQL database (`CorePersistenceModule`)
 */
const UserPersistence = CorePersistenceModule.forFeature([{ model: User, name: User.name, schema: UserSchema }]);

/**
 * User module
 */
@Module({
  // #region rest
  controllers: [AvatarController, UserController],
  // #endregion rest
  exports: [
    UserPersistence,
    // #region graphql
    UserResolver,
    // #endregion graphql
    UserService,
    'USER_CLASS',
  ],
  imports: [
    UserPersistence,
    // #region rest
    // AvatarController stores the avatar in the central file storage (nest-server
    // 11.33.0+) instead of on pod-local disk, so it needs FileService.
    FileModule,
    // #endregion rest
  ],
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
      // Redis-backed when `redis` is configured, so subscriptions reach clients on
      // EVERY replica; the process-local in-memory PubSub otherwise (unchanged
      // behaviour for a single instance). A hardcoded `useValue: new PubSub()` would
      // silently stay single-replica after Redis is enabled.
      inject: [{ optional: true, token: CoreRedisService }],
      provide: 'PUB_SUB',
      useFactory: (redisService?: CoreRedisService) =>
        redisService?.enabled ? new CoreRedisPubSub(redisService) : new PubSub(),
    },
    // #endregion graphql
  ],
})
export class UserModule {}
