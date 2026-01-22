import { CoreBetterAuthModule } from '@lenne.tech/nest-server';
import { DynamicModule, Module } from '@nestjs/common';

import { IamController } from './iam.controller';
import { IamResolver } from './iam.resolver';

/**
 * Project-specific IAM (Better-Auth) module
 *
 * Zero-Config: All values are auto-read from ConfigService (set by CoreModule.forRoot)
 * To disable IAM, set `betterAuth: false` in config.env.ts
 */
@Module({})
export class IamModule {
  static forRoot(): DynamicModule {
    return {
      exports: [CoreBetterAuthModule],
      imports: [
        CoreBetterAuthModule.forRoot({
          controller: IamController,
          registerRolesGuardGlobally: true,
          resolver: IamResolver,
        }),
      ],
      module: IamModule,
    };
  }
}
