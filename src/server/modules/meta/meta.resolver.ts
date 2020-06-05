import { Info, Query, Resolver } from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { Meta } from './meta.model';
import { MetaService } from './meta.service';

/**
 * Resolver to process with Meta data
 */
@Resolver((of) => Meta)
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
  @Query((returns) => Meta, { description: 'Get Meta' })
  async getMeta(@Info() info: GraphQLResolveInfo): Promise<Meta> {
    return await this.metaService.get(info);
  }
}
