import { CoreCronJobs } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import envConfig from '../../../config.env';

@Injectable()
export class CronJobs extends CoreCronJobs {
  // ===================================================================================================================
  // Initializations
  // ===================================================================================================================

  /**
   * Init cron jobs
   */
  constructor(protected schedulerRegistry: SchedulerRegistry) {
    super(schedulerRegistry, envConfig.cronJobs, { log: true });
  }

  // ===================================================================================================================
  // Cron jobs
  // ===================================================================================================================

  protected sayHello() {
    console.log(
      'Hello :)\n' +
        'Remove this cron job by removing the corresponding configuration from config.env.ts ' +
        'or the service from the provider configuration in the ServerModule'
    );
  }
}
