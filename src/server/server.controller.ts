import { ConfigService, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get, Render } from '@nestjs/common';
import * as metaData from '../meta.json';
import { MetaService } from './modules/meta/meta.service';

@Controller()
export class ServerController {
  constructor(protected configService: ConfigService, protected metaService: MetaService) {}

  @Get()
  @Render('index')
  root() {
    // meta.json can be overwritten during the build process
    return {
      env: this.configService.get('env'),
      version: metaData.version,
      title: metaData.name,
      description: metaData.description,
    };
  }

  @Get('meta')
  meta() {
    return this.metaService.get();
  }

  @Get('config')
  @Roles(RoleEnum.ADMIN)
  config() {
    return this.configService.configFastButReadOnly;
  }
}
