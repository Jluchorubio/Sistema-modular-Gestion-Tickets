import { Controller, Get, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';

interface NotificationLog {
  id:         string;
  event_type: string;
  status:     'pending' | 'sent' | 'failed';
  payload:    Record<string, unknown>;
  created_at: string;
  sent_at:    string | null;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Get('me')
  @ApiOperation({ summary: 'Listar notificaciones internas del usuario autenticado (últimas 30).' })
  async getMyNotifications(@Req() req: any) {
    const rows = await this.db.query<NotificationLog[]>(
      `SELECT id, event_type, status, payload, created_at, sent_at
       FROM notifications.notification_logs
       WHERE user_id = $1
         AND channel = 'in_app'
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.sub],
    );
    const unread = rows.filter((r) => r.status === 'pending').length;
    return { notifications: rows, unread_count: unread };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificación interna como leída.' })
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    await this.db.query(
      `UPDATE notifications.notification_logs
       SET status = 'sent', sent_at = now()
       WHERE id = $1 AND user_id = $2 AND channel = 'in_app'`,
      [id, req.user.sub],
    );
    return { ok: true };
  }

  @Patch('me/read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones internas como leídas.' })
  async markAllAsRead(@Req() req: any) {
    await this.db.query(
      `UPDATE notifications.notification_logs
       SET status = 'sent', sent_at = now()
       WHERE user_id = $1 AND channel = 'in_app' AND status = 'pending'`,
      [req.user.sub],
    );
    return { ok: true };
  }
}
