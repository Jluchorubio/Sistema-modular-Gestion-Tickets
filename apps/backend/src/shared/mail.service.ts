import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPass = (this.config.get<string>('SMTP_PASS') ?? '').trim();
    const appName  = this.config.get<string>('APP_NAME') ?? 'Tickets System';
    const from     = this.config.get<string>('EMAIL_FROM') ?? 'noreply@tickets.app';

    if (smtpHost && smtpPass) {
      const transporter = nodemailer.createTransport({
        host:   smtpHost,
        port:   parseInt(this.config.get<string>('SMTP_PORT') ?? '587'),
        secure: (this.config.get<string>('SMTP_PORT') ?? '587') === '465',
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: smtpPass,
        },
      });
      try {
        await transporter.sendMail({ from: `"${appName}" <${from}>`, to, subject, html });
        this.logger.log(`Email enviado via SMTP a ${to}`);
        return;
      } catch (err) {
        this.logger.error(`SMTP error: ${err.message} — usando Resend como fallback`);
      }
    }

    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('Sin config de email. Configura SMTP_PASS o RESEND_API_KEY.');
      return;
    }
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: 'onboarding@resend.dev', to, subject, html });
    if (error) this.logger.error(`Resend error: ${error.message}`);
    else       this.logger.log(`Email enviado via Resend a ${to}`);
  }
}
