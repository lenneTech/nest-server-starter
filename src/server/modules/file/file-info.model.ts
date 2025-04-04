import { CoreFileInfo, Restricted, RoleEnum } from '@lenne.tech/nest-server';
import { ObjectType } from '@nestjs/graphql';
import { Schema as MongooseSchema, SchemaFactory } from '@nestjs/mongoose';

/**
 * File info model
 */
@MongooseSchema({ collection: 'fs.files' })
@ObjectType({ description: 'Information about file' })
@Restricted(RoleEnum.ADMIN)
export class FileInfo extends CoreFileInfo {}

/**
 * File info schema
 */
export const FileInfoSchema = SchemaFactory.createForClass(FileInfo);
