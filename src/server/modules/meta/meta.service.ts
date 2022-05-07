import { ConfigService } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';
import { Meta } from './meta.model';
import * as metaData from '../../../meta.json';

/**
 * Meta service
 */
@Injectable()
export class MetaService {
  // ===================================================================================================================
  // Injections
  // ===================================================================================================================

  /**
   * Constructor for injecting services
   */
  constructor(protected readonly configService: ConfigService) {}

  /**
   * Get Meta via ID
   * Is used by MetaResolver AND ServerController!
   */
  async get(): Promise<Meta> {
    return Meta.map({
      environment: this.configService.config.env,
      title: metaData.description,
      package: metaData.name,
      version: metaData.version,
    });
  }
}
