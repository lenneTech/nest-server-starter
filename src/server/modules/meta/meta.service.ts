import { ConfigService, getCommit, UNKNOWN_COMMIT } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';

import metaData = require('../../../meta.json');
import { Meta } from './meta.model';

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
      commit: this.getCommit(),
      environment: this.configService.config.env,
      package: metaData.name,
      title: metaData.description,
      version: metaData.version,
    });
  }

  /**
   * Resolve the git commit SHA the running build was produced from.
   *
   * Delegates to the framework's `getCommit()` (reads the `APP_VERSION_COMMIT`
   * env baked into the image at build time from the CI commit SHA — see
   * Dockerfile), so this value stays identical to the one the `/health-check`
   * build indicator reports. Falls back to a `commit` field optionally present
   * in meta.json, so local / un-tagged builds still return a defined value.
   */
  protected getCommit(): string {
    const commit = getCommit();
    return commit === UNKNOWN_COMMIT ? (metaData as { commit?: string }).commit || UNKNOWN_COMMIT : commit;
  }
}
