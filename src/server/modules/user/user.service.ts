import {
  ConfigService,
  CoreBetterAuthUserMapper,
  CoreModelConstructor,
  CoreUserService,
  EmailService,
  ServiceOptions,
} from '@lenne.tech/nest-server';
import { Inject, Injectable, Optional, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
// #region graphql
import { PubSub } from 'graphql-subscriptions';
// #endregion graphql
import { Model } from 'mongoose';

import { UserCreateInput } from './inputs/user-create.input';
import { UserInput } from './inputs/user.input';
import { User, UserDocument } from './user.model';

/**
 * User service
 */
@Injectable()
export class UserService extends CoreUserService<User, UserInput, UserCreateInput> {
  // ===================================================================================================================
  // Injections
  // ===================================================================================================================

  /**
   * Constructor for injecting services
   */
  constructor(
    protected override readonly configService: ConfigService,
    protected override readonly emailService: EmailService,
    @Inject('USER_CLASS') protected override readonly mainModelConstructor: CoreModelConstructor<User>,
    @InjectModel('User') protected override readonly mainDbModel: Model<UserDocument>,
    // #region graphql
    @Inject('PUB_SUB') protected readonly pubSub: PubSub,
    // #endregion graphql
    @Optional() private readonly betterAuthUserMapper?: CoreBetterAuthUserMapper,
  ) {
    super(configService, emailService, mainDbModel, mainModelConstructor, { betterAuthUserMapper });
  }

  // ===================================================================================================================
  // Methods
  // ===================================================================================================================

  /**
   * Create new user and send welcome email
   */
  override async create(input: UserCreateInput, serviceOptions?: ServiceOptions): Promise<User> {
    // Get prepared user
    let user = await super.create(input, serviceOptions);

    // Add the createdBy information in an extra step if it was not set by the system because the user created himself
    // and could not exist as currentUser before
    if (!user.createdBy) {
      await this.mainDbModel.findByIdAndUpdate(user.id, { createdBy: user.id });
      user = await this.get(user.id, { ...serviceOptions, currentUser: serviceOptions?.currentUser || user });
    }

    // #region graphql
    // Publish action
    if (serviceOptions?.pubSub === undefined || serviceOptions.pubSub) {
      await this.pubSub.publish('userCreated', User.map(user));
    }
    // #endregion graphql

    // Return created user
    return user;
  }

  /**
   * Request password reset mail
   */
  async sendPasswordResetMail(email: string, serviceOptions?: ServiceOptions): Promise<User> {
    // Set password reset token
    const user = await super.setPasswordResetTokenForEmail(email, serviceOptions);

    // Build reset link.
    // Priority: explicit email.passwordResetLink (deployment override) → derived from appUrl/baseUrl.
    // Since nest-server 11.25.0 the reference config no longer ships email.passwordResetLink —
    // setting it remains supported as a deploy-specific override (IServerOptions still accepts it).
    const config = this.configService.configFastButReadOnly;
    const baseLink = config.email?.passwordResetLink || `${config.appUrl || config.baseUrl}/auth/password-reset`;

    // Send email
    await this.emailService.sendMail(user.email, 'Password reset', {
      htmlTemplate: 'password-reset',
      templateData: {
        link: `${baseLink}/${user.passwordResetToken}`,
        name: user.username,
      },
    });

    // Return user
    return user;
  }

  // #region rest
  /**
   * Point the user's avatar at an already-stored file
   *
   * Takes the file ID rather than the upload itself: the bytes belong in the central
   * file storage (GridFS/S3) so every replica can serve them and a restart does not
   * lose them. Putting that dependency here is not possible — `UserService` is
   * instantiated by `CoreAuthModule`, which knows nothing about this project's
   * `FileModule` — so `AvatarController` stores the file and calls this with the id.
   *
   * @returns the PREVIOUS avatar id, so the caller can delete the orphaned file
   */
  async setAvatar(avatarId: string, user: User): Promise<string> {
    // `findById`, not `findOne({ id })`: `id` is a Mongoose virtual, so it exists on the
    // document but not in MongoDB — a filter on it matches nothing, and every avatar
    // upload therefore ended in "session user no longer exists".
    const dbUser = await this.mainDbModel.findById(user.id).exec();

    // Check user: the token is valid but the account no longer exists, so the session
    // really is invalid — 401 is right here (a permission error would have to be 403).
    if (!dbUser) {
      throw new UnauthorizedException('User of the current session no longer exists');
    }

    // Check file
    if (!avatarId) {
      throw new UnprocessableEntityException('Missing avatar file');
    }

    const previousAvatar = dbUser.avatar;

    // The avatar is referenced by file id and served via GET /files/id/:id
    dbUser.avatar = avatarId;

    await dbUser.save();

    return previousAvatar;
  }
  // #endregion rest
}
