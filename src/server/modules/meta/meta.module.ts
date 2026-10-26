import { Module } from '@nestjs/common';

// #region rest
import { MetaController } from './meta.controller.js';
// #endregion rest
// #region graphql
import { MetaResolver } from './meta.resolver.js';
// #endregion graphql
import { MetaService } from './meta.service.js';

/**
 * Meta module
 */
@Module({
  // #region rest
  controllers: [MetaController],
  // #endregion rest
  exports: [
    // #region graphql
    MetaResolver,
    // #endregion graphql
    MetaService,
  ],
  imports: [],
  providers: [
    // #region graphql
    MetaResolver,
    // #endregion graphql
    MetaService,
  ],
})
export class MetaModule {}
