import { Module } from '@nestjs/common';

import { MetaController } from './meta.controller';
import { MetaResolver } from './meta.resolver';
import { MetaService } from './meta.service';

/**
 * Meta module
 */
@Module({
  controllers: [MetaController],
  exports: [MetaResolver, MetaService],
  imports: [],
  providers: [MetaResolver, MetaService],
})
export class MetaModule {}
