import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../../gateway/guards/profile-complete.guard';
import { CalendarService, type CreateCalendarEventDto, type UpdateCalendarEventDto } from './calendar.service';

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProfileCompleteGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get('events')
  @ApiOperation({ summary: 'Listar eventos del calendario (scoped por rol).' })
  getEvents(
    @Req() req: any,
    @Query('module_id') moduleId?: string,
    @Query('start_at')  startAt?:  string,
    @Query('end_at')    endAt?:    string,
  ) {
    return this.service.getEvents(
      req.user.sub,
      req.user?.is_superadmin ?? false,
      { module_id: moduleId, start_at: startAt, end_at: endAt },
    );
  }

  @Post('events')
  @ApiOperation({ summary: 'Crear evento en el calendario.' })
  createEvent(@Req() req: any, @Body() dto: CreateCalendarEventDto) {
    return this.service.createEvent(req.user.sub, dto);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Actualizar evento del calendario.' })
  updateEvent(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.service.updateEvent(id, req.user.sub, req.user?.is_superadmin ?? false, dto);
  }

  @Delete('events/:id')
  @ApiOperation({ summary: 'Eliminar (soft-delete) evento del calendario.' })
  deleteEvent(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deleteEvent(id, req.user.sub, req.user?.is_superadmin ?? false);
  }
}
