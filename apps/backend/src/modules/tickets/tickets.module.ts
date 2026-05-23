import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [TicketsController, MeetingsController],
  providers: [TicketsService, MeetingsService],
  exports: [TicketsService, MeetingsService],
})
export class TicketsModule {}
