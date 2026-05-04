import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { SystemModulesModule } from './modules/system-modules/system-modules.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),

    // Rate limiting global: 100 req / 60s por IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    SharedModule,
    HealthModule,
    AuthModule,
    SystemModulesModule,
    TicketsModule,
    InventoryModule,
    FilesModule,
    NotificationsModule,
    ReportingModule,
  ],
  providers: [
    // Rate limit guard aplicado globalmente
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
