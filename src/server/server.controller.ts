import { ConfigService, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get, Render } from '@nestjs/common';
import * as pack from '../../package.json';
import { MetaService } from './modules/meta/meta.service';

@Controller()
export class ServerController {
  constructor(protected configService: ConfigService, protected metaService: MetaService) {}

  @Get()
  @Render('index')
  root() {
    return {
      env: this.configService.get('env'),
      version: pack.version,
      title: pack.description,
    };
  }

  @Get('meta')
  meta() {
    return this.metaService.get();
  }

  @Get('config')
  @Roles(RoleEnum.ADMIN)
  config() {
    return this.configService.config;
  }
}
