import { CoreAuthModule, EmailService } from '@lenne.tech/nest-server';
import { JwtModuleOptions } from '@nestjs/jwt';
import { DynamicModule, Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { UserService } from '../user/user.service';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';

/**
 * CoreAuthModule to handle user authentication
 */
@Module({})
export class AuthModule {
  /**
   * Dynamic module
   * see https://docs.nestjs.com/modules#dynamic-modules
   */
  static forRoot(options: JwtModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        CoreAuthModule.forRoot(UserModule, UserService, {
          ...options,
          ...{
            // imports: [], // Integrate additional Services here to resolve dependencies
            // providers: [] // Integrate additional Providers here to resolve dependencies
          },
        }),
        EmailService,
      ],
      providers: [AuthResolver, AuthService],
      exports: [AuthResolver, CoreAuthModule],
    };
  }
}
