import { Module } from '@nestjs/common';
import { MetaResolver } from './meta.resolver';
import { MetaService } from './meta.service';

/**
 * Meta module
 */
@Module({
  imports: [],
  controllers: [],
  providers: [MetaResolver, MetaService],
  exports: [MetaResolver, MetaService],
})
export class MetaModule {}
