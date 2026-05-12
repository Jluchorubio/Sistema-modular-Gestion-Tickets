import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  @Get()
  findAll(@Req() req: any, @Query('module_id') moduleId?: string) {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne();
  }

  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.service.create();
  }

  @Patch(':id/transition')
  transition(@Param('id') id: string, @Body() body: any) {
    return this.service.transition();
  }
}
