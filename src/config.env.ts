import { IServerOptions, getEnvironmentConfig } from '@lenne.tech/nest-server';
import { CronExpression } from '@nestjs/schedule';
import * as dotenv from 'dotenv';
import { join } from 'path';

/**
 * Configuration for the different environments
 * See: https://github.com/lenneTech/nest-server/blob/main/src/core/common/interfaces/server-options.interface.ts
 *
 * Set all SECRET_OR_PRIVATE_KEYs at once via [lenne.Tech CLI](https://github.com/lenneTech/cli): lt server setConfigSecrets
 */
dotenv.config();
export const config: { [env: string]: Partial<IServerOptions> } = {
  // ===========================================================================
  // CI environment
  // ===========================================================================
  ci: {
    automaticObjectIdFiltering: true,
    compression: true,
    cookies: false,
    cronJobs: {
      sayHello: {
        cronTime: CronExpression.EVERY_5_MINUTES,
        disabled: true,
        runOnInit: false,
        timeZone: 'Europe/Berlin',
      },
    },
    email: {
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter CI',
      },
      smtp: {
        auth: {
          pass: 'jpvTwGYeSajEqDvRKT',
          user: 'cade72@ethereal.email',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
    },
    env: 'ci',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        introspection: true,
        playground: true,
      },
      maxComplexity: 1000,
    },
    healthCheck: {
      configs: {
        database: {
          enabled: true,
        },
      },
      enabled: true,
    },
    hostname: '127.0.0.1',
    ignoreSelectionsForPopulate: true,
    jwt: {
      // Each secret should be unique and not reused in other environments,
      // also the JWT secret should be different from the Refresh secret!
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      refresh: {
        renewal: true,
        // Each secret should be unique and not reused in other environments,
        // also the JWT secret should be different from the Refresh secret!
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // Can be created via [lenne.Tech CLI](https://github.com/lenneTech/cli): lt server createSecret
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_CI_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
      sameTokenIdPeriod: 2000,
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_CI',
      signInOptions: {
        expiresIn: '15m',
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      modelDocumentation: false,
      uri: 'mongodb://mongo:27017/nest-server-ci',
    },
    port: 3000,
    security: {
      checkResponseInterceptor: {
        checkObjectItself: false,
        debug: false,
        ignoreUndefined: true,
        mergeRoles: true,
        noteCheckedObjects: true,
        removeUndefinedFromResultArray: true,
        throwError: false,
      },
      checkSecurityInterceptor: {
        debug: false,
        noteCheckedObjects: true,
      },
      mapAndValidatePipe: true,
    },
    sha256: true,
    staticAssets: {
      options: { prefix: '' },
      path: join(__dirname, '..', 'public'),
    },
    templates: {
      engine: 'ejs',
      path: join(__dirname, 'assets', 'templates'),
    },
  },

  // ===========================================================================
  // Develop environment
  // ===========================================================================
  develop: {
    automaticObjectIdFiltering: true,
    compression: true,
    cookies: false,
    email: {
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Develop',
      },
      smtp: {
        auth: {
          pass: 'jpvTwGYeSajEqDvRKT',
          user: 'cade72@ethereal.email',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
    },
    env: 'develop',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        introspection: true,
        playground: true,
      },
      maxComplexity: 1000,
    },
    healthCheck: {
      configs: {
        database: {
          enabled: true,
        },
      },
      enabled: true,
    },
    ignoreSelectionsForPopulate: true,
    jwt: {
      // Each secret should be unique and not reused in other environments,
      // also the JWT secret should be different from the Refresh secret!
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      refresh: {
        renewal: true,
        // Each secret should be unique and not reused in other environments,
        // also the JWT secret should be different from the Refresh secret!
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // Can be created via [lenne.Tech CLI](https://github.com/lenneTech/cli): lt server createSecret
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_DEV_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
      sameTokenIdPeriod: 2000,
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_DEV',
      signInOptions: {
        expiresIn: '15m',
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      uri: 'mongodb://overlay_mongo1/nest-server-develop',
    },
    port: 3000,
    security: {
      checkResponseInterceptor: {
        checkObjectItself: false,
        debug: false,
        ignoreUndefined: true,
        mergeRoles: true,
        noteCheckedObjects: true,
        removeUndefinedFromResultArray: true,
        throwError: false,
      },
      checkSecurityInterceptor: {
        debug: false,
        noteCheckedObjects: true,
      },
      mapAndValidatePipe: true,
    },
    sha256: true,
    staticAssets: {
      options: { prefix: '' },
      path: join(__dirname, '..', 'public'),
    },
    templates: {
      engine: 'ejs',
      path: join(__dirname, 'assets', 'templates'),
    },
  },

  // ===========================================================================
  // Local environment
  // ===========================================================================
  local: {
    automaticObjectIdFiltering: true,
    compression: true,
    cookies: false,
    cronJobs: {
      sayHello: {
        cronTime: CronExpression.EVERY_5_MINUTES,
        disabled: true,
        runOnInit: false,
        timeZone: 'Europe/Berlin',
      },
    },
    email: {
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Local',
      },
      smtp: {
        auth: {
          pass: 'jpvTwGYeSajEqDvRKT',
          user: 'cade72@ethereal.email',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
    },
    env: 'local',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        introspection: true,
        playground: true,
      },
      maxComplexity: 1000,
    },
    healthCheck: {
      configs: {
        database: {
          enabled: true,
        },
      },
      enabled: true,
    },
    hostname: '127.0.0.1',
    ignoreSelectionsForPopulate: true,
    jwt: {
      // Each secret should be unique and not reused in other environments,
      // also the JWT secret should be different from the Refresh secret!
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      refresh: {
        renewal: true,
        // Each secret should be unique and not reused in other environments,
        // also the JWT secret should be different from the Refresh secret!
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // Can be created via [lenne.Tech CLI](https://github.com/lenneTech/cli): lt server createSecret
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_LOCAL_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
      sameTokenIdPeriod: 2000,
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_LOCAL',
      signInOptions: {
        expiresIn: '15m',
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      modelDocumentation: false,
      uri: 'mongodb://127.0.0.1/nest-server-local',
    },
    port: 3000,
    security: {
      checkResponseInterceptor: {
        checkObjectItself: false,
        debug: false,
        ignoreUndefined: true,
        mergeRoles: true,
        noteCheckedObjects: true,
        removeUndefinedFromResultArray: true,
        throwError: false,
      },
      checkSecurityInterceptor: {
        debug: false,
        noteCheckedObjects: true,
      },
      mapAndValidatePipe: true,
    },
    sha256: true,
    staticAssets: {
      options: { prefix: '' },
      path: join(__dirname, '..', 'public'),
    },
    templates: {
      engine: 'ejs',
      path: join(__dirname, 'assets', 'templates'),
    },
  },

  // ===========================================================================
  // Production environment
  // ===========================================================================
  production: {
    automaticObjectIdFiltering: true,
    compression: true,
    cookies: false,
    email: {
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Productive',
      },
      smtp: {
        auth: {
          pass: 'jpvTwGYeSajEqDvRKT',
          user: 'cade72@ethereal.email',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
    },
    env: 'production',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        introspection: true,
        playground: false,
      },
      maxComplexity: 1000,
    },
    healthCheck: {
      configs: {
        database: {
          enabled: true,
        },
      },
      enabled: true,
    },
    ignoreSelectionsForPopulate: true,
    jwt: {
      // Each secret should be unique and not reused in other environments,
      // also the JWT secret should be different from the Refresh secret!
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // Can be created via [lenne.Tech CLI](https://github.com/lenneTech/cli): lt server createSecret
      refresh: {
        renewal: true,
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_PROD_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
      sameTokenIdPeriod: 2000,
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PROD',
      signInOptions: {
        expiresIn: '15m',
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      uri: 'mongodb://overlay_mongo1/nest-server-prod',
    },
    port: 3000,
    security: {
      checkResponseInterceptor: {
        checkObjectItself: false,
        debug: false,
        ignoreUndefined: true,
        mergeRoles: true,
        noteCheckedObjects: true,
        removeUndefinedFromResultArray: true,
        throwError: false,
      },
      checkSecurityInterceptor: {
        debug: false,
        noteCheckedObjects: true,
      },
      mapAndValidatePipe: true,
    },
    sha256: true,
    staticAssets: {
      options: { prefix: '' },
      path: join(__dirname, '..', 'public'),
    },
    templates: {
      engine: 'ejs',
      path: join(__dirname, 'assets', 'templates'),
    },
  },

  // ===========================================================================
  // Test environment
  // ===========================================================================
  test: {
    automaticObjectIdFiltering: true,
    compression: true,
    cookies: false,
    email: {
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Test',
      },
      smtp: {
        auth: {
          pass: 'jpvTwGYeSajEqDvRKT',
          user: 'cade72@ethereal.email',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
    },
    env: 'test',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        introspection: true,
        playground: true,
      },
      maxComplexity: 1000,
    },
    healthCheck: {
      configs: {
        database: {
          enabled: true,
        },
      },
      enabled: true,
    },
    ignoreSelectionsForPopulate: true,
    jwt: {
      // Each secret should be unique and not reused in other environments,
      // also the JWT secret should be different from the Refresh secret!
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      refresh: {
        renewal: true,
        // Each secret should be unique and not reused in other environments,
        // also the JWT secret should be different from the Refresh secret!
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // Can be created via [lenne.Tech CLI](https://github.com/lenneTech/cli): lt server createSecret
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_TEST_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
      sameTokenIdPeriod: 2000,
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_TEST',
      signInOptions: {
        expiresIn: '15m',
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      uri: 'mongodb://overlay_mongo1/nest-server-test',
    },
    port: 3000,
    security: {
      checkResponseInterceptor: {
        checkObjectItself: false,
        debug: false,
        ignoreUndefined: true,
        mergeRoles: true,
        noteCheckedObjects: true,
        removeUndefinedFromResultArray: true,
        throwError: false,
      },
      checkSecurityInterceptor: {
        debug: false,
        noteCheckedObjects: true,
      },
      mapAndValidatePipe: true,
    },
    sha256: true,
    staticAssets: {
      options: { prefix: '' },
      path: join(__dirname, '..', 'public'),
    },
    templates: {
      engine: 'ejs',
      path: join(__dirname, 'assets', 'templates'),
    },
  },
};

/**
 * Export config merged with other configs and environment variables as default
 */
export default getEnvironmentConfig({ config });
