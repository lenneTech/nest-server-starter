import { CoreBetterAuthModule, IBetterAuth } from '@lenne.tech/nest-server';
import { DynamicModule, Module } from '@nestjs/common';

import { IamController } from './iam.controller';

/**
 * Options for IamModule.forRoot()
 */
export interface IamModuleOptions {
  /**
   * IAM configuration.
   * - `true`: Enable with defaults
   * - `false`: Disable IAM
   * - `{ ... }`: Custom configuration
   */
  config: boolean | IBetterAuth;

  /**
   * Fallback secrets for backwards compatibility with JWT config.
   */
  fallbackSecrets?: (string | undefined)[];
}

/**
 * Project-specific IAM (Better-Auth) module wrapping CoreBetterAuthModule
 */
@Module({})
export class IamModule {
  static forRoot(options: IamModuleOptions): DynamicModule {
    const { config, fallbackSecrets } = options;

    // Return minimal module if IAM is disabled
    const isDisabled = config === false || (typeof config === 'object' && config?.enabled === false);
    if (isDisabled) {
      return {
        exports: [],
        module: IamModule,
        providers: [],
      };
    }

    return {
      exports: [CoreBetterAuthModule],
      imports: [
        CoreBetterAuthModule.forRoot({
          config,
          controller: IamController,
          fallbackSecrets,
        }),
      ],
      module: IamModule,
      providers: [],
    };
  }
}
