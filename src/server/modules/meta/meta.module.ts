import { Module } from '@nestjs/common';

// #region rest
import { MetaController } from './meta.controller';
// #endregion rest
// #region graphql
import { MetaResolver } from './meta.resolver';
// #endregion graphql
import { MetaService } from './meta.service';

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
