import {
  ApiCommonErrorResponses,
  CoreFileController,
  CoreFileInfo,
  multerFileToUpload,
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

import { FileService } from './file.service';

/**
 * Controller to handle file REST API endpoints
 *
 * Inherits the download endpoints from CoreFileController:
 * - GET /files/id/:id     - Download file by ID
 * - GET /files/:filename  - Download file by filename
 *
 * Both are gated by `file.downloadRoles` in config.env.ts. The framework default
 * is `[ADMIN]`; this project widens it to `[S_USER]` and makes the real decision
 * per file in `FileService.checkRights()` (own file, or ADMIN) — a role can only
 * answer "may this caller reach the route", never "may this caller have THIS file".
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
 * To change who may reach them, edit `file.downloadRoles` in config.env.ts. For
 * the per-file rule (owner, tenant), see `checkRights()` in FileService.
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

    // multerFileToUpload() adapts the in-memory multer upload to what CoreFileService
    // consumes, so this REST route writes to the same central storage as the GraphQL
    // path. It requires `memory: true` (GridFsMulterConfigService uses memoryStorage)
    // and throws with that instruction rather than storing an empty file.
    //
    // No `metadata.ownerId` here on purpose: this endpoint is @Roles(ADMIN), and
    // FileService.checkRights() treats an owner-less file as admin-only. Pass
    // `{ metadata: { ownerId } }` if you widen this route to normal users.
    return this.fileService.createFile(multerFileToUpload(file));
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
    // `force`: this route is @Roles(ADMIN) — the guard has already decided, and
    // FileService.checkRights() must not be asked to re-derive that from an absent user.
    return this.fileService.getFileInfo(id, { force: true });
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
    return this.fileService.deleteFile(id, { force: true });
  }
  // #endregion rest
}
