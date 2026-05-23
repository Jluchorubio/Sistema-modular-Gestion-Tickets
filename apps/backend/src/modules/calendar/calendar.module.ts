import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { RemindersService } from './reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([]), NotificationsModule],
  controllers: [CalendarController],
  providers: [CalendarService, RemindersService],
  exports: [CalendarService],
})
export class CalendarModule {}
