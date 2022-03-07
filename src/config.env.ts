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
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
    },
    jwt: {
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_DEV',
    },
    mongoose: {
      uri: 'mongodb://localhost/nest-dev',
    },
    port: 3000,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '/public/' },
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
    env: 'develop',
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
    },
    jwt: {
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PREV',
    },
    mongoose: {
      uri: 'mongodb://localhost/nest-develop',
    },
    port: 3001,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '/public/' },
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
    env: 'test',
    graphQl: {
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
    },
    jwt: {
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PREV',
    },
    mongoose: {
      uri: 'mongodb://localhost/nest-test',
    },
    port: 3001,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '/public/' },
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
      driver: {
        debug: true,
        introspection: true,
        playground: true,
      },
    },
    jwt: {
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PREV',
    },
    mongoose: {
      uri: 'mongodb://localhost/nest-preview',
    },
    port: 3001,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '/public/' },
    },
    templates: {
      path: join(__dirname, 'assets', 'templates'),
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
      driver: {
        debug: false,
        introspection: true,
        playground: false,
      },
    },
    jwt: {
      // tslint:disable-next-line:max-line-length
      secret: 'SECRET_OR_PRIVATE_KEY_PROD',
    },
    mongoose: {
      uri: 'mongodb://localhost/nest-prod',
    },
    port: 3000,
    staticAssets: {
      path: join(__dirname, '..', 'public'),
      options: { prefix: '/public/' },
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
 * default: development
 */
const envConfig = config[process.env['NODE' + '_ENV'] || 'development'] || config.development;
console.log('Server starts in mode: ', process.env['NODE' + '_ENV'] || 'development');

/**
 * Export envConfig as default
 */
export default envConfig;
