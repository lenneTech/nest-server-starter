import { CoreAuthService, CoreModule } from '@lenne.tech/nest-server';
import { Module } from '@nestjs/common';
import envConfig from '../config.env';
import { AuthModule } from './modules/auth/auth.module';
import { FileController } from './modules/file/file.controller';
import { ServerController } from './server.controller';
import { MetaModule } from './modules/meta/meta.module';

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

    // Include AuthModule for authorization handling,
    // which will also include UserModule
    AuthModule.forRoot(envConfig.jwt),

    // Include MetaModule to offer information about the server
    MetaModule,
  ],

  // Include REST controllers
  controllers: [FileController, ServerController],

  // Exports (a.o. for testing)
  exports: [CoreModule, AuthModule, MetaModule],
})
export class ServerModule {}
