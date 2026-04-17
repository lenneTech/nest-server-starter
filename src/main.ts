import {
  buildCorsConfig,
  CoreAuthModel,
  CorePersistenceModel,
  CoreUserModel,
  FilterArgs,
  HttpExceptionLogFilter,
  isCookiesEnabled,
  isCorsDisabled,
} from '@lenne.tech/nest-server';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
// #region rest
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// #endregion rest
import { exec } from 'child_process';
import compression = require('compression');
import cookieParser = require('cookie-parser');

import packageJson = require('../package.json');
import envConfig from './config.env';
// #region rest
import { PersistenceModel } from './server/common/models/persistence.model';
// #endregion rest
import { User } from './server/modules/user/user.model';
import { ServerModule } from './server/server.module';

/**
 * Preparations for server start
 */
async function bootstrap() {
  // Create a new server based on express
  const server = await NestFactory.create<NestExpressApplication>(
    // Include server module, with all necessary modules for the project
    ServerModule,
  );

  // Log exceptions
  if (envConfig.logExceptions) {
    server.useGlobalFilters(new HttpExceptionLogFilter());
  }

  // Compression (gzip)
  if (envConfig.compression) {
    let envCompressionOptions = {};
    if (typeof envConfig.compression === 'object') {
      envCompressionOptions = envConfig.compression;
    }
    const compressionOptions = {
      filter: () => {
        return true;
      },
      threshold: 0,
      ...envCompressionOptions,
    };
    server.use(compression(compressionOptions));
  }

  // Cookie handling (enabled by default since nest-server 11.25.0).
  // Sign cookies with jwt.secret → betterAuth.secret fallback chain so
  // signed cookies (req.signedCookies) verify correctly in IAM-only mode.
  const cookiesEnabled = isCookiesEnabled(envConfig.cookies);
  if (cookiesEnabled) {
    const betterAuthSecret = typeof envConfig.betterAuth === 'object' ? envConfig.betterAuth?.secret : undefined;
    const cookieSecret = envConfig.jwt?.secret || betterAuthSecret;
    server.use(cookieSecret ? cookieParser(cookieSecret) : cookieParser());
  }

  // Asset directory
  server.useStaticAssets(envConfig.staticAssets.path, envConfig.staticAssets.options);

  // Templates directory
  server.setBaseViewsDir(envConfig.templates.path);
  server.setViewEngine(envConfig.templates.engine);

  // CORS (unified across REST, GraphQL, and BetterAuth via buildCorsConfig).
  // - cors: false → fully disabled (no headers)
  // - origins resolvable via appUrl/baseUrl/allowedOrigins → restricted credentialed CORS
  // - cookies disabled and no origins → permissive enableCors() for backward compatibility
  if (!isCorsDisabled(envConfig.cors)) {
    const corsOptions = buildCorsConfig(envConfig);
    if (Object.keys(corsOptions).length > 0) {
      server.enableCors(corsOptions);
    } else if (!cookiesEnabled) {
      server.enableCors();
    }
  }

  // #region rest
  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Nest Server Starter API')
    .setDescription('API lenne.Tech Nest Server Starter')
    .setVersion(packageJson.version)
    .addBearerAuth()
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(server, config, {
      autoTagControllers: true,
      deepScanRoutes: true,
      extraModels: [CoreUserModel, CoreAuthModel, User, PersistenceModel, CorePersistenceModel, FilterArgs],
    });
  SwaggerModule.setup('swagger', server, documentFactory, {
    jsonDocumentUrl: '/api-docs-json',
  });
  // #endregion rest

  // Set global prefix (if server runs in subdirectory, e.g. /api)
  // server.setGlobalPrefix('api');

  // Start server on configured port
  await server.listen(envConfig.port, envConfig.hostname);
  console.debug(`Server startet at ${await server.getUrl()}`);

  // Run command after server init
  if (envConfig.execAfterInit) {
    exec(envConfig.execAfterInit, (error, stdout, stderr) => {
      if (error) {
        console.error(`error: ${error.message}`);
        return;
      }

      if (stderr) {
        console.error(`stderr: ${stderr}`);
        return;
      }
    });
  }
}

// Start server
bootstrap();
