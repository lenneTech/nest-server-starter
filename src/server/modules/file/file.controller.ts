import { ApiCommonErrorResponses, CoreFileInfo, FileUpload, RoleEnum, Roles } from '@lenne.tech/nest-server';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Readable } from 'stream';

import { FileService } from './file.service';

/**
 * Controller to handle file REST API endpoints
 */
@ApiCommonErrorResponses()
@ApiTags('files')
@Controller('files')
@Roles(RoleEnum.ADMIN)
export class FileController {
  /**
   * Import services
   */
  constructor(private readonly fileService: FileService) {}

  /**
   * Upload file via HTTP
   */
  @ApiBearerAuth()
  @ApiBody({
    description: 'File to upload',
    schema: {
      properties: {
        file: {
          format: 'binary',
          type: 'string',
        },
      },
      type: 'object',
    },
  })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'File uploaded successfully', type: CoreFileInfo })
  @ApiOperation({ description: 'Upload a file to GridFS', summary: 'Upload file' })
  @Post('upload')
  @Roles(RoleEnum.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File): Promise<any> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Convert Multer file to FileUpload interface
    const fileUpload: FileUpload = {
      capacitor: null, // Not used when creating from buffer
      createReadStream: () => Readable.from(file.buffer),
      filename: file.originalname,
      mimetype: file.mimetype,
    };

    // Save to GridFS using FileService
    return await this.fileService.createFile(fileUpload);
  }

  /**
   * Download file
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'File downloaded successfully' })
  @ApiOperation({ description: 'Download a file from GridFS', summary: 'Download file' })
  @ApiParam({ description: 'File ID', name: 'id', type: String })
  @Get(':id')
  @Roles(RoleEnum.ADMIN)
  async getFile(@Param('id') id: string, @Res() res: Response) {
    if (!id) {
      throw new BadRequestException('Missing ID');
    }

    let file: CoreFileInfo | null;
    try {
      file = await this.fileService.getFileInfo(id);
    } catch (e) {
      console.error(e);
      file = null;
    }

    if (!file) {
      throw new NotFoundException('File not found');
    }
    const filestream = await this.fileService.getFileStream(id);
    res.header('Content-Type', file.contentType || 'application/octet-stream');
    res.header('Content-Disposition', `attachment; filename=${file.filename}`);
    res.header('Cache-Control', 'max-age=31536000');
    return filestream.pipe(res);
  }

  /**
   * Get file information
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'File information retrieved successfully', type: CoreFileInfo })
  @ApiOperation({ description: 'Get file information from GridFS', summary: 'Get file info' })
  @ApiParam({ description: 'File ID', name: 'id', type: String })
  @Get('info/:id')
  @Roles(RoleEnum.ADMIN)
  async getFileInfo(@Param('id') id: string) {
    return await this.fileService.getFileInfo(id);
  }

  /**
   * Delete file
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'File deleted successfully', type: Boolean })
  @ApiOperation({ description: 'Delete a file from GridFS', summary: 'Delete file' })
  @ApiParam({ description: 'File ID', name: 'id', type: String })
  @Delete(':id')
  @Roles(RoleEnum.ADMIN)
  async deleteFile(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Missing ID');
    }

    return await this.fileService.deleteFile(id);
  }
}
