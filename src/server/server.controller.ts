import { ConfigService, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get, Render } from '@nestjs/common';

import metaData = require('../meta.json');
import { MetaService } from './modules/meta/meta.service';

/**
 * Server Controller
 */
@Controller()
@Roles(RoleEnum.ADMIN)
export class ServerController {
  constructor(protected configService: ConfigService, protected metaService: MetaService) {}

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
   * Get configuration
   */
  @Get('config')
  @Roles(RoleEnum.ADMIN)
  config() {
    return JSON.parse(JSON.stringify(this.configService.configFastButReadOnly));
  }
}
