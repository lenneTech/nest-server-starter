import { Injectable } from '@nestjs/common';
import { MulterModuleOptions, MulterOptionsFactory } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

/**
 * Multer configuration service using MemoryStorage
 * Files are stored in memory as Buffer objects and then manually saved to GridFS
 */
@Injectable()
export class GridFsMulterConfigService implements MulterOptionsFactory {
  createMulterOptions(): MulterModuleOptions {
    return {
      // Browsers send the multipart filename as raw UTF-8 bytes without a charset parameter, and
      // multer reads such parameters as latin1 by default: `Prüfbericht.pdf` was stored as
      // `PrÃ¼fbericht.pdf` and offered under that name on every download. An explicit `filename*`
      // stays decoded by its own charset. The GraphQL upload path does the same in nest-server.
      defParamCharset: 'utf8',
      storage: memoryStorage(),
    };
  }
}
