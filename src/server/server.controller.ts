import { ConfigService, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get, Render } from '@nestjs/common';

import metaData = require('../meta.json');
import { redactSecrets } from './common/utils/redact-secrets.util';
import { MetaService } from './modules/meta/meta.service';

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
   * Get configuration, with every secret blanked.
   *
   * It used to return the configuration verbatim — the database URI, the JWT
   * and Better-Auth secrets, the mail password. Whoever holds an administrator
   * session should not get the database credentials from an HTTP response.
   */
  @Get('config')
  @Roles(RoleEnum.ADMIN)
  config() {
    return redactSecrets(JSON.parse(JSON.stringify(this.configService.configFastButReadOnly)));
  }
}
