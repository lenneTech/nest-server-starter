import { CoreFileService } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * File service
 */
@Injectable()
export class FileService extends CoreFileService {
  constructor(@InjectConnection() protected readonly connection: Connection) {
    super(connection, 'fs');
  }
}
