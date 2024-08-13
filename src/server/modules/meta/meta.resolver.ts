import { RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Query, Resolver } from '@nestjs/graphql';

import { Meta } from './meta.model';
import { MetaService } from './meta.service';

/**
 * Resolver to process with metadata
 */
@Roles(RoleEnum.ADMIN)
@Resolver(() => Meta)
export class MetaResolver {
  /**
   * Import services
   */
  constructor(private readonly metaService: MetaService) {}

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get Meta via ID
   */
  @Roles(RoleEnum.S_EVERYONE)
  @Query(() => Meta, { description: 'Get Meta' })
  async getMeta(): Promise<Meta> {
    return await this.metaService.get();
  }
}
