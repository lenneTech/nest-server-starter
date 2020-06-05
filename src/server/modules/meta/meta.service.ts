import { ConfigService } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';
import { Meta } from './meta.model';
import { GraphQLResolveInfo } from 'graphql';
import * as pack from '../../../../package.json';

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
  async get(info?: GraphQLResolveInfo): Promise<Meta> {
    return Meta.map({
      environment: this.configService.config.env,
      title: pack.description,
      package: pack.name,
      version: pack.version,
    });
  }
}
