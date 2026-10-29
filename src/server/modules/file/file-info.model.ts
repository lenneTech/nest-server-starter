import { CoreFileInfo, Schema as MongooseSchema, Restricted, RoleEnum, SchemaFactory } from '@lenne.tech/nest-server';
import { ObjectType } from '@nestjs/graphql';

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
