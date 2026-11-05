import { ConfigService, configEndpointResponse, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get, Render } from '@nestjs/common';

import metaData from '../meta.json' with { type: 'json' };
import { MetaService } from './modules/meta/meta.service.js';

/**
 * Server Controller
 */
@Controller()
@Roles(RoleEnum.ADMIN)
export class ServerController {
  constructor(
    protected configService: ConfigService,
    protected metaService: MetaService,
  ) {}

  @Get()
  @Render('index')
  @Roles(RoleEnum.S_EVERYONE)
  root() {
    // meta.json can be overwritten during the build process
    return {
      description: metaData.description,
      env: this.configService.get('env'),
      title: metaData.name,
      version: metaData.version,
    };
  }

  @Get('meta')
  @Roles(RoleEnum.S_EVERYONE)
  meta() {
    return this.metaService.get();
  }

  /**
   * Get the configuration, with every secret masked (nest-server's `configEndpointResponse()`).
   *
   * It answers in `local`, `ci` and `e2e`. In every deployed environment it answers 404 unless
   * `configEndpoint: true` (or `NSC__CONFIG_ENDPOINT=true`) opens it, and even then secret values
   * read `***`. It used to return the configuration verbatim: the database URI, the JWT and
   * Better-Auth secrets, the mail password.
   */
  @Get('config')
  @Roles(RoleEnum.ADMIN)
  config() {
    return configEndpointResponse();
  }
}
