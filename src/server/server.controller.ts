import { ConfigService, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get, Render } from '@nestjs/common';

@Controller()
export class ServerController {
  constructor(protected configService: ConfigService) {}

  @Get()
  @Render('index')
  root() {
    return {
      env: this.configService.get('env'),
    };
  }

  @Get('config')
  @Roles(RoleEnum.ADMIN)
  config() {
    return this.configService.config;
  }
}
