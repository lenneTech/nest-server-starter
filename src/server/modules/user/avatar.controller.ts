import {
  CurrentUser,
  getStringIds,
  multerFileToUpload,
  multerOptionsForImageUpload,
  RoleEnum,
  Roles,
} from '@lenne.tech/nest-server';
import { Logger, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Controller } from '@nestjs/common/decorators/core/controller.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

import { FileService } from '../file/file.service';
import { User } from './user.model';
import { UserService } from './user.service';

/**
 * Controller for avatar
 */
@Controller('avatar')
@Roles(RoleEnum.ADMIN)
export class AvatarController {
  protected readonly logger = new Logger(AvatarController.name);

  /**
   * Import services
   *
   * `FileService` in addition to `UserService`: the bytes go into the central file
   * storage, and `UserService` cannot do that itself — it is instantiated by
   * `CoreAuthModule`, which knows nothing about this project's `FileModule`.
   */
  constructor(
    protected readonly usersService: UserService,
    protected readonly fileService: FileService,
  ) {}

  /**
   * Upload avatar
   *
   * Returns the FILE ID of the stored avatar (not a filename): serve it via
   * `GET /files/id/:id`. Before nest-server 11.33.0 this wrote to a pod-local
   * `staticAssets/avatars` directory, which only one replica could read and a
   * restart discarded.
   */
  @Post('upload')
  @Roles(RoleEnum.S_USER)
  @UseInterceptors(
    FileInterceptor(
      'file',
      // `memory: true`, NOT a disk destination — multerFileToUpload() needs the
      // buffer, and a disk-stored file has none.
      multerOptionsForImageUpload({ memory: true }),
    ),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: User): Promise<string> {
    // Record the owner. `file.downloadRoles` is widened to S_USER in config.env.ts,
    // and FileService.checkRights() reads exactly this metadata to answer "…but only
    // their OWN file". Without it the uploader could not fetch their own avatar back.
    const stored = await this.fileService.createFile(multerFileToUpload(file), {
      metadata: { ownerId: getStringIds(user.id) },
    });
    const previousAvatar = await this.usersService.setAvatar(stored.id, user);

    // Drop the replaced file. A failure here must not fail the upload: the new avatar
    // is already stored and referenced, so an orphaned object is a cleanup concern,
    // not a request error.
    if (previousAvatar) {
      try {
        await this.fileService.deleteFile(previousAvatar, { currentUser: user });
      } catch (error) {
        this.logger.warn(
          `Could not remove previous avatar ${previousAvatar}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return stored.id;
  }
}
