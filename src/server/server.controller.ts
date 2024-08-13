import { ConfigService, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get, Render } from '@nestjs/common';

import { MetaService } from './modules/meta/meta.service';

import metaData = require('../meta.json');

@Roles(RoleEnum.ADMIN)
@Controller()
export class ServerController {
  constructor(protected configService: ConfigService, protected metaService: MetaService) {}

  @Roles(RoleEnum.S_EVERYONE)
  @Get()
  @Render('index')
  root() {
    // meta.json can be overwritten during the build process
    return {
      description: metaData.description,
      env: this.configService.get('env'),
      title: metaData.name,
      version: metaData.version,
    };
  }

  @Roles(RoleEnum.S_EVERYONE)
  @Get('meta')
  meta() {
    return this.metaService.get();
  }

  @Get('config')
  @Roles(RoleEnum.ADMIN)
  config() {
    return JSON.parse(JSON.stringify(this.configService.configFastButReadOnly));
  }
}
