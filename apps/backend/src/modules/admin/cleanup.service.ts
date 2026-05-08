import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { AdminService } from './admin.service';

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly adminService: AdminService) {}

  onModuleInit() {
    this.runPurge();
    this.timer = setInterval(() => this.runPurge(), INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runPurge() {
    try {
      const result = await this.adminService.purgeExpired();
      if (result.purged > 0) {
        this.logger.log(`Scheduled purge: removed ${result.purged} expired items`);
      }
    } catch (err: any) {
      this.logger.error(`Scheduled purge failed: ${err.message}`);
    }
  }
}
