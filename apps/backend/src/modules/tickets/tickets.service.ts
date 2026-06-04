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
        `SELECT id, name, label, is_initial, is_final, is_pause_state, is_approval_state
         FROM   tickets.states
         WHERE  workflow_version_id = $1 AND is_active = true
         ORDER  BY is_initial DESC, name`,
        [wf.id],
      ),
      this.db.query<any[]>(
        `SELECT tr.id, tr.name, tr.from_state_id, tr.to_state_id,
                ts2.label AS to_label, ts2.name AS to_name,
                COALESCE(tr.variant, 'default') AS variant,
                COALESCE(tr.allowed_roles, '{}') AS allowed_roles
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
    moduleId?:   string;
    stateId?:    string;
    priority?:   string;
    userId?:     string;
    categoryId?: string;
    assigneeId?: string;
    slaStatus?:  string;
    unassigned?: boolean;
    page?:       number;
    limit?:      number;
  }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(200, opts.limit ?? 25);
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
    if (opts.unassigned) {
      conds.push(
        `NOT EXISTS (SELECT 1 FROM tickets.ticket_assignments ta2
                     WHERE  ta2.ticket_id = t.id AND ta2.role = 'owner' AND ta2.is_active = true)`,
      );
      conds.push(`s.is_final = false`);
    }
    if (opts.slaStatus)   { conds.push(`st.status = $${p++}`);             params.push(opts.slaStatus); }

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
              s.name             AS state_name,
              s.label            AS state_label,
              s.is_final,
              s.is_pause_state,
              s.is_approval_state,
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

  async findOne(id: string, userId?: string) {
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
              s.name             AS state_name,
              s.label            AS state_label,
              s.is_final,
              s.is_pause_state,
              s.is_approval_state,
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
                tr.variant, tr.allowed_roles,
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

    // Filter transitions to only those the requesting user can execute
    const filteredTransitions = userId
      ? await this.filterTransitionsByRole(transitions, userId, ticket.module_id)
      : transitions;

    return { ...ticket, assignments, history, transitions: filteredTransitions };
  }

  private async filterTransitionsByRole(
    transitions: any[],
    userId:      string,
    moduleId:    string,
  ): Promise<any[]> {
    const [actor] = await this.db.query<{ is_superadmin: boolean; role_name: string | null }[]>(
      `SELECT u.is_superadmin,
              mr.name AS role_name
       FROM   users.profiles u
       LEFT JOIN modules.user_module_roles umr
             ON umr.user_id   = u.id
            AND umr.module_id = $2
            AND umr.is_active = true
       LEFT JOIN modules.module_roles mr ON mr.id = umr.role_id
       WHERE  u.id = $1
       LIMIT  1`,
      [userId, moduleId],
    );
    if (!actor) return [];
    if (actor.is_superadmin) return transitions;
    const role = actor.role_name ?? '';
    return transitions.filter(tr => {
      const roles: string[] = Array.isArray(tr.allowed_roles) ? tr.allowed_roles : [];
      return roles.length === 0 || roles.includes(role);
    });
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
    environment_id?:           string;
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

    const envCol    = dto.environment_id ? ', environment_id' : '';
    const envPlaceholder = dto.environment_id ? ', $4' : '';
    const baseParams: any[] = [
      dto.module_id, wf.id, initialState.id,
      ...(dto.environment_id ? [dto.environment_id] : []),
      dto.category_id, userId,
      finalPriority, dto.urgency ?? 'media', dto.impact ?? 'medio',
      slaPolicy.id, slaResult.deadline,
      dto.damage_type_id           ?? null,
      dto.custom_damage_description ?? null,
      dto.asset_id                  ?? null,
      dto.title.trim(),
      dto.description?.trim()       ?? null,
    ];
    const p = dto.environment_id ? { cat: 5, by: 6, pri: 7, urg: 8, imp: 9, slaP: 10, slaDl: 11, dtId: 12, dtDesc: 13, asId: 14, tit: 15, desc: 16 }
                                 : { cat: 4, by: 5, pri: 6, urg: 7, imp: 8, slaP: 9, slaDl: 10, dtId: 11, dtDesc: 12, asId: 13, tit: 14, desc: 15 };

    const [ticket] = await this.db.query<any[]>(
      `INSERT INTO tickets.tickets (
         module_id, workflow_version_id, current_state_id
         ${envCol}, category_id, created_by,
         priority, urgency, impact,
         sla_policy_id, sla_deadline,
         damage_type_id, custom_damage_description,
         asset_id,
         title, description
       ) VALUES ($1,$2,$3${envPlaceholder},$${p.cat},$${p.by},$${p.pri},$${p.urg},$${p.imp},$${p.slaP},$${p.slaDl},$${p.dtId},$${p.dtDesc},$${p.asId},$${p.tit},$${p.desc})
       RETURNING id, title, priority, urgency, impact, sla_deadline, damage_type_id, asset_id, created_at`,
      baseParams,
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
      `SELECT id, from_state_id, to_state_id, allowed_roles
       FROM   tickets.transitions
       WHERE  id                  = $1
         AND  workflow_version_id = $2
         AND  from_state_id       = $3
         AND  is_active           = true`,
      [dto.transition_id, ticket.workflow_version_id, ticket.current_state_id],
    );
    if (!trans) throw new BadRequestException('Invalid or unavailable transition.');

    // ── Role-based transition guard ───────────────────────────────────────────
    if (Array.isArray(trans.allowed_roles) && trans.allowed_roles.length > 0) {
      const [actor] = await this.db.query<any[]>(
        `SELECT u.is_superadmin, mr.name AS role_name
         FROM   users.profiles u
         LEFT JOIN modules.user_module_roles umr
               ON umr.user_id = u.id
              AND umr.module_id = (SELECT module_id FROM tickets.tickets WHERE id = $2)
              AND umr.is_active = true
         LEFT JOIN modules.module_roles mr ON mr.id = umr.role_id
         WHERE  u.id = $1
         LIMIT  1`,
        [userId, ticketId],
      );
      const isSuperadmin = actor?.is_superadmin ?? false;
      const userRole     = actor?.role_name ?? null;
      if (!isSuperadmin && (!userRole || !trans.allowed_roles.includes(userRole))) {
        throw new ForbiddenException(`Tu rol "${userRole ?? 'sin rol'}" no puede ejecutar esta transición.`);
      }
    }

    // ── Atomic write: state update + SLA clock in one transaction ────────────
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let toState: any;
    try {
      // set_config local=true so trigger fn_ticket_state_history records actor
      await qr.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

      await qr.query(
        `UPDATE tickets.tickets SET current_state_id = $1 WHERE id = $2`,
        [trans.to_state_id, ticketId],
      );

      [toState] = await qr.query<any[]>(
        `SELECT is_final, name, label, is_pause_state, is_approval_state FROM tickets.states WHERE id = $1`,
        [trans.to_state_id],
      );

      // 1. Resume SLA if leaving a paused state (en_espera)
      await qr.query(
        `UPDATE tickets.ticket_sla_tracking
         SET deadline_at          = deadline_at + (now() - paused_at),
             total_paused_seconds = total_paused_seconds
                                    + EXTRACT(EPOCH FROM (now() - paused_at))::int,
             paused_at            = NULL,
             status               = 'active',
             updated_at           = now()
         WHERE ticket_id = $1 AND status = 'paused'`,
        [ticketId],
      );

      // 2. Final state → mark met or breached
      if (toState?.is_final) {
        await qr.query(
          `UPDATE tickets.ticket_sla_tracking
           SET status      = CASE WHEN deadline_at < now() THEN 'breached' ELSE 'met' END,
               breached_at = CASE WHEN deadline_at < now() THEN now() ELSE NULL END,
               updated_at  = now()
           WHERE ticket_id = $1 AND status = 'active'`,
          [ticketId],
        );
      // 3. Entering pause state → pause SLA clock
      } else if (toState?.is_pause_state) {
        await qr.query(
          `UPDATE tickets.ticket_sla_tracking
           SET status     = 'paused',
               paused_at  = now(),
               updated_at = now()
           WHERE ticket_id = $1 AND status = 'active'`,
          [ticketId],
        );
      }

      // 4. Approval state → generate approval token (DB function, must be in txn)
      if (toState?.is_approval_state) {
        await qr.query(
          `SELECT tickets.generate_approval_token($1, $2, 48)`,
          [ticketId, ticket.created_by],
        );
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // Emit events after commit — side effects outside the transaction
    if (toState?.is_approval_state) {
      this.events.emit('ticket.validation_required', {
        ticketId,
        title:     ticket.title,
        createdBy: ticket.created_by,
      });
    } else if (!toState?.is_final) {
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
      `SELECT t.id, t.created_by, t.workflow_version_id, t.current_state_id, s.is_approval_state
       FROM   tickets.tickets t JOIN tickets.states s ON s.id = t.current_state_id
       WHERE  t.id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.is_approval_state) throw new BadRequestException('El ticket no está pendiente de validación.');
    if (ticket.created_by !== userId) throw new ForbiddenException('Solo el solicitante puede validar este ticket.');

    const [trans] = await this.db.query<any[]>(
      `SELECT tr.id, tr.to_state_id
       FROM   tickets.transitions tr
       JOIN   tickets.states ts2 ON ts2.id = tr.to_state_id
       WHERE  tr.workflow_version_id = $1 AND tr.from_state_id = $2
         AND  ts2.is_final = true AND tr.is_active = true
       LIMIT 1`,
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

  /* ── Reject ticket → rechazado / escalation ─────────────────────────────── */

  async rejectTicket(userId: string, ticketId: string, dto: { reason: string }) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT t.id, t.created_by, t.workflow_version_id, t.current_state_id,
              t.reprocess_count, t.module_id, t.priority, s.is_approval_state
       FROM   tickets.tickets t JOIN tickets.states s ON s.id = t.current_state_id
       WHERE  t.id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.is_approval_state)     throw new BadRequestException('El ticket no está pendiente de validación.');
    if (ticket.created_by !== userId)  throw new ForbiddenException('Solo el solicitante puede validar este ticket.');
    if (ticket.reprocess_count >= 5)   throw new BadRequestException('Límite de reaperturas alcanzado (5). Contacta a soporte.');

    const [trans] = await this.db.query<any[]>(
      `SELECT tr.id, tr.to_state_id
       FROM   tickets.transitions tr
       JOIN   tickets.states ts2 ON ts2.id = tr.to_state_id
       WHERE  tr.workflow_version_id = $1 AND tr.from_state_id = $2
         AND  ts2.is_final = false AND ts2.is_pause_state = false
         AND  ts2.is_approval_state = false AND tr.is_active = true
       LIMIT 1`,
      [ticket.workflow_version_id, ticket.current_state_id],
    );
    if (!trans) throw new BadRequestException('No hay transición de reapertura disponible.');

    await this.db.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

    const reopenCount = (ticket.reprocess_count ?? 0) + 1;
    const shouldEscalate = reopenCount >= 3 && ticket.priority !== 'critica';
    const newPriority    = shouldEscalate ? 'alta' : ticket.priority;

    await this.db.query(
      `UPDATE tickets.tickets
       SET current_state_id = $1,
           reprocess_count  = $2,
           priority         = $3
       WHERE id = $4`,
      [trans.to_state_id, reopenCount, newPriority, ticketId],
    );

    await this.db.query(
      `UPDATE tickets.ticket_approvals SET status = 'rejected' WHERE ticket_id = $1 AND status = 'pending'`,
      [ticketId],
    );

    this.events.emit('ticket.state_changed', {
      ticketId,
      title:     ticket.id,
      createdBy: ticket.created_by,
      toLabel:   'En proceso',
      actorId:   userId,
    });

    return { ok: true, escalated: shouldEscalate };
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
    const [ticket] = await this.db.query<{ id: string; title: string; created_by: string }[]>(
      `SELECT id, title, created_by FROM tickets.tickets WHERE id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');

    const commentType = dto.comment_type ?? 'public';
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.ticket_comments (ticket_id, user_id, comment_type, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, comment_type, content, created_at`,
      [ticketId, userId, commentType, dto.content.trim()],
    );

    if (commentType === 'public' && userId !== ticket.created_by) {
      const [author] = await this.db.query<{ full_name: string }[]>(
        `SELECT first_name || ' ' || last_name AS full_name FROM users.profiles WHERE id = $1`,
        [userId],
      );
      this.events.emit('ticket.comment_added', {
        ticketId:   ticketId,
        title:      ticket.title,
        createdBy:  ticket.created_by,
        authorName: author?.full_name ?? 'Técnico',
        actorId:    userId,
      });
    }

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
      `SELECT id FROM tickets.tickets WHERE id = $1`,
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
      `SELECT t.id, t.created_by, s.is_final, s.is_approval_state
       FROM   tickets.tickets t JOIN tickets.states s ON s.id = t.current_state_id
       WHERE  t.id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.is_final && !ticket.is_approval_state)
      throw new BadRequestException('Solo se puede calificar cuando el ticket está resuelto o cerrado.');
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

  /* ── Knowledge Base ─────────────────────────────────────────────────────── */

  async getKnowledgeArticles(moduleId: string, search?: string, includeDrafts = false) {
    const params: any[] = [moduleId];
    let searchClause = '';
    if (search?.trim() && search.trim().length >= 2) {
      params.push(`%${search.trim()}%`);
      searchClause = `AND (a.title ILIKE $${params.length} OR a.content ILIKE $${params.length} OR a.category ILIKE $${params.length})`;
    }
    const publishedClause = includeDrafts ? '' : 'AND a.is_published = true';
    return this.db.query<any[]>(
      `SELECT a.id, a.title, a.content, a.category, a.tags, a.is_published,
              a.status, a.helpful_count, a.not_helpful_count,
              a.view_count, a.created_at, a.updated_at,
              a.doc_type, a.file_url, a.file_name, a.file_size, a.file_mime,
              p.first_name || ' ' || p.last_name AS author_name,
              a.ticket_id
       FROM   tickets.knowledge_articles a
       JOIN   users.profiles p ON p.id = a.created_by
       WHERE  a.module_id = $1 ${publishedClause}
         ${searchClause}
       ORDER  BY a.view_count DESC, a.created_at DESC
       LIMIT  100`,
      params,
    );
  }

  async getKnowledgeArticle(id: string) {
    const [article] = await this.db.query<any[]>(
      `SELECT a.*, p.first_name || ' ' || p.last_name AS author_name
       FROM   tickets.knowledge_articles a
       JOIN   users.profiles p ON p.id = a.created_by
       WHERE  a.id = $1`,
      [id],
    );
    if (!article) throw new NotFoundException('Article not found');
    // Increment view count
    await this.db.query(`UPDATE tickets.knowledge_articles SET view_count = view_count + 1 WHERE id = $1`, [id]).catch(() => {});
    return article;
  }

  async createKnowledgeArticle(
    userId: string,
    dto: {
      module_id: string; title: string; content?: string; category?: string;
      tags?: string[]; ticket_id?: string; is_published?: boolean;
      doc_type?: string; file_url?: string; file_name?: string;
      file_size?: number; file_mime?: string;
    },
  ) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.knowledge_articles
         (module_id, title, content, category, tags, ticket_id, is_published,
          doc_type, file_url, file_name, file_size, file_mime, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, title, doc_type, created_at`,
      [
        dto.module_id, dto.title.trim(), (dto.content ?? '').trim(),
        dto.category ?? null, dto.tags ?? [], dto.ticket_id ?? null,
        dto.is_published ?? true,
        dto.doc_type ?? 'article', dto.file_url ?? null,
        dto.file_name ?? null, dto.file_size ?? null, dto.file_mime ?? null,
        userId,
      ],
    );
    return row;
  }

  async updateKnowledgeArticle(
    id: string,
    userId: string,
    dto: { title?: string; content?: string; category?: string; tags?: string[]; is_published?: boolean },
  ) {
    const fields: string[] = ['updated_by = $1', 'updated_at = now()'];
    const params: any[] = [userId];
    let p = 2;
    if (dto.title     !== undefined) { fields.push(`title = $${p++}`);       params.push(dto.title.trim()); }
    if (dto.content   !== undefined) { fields.push(`content = $${p++}`);     params.push(dto.content.trim()); }
    if (dto.category  !== undefined) { fields.push(`category = $${p++}`);    params.push(dto.category); }
    if (dto.tags      !== undefined) { fields.push(`tags = $${p++}`);        params.push(dto.tags); }
    if (dto.is_published !== undefined) { fields.push(`is_published = $${p++}`); params.push(dto.is_published); }
    params.push(id);
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.knowledge_articles SET ${fields.join(', ')} WHERE id = $${p} RETURNING id, title, is_published`,
      params,
    );
    if (!row) throw new NotFoundException('Article not found');
    return row;
  }

  async deleteKnowledgeArticle(id: string) {
    await this.db.query(`DELETE FROM tickets.knowledge_articles WHERE id = $1`, [id]);
    return { ok: true };
  }

  async voteArticle(userId: string, articleId: string, value: 1 | -1) {
    await this.db.query(
      `INSERT INTO tickets.knowledge_votes (user_id, entity_id, entity_type, value)
       VALUES ($1, $2, 'article', $3)
       ON CONFLICT (user_id, entity_id, entity_type) DO UPDATE SET value = $3`,
      [userId, articleId, value],
    );
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.knowledge_articles
       SET helpful_count     = (SELECT COUNT(*) FROM tickets.knowledge_votes WHERE entity_id=$1 AND entity_type='article' AND value=1),
           not_helpful_count = (SELECT COUNT(*) FROM tickets.knowledge_votes WHERE entity_id=$1 AND entity_type='article' AND value=-1)
       WHERE id = $1
       RETURNING helpful_count, not_helpful_count`,
      [articleId],
    );
    return row;
  }

  /* ── Forum posts ─────────────────────────────────────────────────────────── */

  async getKnowledgePosts(moduleId: string, q?: string, filter?: string) {
    const params: any[] = [moduleId];
    let filterClause = '';
    if (filter === 'resolved')   filterClause = 'AND kp.is_resolved = true';
    if (filter === 'unresolved') filterClause = 'AND kp.is_resolved = false';
    let searchClause = '';
    if (q?.trim() && q.trim().length >= 2) {
      params.push(`%${q.trim()}%`);
      searchClause = `AND (kp.title ILIKE $${params.length} OR kp.content ILIKE $${params.length})`;
    }
    const posts = await this.db.query<any[]>(
      `SELECT kp.id, kp.title, kp.content, kp.tags, kp.is_resolved, kp.view_count,
              kp.created_at, kp.updated_at, kp.created_by,
              p.first_name || ' ' || p.last_name AS author_name,
              p.avatar_url AS author_avatar,
              (SELECT COUNT(*) FROM tickets.knowledge_replies kr WHERE kr.post_id = kp.id) AS reply_count,
              (SELECT COUNT(*) FROM tickets.knowledge_votes kv WHERE kv.entity_id = kp.id AND kv.entity_type='post' AND kv.value=1) AS vote_count,
              (SELECT kr2.created_at FROM tickets.knowledge_replies kr2 WHERE kr2.post_id = kp.id ORDER BY kr2.created_at DESC LIMIT 1) AS last_reply_at,
              (SELECT p2.first_name || ' ' || p2.last_name FROM tickets.knowledge_replies kr2 JOIN users.profiles p2 ON p2.id = kr2.created_by WHERE kr2.post_id = kp.id ORDER BY kr2.created_at DESC LIMIT 1) AS last_reply_author,
              (SELECT p2.avatar_url FROM tickets.knowledge_replies kr2 JOIN users.profiles p2 ON p2.id = kr2.created_by WHERE kr2.post_id = kp.id ORDER BY kr2.created_at DESC LIMIT 1) AS last_reply_avatar
       FROM   tickets.knowledge_posts kp
       JOIN   users.profiles p ON p.id = kp.created_by
       WHERE  kp.module_id = $1 ${filterClause} ${searchClause}
       ORDER  BY kp.is_resolved ASC, COALESCE(
         (SELECT MAX(kr.created_at) FROM tickets.knowledge_replies kr WHERE kr.post_id = kp.id),
         kp.created_at
       ) DESC
       LIMIT  100`,
      params,
    );
    return posts;
  }

  async getKnowledgePost(id: string) {
    const [post] = await this.db.query<any[]>(
      `SELECT kp.*,
              p.first_name || ' ' || p.last_name AS author_name,
              p.avatar_url AS author_avatar
       FROM   tickets.knowledge_posts kp
       JOIN   users.profiles p ON p.id = kp.created_by
       WHERE  kp.id = $1`,
      [id],
    );
    if (!post) throw new NotFoundException('Post not found');
    await this.db.query(`UPDATE tickets.knowledge_posts SET view_count = view_count + 1 WHERE id = $1`, [id]).catch(() => {});

    const replies = await this.db.query<any[]>(
      `SELECT kr.*,
              p.first_name || ' ' || p.last_name AS author_name,
              p.avatar_url AS author_avatar,
              (SELECT COUNT(*) FROM tickets.knowledge_votes kv WHERE kv.entity_id = kr.id AND kv.entity_type='reply' AND kv.value=1) AS vote_count
       FROM   tickets.knowledge_replies kr
       JOIN   users.profiles p ON p.id = kr.created_by
       WHERE  kr.post_id = $1
       ORDER  BY kr.is_accepted DESC, kr.created_at ASC`,
      [id],
    );
    return { ...post, replies };
  }

  async createKnowledgePost(userId: string, dto: { module_id: string; title: string; content: string; tags?: string[] }) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.knowledge_posts (module_id, title, content, tags, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, created_at`,
      [dto.module_id, dto.title.trim(), dto.content.trim(), dto.tags ?? [], userId],
    );
    return row;
  }

  async createKnowledgeReply(userId: string, postId: string, dto: { content: string }) {
    const [post] = await this.db.query<any[]>(`SELECT id FROM tickets.knowledge_posts WHERE id = $1`, [postId]);
    if (!post) throw new NotFoundException('Post not found');
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.knowledge_replies (post_id, content, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [postId, dto.content.trim(), userId],
    );
    return row;
  }

  async acceptKnowledgeReply(userId: string, postId: string, replyId: string) {
    const [post] = await this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_posts WHERE id = $1`, [postId]);
    if (!post) throw new NotFoundException('Post not found');
    if (post.created_by !== userId) throw new ForbiddenException('Solo el autor del post puede aceptar una respuesta.');
    await this.db.query(`UPDATE tickets.knowledge_replies SET is_accepted = false WHERE post_id = $1`, [postId]);
    await this.db.query(`UPDATE tickets.knowledge_replies SET is_accepted = true  WHERE id = $1`, [replyId]);
    await this.db.query(`UPDATE tickets.knowledge_posts    SET is_resolved = true  WHERE id = $1`, [postId]);
    return { ok: true };
  }

  async deleteKnowledgePost(userId: string, postId: string) {
    const [[post], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_posts WHERE id = $1`, [postId]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!post) throw new NotFoundException('Post not found');
    if (!actor?.is_superadmin && post.created_by !== userId) throw new ForbiddenException('Sin permisos para eliminar este post.');
    await this.db.query(`DELETE FROM tickets.knowledge_posts WHERE id = $1`, [postId]);
    return { ok: true };
  }

  async deleteKnowledgeReply(userId: string, replyId: string) {
    const [[reply], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_replies WHERE id = $1`, [replyId]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!reply) throw new NotFoundException('Reply not found');
    if (!actor?.is_superadmin && reply.created_by !== userId) throw new ForbiddenException('Sin permisos para eliminar esta respuesta.');
    await this.db.query(`DELETE FROM tickets.knowledge_replies WHERE id = $1`, [replyId]);
    return { ok: true };
  }

  async convertTicketToArticle(userId: string, ticketId: string, dto: { module_id: string; title: string; content: string; category?: string; tags?: string[] }) {
    const [ticket] = await this.db.query<any[]>(`SELECT id, title FROM tickets.tickets WHERE id = $1`, [ticketId]);
    if (!ticket) throw new NotFoundException('Ticket not found');
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.knowledge_articles
         (module_id, title, content, category, tags, ticket_id, is_published, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'published', $7)
       RETURNING id, title, created_at`,
      [dto.module_id, dto.title.trim(), dto.content.trim(), dto.category ?? null, dto.tags ?? [], ticketId, userId],
    );
    return row;
  }
}
