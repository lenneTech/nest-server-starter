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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Readable } from 'stream';

import { FileService } from './file.service';

/**
 * Controller to handle file REST API endpoints
 *
 * Inherits the download endpoints from CoreFileController:
 * - GET /files/id/:id     - Download file by ID
 * - GET /files/:filename  - Download file by filename
 *
 * Both are gated by `file.downloadRoles` in config.env.ts (default: ADMIN).
 *
 * DO NOT re-declare these two as overrides here. Role metadata lives on the
 * function object, so an override carries its own — which silently opts the
 * route out of `file.downloadRoles` and pins whatever the override declares.
 * This class used to override both purely to attach Swagger decorators, and in
 * doing so re-declared `@Roles(RoleEnum.S_EVERYONE)`: every project generated
 * from this starter kept serving the entire shared GridFS bucket to anonymous
 * callers, no matter what the framework default was. Swagger still lists both
 * routes through inheritance; only the prose annotations are gone, which is a
 * cheap price for the endpoints meaning what the config says.
 *
 * To widen them, set `file: { downloadRoles: [...] }` in config.env.ts. For a
 * per-file rule (owner, tenant), override `checkRights()` in FileService.
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
