import { Module } from '@nestjs/common';

import { MetaResolver } from './meta.resolver';
import { MetaService } from './meta.service';

/**
 * Meta module
 */
@Module({
  controllers: [],
  exports: [MetaResolver, MetaService],
  imports: [],
  providers: [MetaResolver, MetaService],
})
export class MetaModule {}
