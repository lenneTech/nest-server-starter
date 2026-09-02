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
   *
   * Returns `null` for an address without an account. The callers must still answer the same thing
   * either way — see the note on `requestPasswordResetMail` in the controller and the resolver.
   *
   * Three things here are deliberate, and each was a defect once (tests/password-reset-mail.e2e-spec.ts):
   *
   * - The token comes from `createPasswordResetToken`, not off the returned user. The security
   *   interceptor strips `passwordResetToken` from anything `process()` hands back — correctly, a
   *   reset token in a response body is one in a log and a proxy cache — so reading it there
   *   yielded `undefined` and mailed it.
   * - The link comes from `buildPasswordResetLink`, which resolves the app URL the same way the
   *   cookie and CORS setup does and returns `null` rather than a string containing `undefined`.
   *   Hand-built bases missed both the localhost defaults and the page's real path.
   * - The send is NOT awaited. A mail send is a network round trip; awaiting it makes the response
   *   time say whether the address exists, which is the same disclosure the equal status codes are
   *   there to prevent.
   */
  async sendPasswordResetMail(email: string, serviceOptions?: ServiceOptions): Promise<null | User> {
    const created = await this.createPasswordResetToken(email, serviceOptions);

    // Unknown address: nothing to send, and nothing to say about it.
    if (!created) {
      return null;
    }

    const link = this.buildPasswordResetLink(created.token);
    if (!link) {
      // Sending a mail whose link cannot work is worse than sending none: the recipient has no
      // second way in, and a dead link gives them nothing to act on.
      this.userServiceLogger.error(
        'Password reset mail not sent: no reset link could be built. Set `email.passwordResetLink` or `appUrl`.',
      );
      return created.user;
    }

    void this.emailService
      .sendMail(created.user.email, 'Password reset', {
        htmlTemplate: 'password-reset',
        templateData: {
          link,
          name: created.user.username,
        },
      })
      .catch((error: unknown) => {
        this.userServiceLogger.error(`Password reset mail could not be sent: ${String(error)}`);
      });

    return created.user;
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
