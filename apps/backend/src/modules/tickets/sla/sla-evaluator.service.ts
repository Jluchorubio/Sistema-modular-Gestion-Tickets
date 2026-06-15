import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface SlaContext {
  module_id:       string;
  policy_id:       string;
  category_id?:    string;
  damage_type_id?: string;
  priority:        string;
  urgency?:        string;
  impact?:         string;
  created_at?:     Date;
}

export interface SlaResult {
  deadline:         Date;
  resolution_hours: number;
  policy_id:        string;
  rule_id:          string | null;
  matched_by:       'condition' | 'priority_fallback' | 'hard_fallback';
}

interface SlaRule {
  id:               string;
  sort_order:       number;
  hours_to_resolve: number;
  priority_result:  string;
}

interface SlaCondition {
  rule_id:       string;
  field:         string;
  operator:      string;
  value:         string;
  logical_group: number;
}

interface BusinessHour {
  day_of_week: number;
  start_time:  string;
  end_time:    string;
}

const PRIORITY_FALLBACK_HOURS: Record<string, number> = {
  critica: 2,
  alta:    8,
  media:   24,
  baja:    72,
};

@Injectable()
export class SlaEvaluatorService {
  private readonly logger = new Logger(SlaEvaluatorService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /* ── Public: compute full SLA result ─────────────────────────────────── */

  async compute(ctx: SlaContext): Promise<SlaResult> {
    const from = ctx.created_at ?? new Date();

    // 1. Try to match a condition-based rule
    const conditionMatch = await this.evaluateConditions(ctx);
    if (conditionMatch) {
      const deadline = await this.resolveDeadline(
        conditionMatch.hours_to_resolve, from, ctx.module_id,
      );
      return {
        deadline,
        resolution_hours: conditionMatch.hours_to_resolve,
        policy_id: ctx.policy_id,
        rule_id:   conditionMatch.id,
        matched_by: 'condition',
      };
    }

    // 2. Fallback: find rule by priority_result column
    const priorityMatch = await this.findRuleByPriority(ctx.policy_id, ctx.priority);
    if (priorityMatch) {
      const deadline = await this.resolveDeadline(
        priorityMatch.hours_to_resolve, from, ctx.module_id,
      );
      return {
        deadline,
        resolution_hours: priorityMatch.hours_to_resolve,
        policy_id: ctx.policy_id,
        rule_id:   priorityMatch.id,
        matched_by: 'priority_fallback',
      };
    }

    // 3. Hard fallback: constants
    const hours = PRIORITY_FALLBACK_HOURS[ctx.priority] ?? 24;
    const deadline = await this.resolveDeadline(hours, from, ctx.module_id);
    return {
      deadline,
      resolution_hours: hours,
      policy_id: ctx.policy_id,
      rule_id:   null,
      matched_by: 'hard_fallback',
    };
  }

  /* ── Condition evaluation ─────────────────────────────────────────────── */

  private async evaluateConditions(ctx: SlaContext): Promise<SlaRule | null> {
    // Load rules ordered by rule_order (first match wins)
    const rules = await this.db.query<SlaRule[]>(
      `SELECT id, sort_order, hours_to_resolve, priority_result
       FROM tickets.sla_rules
       WHERE policy_id = $1
         AND is_active = true
         AND (valid_from  IS NULL OR valid_from  <= now())
         AND (valid_until IS NULL OR valid_until >= now())
       ORDER BY sort_order`,
      [ctx.policy_id],
    );

    if (!rules.length) return null;

    const ruleIds = rules.map(r => r.id);

    // Load all conditions for these rules in one query
    const conditions = await this.db.query<SlaCondition[]>(
      `SELECT rule_id, field, operator, value, logical_group
       FROM tickets.sla_conditions
       WHERE rule_id = ANY($1)
       ORDER BY rule_id, logical_group, sort_order`,
      [ruleIds],
    );

    // Group conditions by rule_id
    const condByRule = new Map<string, SlaCondition[]>();
    for (const c of conditions) {
      const list = condByRule.get(c.rule_id) ?? [];
      list.push(c);
      condByRule.set(c.rule_id, list);
    }

    for (const rule of rules) {
      const ruleConds = condByRule.get(rule.id);
      // Rule with no conditions always matches
      if (!ruleConds || !ruleConds.length) return rule;

      if (this.ruleMatches(ruleConds, ctx)) return rule;
    }

    return null;
  }

  private ruleMatches(conditions: SlaCondition[], ctx: SlaContext): boolean {
    // Group by logical_group → groups are ORed, conditions within group are ANDed
    const groups = new Map<number, SlaCondition[]>();
    for (const c of conditions) {
      const g = groups.get(c.logical_group) ?? [];
      g.push(c);
      groups.set(c.logical_group, g);
    }

    for (const group of groups.values()) {
      // All conditions in group must pass
      if (group.every(c => this.conditionPasses(c, ctx))) return true;
    }
    return false;
  }

  private conditionPasses(cond: SlaCondition, ctx: SlaContext): boolean {
    const raw = this.fieldValue(cond.field, ctx);
    if (raw === undefined) return false;
    const actual = String(raw);

    switch (cond.operator) {
      case '=':   return actual === cond.value;
      case '!=':  return actual !== cond.value;
      case 'IN': {
        // Value stored as comma-separated (e.g. "alta,critica") by the frontend
        const arr = cond.value.split(',').map(s => s.trim()).filter(Boolean);
        return arr.includes(actual);
      }
      case '>':   return Number(actual) > Number(cond.value);
      case '<':   return Number(actual) < Number(cond.value);
      case '>=':  return Number(actual) >= Number(cond.value);
      case '<=':  return Number(actual) <= Number(cond.value);
      default:    return false;
    }
  }

  private fieldValue(field: string, ctx: SlaContext): string | undefined {
    const map: Record<string, string | undefined> = {
      priority:       ctx.priority,
      urgency:        ctx.urgency,
      impact:         ctx.impact,
      category_id:    ctx.category_id,
      damage_type_id: ctx.damage_type_id,
      module_id:      ctx.module_id,
    };
    return map[field];
  }

  /* ── Priority-based fallback rule lookup ─────────────────────────────── */

  private async findRuleByPriority(policyId: string, priority: string): Promise<SlaRule | null> {
    const [rule] = await this.db.query<SlaRule[]>(
      `SELECT id, sort_order, hours_to_resolve, priority_result
       FROM tickets.sla_rules
       WHERE policy_id      = $1
         AND priority_result = $2
         AND is_active = true
         AND (valid_from  IS NULL OR valid_from  <= now())
         AND (valid_until IS NULL OR valid_until >= now())
       ORDER BY sort_order
       LIMIT 1`,
      [policyId, priority],
    );
    return rule ?? null;
  }

  /* ── Deadline calculation (business hours aware) ──────────────────────── */

  async resolveDeadline(
    hoursToAdd: number,
    from:       Date,
    moduleId:   string,
  ): Promise<Date> {
    const [businessHours, holidays, tz] = await Promise.all([
      this.loadBusinessHours(moduleId),
      this.loadHolidays(moduleId),
      this.loadOrgTimezone(),
    ]);

    // No business hours configured → add raw hours (simple calendar time)
    if (!businessHours.length) {
      this.logger.warn(`Module ${moduleId || 'global'}: no business_hours configured — using calendar time for SLA deadline`);
      return new Date(from.getTime() + hoursToAdd * 3600_000);
    }

    return this.advanceBusinessTime(from, hoursToAdd, businessHours, holidays, tz);
  }

  private advanceBusinessTime(
    start:          Date,
    hoursRemaining: number,
    businessHours:  BusinessHour[],
    holidays:       Set<string>,
    tz:             string,
  ): Date {
    const dayMap = new Map<number, { startMs: number; endMs: number }>();
    for (const bh of businessHours) {
      dayMap.set(bh.day_of_week, {
        startMs: this.timeToMs(bh.start_time),
        endMs:   this.timeToMs(bh.end_time),
      });
    }

    let cursor = new Date(start);
    let remaining = hoursRemaining * 3600_000;

    let safeguard = 0;
    while (remaining > 0 && safeguard < 400) {
      safeguard++;

      const { localDayStart, dow } = this.getLocalDateInfo(cursor, tz);
      const dateStr = this.toDateStr(cursor, tz);

      if (holidays.has(dateStr) || !dayMap.has(dow)) {
        cursor = this.nextDayStart(cursor, dayMap, tz);
        continue;
      }

      const { startMs, endMs } = dayMap.get(dow)!;
      const bStart = new Date(localDayStart.getTime() + startMs);
      const bEnd   = new Date(localDayStart.getTime() + endMs);

      if (cursor < bStart) { cursor = bStart; continue; }
      if (cursor >= bEnd)  { cursor = this.nextDayStart(cursor, dayMap, tz); continue; }

      const available = bEnd.getTime() - cursor.getTime();
      if (remaining <= available) {
        cursor    = new Date(cursor.getTime() + remaining);
        remaining = 0;
      } else {
        remaining -= available;
        cursor     = this.nextDayStart(cursor, dayMap, tz);
      }
    }

    return cursor;
  }

  private nextDayStart(
    from:   Date,
    dayMap: Map<number, { startMs: number; endMs: number }>,
    tz:     string,
  ): Date {
    const { localDayStart } = this.getLocalDateInfo(from, tz);
    let next = new Date(localDayStart.getTime() + 86_400_000);

    for (let i = 0; i < 7; i++) {
      const { dow } = this.getLocalDateInfo(next, tz);
      if (dayMap.has(dow)) {
        const { localDayStart: nextDayStart } = this.getLocalDateInfo(next, tz);
        const { startMs } = dayMap.get(dow)!;
        return new Date(nextDayStart.getTime() + startMs);
      }
      next = new Date(next.getTime() + 86_400_000);
    }

    return new Date(from.getTime() + 86_400_000);
  }

  private getLocalDateInfo(d: Date, tz: string): { localDayStart: Date; dow: number } {
    const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday:  'short',
      hour:     '2-digit',
      minute:   '2-digit',
      second:   '2-digit',
      hour12:   false,
    });

    const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

    const localH = +parts.hour   || 0;
    const localM = +parts.minute || 0;
    const localS = +parts.second || 0;
    const dow    = DOW_SHORT.indexOf(parts.weekday ?? 'Sun');

    // Subtract elapsed local time to get local midnight in UTC.
    let localDayStart = new Date(
      d.getTime() - (localH * 3_600_000 + localM * 60_000 + localS * 1_000),
    );

    // DST-safety: verify the result is actually midnight in tz.
    // If a DST transition occurred during the day, our subtraction can be off by ±1h.
    const vParts = fmt.formatToParts(localDayStart).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value; return acc;
    }, {});
    const vH = +vParts.hour || 0;
    const vM = +vParts.minute || 0;
    const vS = +vParts.second || 0;
    if (vH !== 0 || vM !== 0 || vS !== 0) {
      localDayStart = new Date(
        localDayStart.getTime() - (vH * 3_600_000 + vM * 60_000 + vS * 1_000),
      );
    }

    return { localDayStart, dow };
  }

  private timeToMs(t: string): number {
    const [h, m, s] = t.split(':').map(Number);
    return ((h * 60 + m) * 60 + (s ?? 0)) * 1000;
  }

  private toDateStr(d: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  }

  /* ── DB loaders ───────────────────────────────────────────────────────── */

  private async loadBusinessHours(moduleId: string): Promise<BusinessHour[]> {
    // Module-specific overrides global. If module has any rows, use those; otherwise global.
    const moduleRows = await this.db.query<BusinessHour[]>(
      `SELECT day_of_week, start_time::text, end_time::text
       FROM config.business_hours
       WHERE module_id = $1 AND is_active = TRUE
       ORDER BY day_of_week`,
      [moduleId],
    );
    if (moduleRows.length) return moduleRows;

    return this.db.query<BusinessHour[]>(
      `SELECT day_of_week, start_time::text, end_time::text
       FROM config.business_hours
       WHERE module_id IS NULL AND is_active = TRUE
       ORDER BY day_of_week`,
    );
  }

  private async loadHolidays(moduleId: string): Promise<Set<string>> {
    const rows = await this.db.query<{ holiday_date: string }[]>(
      `SELECT holiday_date::text
       FROM config.holidays
       WHERE (module_id = $1 OR module_id IS NULL) AND is_active = TRUE`,
      [moduleId],
    );
    return new Set(rows.map(r => r.holiday_date.slice(0, 10)));
  }

  private async loadOrgTimezone(): Promise<string> {
    const [row] = await this.db.query<{ timezone: string }[]>(
      `SELECT timezone FROM users.organizations
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    return row?.timezone ?? 'America/Bogota';
  }

  /* ── Suggest priority from damage_type ───────────────────────────────── */

  async suggestPriorityFromDamageType(damageTypeId: string): Promise<string | null> {
    const [row] = await this.db.query<{ default_priority: string }[]>(
      `SELECT default_priority FROM tickets.damage_types WHERE id = $1 AND is_active = TRUE`,
      [damageTypeId],
    );
    return row?.default_priority ?? null;
  }
}
