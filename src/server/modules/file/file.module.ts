import { Module } from '@nestjs/common';
// #region rest
import { MulterModule } from '@nestjs/platform-express';
// #endregion rest

import { FileController } from './file.controller';
// #region graphql
import { FileResolver } from './file.resolver';
// #endregion graphql
import { FileService } from './file.service';
// #region rest
import { GridFsMulterConfigService } from './multer-config.service';
// #endregion rest

/**
 * File module
 */
@Module({
  controllers: [FileController],
  exports: [FileService],
  imports: [
    // #region rest
    MulterModule.registerAsync({
      useClass: GridFsMulterConfigService,
    } as any),
    // #endregion rest
  ],
  providers: [
    // #region rest
    GridFsMulterConfigService,
    // #endregion rest
    FileService,
    // #region graphql
    FileResolver,
    // #endregion graphql
  ],
})
export class FileModule {}
