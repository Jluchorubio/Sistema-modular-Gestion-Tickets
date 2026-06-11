import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminService } from './admin.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly adminService: AdminService) {}

  /** Daily at 02:00 UTC — hard-delete items past their scheduled_hard_delete_at */
  @Cron('0 0 2 * * *')
  async runPurge() {
    try {
      const result = await this.adminService.purgeExpired();
      if (result.purged > 0) {
        this.logger.log(`Scheduled purge: removed ${result.purged} expired items`);
      }
    } catch (err: any) {
      this.logger.error(`Scheduled purge failed: ${err.message}`);
    }

    try {
      await this.adminService.checkAndSendTrashWarnings();
    } catch (err: any) {
      this.logger.error(`Trash warning check failed: ${err.message}`);
    }
  }
}
