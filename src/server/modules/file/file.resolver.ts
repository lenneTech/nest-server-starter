import { CoreFileInfo, FileUpload, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import GraphQLUpload = require('graphql-upload/GraphQLUpload.js');

import { FileInfo } from './file-info.model';
import { FileService } from './file.service';

/**
 * File resolver for GraphQL file operations
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
  async getFileInfo(
    @Args({ name: 'filename', type: () => String }) filename: string,
  ): Promise<CoreFileInfo | null> {
    return this.fileService.getFileInfoByName(filename);
  }

  // ===========================================================================
  // Mutations
  // ===========================================================================

  /**
   * Delete file by filename
   */
  @Mutation(() => FileInfo)
  @Roles(RoleEnum.ADMIN)
  async deleteFile(
    @Args({ name: 'filename', type: () => String }) filename: string,
  ): Promise<CoreFileInfo | null> {
    return this.fileService.deleteFileByName(filename);
  }

  /**
   * Upload single file to GridFS
   */
  @Mutation(() => FileInfo)
  @Roles(RoleEnum.ADMIN)
  async uploadFile(
    @Args({ name: 'file', type: () => GraphQLUpload }) file: FileUpload,
  ): Promise<CoreFileInfo> {
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
    const uploadPromises = files.map(file => this.fileService.createFile(file));
    return Promise.all(uploadPromises);
  }
}
