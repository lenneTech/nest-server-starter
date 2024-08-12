import { ConfigService, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get, Render } from '@nestjs/common';

import { MetaService } from './modules/meta/meta.service';

import metaData = require('../meta.json');

@Controller()
export class ServerController {
  constructor(protected configService: ConfigService, protected metaService: MetaService) {}

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
