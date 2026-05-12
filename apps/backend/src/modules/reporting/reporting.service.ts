import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportingService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async slaMetrics(moduleId?: string) {
    const cond  = moduleId ? `AND t.module_id = $1` : '';
    const params = moduleId ? [moduleId] : [];

    const [summary] = await this.db.query<any[]>(
      `SELECT
         COUNT(*)                                           AS total,
         COUNT(*) FILTER (WHERE t.sla_deadline IS NULL)    AS without_sla,
         COUNT(*) FILTER (WHERE t.sla_deadline < now() AND NOT s.is_final) AS breached,
         COUNT(*) FILTER (WHERE t.sla_deadline >= now() OR s.is_final)    AS compliant,
         ROUND(
           100.0 * COUNT(*) FILTER (WHERE t.sla_deadline >= now() OR s.is_final)
           / NULLIF(COUNT(*) FILTER (WHERE t.sla_deadline IS NOT NULL), 0)
         , 1) AS compliance_pct
       FROM tickets.tickets t
       JOIN tickets.states s ON s.id = t.current_state_id
       WHERE 1=1 ${cond}`,
      params,
    );

    const byPriority = await this.db.query<any[]>(
      `SELECT
         t.priority,
         COUNT(*)                                                      AS total,
         COUNT(*) FILTER (WHERE t.sla_deadline < now() AND NOT s.is_final) AS breached,
         AVG(EXTRACT(EPOCH FROM (t.sla_deadline - t.created_at)) / 3600) AS avg_sla_hours
       FROM tickets.tickets t
       JOIN tickets.states s ON s.id = t.current_state_id
       WHERE t.sla_deadline IS NOT NULL ${cond}
       GROUP BY t.priority
       ORDER BY t.priority`,
      params,
    );

    return { summary, by_priority: byPriority };
  }

  async ticketsSummary(moduleId?: string) {
    const cond  = moduleId ? `AND t.module_id = $1` : '';
    const params = moduleId ? [moduleId] : [];

    const byState = await this.db.query<any[]>(
      `SELECT s.name AS state_name, s.label AS state_label, s.is_final,
              COUNT(*) AS total
       FROM tickets.tickets t
       JOIN tickets.states s ON s.id = t.current_state_id
       WHERE 1=1 ${cond}
       GROUP BY s.name, s.label, s.is_final
       ORDER BY s.is_final, s.name`,
      params,
    );

    const byPriority = await this.db.query<any[]>(
      `SELECT t.priority, COUNT(*) AS total
       FROM tickets.tickets t WHERE 1=1 ${cond}
       GROUP BY t.priority ORDER BY t.priority`,
      params,
    );

    const trend = await this.db.query<any[]>(
      `SELECT date_trunc('day', t.created_at)::date AS day, COUNT(*) AS created
       FROM tickets.tickets t
       WHERE t.created_at >= now() - INTERVAL '30 days' ${cond}
       GROUP BY 1 ORDER BY 1`,
      params,
    );

    const [totals] = await this.db.query<any[]>(
      `SELECT
         COUNT(*)                                           AS total,
         COUNT(*) FILTER (WHERE NOT s.is_final)            AS open,
         COUNT(*) FILTER (WHERE s.is_final)                AS closed,
         COUNT(*) FILTER (WHERE t.created_at >= now() - INTERVAL '7 days') AS last_7_days
       FROM tickets.tickets t
       JOIN tickets.states s ON s.id = t.current_state_id
       WHERE 1=1 ${cond}`,
      params,
    );

    return { totals, by_state: byState, by_priority: byPriority, daily_trend: trend };
  }
}
