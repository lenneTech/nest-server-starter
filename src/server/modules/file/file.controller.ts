import { CoreFileController, multerRandomFileName, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Body, Controller, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import envConfig from '../../../config.env';
import { FileService } from './file.service';

/**
 * File controller
 */
@Roles(RoleEnum.S_USER)
@Controller('files')
export class FileController extends CoreFileController {
  /**
   * Include services
   */
  constructor(protected fileService: FileService) {
    super(fileService);
  }

  /**
   * Upload files via REST as an alternative to uploading via GraphQL (see file.resolver.ts)
   */
  @Roles(RoleEnum.ADMIN)
  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', null, {
      // Automatic storage handling
      // For configuration see https://github.com/expressjs/multer#storage
      storage: diskStorage({
        // Destination for uploaded file
        // If destination is not set file will be buffered and can be processed
        // in the method
        destination: envConfig.staticAssets.path,

        // Generated random file name
        filename: multerRandomFileName(),
      }),
    })
  )
  uploadFiles(@UploadedFiles() files, @Body() fields: any) {
    console.info('Saved file info', JSON.stringify({ files, fields }, null, 2));
  }
}
