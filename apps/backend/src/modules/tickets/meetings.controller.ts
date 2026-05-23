import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../../gateway/guards/profile-complete.guard';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { MeetingsService, type CreateMeetingDto, type MeetingStatus } from './meetings.service';

@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProfileCompleteGuard)
@Controller()
export class MeetingsController {
  constructor(private readonly service: MeetingsService) {}

  @Get('meetings/calendar')
  @RequirePermission('helpdesk:tickets:view')
  @ApiOperation({ summary: 'Reuniones activas/programadas para el calendario del usuario.' })
  getCalendarMeetings(
    @Req() req: any,
    @Query('module_id') moduleId?: string,
  ) {
    const isSuperadmin: boolean = req.user?.is_superadmin ?? false;
    return this.service.getCalendarMeetings(req.user.sub, isSuperadmin, moduleId);
  }

  @Get('tickets/:ticketId/meetings')
  @RequirePermission('helpdesk:tickets:view')
  @ApiOperation({ summary: 'Listar reuniones de un ticket.' })
  getMeetings(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.service.getMeetings(ticketId);
  }

  @Post('tickets/:ticketId/meetings')
  @RequirePermission('helpdesk:tickets:edit')
  @ApiOperation({ summary: 'Programar reunión para un ticket.' })
  createMeeting(
    @Req() req: any,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: CreateMeetingDto & { participant_ids?: string[] },
  ) {
    return this.service.createMeeting(req.user.sub, ticketId, dto);
  }

  @Patch('meetings/:meetingId')
  @RequirePermission('helpdesk:tickets:edit')
  @ApiOperation({ summary: 'Actualizar estado o URL de reunión.' })
  updateMeeting(
    @Req() req: any,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: { status?: MeetingStatus; meeting_url?: string },
  ) {
    return this.service.updateMeeting(meetingId, req.user.sub, dto);
  }

  @Delete('meetings/:meetingId')
  @RequirePermission('helpdesk:tickets:edit')
  @ApiOperation({ summary: 'Cancelar reunión.' })
  cancelMeeting(
    @Req() req: any,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
  ) {
    return this.service.cancelMeeting(meetingId, req.user.sub);
  }
}
