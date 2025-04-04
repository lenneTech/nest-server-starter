import { RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Query, Resolver } from '@nestjs/graphql';

import { Meta } from './meta.model';
import { MetaService } from './meta.service';

/**
 * Resolver to process with metadata
 */
@Resolver(() => Meta)
@Roles(RoleEnum.ADMIN)
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
  @Query(() => Meta, { description: 'Get Meta' })
  @Roles(RoleEnum.S_EVERYONE)
  async getMeta(): Promise<Meta> {
    return await this.metaService.get();
  }
}
