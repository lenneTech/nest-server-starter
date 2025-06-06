import { RoleEnum, Roles } from '@lenne.tech/nest-server';
import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FileService } from './file.service';

/**
 * File controller for
 */
@Controller('files')
@Roles(RoleEnum.ADMIN)
export class FileController {
  /**
   * Import services
   */
  constructor(private readonly fileService: FileService) {}

  /**
   * Upload file
   */
  @Post('upload')
  @Roles(RoleEnum.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File): any {
    return file;
  }

  /**
   * Download file
   */
  @Get(':id')
  @Roles(RoleEnum.ADMIN)
  async getFile(@Param('id') id: string, @Res() res) {
    if (!id) {
      throw new UnprocessableEntityException();
    }

    let file;
    try {
      file = await this.fileService.getFileInfo(id);
    } catch (e) {
      console.error(e);
    }

    if (!file) {
      throw new NotFoundException();
    }
    const filestream = await this.fileService.getFileStream(id);
    res.header('Content-Type', file.contentType);
    res.header('Content-Disposition', `attachment; filename=${file.filename}`);
    res.header('Cache-Control', 'max-age=31536000');
    return filestream.pipe(res);
  }

  /**
   * Get file information
   */
  @Get('info/:id')
  @Roles(RoleEnum.ADMIN)
  async getFileInfo(@Param('id') id: string) {
    return await this.fileService.getFileInfo(id);
  }

  /**
   * Delete file
   */
  @Delete(':id')
  @Roles(RoleEnum.ADMIN)
  async deleteFile(@Param('id') id: string) {
    if (!id) {
      throw new UnprocessableEntityException();
    }

    return await this.fileService.deleteFile(id);
  }
}
