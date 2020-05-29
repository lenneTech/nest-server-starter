import { CoreEditorModel } from '@lenne.tech/nest-server';
import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Editor model
 */
@ObjectType({ description: 'Editor' })
export class Editor extends CoreEditorModel {
  /**
   * URL to avatar file of the user
   */
  @Field({ description: 'URL to avatar file of the editor', nullable: true })
  avatar: string;
}
