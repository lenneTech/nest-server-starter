import {
  ConfigService,
  CoreUserService,
  EmailService,
  Filter,
  FilterArgs,
  ICorePersistenceModel,
  ServiceHelper,
} from '@lenne.tech/nest-server';
import { Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import * as fs from 'fs';
import { GraphQLResolveInfo } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import envConfig from '../../../config.env';
import { UserCreateInput } from './inputs/user-create.input';
import { UserInput } from './inputs/user.input';
import { User, UserDocument } from './user.model';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

// Subscription
const pubSub = new PubSub();

/**
 * User service
 */
@Injectable()
export class UserService extends CoreUserService<User, UserInput, UserCreateInput> {
  // ===================================================================================================================
  // Properties
  // ===================================================================================================================

  /**
   * User model
   */
  protected readonly model: ICorePersistenceModel;

  // ===================================================================================================================
  // Injections
  // ===================================================================================================================

  /**
   * Constructor for injecting services
   */
  constructor(
    protected readonly configService: ConfigService,
    protected readonly emailService: EmailService,
    @InjectModel('User') protected readonly userModel: Model<UserDocument>
  ) {
    super(userModel);
    this.model = User;
  }

  // ===================================================================================================================
  // Methods
  // ===================================================================================================================

  /**
   * Create new user and send welcome email
   */
  async create(input: UserCreateInput, currentUser?: User, ...args: any[]): Promise<User> {
    try {
      const user = await super.create(input, currentUser);
      const text = `Welcome ${user.firstName}, this is plain text from server.`;
      await this.emailService.sendMail(user.email, 'Welcome', {
        htmlTemplate: 'welcome',
        templateData: user,
        text,
      });
      return user;
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Get users via filter
   */
  find(filterArgs?: FilterArgs, ...args: any[]): Promise<User[]> {
    // Get filter query
    const filterQuery = Filter.convertFilterArgsToQuery(filterArgs);
    // Return found users
    return this.userModel.find(filterQuery[0], null, filterQuery[1]).exec();
  }

  /**
   * Set avatar image
   */
  async setAvatar(file: Express.Multer.File, user: User): Promise<string> {
    const dbUser = await this.userModel.findOne({ id: user.id }).exec();

    // Check user
    if (!user) {
      throw new UnauthorizedException();
    }

    // Check file
    if (!file) {
      throw new UnprocessableEntityException('Missing avatar file');
    }

    // Remove old avatar image
    if (user.avatar) {
      fs.unlink(envConfig.staticAssets.path + '/avatars/' + user.avatar, (err) => {
        if (err) {
          console.log(err);
        }
      });
    }

    // Update user
    dbUser.avatar = file.filename;

    await dbUser.save();

    // Return user
    return file.filename;
  }

  // ===================================================================================================================
  // Helper methods
  // ===================================================================================================================

  /**
   * Prepare input before save
   */
  protected async prepareInput(input: { [key: string]: any }, currentUser: User, options: { create?: boolean } = {}) {
    return ServiceHelper.prepareInput(input, currentUser, options);
  }

  /**
   * Prepare output before return
   */
  protected async prepareOutput(user: User, info?: GraphQLResolveInfo) {
    return ServiceHelper.prepareOutput(user, User, this);
  }
}
