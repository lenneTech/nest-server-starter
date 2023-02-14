import { ConfigService, CoreCronJobs } from '@lenne.tech/nest-server';
import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class CronJobs extends CoreCronJobs {
  // ===================================================================================================================
  // Initializations
  // ===================================================================================================================

  /**
   * Init cron jobs
   */
  constructor(protected override schedulerRegistry: SchedulerRegistry, protected configService: ConfigService) {
    super(schedulerRegistry, configService.config.cronJobs, { log: true });
  }

  // ===================================================================================================================
  // Cron jobs
  // ===================================================================================================================

  protected sayHello() {
    console.info(
      'Hello :)\n' +
        'Remove this cron job by removing the corresponding configuration from config.env.ts ' +
        'or the service from the provider configuration in the ServerModule'
    );
  }
}
