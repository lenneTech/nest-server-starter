import { CoreFileInfo, FileUpload, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import GraphQLUpload = require('graphql-upload/GraphQLUpload.js');

import { FileInfo } from './file-info.model';
import { FileService } from './file.service';

/**
 * File resolver for GraphQL file operations
 *
 * NOTE — these members are NOT governed by `file.uploadRoles` / `deleteRoles` /
 * `downloadRoles` from config.env.ts. Those knobs write role metadata onto
 * `CoreFileResolver.prototype.*` (nest-server 11.33.0+), and this class does not
 * extend it: it is a standalone, filename-based admin API. The `@Roles(ADMIN)`
 * declared here is therefore the whole story, and stays the whole story if the
 * config is widened.
 *
 * `FileService.checkRights()` still applies to every call made through the service,
 * but with ADMIN on every member it can never refuse here.
 */
@Resolver()
@Roles(RoleEnum.ADMIN)
export class FileResolver {
  /**
   * Integrate services
   */
  constructor(protected readonly fileService: FileService) {}

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get file info by filename
   */
  @Query(() => FileInfo, { nullable: true })
  @Roles(RoleEnum.ADMIN)
  async getFileInfo(@Args({ name: 'filename', type: () => String }) filename: string): Promise<CoreFileInfo | null> {
    // `force`: @Roles(ADMIN) above is the whole gate for this admin API.
    return this.fileService.getFileInfoByName(filename, { force: true });
  }

  // ===========================================================================
  // Mutations
  // ===========================================================================

  /**
   * Delete file by filename
   */
  @Mutation(() => FileInfo)
  @Roles(RoleEnum.ADMIN)
  async deleteFile(@Args({ name: 'filename', type: () => String }) filename: string): Promise<CoreFileInfo | null> {
    return this.fileService.deleteFileByName(filename, { force: true });
  }

  /**
   * Upload single file to GridFS
   */
  @Mutation(() => FileInfo)
  @Roles(RoleEnum.ADMIN)
  async uploadFile(@Args({ name: 'file', type: () => GraphQLUpload }) file: FileUpload): Promise<CoreFileInfo> {
    return this.fileService.createFile(file);
  }

  /**
   * Upload multiple files to GridFS
   * @returns Array of uploaded file information
   */
  @Mutation(() => [FileInfo])
  @Roles(RoleEnum.ADMIN)
  async uploadFiles(
    @Args({ name: 'files', type: () => [GraphQLUpload] }) files: FileUpload[],
  ): Promise<CoreFileInfo[]> {
    const uploadPromises = files.map((file) => this.fileService.createFile(file));
    return Promise.all(uploadPromises);
  }
}
