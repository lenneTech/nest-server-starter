import { Restricted, RoleEnum, UnifiedField } from '@lenne.tech/nest-server';
import { ObjectType } from '@nestjs/graphql';

import { User } from '../user.model';

@ObjectType({ description: 'Result of find and count' })
@Restricted(RoleEnum.ADMIN)
export class FindAndCountUsersResult {

  @UnifiedField({
    array: true,
    description: 'Found users',
    type: () => User,
  })
  items: User[];

  @UnifiedField({
    description: 'Total count (skip/offset and limit/take are ignored in the count)',
    isOptional: false,
  })
  totalCount: number;
}
