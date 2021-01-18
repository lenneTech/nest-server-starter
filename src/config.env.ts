import { IServerOptions } from '@lenne.tech/nest-server';
import { join } from 'path';

/**
 * Configuration for the different environments
 */
const config: { [env: string]: Partial<IServerOptions> } = {
  // ===========================================================================
  // Development environment
  // ===========================================================================
  development: {
    email: {
      smtp: {
        auth: {
          user: 'everardo.hansen7@ethereal.email',
          pass: 'hP6dNm7eQn7QRTmWH2',
        },
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      defaultSender: {
        email: 'everardo.hansen7@ethereal.email',
        name: 'Everardo Hansen',
      },
    },
    env: 'development',
    graphQl: {
      debug: true,
      introspection: true,
      playground: true,
    },
    jwt: {
      // tslint:disable-next-line:max-line-length
      secretOrPrivateKey: 'SECRET_OR_PRIVATE_KEY_DEV',
    },
    mikroOrm: {
      autoLoadEntities: true,
      dbName: 'nest-server-dev',
      host: 'localhost',
      port: 27017,
      type: 'mongo',
    },
    port: 3000,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '/public/' },
    },
    templates: {
      path: join(__dirname, 'templates'),
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
          user: 'everardo.hansen7@ethereal.email',
          pass: 'hP6dNm7eQn7QRTmWH2',
        },
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      defaultSender: {
        email: 'everardo.hansen7@ethereal.email',
        name: 'Everardo Hansen',
      },
    },
    env: 'preview',
    graphQl: {
      debug: true,
      introspection: true,
      playground: true,
    },
    jwt: {
      // tslint:disable-next-line:max-line-length
      secretOrPrivateKey: 'SECRET_OR_PRIVATE_KEY_PREV',
    },
    mikroOrm: {
      autoLoadEntities: true,
      dbName: 'nest-server-test',
      host: 'localhost',
      port: 27017,
      type: 'mongo',
    },
    port: 3001,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '/public/' },
    },
    templates: {
      path: join(__dirname, 'templates'),
      engine: 'ejs',
    },
  },

  // ===========================================================================
  // Productive environment
  // ===========================================================================
  production: {
    email: {
      smtp: {
        auth: {
          user: 'everardo.hansen7@ethereal.email',
          pass: 'hP6dNm7eQn7QRTmWH2',
        },
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      defaultSender: {
        email: 'everardo.hansen7@ethereal.email',
        name: 'Everardo Hansen',
      },
    },
    env: 'productive',
    graphQl: {
      debug: false,
      introspection: true,
      playground: false,
    },
    jwt: {
      // tslint:disable-next-line:max-line-length
      secretOrPrivateKey: 'SECRET_OR_PRIVATE_KEY_PROD',
    },
    mikroOrm: {
      autoLoadEntities: true,
      dbName: 'nest-server-prod',
      host: 'localhost',
      port: 27017,
      type: 'mongo',
    },
    port: 3000,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '/public/' },
    },
    templates: {
      path: join(__dirname, 'templates'),
      engine: 'ejs',
    },
  },
};

/**
 * Environment specific config
 *
 * default: development
 */
const envConfig = config[process.env.NODE_ENV || 'development'] || config.development;

/**
 * Export envConfig as default
 */
export default envConfig;
