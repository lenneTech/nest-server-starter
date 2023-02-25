import { CurrentUser, multerOptionsForImageUpload, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Controller } from '@nestjs/common/decorators/core/controller.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import envConfig from '../../../config.env';
import { User } from './user.model';
import { UserService } from './user.service';

/**
 * Controller for avatar
 */
@Controller('avatar')
export class AvatarController {
  /**
   * Import services
   */
  constructor(protected readonly usersService: UserService) {}

  /**
   * Upload files
   */
  @Roles(RoleEnum.S_USER)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor(
      'file',
      multerOptionsForImageUpload({
        destination: envConfig.staticAssets.path + '/avatars',
      })
    )
  )
  uploadFile(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: User): Promise<string> {
    return this.usersService.setAvatar(file, user);
  }
}
