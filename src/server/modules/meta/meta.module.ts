import { JSON } from '@lenne.tech/nest-server';
import { Module } from '@nestjs/common';
import { MetaResolver } from './meta.resolver';
import { MetaService } from './meta.service';

/**
 * Meta module
 */
@Module({
  imports: [],
  controllers: [],
  providers: [MetaResolver, MetaService, JSON],
  exports: [MetaResolver, MetaService],
})
export class MetaModule {}
