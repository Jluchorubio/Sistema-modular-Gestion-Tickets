import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportingService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async slaMetrics(moduleId?: string, dateFrom?: string, dateTo?: string) {
    const conditions: string[] = [];
    const params: any[]        = [];
    let   idx = 1;

    if (moduleId)  { conditions.push(`t.module_id = $${idx++}`); params.push(moduleId); }
    if (dateFrom)  { conditions.push(`t.created_at >= $${idx++}`); params.push(dateFrom); }
    if (dateTo)    { conditions.push(`t.created_at <= $${idx++}`); params.push(dateTo); }

    const cond = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    const [summary] = await this.db.query<any[]>(
      `SELECT
         COUNT(*)                                                          AS total,
         -- Legacy: no sla_deadline column OR no tracking row
         COUNT(*) FILTER (WHERE t.sla_deadline IS NULL
                             OR  tst.ticket_id IS NULL)                   AS without_sla,
         COUNT(*) FILTER (WHERE tst.status = 'breached')                  AS breached,
         COUNT(*) FILTER (WHERE tst.status IN ('met', 'active'))           AS compliant,
         ROUND(
           100.0 * COUNT(*) FILTER (WHERE tst.status IN ('met', 'active'))
           / NULLIF(COUNT(*) FILTER (WHERE tst.ticket_id IS NOT NULL), 0)
         , 1) AS compliance_pct
       FROM tickets.tickets t
       JOIN tickets.states s ON s.id = t.current_state_id
       LEFT JOIN tickets.ticket_sla_tracking tst ON tst.ticket_id = t.id
       WHERE 1=1 ${cond}`,
      params,
    );

    const byPriority = await this.db.query<any[]>(
      `SELECT
         t.priority,
         COUNT(*)                                                      AS total,
         COUNT(*) FILTER (WHERE tst.status = 'breached')              AS breached,
         AVG(EXTRACT(EPOCH FROM (tst.deadline_at - tst.started_at)) / 3600) AS avg_sla_hours
       FROM tickets.tickets t
       JOIN tickets.states s ON s.id = t.current_state_id
       LEFT JOIN tickets.ticket_sla_tracking tst ON tst.ticket_id = t.id
       WHERE t.sla_deadline IS NOT NULL ${cond}
       GROUP BY t.priority
       ORDER BY t.priority`,
      params,
    );

    return { summary, by_priority: byPriority };
  }

  async auditLog(limit = 50, entityType?: string) {
    const cond   = entityType ? `AND el.entity_type = $2` : '';
    const params = entityType ? [limit, entityType] : [limit];
    return this.db.query<any[]>(
      `SELECT el.id, el.action, el.entity_type, el.entity_id,
              el.ip_address, el.created_at,
              p.first_name || ' ' || p.last_name AS actor_name,
              c.email AS actor_email
       FROM   audit.event_log el
       LEFT JOIN users.profiles   p ON p.id = el.actor_id
       LEFT JOIN auth.credentials c ON c.user_id = el.actor_id
       WHERE  1=1 ${cond}
       ORDER  BY el.created_at DESC
       LIMIT  $1`,
      params,
    );
  }

  async inventorySummary(moduleId?: string) {
    const cond   = moduleId ? `AND a.module_id = $1` : '';
    const params = moduleId ? [moduleId] : [];
    let i = params.length + 1;

    const [totals] = await this.db.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE a.deleted_at IS NULL)                                     AS total,
         COUNT(*) FILTER (WHERE a.deleted_at IS NULL AND a.status = 'disponible')         AS disponible,
         COUNT(*) FILTER (WHERE a.deleted_at IS NULL AND a.status = 'asignado')           AS asignado,
         COUNT(*) FILTER (WHERE a.deleted_at IS NULL AND a.status = 'en_reparacion')      AS en_reparacion,
         COUNT(*) FILTER (WHERE a.deleted_at IS NULL AND a.status = 'dado_de_baja')       AS dado_de_baja,
         COUNT(*) FILTER (WHERE a.deleted_at IS NULL AND a.created_at >= now() - INTERVAL '30 days') AS added_last_30
       FROM inventory.assets a
       WHERE 1=1 ${cond}`,
      params,
    );

    const byCategory = await this.db.query<any[]>(
      `SELECT c.name AS category_name, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE a.status = 'disponible')    AS disponible,
              COUNT(*) FILTER (WHERE a.status = 'asignado')      AS asignado
       FROM   inventory.assets a
       JOIN   modules.categories c ON c.id = a.category_id
       WHERE  a.deleted_at IS NULL ${cond}
       GROUP  BY c.name ORDER BY total DESC LIMIT 10`,
      params,
    );

    return { totals, by_category: byCategory };
  }

  async exportTicketsCsv(moduleId?: string): Promise<string> {
    const cond   = moduleId ? `AND t.module_id = $1` : '';
    const params = moduleId ? [moduleId] : [];

    const rows = await this.db.query<any[]>(
      `SELECT t.id, t.title, t.priority, t.created_at, t.updated_at, t.sla_deadline,
              s.label  AS state,
              m.name   AS module_name,
              e.name   AS environment_name,
              c.name   AS category_name,
              p.first_name || ' ' || p.last_name AS created_by_name
       FROM   tickets.tickets t
       JOIN   tickets.states        s ON s.id  = t.current_state_id
       JOIN   modules.modules       m ON m.id  = t.module_id
       JOIN   modules.environments  e ON e.id  = t.environment_id
       JOIN   modules.categories    c ON c.id  = t.category_id
       LEFT JOIN users.profiles     p ON p.id  = t.created_by
       WHERE  1=1 ${cond}
       ORDER  BY t.created_at DESC
       LIMIT  5000`,
      params,
    );

    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const headers = ['id','title','priority','state','module','environment','category','created_by','created_at','updated_at','sla_deadline'];
    const lines   = [
      headers.join(','),
      ...rows.map((r) => [
        r.id, r.title, r.priority, r.state, r.module_name,
        r.environment_name, r.category_name, r.created_by_name,
        r.created_at, r.updated_at, r.sla_deadline ?? '',
      ].map(escape).join(',')),
    ];
    return lines.join('\r\n');
  }

  async ticketsSummary(moduleId?: string, dateFrom?: string, dateTo?: string) {
    const conditions: string[] = [];
    const params: any[]        = [];
    let   idx = 1;

    if (moduleId)  { conditions.push(`t.module_id = $${idx++}`); params.push(moduleId); }
    if (dateFrom)  { conditions.push(`t.created_at >= $${idx++}`); params.push(dateFrom); }
    if (dateTo)    { conditions.push(`t.created_at <= $${idx++}`); params.push(dateTo); }

    const cond = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    // Trend: use supplied date range, or last 30 days if no from-date
    const trendFrom = dateFrom ?? null;
    const trendCond = trendFrom
      ? cond
      : `${cond} AND t.created_at >= now() - INTERVAL '30 days'`;

    const [byState, byPriority, trend, [totals]] = await Promise.all([
      this.db.query<any[]>(
        `SELECT s.name AS state_name, s.label AS state_label, s.is_final,
                COUNT(*) AS total
         FROM tickets.tickets t
         JOIN tickets.states s ON s.id = t.current_state_id
         WHERE 1=1 ${cond}
         GROUP BY s.name, s.label, s.is_final
         ORDER BY s.is_final, s.name`,
        params,
      ),
      this.db.query<any[]>(
        `SELECT t.priority, COUNT(*) AS total
         FROM tickets.tickets t WHERE 1=1 ${cond}
         GROUP BY t.priority ORDER BY t.priority`,
        params,
      ),
      this.db.query<any[]>(
        `SELECT date_trunc('day', t.created_at)::date AS day, COUNT(*) AS created
         FROM tickets.tickets t
         WHERE 1=1 ${trendCond}
         GROUP BY 1 ORDER BY 1`,
        params,
      ),
      this.db.query<any[]>(
        `SELECT
           COUNT(*)                                           AS total,
           COUNT(*) FILTER (WHERE NOT s.is_final)            AS open,
           COUNT(*) FILTER (WHERE s.is_final)                AS closed,
           COUNT(*) FILTER (WHERE t.created_at >= now() - INTERVAL '7 days') AS last_7_days
         FROM tickets.tickets t
         JOIN tickets.states s ON s.id = t.current_state_id
         WHERE 1=1 ${cond}`,
        params,
      ),
    ]);

    return { totals, by_state: byState, by_priority: byPriority, daily_trend: trend };
  }

  async helpdeskMetrics(moduleId: string) {
    const p = [moduleId];

    const [kpis, byPriority, firstResponse, reopenCount] = await Promise.all([
      this.db.query<any[]>(
        `SELECT
           COUNT(*)                                                                   AS total,
           COUNT(*) FILTER (WHERE NOT s.is_final)                                    AS open,
           COUNT(*) FILTER (WHERE s.is_final)                                        AS closed,
           COUNT(*) FILTER (WHERE t.created_at >= now() - INTERVAL '1 day')          AS today,
           COUNT(*) FILTER (WHERE t.created_at >= now() - INTERVAL '7 days')         AS this_week,
           COUNT(*) FILTER (WHERE t.created_at >= now() - INTERVAL '30 days')        AS this_month,
           COUNT(*) FILTER (WHERE s.name = 'rechazado')                              AS rechazados,
           ROUND(AVG(
             EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 3600
           ) FILTER (WHERE s.is_final), 1)                                            AS avg_resolution_hours,
           ROUND(AVG(
             EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600
           ) FILTER (WHERE NOT s.is_final), 1)                                        AS avg_open_age_hours,
           COUNT(*) FILTER (WHERE st.status = 'breached' AND NOT s.is_final)          AS breach_active
         FROM tickets.tickets t
         JOIN tickets.states s ON s.id = t.current_state_id
         LEFT JOIN tickets.ticket_sla_tracking st ON st.ticket_id = t.id
         WHERE t.module_id = $1`,
        p,
      ),
      this.db.query<any[]>(
        `SELECT
           t.priority,
           COUNT(*)                                                      AS total,
           COUNT(*) FILTER (WHERE NOT s.is_final)                        AS open,
           COUNT(*) FILTER (WHERE s.is_final)                            AS closed,
           COUNT(*) FILTER (WHERE st.status = 'breached')                AS breached
         FROM tickets.tickets t
         JOIN tickets.states s ON s.id = t.current_state_id
         LEFT JOIN tickets.ticket_sla_tracking st ON st.ticket_id = t.id
         WHERE t.module_id = $1
         GROUP BY t.priority
         ORDER BY CASE t.priority
           WHEN 'critica' THEN 1 WHEN 'alta' THEN 2
           WHEN 'media' THEN 3 WHEN 'baja' THEN 4 ELSE 5 END`,
        p,
      ),
      this.db.query<any[]>(
        `SELECT ROUND(AVG(
           EXTRACT(EPOCH FROM (ta.assigned_at - t.created_at)) / 3600
         ), 1) AS avg_first_response_hours
         FROM tickets.tickets t
         JOIN (
           SELECT DISTINCT ON (ticket_id) ticket_id, assigned_at
           FROM   tickets.ticket_assignments
           WHERE  role = 'owner'
           ORDER  BY ticket_id, assigned_at ASC
         ) ta ON ta.ticket_id = t.id
         WHERE t.module_id = $1`,
        p,
      ),
      this.db.query<{ cnt: string }[]>(
        `SELECT COUNT(DISTINCT tsh.ticket_id) AS cnt
         FROM   tickets.ticket_state_history tsh
         JOIN   tickets.tickets t  ON t.id  = tsh.ticket_id AND t.module_id = $1
         JOIN   tickets.states  fs ON fs.id = tsh.from_state_id
         JOIN   tickets.states  ts ON ts.id = tsh.to_state_id
         WHERE  (fs.is_final = true OR fs.is_approval_state = true)
           AND  ts.is_final = false
           AND  ts.is_approval_state = false`,
        p,
      ),
    ]);

    const enrichedKpis = {
      ...kpis[0],
      avg_first_response_hours: firstResponse[0]?.avg_first_response_hours ?? null,
      reopen_count: reopenCount[0]?.cnt ?? '0',
    };

    const byCategory = await this.db.query<any[]>(
      `SELECT c.name AS category_name,
              COUNT(*)                               AS total,
              COUNT(*) FILTER (WHERE s.is_final)     AS closed,
              COUNT(*) FILTER (WHERE NOT s.is_final) AS open
       FROM   tickets.tickets t
       JOIN   modules.categories c ON c.id = t.category_id
       JOIN   tickets.states     s ON s.id = t.current_state_id
       WHERE  t.module_id = $1
       GROUP  BY c.name
       ORDER  BY total DESC
       LIMIT  15`,
      p,
    );

    const byTechnician = await this.db.query<any[]>(
      `SELECT p.id AS technician_id,
              p.first_name || ' ' || p.last_name AS technician_name,
              COUNT(DISTINCT ta.ticket_id)                                           AS tickets_assigned,
              COUNT(DISTINCT ta.ticket_id) FILTER (WHERE s.is_final)                AS tickets_resolved,
              COUNT(DISTINCT ta.ticket_id) FILTER (WHERE s.name = 'rechazado')      AS rechazados,
              ROUND(AVG(
                EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 3600
              ) FILTER (WHERE s.is_final), 1)                                        AS avg_resolution_hours,
              ROUND(AVG(
                EXTRACT(EPOCH FROM (COALESCE(ta.unassigned_at, now()) - ta.assigned_at)) / 3600
              ), 1)                                                                   AS avg_assignment_hours,
              ROUND(AVG(r.score_overall), 1)                                         AS avg_rating,
              COUNT(r.id)                                                             AS total_ratings
       FROM   tickets.ticket_assignments ta
       JOIN   tickets.tickets    t  ON t.id  = ta.ticket_id AND t.module_id = $1
       JOIN   tickets.states     s  ON s.id  = t.current_state_id
       JOIN   users.profiles     p  ON p.id  = ta.user_id
       LEFT JOIN tickets.ticket_ratings r ON r.ticket_id = ta.ticket_id AND r.technician_id = ta.user_id
       WHERE  ta.role = 'owner'
       GROUP  BY p.id, p.first_name, p.last_name
       ORDER  BY tickets_resolved DESC, tickets_assigned DESC
       LIMIT  20`,
      p,
    );

    const sla = await this.slaMetrics(moduleId);
    const trend = await this.db.query<any[]>(
      `SELECT date_trunc('day', t.created_at)::date AS day, COUNT(*) AS created
       FROM   tickets.tickets t
       WHERE  t.module_id = $1 AND t.created_at >= now() - INTERVAL '30 days'
       GROUP  BY 1 ORDER BY 1`,
      p,
    );

    return { kpis: enrichedKpis, by_category: byCategory, by_priority: byPriority, by_technician: byTechnician, sla, daily_trend: trend };
  }
}
