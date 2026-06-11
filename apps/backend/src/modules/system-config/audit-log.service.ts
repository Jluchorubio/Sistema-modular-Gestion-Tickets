import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface AuditContext {
  userId:       string;
  reason:       string;
  ip:           string | null;
  userAgent:    string | null;
  verified_2fa: boolean;
  action:       'CREATE' | 'UPDATE' | 'DELETE';
}

export interface AuditEntry extends AuditContext {
  entityType:    string;
  entityId?:     string;
  previousValue?: Record<string, unknown>;
  newValue?:      Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO audit.system_configuration_logs
         (user_id, action, entity_type, entity_id, previous_value, new_value,
          reason, ip_address, user_agent, verified_2fa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::inet,$9,$10)`,
      [
        entry.userId,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.previousValue ? JSON.stringify(entry.previousValue) : null,
        entry.newValue      ? JSON.stringify(entry.newValue)      : null,
        entry.reason,
        entry.ip,
        entry.userAgent,
        entry.verified_2fa,
      ],
    );
  }

  async getLogs(params: {
    limit?:       number;
    offset?:      number;
    entity_type?: string;
    entity_id?:   string;
    user_id?:     string;
  }) {
    const conditions: string[] = [];
    const values: unknown[]    = [];
    let idx = 1;

    if (params.entity_type) { conditions.push(`l.entity_type = $${idx++}`); values.push(params.entity_type); }
    if (params.entity_id)   { conditions.push(`l.entity_id   = $${idx++}`); values.push(params.entity_id); }
    if (params.user_id)     { conditions.push(`l.user_id     = $${idx++}`); values.push(params.user_id); }

    const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit  = Math.min(params.limit  ?? 50, 200);
    const offset = params.offset ?? 0;

    values.push(limit, offset);

    return this.db.query<any[]>(
      `SELECT l.id, l.action, l.entity_type, l.entity_id,
              l.previous_value, l.new_value, l.reason,
              l.ip_address, l.verified_2fa, l.created_at,
              p.first_name || ' ' || p.last_name AS user_name,
              p.username
       FROM audit.system_configuration_logs l
       JOIN users.profiles p ON p.id = l.user_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values,
    );
  }
}
