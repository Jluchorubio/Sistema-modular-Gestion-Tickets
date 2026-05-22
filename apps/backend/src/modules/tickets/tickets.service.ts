import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TicketsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /* ── Module meta ────────────────────────────────────────────────────────── */

  async getModuleCategories(moduleId: string) {
    return this.db.query<any[]>(
      `SELECT id, name, parent_id
       FROM   modules.categories
       WHERE  module_id = $1 AND deleted_at IS NULL
       ORDER  BY name`,
      [moduleId],
    );
  }

  async getModuleEnvironments(moduleId: string) {
    return this.db.query<any[]>(
      `SELECT e.id, e.name, l.name AS location_name
       FROM   modules.environments e
       LEFT JOIN modules.locations l ON l.id = e.location_id
       WHERE  e.module_id = $1 AND e.deleted_at IS NULL
       ORDER  BY e.name`,
      [moduleId],
    );
  }

  async getModuleWorkflow(moduleId: string) {
    const [wf] = await this.db.query<any[]>(
      `SELECT id, version, description
       FROM   tickets.workflow_versions
       WHERE  module_id = $1 AND is_active = true
       LIMIT  1`,
      [moduleId],
    );
    if (!wf) return null;

    const [states, transitions] = await Promise.all([
      this.db.query<any[]>(
        `SELECT id, name, label, is_initial, is_final
         FROM   tickets.states
         WHERE  workflow_version_id = $1 AND is_active = true
         ORDER  BY is_initial DESC, name`,
        [wf.id],
      ),
      this.db.query<any[]>(
        `SELECT tr.id, tr.name, tr.from_state_id, tr.to_state_id,
                ts2.label AS to_label, ts2.name AS to_name
         FROM   tickets.transitions tr
         JOIN   tickets.states ts2 ON ts2.id = tr.to_state_id
         WHERE  tr.workflow_version_id = $1 AND tr.is_active = true`,
        [wf.id],
      ),
    ]);

    return { workflow: wf, states, transitions };
  }

  /* ── List ───────────────────────────────────────────────────────────────── */

  async findAll(opts: {
    moduleId?:  string;
    stateId?:   string;
    priority?:  string;
    userId?:    string;
    page?:      number;
    limit?:     number;
  }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(100, opts.limit ?? 25);
    const offset = (page - 1) * limit;

    const conds: string[] = [];
    const params: any[]   = [];
    let p = 1;

    if (opts.moduleId) { conds.push(`t.module_id = $${p++}`);         params.push(opts.moduleId); }
    if (opts.stateId)  { conds.push(`t.current_state_id = $${p++}`);  params.push(opts.stateId); }
    if (opts.priority) { conds.push(`t.priority = $${p++}`);          params.push(opts.priority); }
    if (opts.userId)   { conds.push(`t.created_by = $${p++}`);        params.push(opts.userId); }

    const where = conds.length ? conds.join(' AND ') : 'TRUE';

    const [{ count }] = await this.db.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM tickets.tickets t WHERE ${where}`,
      params,
    );

    const rows = await this.db.query<any[]>(
      `SELECT t.id, t.title, t.priority, t.urgency, t.impact,
              t.sla_deadline, t.created_at, t.updated_at,
              t.module_id,      m.name  AS module_name,
              t.category_id,    c.name  AS category_name,
              t.environment_id, e.name  AS environment_name,
              t.current_state_id,
              s.name  AS state_name,
              s.label AS state_label,
              s.is_final,
              t.created_by,
              up.first_name || ' ' || up.last_name AS creator_name,
              (SELECT u2.first_name || ' ' || u2.last_name
               FROM   tickets.ticket_assignments ta
               JOIN   users.profiles u2 ON u2.id = ta.user_id
               WHERE  ta.ticket_id = t.id
                 AND  ta.role      = 'owner'
                 AND  ta.is_active = true
               LIMIT  1) AS assignee_name,
              st.status      AS sla_status,
              st.deadline_at AS sla_deadline_tracked,
              st.breached_at
       FROM   tickets.tickets           t
       JOIN   modules.modules           m  ON m.id  = t.module_id
       LEFT JOIN modules.categories     c  ON c.id  = t.category_id
       LEFT JOIN modules.environments   e  ON e.id  = t.environment_id
       JOIN   tickets.states            s  ON s.id  = t.current_state_id
       JOIN   users.profiles            up ON up.id = t.created_by
       LEFT JOIN tickets.ticket_sla_tracking st ON st.ticket_id = t.id
       WHERE  ${where}
       ORDER  BY t.created_at DESC
       LIMIT  $${p} OFFSET $${p + 1}`,
      [...params, limit, offset],
    );

    return { data: rows, total: parseInt(count, 10), page, limit };
  }

  /* ── Single ─────────────────────────────────────────────────────────────── */

  async findOne(id: string) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT t.id, t.title, t.description, t.priority, t.urgency, t.impact,
              t.sla_deadline, t.created_at, t.updated_at,
              t.module_id,      m.name  AS module_name,
              t.category_id,    c.name  AS category_name,
              t.environment_id, e.name  AS environment_name,
              t.workflow_version_id,
              t.current_state_id,
              s.name  AS state_name,
              s.label AS state_label,
              s.is_final,
              t.created_by,
              up.first_name || ' ' || up.last_name AS creator_name,
              t.reprocess_count,
              st.status      AS sla_status,
              st.deadline_at AS sla_deadline_tracked,
              st.breached_at,
              appr.status    AS approval_status,
              appr.expires_at AS approval_expires_at
       FROM   tickets.tickets           t
       JOIN   modules.modules           m    ON m.id    = t.module_id
       LEFT JOIN modules.categories     c    ON c.id    = t.category_id
       LEFT JOIN modules.environments   e    ON e.id    = t.environment_id
       JOIN   tickets.states            s    ON s.id    = t.current_state_id
       JOIN   users.profiles            up   ON up.id   = t.created_by
       LEFT JOIN tickets.ticket_sla_tracking st   ON st.ticket_id   = t.id
       LEFT JOIN tickets.ticket_approvals    appr ON appr.ticket_id = t.id
                                                  AND appr.status = 'pending'
       WHERE  t.id = $1`,
      [id],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');

    const [assignments, history, transitions] = await Promise.all([
      this.db.query<any[]>(
        `SELECT ta.id, ta.role, ta.assigned_at, ta.is_active,
                up.first_name || ' ' || up.last_name AS user_name,
                up.id AS user_id
         FROM   tickets.ticket_assignments ta
         JOIN   users.profiles up ON up.id = ta.user_id
         WHERE  ta.ticket_id = $1
         ORDER  BY ta.assigned_at DESC`,
        [id],
      ),
      this.db.query<any[]>(
        `SELECT tsh.id, tsh.transitioned_at, tsh.transition_reason,
                fs.label  AS from_label,
                ts2.label AS to_label,
                up.first_name || ' ' || up.last_name AS actor_name
         FROM   tickets.ticket_state_history tsh
         JOIN   tickets.states  fs  ON fs.id  = tsh.from_state_id
         JOIN   tickets.states  ts2 ON ts2.id = tsh.to_state_id
         JOIN   users.profiles  up  ON up.id  = tsh.transitioned_by
         WHERE  tsh.ticket_id = $1
         ORDER  BY tsh.transitioned_at DESC`,
        [id],
      ),
      this.db.query<any[]>(
        `SELECT tr.id, tr.name, tr.from_state_id, tr.to_state_id,
                ts2.label AS to_label,
                ts2.name  AS to_name
         FROM   tickets.transitions tr
         JOIN   tickets.states ts2 ON ts2.id = tr.to_state_id
         WHERE  tr.workflow_version_id = $1
           AND  tr.from_state_id       = $2
           AND  tr.is_active           = true`,
        [ticket.workflow_version_id, ticket.current_state_id],
      ),
    ]);

    return { ...ticket, assignments, history, transitions };
  }

  /* ── Create ─────────────────────────────────────────────────────────────── */

  async create(userId: string, dto: {
    module_id:       string;
    category_id:     string;
    environment_id:  string;
    title:           string;
    description?:    string;
    priority?:       string;
    urgency?:        string;
    impact?:         string;
  }) {
    const [wf] = await this.db.query<any[]>(
      `SELECT id FROM tickets.workflow_versions WHERE module_id = $1 AND is_active = true LIMIT 1`,
      [dto.module_id],
    );
    if (!wf) throw new BadRequestException('No active workflow for this module. Run bootstrap_module first.');

    const [initialState] = await this.db.query<any[]>(
      `SELECT id FROM tickets.states WHERE workflow_version_id = $1 AND is_initial = true AND is_active = true LIMIT 1`,
      [wf.id],
    );
    if (!initialState) throw new BadRequestException('Workflow has no initial state.');

    const [slaPolicy] = await this.db.query<any[]>(
      `SELECT id FROM tickets.sla_policies WHERE module_id = $1 AND is_active = true LIMIT 1`,
      [dto.module_id],
    );
    if (!slaPolicy) throw new BadRequestException('No active SLA policy for this module.');

    // Set session user for triggers
    await this.db.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

    const [ticket] = await this.db.query<any[]>(
      `INSERT INTO tickets.tickets (
         module_id, workflow_version_id, current_state_id,
         environment_id, category_id, created_by,
         priority, urgency, impact, sla_policy_id,
         title, description
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, title, priority, urgency, impact, created_at`,
      [
        dto.module_id,
        wf.id,
        initialState.id,
        dto.environment_id,
        dto.category_id,
        userId,
        dto.priority   ?? 'media',
        dto.urgency    ?? 'media',
        dto.impact     ?? 'medio',
        slaPolicy.id,
        dto.title.trim(),
        dto.description?.trim() ?? null,
      ],
    );

    return ticket;
  }

  /* ── Transition ─────────────────────────────────────────────────────────── */

  async transition(userId: string, ticketId: string, dto: { transition_id: string; reason?: string }) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT id, current_state_id, workflow_version_id, created_by FROM tickets.tickets WHERE id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');

    const [trans] = await this.db.query<any[]>(
      `SELECT id, from_state_id, to_state_id
       FROM   tickets.transitions
       WHERE  id                  = $1
         AND  workflow_version_id = $2
         AND  from_state_id       = $3
         AND  is_active           = true`,
      [dto.transition_id, ticket.workflow_version_id, ticket.current_state_id],
    );
    if (!trans) throw new BadRequestException('Invalid or unavailable transition.');

    // Set session user so fn_ticket_state_history trigger records correct actor
    await this.db.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

    await this.db.query(
      `UPDATE tickets.tickets SET current_state_id = $1 WHERE id = $2`,
      [trans.to_state_id, ticketId],
    );

    // Mark SLA as met/breached when reaching a final state
    const [toState] = await this.db.query<any[]>(
      `SELECT is_final, name FROM tickets.states WHERE id = $1`,
      [trans.to_state_id],
    );
    if (toState?.is_final) {
      await this.db.query(
        `UPDATE tickets.ticket_sla_tracking
         SET status     = CASE WHEN deadline_at < now() THEN 'breached' ELSE 'met' END,
             breached_at = CASE WHEN deadline_at < now() THEN now() ELSE NULL END,
             updated_at  = now()
         WHERE ticket_id = $1 AND status = 'active'`,
        [ticketId],
      );
    }

    // Auto-generate approval token when reaching "realizado" state
    if (toState?.name === 'realizado') {
      await this.db.query(
        `SELECT tickets.generate_approval_token($1, $2, 48)`,
        [ticketId, ticket.created_by],
      );
    }

    return { ok: true };
  }

  /* ── Approve ticket (digital signature) ────────────────────────────────── */

  async approveTicket(userId: string, ticketId: string, dto: { signature?: string }) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT t.id, t.created_by, t.workflow_version_id, t.current_state_id, s.name AS state_name
       FROM   tickets.tickets t JOIN tickets.states s ON s.id = t.current_state_id
       WHERE  t.id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.state_name !== 'realizado') throw new BadRequestException('El ticket no está pendiente de validación.');
    if (ticket.created_by !== userId)      throw new ForbiddenException('Solo el solicitante puede validar este ticket.');

    const [trans] = await this.db.query<any[]>(
      `SELECT tr.id, tr.to_state_id
       FROM   tickets.transitions tr
       JOIN   tickets.states ts2 ON ts2.id = tr.to_state_id
       WHERE  tr.workflow_version_id = $1 AND tr.from_state_id = $2
         AND  ts2.name = 'cerrado' AND tr.is_active = true`,
      [ticket.workflow_version_id, ticket.current_state_id],
    );
    if (!trans) throw new BadRequestException('No hay transición de cierre disponible.');

    await this.db.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

    await this.db.query(
      `UPDATE tickets.tickets SET current_state_id = $1 WHERE id = $2`,
      [trans.to_state_id, ticketId],
    );

    const sigHash = dto.signature ? Buffer.from(dto.signature).toString('base64') : null;
    await this.db.query(
      `UPDATE tickets.ticket_approvals
       SET status = 'approved', signature_hash = $1, approved_at = now()
       WHERE ticket_id = $2 AND status = 'pending'`,
      [sigHash, ticketId],
    );

    await this.db.query(
      `UPDATE tickets.ticket_sla_tracking
       SET status     = CASE WHEN deadline_at < now() THEN 'breached' ELSE 'met' END,
           breached_at = CASE WHEN deadline_at < now() THEN now() ELSE NULL END,
           updated_at  = now()
       WHERE ticket_id = $1 AND status = 'active'`,
      [ticketId],
    );

    return { ok: true };
  }

  /* ── Reject ticket → reproceso / escalation ─────────────────────────────── */

  async rejectTicket(userId: string, ticketId: string, dto: { reason: string }) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT t.id, t.created_by, t.workflow_version_id, t.current_state_id,
              t.reprocess_count, t.module_id, t.priority, s.name AS state_name
       FROM   tickets.tickets t JOIN tickets.states s ON s.id = t.current_state_id
       WHERE  t.id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.state_name !== 'realizado') throw new BadRequestException('El ticket no está pendiente de validación.');
    if (ticket.created_by !== userId)      throw new ForbiddenException('Solo el solicitante puede validar este ticket.');

    const [cfg] = await this.db.query<any[]>(
      `SELECT (value::jsonb->>'reproceso_max')::int AS reproceso_max
       FROM   config.module_settings
       WHERE  module_id = $1 AND key = 'ticket_flow' AND is_active = true`,
      [ticket.module_id],
    );
    const reproceso_max = cfg?.reproceso_max ?? 1;

    const [trans] = await this.db.query<any[]>(
      `SELECT tr.id, tr.to_state_id
       FROM   tickets.transitions tr
       JOIN   tickets.states ts2 ON ts2.id = tr.to_state_id
       WHERE  tr.workflow_version_id = $1 AND tr.from_state_id = $2
         AND  ts2.name = 'reproceso' AND tr.is_active = true`,
      [ticket.workflow_version_id, ticket.current_state_id],
    );
    if (!trans) throw new BadRequestException('No hay transición de reproceso disponible.');

    await this.db.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

    const isEscalation = ticket.reprocess_count >= reproceso_max;
    const newPriority  = isEscalation && ticket.priority !== 'critica' ? 'alta' : ticket.priority;

    await this.db.query(
      `UPDATE tickets.tickets
       SET current_state_id = $1,
           reprocess_count  = reprocess_count + 1,
           priority         = $2
       WHERE id = $3`,
      [trans.to_state_id, newPriority, ticketId],
    );

    await this.db.query(
      `UPDATE tickets.ticket_approvals SET status = 'rejected' WHERE ticket_id = $1 AND status = 'pending'`,
      [ticketId],
    );

    if (isEscalation) {
      const [jefe] = await this.db.query<any[]>(
        `SELECT umr.user_id
         FROM   users.user_module_roles umr
         JOIN   modules.roles r ON r.id = umr.role_id
         WHERE  umr.module_id = $1 AND r.name = 'jefe_tecnico' AND umr.status = 'active'
         LIMIT  1`,
        [ticket.module_id],
      );
      if (jefe) {
        await this.db.query(
          `UPDATE tickets.ticket_assignments SET is_active = false WHERE ticket_id = $1 AND role = 'owner'`,
          [ticketId],
        );
        await this.db.query(
          `INSERT INTO tickets.ticket_assignments (ticket_id, user_id, role, assigned_by, is_active)
           VALUES ($1, $2, 'owner', $3, true)`,
          [ticketId, jefe.user_id, userId],
        );
      }
    }

    return { ok: true, escalated: isEscalation };
  }

  /* ── Attachments ────────────────────────────────────────────────────────── */

  async getAttachments(ticketId: string) {
    return this.db.query<any[]>(
      `SELECT ta.id, ta.original_name, ta.mime_type, ta.file_size, ta.file_url, ta.created_at,
              p.first_name || ' ' || p.last_name AS uploader_name
       FROM   tickets.ticket_attachments ta
       JOIN   users.profiles p ON p.id = ta.uploaded_by
       WHERE  ta.ticket_id = $1 AND ta.deleted_at IS NULL
       ORDER  BY ta.created_at ASC`,
      [ticketId],
    );
  }

  async addAttachment(userId: string, ticketId: string, dto: {
    original_name: string;
    stored_name:   string;
    mime_type:     string;
    file_size:     number;
    file_url:      string;
  }) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.ticket_attachments
         (ticket_id, uploaded_by, original_name, stored_name, mime_type, file_size, file_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, original_name, mime_type, file_size, file_url, created_at`,
      [ticketId, userId, dto.original_name, dto.stored_name, dto.mime_type, dto.file_size, dto.file_url],
    );
    return row;
  }

  async deleteAttachment(userId: string, attachmentId: string) {
    const [att] = await this.db.query<any[]>(
      `SELECT id, uploaded_by FROM tickets.ticket_attachments WHERE id = $1 AND deleted_at IS NULL`,
      [attachmentId],
    );
    if (!att) throw new NotFoundException('Attachment not found');
    if (att.uploaded_by !== userId) throw new ForbiddenException('Solo el autor puede eliminar este adjunto');
    await this.db.query(
      `UPDATE tickets.ticket_attachments SET deleted_at = now() WHERE id = $1`,
      [attachmentId],
    );
    return { ok: true };
  }
}
