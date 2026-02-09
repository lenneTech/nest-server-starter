import {
  ApiCommonErrorResponses,
  CoreFileController,
  CoreFileInfo,
  FileUpload,
  RoleEnum,
  Roles,
} from '@lenne.tech/nest-server';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Readable } from 'stream';

import { FileService } from './file.service';

/**
 * Controller to handle file REST API endpoints
 *
 * Inherits public download endpoints from CoreFileController:
 * - GET /files/id/:id - Download file by ID (public)
 * - GET /files/:filename - Download file by filename (public)
 */
@ApiCommonErrorResponses()
@ApiTags('files')
@Controller('files')
@Roles(RoleEnum.ADMIN)
export class FileController extends CoreFileController {
  /**
   * Import services
   */
  constructor(protected override readonly fileService: FileService) {
    super(fileService);
  }

  // ===================================================================================================================
  // Public Download Endpoints (inherited from CoreFileController, documented here for Swagger)
  // ===================================================================================================================

  /**
   * Download file by ID
   * More reliable than filename-based download as IDs are unique.
   * Recommended for TUS uploads and when filename uniqueness cannot be guaranteed.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'File downloaded successfully' })
  @ApiOperation({ description: 'Download a file from GridFS by ID', summary: 'Download file by ID' })
  @ApiParam({ description: 'File ID', name: 'id', type: String })
  @Get('id/:id')
  @Roles(RoleEnum.S_EVERYONE)
  override async getFileById(@Param('id') id: string, @Res() res: Response): Promise<Response> {
    return super.getFileById(id, res);
  }

  /**
   * Download file by filename
   * Note: If multiple files have the same filename, only the first match is returned.
   * For unique file access, use GET /files/id/:id instead.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'File downloaded successfully' })
  @ApiOperation({ description: 'Download a file from GridFS by filename', summary: 'Download file by filename' })
  @ApiParam({ description: 'Filename', name: 'filename', type: String })
  @Get(':filename')
  @Roles(RoleEnum.S_EVERYONE)
  override async getFile(@Param('filename') filename: string, @Res() res: Response): Promise<Response> {
    return super.getFile(filename, res);
  }

  // #region rest
  // ===================================================================================================================
  // Admin Endpoints
  // ===================================================================================================================

  /**
   * Upload file via HTTP multipart/form-data
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
  async uploadFile(@UploadedFile() file: Express.Multer.File): Promise<CoreFileInfo> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const fileUpload: FileUpload = {
      capacitor: null,
      createReadStream: () => Readable.from(file.buffer),
      filename: file.originalname,
      mimetype: file.mimetype,
    };

    return this.fileService.createFile(fileUpload);
  }

  /**
   * Get file information by ID
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'File information retrieved successfully', type: CoreFileInfo })
  @ApiOperation({ description: 'Get file information from GridFS', summary: 'Get file info' })
  @ApiParam({ description: 'File ID', name: 'id', type: String })
  @Get('info/:id')
  @Roles(RoleEnum.ADMIN)
  async getFileInfo(@Param('id') id: string): Promise<CoreFileInfo | null> {
    return this.fileService.getFileInfo(id);
  }

  /**
   * Delete file by ID
   */
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'File deleted successfully', type: CoreFileInfo })
  @ApiOperation({ description: 'Delete a file from GridFS', summary: 'Delete file' })
  @ApiParam({ description: 'File ID', name: 'id', type: String })
  @Delete(':id')
  @Roles(RoleEnum.ADMIN)
  async deleteFile(@Param('id') id: string): Promise<CoreFileInfo | null> {
    return this.fileService.deleteFile(id);
  }
  // #endregion rest
}
