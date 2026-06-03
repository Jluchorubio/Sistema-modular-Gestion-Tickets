import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SlaEvaluatorService } from './sla/sla-evaluator.service';
import { PriorityEngineService } from './priority/priority-engine.service';
import { AssignmentService } from './assignment/assignment.service';

@Injectable()
export class TicketsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly events: EventEmitter2,
    private readonly slaEvaluator: SlaEvaluatorService,
    private readonly priorityEngine: PriorityEngineService,
    private readonly assignment: AssignmentService,
  ) {}

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
    moduleId?:    string;
    stateId?:     string;
    priority?:    string;
    userId?:      string;
    categoryId?:  string;
    assigneeId?:  string;
    slaStatus?:   string;
    isReproceso?: boolean;
    page?:        number;
    limit?:       number;
  }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(100, opts.limit ?? 25);
    const offset = (page - 1) * limit;

    const conds: string[] = [];
    const params: any[]   = [];
    let p = 1;

    if (opts.moduleId)    { conds.push(`t.module_id = $${p++}`);           params.push(opts.moduleId); }
    if (opts.stateId)     { conds.push(`t.current_state_id = $${p++}`);    params.push(opts.stateId); }
    if (opts.priority)    { conds.push(`t.priority = $${p++}`);            params.push(opts.priority); }
    if (opts.userId)      { conds.push(`t.created_by = $${p++}`);          params.push(opts.userId); }
    if (opts.categoryId)  { conds.push(`t.category_id = $${p++}`);         params.push(opts.categoryId); }
    if (opts.assigneeId)  {
      conds.push(
        `EXISTS (SELECT 1 FROM tickets.ticket_assignments ta2
                 WHERE  ta2.ticket_id = t.id AND ta2.user_id = $${p++}
                   AND  ta2.role = 'owner' AND ta2.is_active = true)`,
      );
      params.push(opts.assigneeId);
    }
    if (opts.slaStatus)   { conds.push(`st.status = $${p++}`);             params.push(opts.slaStatus); }
    if (opts.isReproceso) { conds.push(`s.name = 'reproceso'`); }

    const where = conds.length ? conds.join(' AND ') : 'TRUE';

    const [{ count }] = await this.db.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
       FROM   tickets.tickets                     t
       JOIN   tickets.states                      s  ON s.id = t.current_state_id
       LEFT JOIN tickets.ticket_sla_tracking      st ON st.ticket_id = t.id
       WHERE  ${where}`,
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
       FROM   tickets.tickets                     t
       JOIN   modules.modules                     m  ON m.id  = t.module_id
       LEFT JOIN modules.categories               c  ON c.id  = t.category_id
       LEFT JOIN modules.environments             e  ON e.id  = t.environment_id
       JOIN   tickets.states                      s  ON s.id  = t.current_state_id
       JOIN   users.profiles                      up ON up.id = t.created_by
       LEFT JOIN tickets.ticket_sla_tracking      st ON st.ticket_id = t.id
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
              t.module_id,        m.name  AS module_name,
              t.category_id,      c.name  AS category_name,
              t.environment_id,   e.name  AS environment_name,
              t.damage_type_id,   dt.label AS damage_type_label,
              dt.slug             AS damage_type_slug,
              dtc.slug            AS damage_category_slug,
              dtc.label           AS damage_category_label,
              t.custom_damage_description,
              t.workflow_version_id,
              t.current_state_id,
              s.name  AS state_name,
              s.label AS state_label,
              s.is_final,
              t.created_by,
              up.first_name || ' ' || up.last_name AS creator_name,
              t.reprocess_count,
              t.escalated, t.escalation_note,
              t.asset_id,
              st.status      AS sla_status,
              st.deadline_at AS sla_deadline_tracked,
              st.breached_at,
              appr.status    AS approval_status,
              appr.expires_at AS approval_expires_at
       FROM   tickets.tickets                t
       JOIN   modules.modules                m    ON m.id   = t.module_id
       LEFT JOIN modules.categories          c    ON c.id   = t.category_id
       LEFT JOIN modules.environments        e    ON e.id   = t.environment_id
       LEFT JOIN tickets.damage_types        dt   ON dt.id  = t.damage_type_id
       LEFT JOIN config.ticket_categories    dtc  ON dtc.id = dt.category_id
       JOIN   tickets.states                 s    ON s.id   = t.current_state_id
       JOIN   users.profiles                 up   ON up.id  = t.created_by
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

  async searchAssets(q: string) {
    if (!q || q.length < 2) return [];
    return this.db.query<any[]>(
      `SELECT a.id, a.name, a.serial_number, a.qr_code, a.status,
              c.name AS category_name,
              e.name AS environment_name,
              l.name AS location_name,
              p.first_name || ' ' || p.last_name AS assigned_to_name
       FROM   inventory.assets a
       LEFT JOIN modules.categories   c  ON c.id = a.category_id
       LEFT JOIN modules.environments e  ON e.id = a.environment_id
       LEFT JOIN modules.locations    l  ON l.id = e.location_id
       LEFT JOIN inventory.asset_assignments aa ON aa.asset_id = a.id AND aa.status = 'activo'
       LEFT JOIN users.profiles        p  ON p.id = aa.user_id
       WHERE  a.deleted_at IS NULL
         AND  a.status != 'dado_de_baja'
         AND  (a.name ILIKE $1 OR a.serial_number ILIKE $1 OR a.qr_code ILIKE $1)
       ORDER  BY a.name
       LIMIT  10`,
      [`%${q}%`],
    );
  }

  async create(userId: string, dto: {
    module_id:                 string;
    category_id:               string;
    environment_id:            string;
    title:                     string;
    description?:              string;
    damage_type_id?:           string;
    custom_damage_description?: string;
    asset_id?:                 string;
    priority?:                 string;
    urgency?:                  string;
    impact?:                   string;
  }) {
    const now = new Date();

    // Load workflow, initial state, and SLA policy in parallel
    const [[wf], [initialState], [slaPolicy]] = await Promise.all([
      this.db.query<any[]>(
        `SELECT id FROM tickets.workflow_versions WHERE module_id = $1 AND is_active = true LIMIT 1`,
        [dto.module_id],
      ),
      this.db.query<any[]>(
        `SELECT s.id
         FROM tickets.states s
         JOIN tickets.workflow_versions wv ON wv.id = s.workflow_version_id
         WHERE wv.module_id = $1 AND s.is_initial = true AND s.is_active = true LIMIT 1`,
        [dto.module_id],
      ),
      this.db.query<any[]>(
        `SELECT id FROM tickets.sla_policies WHERE module_id = $1 AND is_active = true LIMIT 1`,
        [dto.module_id],
      ),
    ]);

    if (!wf)          throw new BadRequestException('No active workflow for this module.');
    if (!initialState) throw new BadRequestException('Workflow has no initial state.');
    if (!slaPolicy)   throw new BadRequestException('No active SLA policy for this module.');

    // Resolve priority: manual override → scoring engine → default
    let finalPriority = dto.priority ?? 'media';
    if (!dto.priority) {
      const scored = await this.priorityEngine.compute({
        damage_type_id: dto.damage_type_id,
        urgency:        dto.urgency,
        impact:         dto.impact,
        creator_id:     userId,
      });
      finalPriority = scored.priority;
    }

    // Recurrence detection: same asset + damage_type repeated 3+ times in 30 days → escalate
    let autoEscalated = false;
    let recurrenceCount = 0;
    if (dto.asset_id && dto.damage_type_id) {
      recurrenceCount = await this.priorityEngine.checkRecurrence(dto.asset_id, dto.damage_type_id);
      if (recurrenceCount >= 2) {
        finalPriority = this.priorityEngine.escalatePriority(finalPriority);
        autoEscalated = true;
      }
    }

    // Compute SLA deadline via evaluator
    const slaResult = await this.slaEvaluator.compute({
      module_id:       dto.module_id,
      policy_id:       slaPolicy.id,
      category_id:     dto.category_id,
      damage_type_id:  dto.damage_type_id,
      priority:        finalPriority,
      urgency:         dto.urgency,
      impact:          dto.impact,
      created_at:      now,
    });

    // Set session user for audit triggers
    await this.db.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

    const [ticket] = await this.db.query<any[]>(
      `INSERT INTO tickets.tickets (
         module_id, workflow_version_id, current_state_id,
         environment_id, category_id, created_by,
         priority, urgency, impact,
         sla_policy_id, sla_deadline,
         damage_type_id, custom_damage_description,
         asset_id,
         title, description
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id, title, priority, urgency, impact, sla_deadline, damage_type_id, asset_id, created_at`,
      [
        dto.module_id,
        wf.id,
        initialState.id,
        dto.environment_id,
        dto.category_id,
        userId,
        finalPriority,
        dto.urgency ?? 'media',
        dto.impact  ?? 'medio',
        slaPolicy.id,
        slaResult.deadline,
        dto.damage_type_id           ?? null,
        dto.custom_damage_description ?? null,
        dto.asset_id                  ?? null,
        dto.title.trim(),
        dto.description?.trim() ?? null,
      ],
    );

    // Write SLA tracking record
    if (slaResult.rule_id) {
      await this.db.query(
        `INSERT INTO tickets.ticket_sla_tracking
           (ticket_id, sla_policy_id, sla_rule_id, started_at, deadline_at, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (ticket_id) DO NOTHING`,
        [ticket.id, slaPolicy.id, slaResult.rule_id, now, slaResult.deadline],
      );
    }

    // Link asset to ticket in junction table so inventory can query its tickets
    if (dto.asset_id) {
      await this.db.query(
        `INSERT INTO inventory.ticket_assets (ticket_id, asset_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [ticket.id, dto.asset_id],
      ).catch(() => {});
    }

    // Mark auto-escalation from recurrence detection
    if (autoEscalated) {
      await this.db.query(
        `UPDATE tickets.tickets
         SET escalated = true, escalated_at = now(),
             escalation_note = $2
         WHERE id = $1`,
        [ticket.id, `Auto-escalado: ${recurrenceCount + 1} tickets para el mismo activo y tipo de daño en 30 días.`],
      );
    }

    // Auto-assignment: round_robin or hybrid mode assigns a technician immediately
    const assignedTo = await this.assignment.assign(
      ticket.id, dto.module_id, dto.category_id, userId,
    );

    this.events.emit('ticket.created', {
      ticketId:        ticket.id,
      title:           ticket.title,
      createdBy:       userId,
      moduleId:        dto.module_id,
      slaDeadline:     slaResult.deadline,
      slaMatchedBy:    slaResult.matched_by,
      autoEscalated,
      assignedTo,
    });

    return { ...ticket, sla: slaResult, auto_escalated: autoEscalated, assigned_to: assignedTo };
  }

  /* ── Transition ─────────────────────────────────────────────────────────── */

  async transition(userId: string, ticketId: string, dto: { transition_id: string; reason?: string }) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT id, title, current_state_id, workflow_version_id, created_by FROM tickets.tickets WHERE id = $1`,
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

    const [toState] = await this.db.query<any[]>(
      `SELECT is_final, name, label FROM tickets.states WHERE id = $1`,
      [trans.to_state_id],
    );

    // ── SLA clock management ──────────────────────────────────────────────────
    // 1. If tracking was paused (leaving EN_ESPERA), resume it first by extending
    //    deadline_at by the elapsed pause duration, whatever the destination state.
    await this.db.query(
      `UPDATE tickets.ticket_sla_tracking
       SET deadline_at           = deadline_at + (now() - paused_at),
           total_paused_seconds  = total_paused_seconds
                                   + EXTRACT(EPOCH FROM (now() - paused_at))::int,
           paused_at             = NULL,
           status                = 'active',
           updated_at            = now()
       WHERE ticket_id = $1 AND status = 'paused'`,
      [ticketId],
    );

    // 2. Final state → mark met or breached (after any resume above)
    if (toState?.is_final) {
      await this.db.query(
        `UPDATE tickets.ticket_sla_tracking
         SET status      = CASE WHEN deadline_at < now() THEN 'breached' ELSE 'met' END,
             breached_at = CASE WHEN deadline_at < now() THEN now() ELSE NULL END,
             updated_at  = now()
         WHERE ticket_id = $1 AND status = 'active'`,
        [ticketId],
      );
    }
    // 3. Entering EN_ESPERA → pause the SLA clock
    else if (toState?.name === 'en_espera') {
      await this.db.query(
        `UPDATE tickets.ticket_sla_tracking
         SET status     = 'paused',
             paused_at  = now(),
             updated_at = now()
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
      this.events.emit('ticket.validation_required', {
        ticketId,
        title:     ticket.title,
        createdBy: ticket.created_by,
      });
    } else if (!toState?.is_final) {
      // Notify creator of state change (skip final states — handled by approval flow)
      this.events.emit('ticket.state_changed', {
        ticketId,
        title:     ticket.title,
        createdBy: ticket.created_by,
        toLabel:   toState?.label ?? toState?.name ?? '',
        actorId:   userId,
      });
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
    if (ticket.reprocess_count >= 5)       throw new BadRequestException('El ticket alcanzó el límite máximo de reproces (5). No puede ser devuelto nuevamente.');

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

  /* ── Comments ───────────────────────────────────────────────────────────── */

  async getTimeline(ticketId: string) {
    return this.db.query<any[]>(
      `SELECT *
       FROM (
         /* ── Comentarios ── */
         SELECT tc.id,
                'comment'         AS event_type,
                tc.comment_type   AS subtype,
                tc.user_id,
                p.first_name || ' ' || p.last_name AS user_name,
                p.avatar_url,
                tc.content,
                NULL::jsonb       AS metadata,
                tc.created_at
         FROM   tickets.ticket_comments tc
         JOIN   users.profiles p ON p.id = tc.user_id
         WHERE  tc.ticket_id = $1 AND tc.deleted_at IS NULL

         UNION ALL

         /* ── Cambios de estado ── */
         SELECT tsh.id,
                'status_change'   AS event_type,
                NULL              AS subtype,
                tsh.transitioned_by AS user_id,
                p.first_name || ' ' || p.last_name AS user_name,
                p.avatar_url,
                tsh.transition_reason AS content,
                jsonb_build_object(
                  'from_state', fs.label,
                  'to_state',   ts.label,
                  'to_state_name', ts.name,
                  'is_final',   ts.is_final
                ) AS metadata,
                tsh.transitioned_at AS created_at
         FROM   tickets.ticket_state_history tsh
         JOIN   tickets.states fs ON fs.id = tsh.from_state_id
         JOIN   tickets.states ts ON ts.id = tsh.to_state_id
         JOIN   users.profiles p  ON p.id  = tsh.transitioned_by
         WHERE  tsh.ticket_id = $1

         UNION ALL

         /* ── Asignaciones ── */
         SELECT ta.id,
                'assignment'      AS event_type,
                ta.role::text     AS subtype,
                ta.assigned_by    AS user_id,
                pa.first_name || ' ' || pa.last_name AS user_name,
                pa.avatar_url,
                NULL              AS content,
                jsonb_build_object(
                  'assignee_name', pu.first_name || ' ' || pu.last_name,
                  'assignee_id',   ta.user_id,
                  'role',          ta.role,
                  'is_active',     ta.is_active
                ) AS metadata,
                ta.assigned_at    AS created_at
         FROM   tickets.ticket_assignments ta
         JOIN   users.profiles pa ON pa.id = ta.assigned_by
         JOIN   users.profiles pu ON pu.id = ta.user_id
         WHERE  ta.ticket_id = $1

         UNION ALL

         /* ── Adjuntos ── */
         SELECT att.id,
                'attachment'      AS event_type,
                att.mime_type     AS subtype,
                att.uploaded_by   AS user_id,
                p.first_name || ' ' || p.last_name AS user_name,
                p.avatar_url,
                att.original_name AS content,
                jsonb_build_object(
                  'mime_type',  att.mime_type,
                  'file_size',  att.file_size,
                  'file_url',   att.file_url
                ) AS metadata,
                att.created_at
         FROM   tickets.ticket_attachments att
         JOIN   users.profiles p ON p.id = att.uploaded_by
         WHERE  att.ticket_id = $1 AND att.deleted_at IS NULL

         UNION ALL

         /* ── Aprobaciones / rechazos ── */
         SELECT ap.id,
                'approval'             AS event_type,
                ap.status::text        AS subtype,
                ap.user_id,
                p.first_name || ' ' || p.last_name AS user_name,
                p.avatar_url,
                NULL                   AS content,
                jsonb_build_object('status', ap.status::text) AS metadata,
                COALESCE(ap.approved_at, ap.created_at) AS created_at
         FROM   tickets.ticket_approvals ap
         JOIN   users.profiles p ON p.id = ap.user_id
         WHERE  ap.ticket_id = $1 AND ap.status::text != 'pending'
       ) timeline
       ORDER BY created_at ASC`,
      [ticketId],
    );
  }

  async getComments(ticketId: string) {
    return this.db.query<any[]>(
      `SELECT tc.id, tc.comment_type, tc.content, tc.created_at,
              p.id         AS user_id,
              p.avatar_url,
              p.first_name || ' ' || p.last_name AS author_name
       FROM   tickets.ticket_comments tc
       JOIN   users.profiles p ON p.id = tc.user_id
       WHERE  tc.ticket_id = $1 AND tc.deleted_at IS NULL
       ORDER  BY tc.created_at ASC`,
      [ticketId],
    );
  }

  async addComment(userId: string, ticketId: string, dto: { content: string; comment_type?: string }) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT id FROM tickets.tickets WHERE id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');

    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.ticket_comments (ticket_id, user_id, comment_type, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, comment_type, content, created_at`,
      [ticketId, userId, dto.comment_type ?? 'public', dto.content.trim()],
    );
    return row;
  }

  /* ── Linked assets (inventory) ─────────────────────────────────────────── */

  async getTicketAssets(ticketId: string) {
    return this.db.query<any[]>(
      `SELECT ta.id AS link_id, ta.notes AS link_notes,
              a.id, a.name, a.serial_number, a.qr_code, a.status, a.specifications,
              c.name AS category_name,
              e.name AS environment_name,
              l.name AS location_name,
              p.first_name || ' ' || p.last_name AS assigned_to_name
       FROM   inventory.ticket_assets ta
       JOIN   inventory.assets a ON a.id = ta.asset_id AND a.deleted_at IS NULL
       LEFT JOIN modules.categories   c  ON c.id = a.category_id
       LEFT JOIN modules.environments e  ON e.id = a.environment_id
       LEFT JOIN modules.locations    l  ON l.id = e.location_id
       LEFT JOIN inventory.asset_assignments aa ON aa.asset_id = a.id AND aa.status = 'activo'
       LEFT JOIN users.profiles        p  ON p.id = aa.user_id
       WHERE  ta.ticket_id = $1
       ORDER  BY ta.created_at ASC`,
      [ticketId],
    );
  }

  async getTicketAssetHistory(ticketId: string, assetId: string) {
    const [link] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM inventory.ticket_assets WHERE ticket_id = $1 AND asset_id = $2`,
      [ticketId, assetId],
    );
    if (!link) throw new NotFoundException('Asset not linked to this ticket');

    return this.db.query<any[]>(
      `SELECT h.id, h.action, h.reason, h.created_at,
              pu.first_name || ' ' || pu.last_name AS user_name,
              pa.first_name || ' ' || pa.last_name AS actor_name
       FROM   inventory.asset_assignment_history h
       LEFT JOIN users.profiles pu ON pu.id = h.user_id
       LEFT JOIN users.profiles pa ON pa.id = h.assigned_by
       WHERE  h.asset_id = $1
       ORDER  BY h.created_at DESC`,
      [assetId],
    );
  }

  async getAssetPrevTickets(currentTicketId: string, assetId: string) {
    return this.db.query<any[]>(
      `SELECT t.id, t.title, t.priority, t.created_at, t.updated_at,
              s.label AS state_label, s.name AS state_name, s.is_final,
              p.first_name || ' ' || p.last_name AS creator_name,
              po.first_name || ' ' || po.last_name AS owner_name
       FROM   inventory.ticket_assets ta
       JOIN   tickets.tickets t ON t.id = ta.ticket_id
       JOIN   tickets.states  s ON s.id = t.current_state_id
       JOIN   users.profiles  p ON p.id = t.created_by
       LEFT JOIN tickets.ticket_assignments oa
         ON  oa.ticket_id = t.id AND oa.role = 'owner' AND oa.is_active = true
       LEFT JOIN users.profiles po ON po.id = oa.user_id
       WHERE  ta.asset_id = $1
         AND  ta.ticket_id <> $2
       ORDER  BY t.created_at DESC
       LIMIT  20`,
      [assetId, currentTicketId],
    );
  }

  /* ── Related tickets ───────────────────────────────────────────────────── */

  async getTicketRelations(ticketId: string) {
    return this.db.query<any[]>(
      `SELECT
         r.id, r.relation_type, r.notes, r.created_at,
         p.first_name || ' ' || p.last_name AS created_by_name,
         t.id            AS related_id,
         t.title         AS related_title,
         t.priority      AS related_priority,
         t.created_at    AS related_created_at,
         s.label         AS related_state_label,
         s.name          AS related_state_name,
         s.is_final      AS related_is_final,
         po.first_name || ' ' || po.last_name AS related_owner_name,
         t.description   AS related_description
       FROM tickets.ticket_relations r
       JOIN tickets.tickets t  ON t.id = CASE WHEN r.source_ticket_id = $1 THEN r.target_ticket_id ELSE r.source_ticket_id END
       JOIN tickets.states  s  ON s.id = t.current_state_id
       JOIN users.profiles  p  ON p.id = r.created_by
       LEFT JOIN tickets.ticket_assignments oa
         ON  oa.ticket_id = t.id AND oa.role = 'owner' AND oa.is_active = true
       LEFT JOIN users.profiles po ON po.id = oa.user_id
       WHERE r.source_ticket_id = $1 OR r.target_ticket_id = $1
       ORDER BY r.created_at DESC`,
      [ticketId],
    );
  }

  async searchTickets(query: string, excludeId: string) {
    return this.db.query<any[]>(
      `SELECT t.id, t.title, t.priority, s.label AS state_label, s.is_final
       FROM   tickets.tickets t
       JOIN   tickets.states  s ON s.id = t.current_state_id
       WHERE  t.id <> $2
         AND  t.deleted_at IS NULL
         AND  (t.title ILIKE $1 OR t.id::text ILIKE $1)
       ORDER BY t.created_at DESC
       LIMIT 10`,
      [`%${query}%`, excludeId],
    );
  }

  async addTicketRelation(actorId: string, ticketId: string, dto: { target_ticket_id: string; relation_type: string; notes?: string }) {
    const valid = ['related', 'duplicate', 'blocks', 'caused_by'];
    if (!valid.includes(dto.relation_type)) {
      throw new BadRequestException(`Tipo de relación inválido: ${dto.relation_type}`);
    }

    const [target] = await this.db.query<any[]>(
      `SELECT id FROM tickets.tickets WHERE id = $1 AND deleted_at IS NULL`,
      [dto.target_ticket_id],
    );
    if (!target) throw new NotFoundException('Ticket relacionado no encontrado');

    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.ticket_relations (source_ticket_id, target_ticket_id, relation_type, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_ticket_id, target_ticket_id) DO NOTHING
       RETURNING id`,
      [ticketId, dto.target_ticket_id, dto.relation_type, dto.notes ?? null, actorId],
    );
    return row ?? { ok: true };
  }

  async removeTicketRelation(ticketId: string, relationId: string) {
    await this.db.query(
      `DELETE FROM tickets.ticket_relations
       WHERE id = $1 AND (source_ticket_id = $2 OR target_ticket_id = $2)`,
      [relationId, ticketId],
    );
    return { ok: true };
  }

  /* ── Assignments ────────────────────────────────────────────────────────── */

  async addAssignment(actorId: string, ticketId: string, dto: { user_id: string; role: string }) {
    const validRoles = ['owner', 'collaborator', 'observer'];
    if (!validRoles.includes(dto.role)) {
      throw new BadRequestException(`Rol inválido. Debe ser uno de: ${validRoles.join(', ')}`);
    }

    const [ticket] = await this.db.query<any[]>(
      `SELECT id FROM tickets.tickets WHERE id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (dto.role === 'owner') {
      await this.db.query(
        `UPDATE tickets.ticket_assignments
         SET is_active = false, unassigned_at = now()
         WHERE ticket_id = $1 AND role = 'owner' AND is_active = true`,
        [ticketId],
      );
    }

    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.ticket_assignments (ticket_id, user_id, role, assigned_by, is_active)
       VALUES ($1, $2, $3::assignment_role, $4, true)
       ON CONFLICT DO NOTHING
       RETURNING id, role, assigned_at, is_active`,
      [ticketId, dto.user_id, dto.role, actorId],
    );

    if (row && dto.role === 'owner') {
      const [t] = await this.db.query<{ title: string }[]>(
        `SELECT title FROM tickets.tickets WHERE id = $1`,
        [ticketId],
      );
      this.events.emit('ticket.assigned', {
        ticketId,
        title:      t?.title ?? '',
        assigneeId: dto.user_id,
      });
    }

    return row ?? { ok: true };
  }

  /* ── Rating ─────────────────────────────────────────────────────────────── */

  async rateTicket(userId: string, ticketId: string, dto: {
    score_overall:             number;
    score_attention?:          number;
    score_clarity?:            number;
    score_response_time?:      number;
    score_quality?:            number;
    service_label?:            string;
    comment?:                  string;
    would_recommend?:          boolean;
    resolved_on_first_attempt?: boolean;
  }) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT t.id, t.created_by, s.is_final
       FROM   tickets.tickets t JOIN tickets.states s ON s.id = t.current_state_id
       WHERE  t.id = $1 AND t.deleted_at IS NULL`,
      [ticketId],
    );
    if (!ticket)          throw new NotFoundException('Ticket not found');
    if (!ticket.is_final) throw new BadRequestException('Solo se pueden calificar tickets cerrados.');
    if (ticket.created_by !== userId) throw new ForbiddenException('Solo el solicitante puede calificar este ticket.');

    const [existing] = await this.db.query<any[]>(
      `SELECT id FROM tickets.ticket_ratings WHERE ticket_id = $1`,
      [ticketId],
    );
    if (existing) throw new BadRequestException('Este ticket ya fue calificado.');

    const [owner] = await this.db.query<{ user_id: string }[]>(
      `SELECT user_id FROM tickets.ticket_assignments
       WHERE ticket_id = $1 AND role = 'owner'
       ORDER BY assigned_at DESC LIMIT 1`,
      [ticketId],
    );
    if (!owner) throw new BadRequestException('El ticket no tiene técnico asignado.');

    const [rating] = await this.db.query<any[]>(
      `INSERT INTO tickets.ticket_ratings
         (ticket_id, rated_by, technician_id,
          score_overall, score_attention, score_clarity, score_response_time, score_quality,
          service_label, comment, would_recommend, resolved_on_first_attempt,
          expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() + INTERVAL '7 days')
       RETURNING *`,
      [
        ticketId, userId, owner.user_id,
        dto.score_overall,
        dto.score_attention          ?? null,
        dto.score_clarity            ?? null,
        dto.score_response_time      ?? null,
        dto.score_quality            ?? null,
        dto.service_label            ?? null,
        dto.comment?.trim()          ?? null,
        dto.would_recommend          ?? null,
        dto.resolved_on_first_attempt ?? null,
      ],
    );
    return rating;
  }

  async getTicketRating(ticketId: string) {
    const [row] = await this.db.query<any[]>(
      `SELECT r.*, p.first_name || ' ' || p.last_name AS technician_name
       FROM tickets.ticket_ratings r
       JOIN users.profiles p ON p.id = r.technician_id
       WHERE r.ticket_id = $1`,
      [ticketId],
    );
    return row ?? null;
  }
}
