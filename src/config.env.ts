import { IServerOptions, merge } from '@lenne.tech/nest-server';
import { CronExpression } from '@nestjs/schedule';
import { join } from 'path';

/**
 * Configuration for the different environments
 * See: https://github.com/lenneTech/nest-server/blob/main/src/core/common/interfaces/server-options.interface.ts
 */
export const config: { [env: string]: Partial<IServerOptions> } = {
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
        timeZone: 'Europe/Berlin',
        runOnInit: false,
      },
    },
    email: {
      smtp: {
        auth: {
          user: 'cade72@ethereal.email',
          pass: 'jpvTwGYeSajEqDvRKT',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Local',
      },
    },
    env: 'local',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
      maxComplexity: 20,
    },
    ignoreSelectionsForPopulate: true,
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_LOCAL',
      signInOptions: {
        expiresIn: '15m',
      },
      refresh: {
        renewal: true,
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_LOCAL_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      uri: 'mongodb://127.0.0.1/nest-server-local',
    },
    port: 3000,
    sha256: true,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '' },
    },
    templates: {
      path: join(__dirname, 'assets', 'templates'),
      engine: 'ejs',
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
      smtp: {
        auth: {
          user: 'cade72@ethereal.email',
          pass: 'jpvTwGYeSajEqDvRKT',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Develop',
      },
    },
    env: 'develop',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
      maxComplexity: 20,
    },
    ignoreSelectionsForPopulate: true,
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_DEV',
      signInOptions: {
        expiresIn: '15m',
      },
      refresh: {
        renewal: true,
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_DEV_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      uri: 'mongodb://overlay_mongo1/nest-server-develop',
    },
    port: 3000,
    sha256: true,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '' },
    },
    templates: {
      path: join(__dirname, 'assets', 'templates'),
      engine: 'ejs',
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
      smtp: {
        auth: {
          user: 'cade72@ethereal.email',
          pass: 'jpvTwGYeSajEqDvRKT',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Test',
      },
    },
    env: 'test',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
      maxComplexity: 20,
    },
    ignoreSelectionsForPopulate: true,
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_TEST',
      signInOptions: {
        expiresIn: '15m',
      },
      refresh: {
        renewal: true,
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_TEST_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      uri: 'mongodb://overlay_mongo1/nest-server-test',
    },
    port: 3000,
    sha256: true,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '' },
    },
    templates: {
      path: join(__dirname, 'assets', 'templates'),
      engine: 'ejs',
    },
  },

  // ===========================================================================
  // Preview environment
  // ===========================================================================
  preview: {
    automaticObjectIdFiltering: true,
    compression: true,
    cookies: false,
    email: {
      smtp: {
        auth: {
          user: 'cade72@ethereal.email',
          pass: 'jpvTwGYeSajEqDvRKT',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Preview',
      },
    },
    env: 'preview',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
      maxComplexity: 20,
    },
    ignoreSelectionsForPopulate: true,
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PREV',
      signInOptions: {
        expiresIn: '15m',
      },
      refresh: {
        renewal: true,
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_PREV_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      uri: 'mongodb://overlay_mongo1/nest-server-preview',
    },
    port: 3000,
    sha256: true,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '' },
    },
    templates: {
      path: join(__dirname, 'assets', 'templates'),
      engine: 'ejs',
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
      smtp: {
        auth: {
          user: 'cade72@ethereal.email',
          pass: 'jpvTwGYeSajEqDvRKT',
        },
        host: 'mailhog.lenne.tech',
        port: 1025,
        secure: false,
      },
      defaultSender: {
        email: 'cade72@ethereal.email',
        name: 'Nest Server Starter Productive',
      },
    },
    env: 'production',
    execAfterInit: 'npm run docs:bootstrap',
    filter: {
      maxLimit: null,
    },
    graphQl: {
      driver: {
        debug: false,
        introspection: true,
        playground: false,
      },
      maxComplexity: 20,
    },
    ignoreSelectionsForPopulate: true,
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PROD',
      signInOptions: {
        expiresIn: '15m',
      },
      refresh: {
        renewal: true,
        // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
        // tslint:disable-next-line:max-line-length
        secret: 'SECRET_OR_PRIVATE_KEY_PROD_REFRESH',
        signInOptions: {
          expiresIn: '7d',
        },
      },
    },
    loadLocalConfig: false,
    logExceptions: true,
    mongoose: {
      uri: 'mongodb://overlay_mongo1/nest-server-prod',
    },
    port: 3000,
    sha256: true,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '' },
    },
    templates: {
      path: join(__dirname, 'assets', 'templates'),
      engine: 'ejs',
    },
  },
};

/**
 * Environment specific config
 *
 * default: local
 */
const env = process.env['NODE' + '_ENV'] || 'local';
const envConfig = config[env] || config.local;
console.info('Configured for: ' + envConfig.env + (env !== envConfig.env ? ' (requested: ' + env + ')' : ''));

// Merge with localConfig (e.g. config.json)
if (envConfig.loadLocalConfig) {
  let localConfig;
  if (typeof envConfig.loadLocalConfig === 'string') {
    localConfig = require(envConfig.loadLocalConfig);
    merge(envConfig, localConfig);
  } else {
    try {
      // get config from src directory
      localConfig = require(__dirname + '/config.json');
      merge(envConfig, localConfig);
    } catch {
      try {
        // if not found try to find in project directory
        localConfig = require(__dirname + '/../config.json');
        merge(envConfig, localConfig);
      } catch (e) {
        // No config.json found => nothing to do
      }
    }
  }
}

/**
 * Export envConfig as default
 */
export default envConfig;
