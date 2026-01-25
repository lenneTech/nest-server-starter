import { PaginationInfo, Restricted, RoleEnum, UnifiedField } from '@lenne.tech/nest-server';
import { ObjectType } from '@nestjs/graphql';

import { User } from '../user.model';

@ObjectType({ description: 'Result of find and count' })
@Restricted(RoleEnum.ADMIN)
export class FindAndCountUsersResult {
  @UnifiedField({
    description: 'Found users',
    isArray: true,
    type: () => User,
  })
  items: User[];

  @UnifiedField({
    description: 'Pagination information',
    isOptional: true,
    type: () => PaginationInfo,
  })
  pagination?: PaginationInfo;

  @UnifiedField({
    description: 'Total count (skip/offset and limit/take are ignored in the count)',
    isOptional: false,
  })
  totalCount: number;
}
