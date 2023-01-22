import { CoreFileService } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

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
   */
  async duplicate(fileName: string, newName: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      resolve(this.files.openDownloadStreamByName(fileName).pipe(this.files.openUploadStream(newName)));
    });
  }
}
