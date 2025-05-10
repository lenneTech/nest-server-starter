import { Any, CoreAuthService, CoreModule, DateScalar, JSON } from '@lenne.tech/nest-server';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import envConfig from '../config.env';
import { CronJobs } from './common/services/cron-jobs.service';
import { AuthModule } from './modules/auth/auth.module';
import { FileModule } from './modules/file/file.module';
import { MetaModule } from './modules/meta/meta.module';
import { ServerController } from './server.controller';

// Export imports for reuse (e.g. in tests)
export const imports = [
  // Include CoreModule for standard processes
  CoreModule.forRoot(CoreAuthService, AuthModule.forRoot(envConfig.jwt), envConfig),

  // Include cron job handling
  ScheduleModule.forRoot(),

  // Include AuthModule for authorization handling,
  // which will also include UserModule
  AuthModule.forRoot(envConfig.jwt),

  // Include MetaModule to offer information about the server
  MetaModule,

  // Include FileModule for file handling
  FileModule,
];

/**
 * Server module (dynamic)
 *
 * This is the server module, which includes all modules which are necessary
 * for the project API
 */
@Module({
  // Include REST controllers
  controllers: [ServerController],

  // Export modules for reuse in other modules
  exports: [CoreModule, AuthModule, MetaModule, FileModule],

  // Include modules
  imports,

  // Include services and scalars
  providers: [
    Any,
    CronJobs,
    DateScalar,
    JSON,
  ],
})
export class ServerModule {}
