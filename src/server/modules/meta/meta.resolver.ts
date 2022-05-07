import { Query, Resolver } from '@nestjs/graphql';
import { Meta } from './meta.model';
import { MetaService } from './meta.service';

/**
 * Resolver to process with metadata
 */
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
  @Query(() => Meta, { description: 'Get Meta' })
  async getMeta(): Promise<Meta> {
    return await this.metaService.get();
  }
}
