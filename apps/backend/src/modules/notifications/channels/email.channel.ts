import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MailService } from '../../../shared/mail.service';
import type { NotificationPayload } from '../notifications.service';

@Injectable()
export class EmailChannel {
  constructor(
    private readonly mail: MailService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    const [cred] = await this.db.query<{ email: string }[]>(
      `SELECT email FROM auth.credentials WHERE user_id = $1 LIMIT 1`,
      [payload.userId],
    );
    if (!cred?.email) return;

    const appName = 'Tickets System';
    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0e2235;padding:20px 28px">
      <span style="color:#ffffff;font-size:18px;font-weight:600">${appName}</span>
    </div>
    <div style="padding:28px">
      <h2 style="margin:0 0 12px;color:#1e293b;font-size:18px">${payload.subject}</h2>
      <p style="margin:0;color:#475569;line-height:1.6">${payload.body}</p>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0">
      <p style="margin:0;color:#94a3b8;font-size:12px">Este es un mensaje automático. No respondas a este correo.</p>
    </div>
  </div>
</body>
</html>`;

    await this.mail.send(cred.email, payload.subject, html);
  }
}
