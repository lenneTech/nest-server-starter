import { ApiCommonErrorResponses, RoleEnum, Roles } from '@lenne.tech/nest-server';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Meta } from './meta.model';
import { MetaService } from './meta.service';

/**
 * Controller to handle meta REST API endpoints
 */
@ApiCommonErrorResponses()
@ApiTags('meta')
@Controller('meta')
@Roles(RoleEnum.S_EVERYONE)
export class MetaController {
  /**
   * Import services
   */
  constructor(private readonly metaService: MetaService) {}

  // ===========================================================================
  // GET Endpoints (Queries)
  // ===========================================================================

  /**
   * Get metadata
   */
  @ApiOkResponse({ description: 'Metadata retrieved successfully', type: Meta })
  @ApiOperation({ description: 'Get metadata information', summary: 'Get metadata' })
  @Get()
  @Roles(RoleEnum.S_EVERYONE)
  async getMeta(): Promise<Meta> {
    return await this.metaService.get();
  }
}
