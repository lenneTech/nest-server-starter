import {
  ConfigService,
  CoreModelConstructor,
  CoreUserService,
  EmailService,
  ServiceOptions,
} from '@lenne.tech/nest-server';
import { Inject, Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as fs from 'fs';
import { PubSub } from 'graphql-subscriptions';
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
    protected readonly configService: ConfigService,
    protected readonly emailService: EmailService,
    @Inject('USER_CLASS') protected readonly mainModelConstructor: CoreModelConstructor<User>,
    @InjectModel('User') protected readonly mainDbModel: Model<UserDocument>,
    @Inject('PUB_SUB') protected readonly pubSub: PubSub
  ) {
    super(emailService, mainDbModel, mainModelConstructor);
  }

  // ===================================================================================================================
  // Methods
  // ===================================================================================================================

  /**
   * Create new user and send welcome email
   */
  async create(input: UserCreateInput, serviceOptions?: ServiceOptions): Promise<User> {
    // Get prepared user
    let user = await super.create(input, serviceOptions);

    // Add the createdBy information in an extra step if it was not set by the system because the user created himself
    // and could not exist as currentUser before
    if (!user.createdBy) {
      await this.mainDbModel.findByIdAndUpdate(user.id, { createdBy: user.id });
      user = await this.get(user.id, { ...serviceOptions, currentUser: serviceOptions?.currentUser || user });
    }

    // Publish action
    if (serviceOptions?.pubSub === undefined || serviceOptions.pubSub) {
      await this.pubSub.publish('userCreated', User.map(user));
    }

    // Return created user
    return user;
  }

  /**
   * Request password reset mail
   */
  async sendPasswordResetMail(email: string, serviceOptions?: ServiceOptions): Promise<User> {
    // Set password reset token
    const user = await super.setPasswordResetTokenForEmail(email, serviceOptions);

    // Send email
    await this.emailService.sendMail(user.email, 'Password reset', {
      htmlTemplate: 'password-reset',
      templateData: {
        name: user.username,
        link: this.configService.configFastButReadOnly.email.passwordResetLink + '/' + user.passwordResetToken,
      },
    });

    // Return user
    return user;
  }

  /**
   * Set avatar image
   */
  async setAvatar(file: Express.Multer.File, user: User): Promise<string> {
    const dbUser = await this.mainDbModel.findOne({ id: user.id }).exec();
    // Check user
    if (!dbUser) {
      throw new UnauthorizedException();
    }

    // Check file
    if (!file) {
      throw new UnprocessableEntityException('Missing avatar file');
    }

    // Remove old avatar image
    if (user.avatar) {
      fs.unlink(this.configService.configFastButReadOnly.staticAssets.path + '/avatars/' + user.avatar, (err) => {
        if (err) {
          console.error(err);
        }
      });
    }

    // Update user
    dbUser.avatar = file.filename;

    await dbUser.save();

    // Return user
    return file.filename;
  }
}
