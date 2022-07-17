import { IServerOptions, merge } from '@lenne.tech/nest-server';
import { CronExpression } from '@nestjs/schedule';
import { join } from 'path';

/**
 * Configuration for the different environments
 */
export const config: { [env: string]: Partial<IServerOptions> } = {
  // ===========================================================================
  // Local environment
  // ===========================================================================
  local: {
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
          user: 'thalia.gerhold24@ethereal.email',
          pass: 'G98EMVGcGKC7bmKahF',
        },
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      defaultSender: {
        email: 'thalia.gerhold24@ethereal.email',
        name: 'Thalia Gerhold',
      },
    },
    env: 'local',
    execAfterInit: 'npm run docs:bootstrap',
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
    },
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_LOCAL',
    },
    loadLocalConfig: false,
    mongoose: {
      uri: 'mongodb://localhost/nest-server-local',
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
    email: {
      smtp: {
        auth: {
          user: 'thalia.gerhold24@ethereal.email',
          pass: 'G98EMVGcGKC7bmKahF',
        },
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      defaultSender: {
        email: 'thalia.gerhold24@ethereal.email',
        name: 'Thalia Gerhold',
      },
    },
    env: 'develop',
    execAfterInit: 'npm run docs:bootstrap',
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
    },
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_DEV',
    },
    loadLocalConfig: false,
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
    email: {
      smtp: {
        auth: {
          user: 'thalia.gerhold24@ethereal.email',
          pass: 'G98EMVGcGKC7bmKahF',
        },
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      defaultSender: {
        email: 'thalia.gerhold24@ethereal.email',
        name: 'Thalia Gerhold',
      },
    },
    env: 'test',
    execAfterInit: 'npm run docs:bootstrap',
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
    },
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_TEST',
    },
    loadLocalConfig: false,
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
    email: {
      smtp: {
        auth: {
          user: 'thalia.gerhold24@ethereal.email',
          pass: 'G98EMVGcGKC7bmKahF',
        },
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      defaultSender: {
        email: 'thalia.gerhold24@ethereal.email',
        name: 'Thalia Gerhold',
      },
    },
    env: 'preview',
    execAfterInit: 'npm run docs:bootstrap',
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
    },
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PREV',
    },
    loadLocalConfig: false,
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
  // Productive environment
  // ===========================================================================
  productive: {
    email: {
      smtp: {
        auth: {
          user: 'thalia.gerhold24@ethereal.email',
          pass: 'G98EMVGcGKC7bmKahF',
        },
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      defaultSender: {
        email: 'thalia.gerhold24@ethereal.email',
        name: 'Thalia Gerhold',
      },
    },
    env: 'productive',
    execAfterInit: 'npm run docs:bootstrap',
    graphQl: {
      driver: {
        debug: false,
        introspection: true,
        playground: false,
      },
    },
    jwt: {
      // crypto.randomBytes(512).toString('base64') (see https://nodejs.org/api/crypto.html#crypto)
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PROD',
    },
    loadLocalConfig: false,
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
console.log('Configured for: ' + envConfig.env + (env !== envConfig.env ? ' (requested: ' + env + ')' : ''));

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
