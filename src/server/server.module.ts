import { CoreAuthService, CoreModule } from '@lenne.tech/nest-server';
import { Module } from '@nestjs/common';
import envConfig from '../config.env';
import { AuthModule } from './modules/auth/auth.module';
import { FileController } from './modules/file/file.controller';
import { FileResolver } from './modules/file/file.resolver';
import { FileService } from './modules/file/file.service';
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

    // Include AuthModule for authorization handling,
    // which will also include UserModule
    AuthModule.forRoot(envConfig.jwt),

    // Include MetaModule to offer information about the server
    MetaModule,
  ],

  // Include REST controllers
  controllers: [FileController, ServerController],

  // Include resolvers, services and other providers
  providers: [FileResolver, FileService],

  // Exports (a.o. for testing)
  exports: [CoreModule, AuthModule, MetaModule],
})
export class ServerModule {}
