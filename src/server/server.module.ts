import { Any, CheckSecurityInterceptor, CoreAuthService, CoreModule, DateScalar, JSON } from '@lenne.tech/nest-server';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import envConfig from '../config.env';
import { CronJobs } from './common/services/cron-jobs.service';
import { AuthModule } from './modules/auth/auth.module';
import { FileModule } from './modules/file/file.module';
import { MetaModule } from './modules/meta/meta.module';
import { ServerController } from './server.controller';

/**
 * Server module (dynamic)
 *
 * This is the server module, which includes all modules which are necessary
 * for the project API
 */
@Module({
  // Include modules
  imports: [
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
  ],

  // Include services and scalars
  providers: [
    Any,
    CronJobs,
    DateScalar,
    JSON,
    {
      provide: APP_INTERCEPTOR,
      useClass: CheckSecurityInterceptor,
    },
  ],

  // Include REST controllers
  controllers: [ServerController],

  // Export modules for reuse in other modules
  exports: [CoreModule, AuthModule, MetaModule, FileModule],
})
export class ServerModule {}
