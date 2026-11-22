import { CoreFileInfo, Schema as MongooseSchema, Restricted, RoleEnum, SchemaFactory } from '@lenne.tech/nest-server';
import { ObjectType } from '@nestjs/graphql';

import type { User } from '../user/user.model.js';

/**
 * File info model
 */
@MongooseSchema({ collection: 'fs.files' })
@ObjectType({ description: 'Information about file' })
@Restricted(RoleEnum.ADMIN)
export class FileInfo extends CoreFileInfo {
  /**
   * Verification of the user's rights to access the properties of this object
   *
   * An admin, or a call in force mode, gets the complete object, everybody else, signed in or not,
   * gets nothing. This is a second line behind the routes, not the rule that decides who may read
   * which file:
   *
   * - Every route that returns a file info is `@Roles(ADMIN)` (`FileController`, `FileResolver`),
   *   and downloads stream the file without its info.
   * - `FileService` answers with `CoreFileInfo` (`CoreFileService.prepareOutput()`), which drops
   *   `metadata`. Only the GraphQL routes typed `FileInfo` (`getFileInfo`, `deleteFile`,
   *   `uploadFile`) reach this method, through the ResponseModelInterceptor; the REST routes and
   *   `uploadFiles` keep the default check.
   *
   * Which user may read which file belongs in `FileService.checkRights()` (or `file.access:
   * 'owner'`), where the stored owner is still at hand. Opening a route on the strength of a rule
   * written here would hand every signed-in user the info of every file.
   */
  override securityCheck(user: User, force?: boolean) {
    if (force || user?.hasRole(RoleEnum.ADMIN)) {
      return this;
    }
    return undefined;
  }
}

/**
 * File info schema
 */
export const FileInfoSchema = SchemaFactory.createForClass(FileInfo);
