import { CoreFileService } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, mongo } from 'mongoose';

/**
 * File service
 */
@Injectable()
export class FileService extends CoreFileService {
  constructor(@InjectConnection() protected override readonly connection: Connection) {
    super(connection);
  }

  /**
   * Duplicate file by name
   * @param fileName - Source file name
   * @param newName - Name for the duplicated file
   * @returns The GridFS upload stream for the duplicated file
   */
  duplicate(fileName: string, newName: string): mongo.GridFSBucketWriteStream {
    return this.files.openDownloadStreamByName(fileName).pipe(this.files.openUploadStream(newName));
  }
}
