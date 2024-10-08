import { CoreFileInfo, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { ObjectType } from '@nestjs/graphql';
import { Schema as MongooseSchema, SchemaFactory } from '@nestjs/mongoose';

/**
 * File info model
 */
@Restricted(RoleEnum.ADMIN)
@ObjectType({ description: 'Information about file' })
@MongooseSchema({ collection: 'fs.files' })
export class FileInfo extends CoreFileInfo {}

/**
 * File info schema
 */
export const FileInfoSchema = SchemaFactory.createForClass(FileInfo);
