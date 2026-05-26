import { Injectable } from '@nestjs/common';
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
  id:                   string;
  rule_order:           number;
  resolution_time_hours: number;
  priority_result:      string;
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
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /* ── Public: compute full SLA result ─────────────────────────────────── */

  async compute(ctx: SlaContext): Promise<SlaResult> {
    const from = ctx.created_at ?? new Date();

    // 1. Try to match a condition-based rule
    const conditionMatch = await this.evaluateConditions(ctx);
    if (conditionMatch) {
      const deadline = await this.resolveDeadline(
        conditionMatch.resolution_time_hours, from, ctx.module_id,
      );
      return {
        deadline,
        resolution_hours: conditionMatch.resolution_time_hours,
        policy_id: ctx.policy_id,
        rule_id:   conditionMatch.id,
        matched_by: 'condition',
      };
    }

    // 2. Fallback: find rule by priority_result column
    const priorityMatch = await this.findRuleByPriority(ctx.policy_id, ctx.priority);
    if (priorityMatch) {
      const deadline = await this.resolveDeadline(
        priorityMatch.resolution_time_hours, from, ctx.module_id,
      );
      return {
        deadline,
        resolution_hours: priorityMatch.resolution_time_hours,
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
      `SELECT id, rule_order, resolution_time_hours, priority_result
       FROM tickets.sla_rules
       WHERE policy_id = $1
         AND (valid_from  IS NULL OR valid_from  <= now())
         AND (valid_until IS NULL OR valid_until >= now())
       ORDER BY rule_order`,
      [ctx.policy_id],
    );

    if (!rules.length) return null;

    const ruleIds = rules.map(r => r.id);

    // Load all conditions for these rules in one query
    const conditions = await this.db.query<SlaCondition[]>(
      `SELECT rule_id, field, operator, value, logical_group
       FROM tickets.sla_conditions
       WHERE rule_id = ANY($1)
       ORDER BY rule_id, logical_group, order_index`,
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
        let arr: string[] = [];
        try { arr = JSON.parse(cond.value); } catch { return false; }
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
      `SELECT id, rule_order, resolution_time_hours, priority_result
       FROM tickets.sla_rules
       WHERE policy_id      = $1
         AND priority_result = $2
         AND (valid_from  IS NULL OR valid_from  <= now())
         AND (valid_until IS NULL OR valid_until >= now())
       ORDER BY rule_order
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
    const [businessHours, holidays] = await Promise.all([
      this.loadBusinessHours(moduleId),
      this.loadHolidays(moduleId),
    ]);

    // No business hours configured → add raw hours (simple calendar)
    if (!businessHours.length) {
      return new Date(from.getTime() + hoursToAdd * 3600_000);
    }

    return this.advanceBusinessTime(from, hoursToAdd, businessHours, holidays);
  }

  private advanceBusinessTime(
    start:         Date,
    hoursRemaining: number,
    businessHours: BusinessHour[],
    holidays:      Set<string>,
  ): Date {
    // Build a fast lookup: day_of_week → { start_ms, end_ms } relative to day start
    const dayMap = new Map<number, { startMs: number; endMs: number }>();
    for (const bh of businessHours) {
      dayMap.set(bh.day_of_week, {
        startMs: this.timeToMs(bh.start_time),
        endMs:   this.timeToMs(bh.end_time),
      });
    }

    let cursor = new Date(start);
    let remaining = hoursRemaining * 3600_000; // ms

    let safeguard = 0;
    while (remaining > 0 && safeguard < 400) {
      safeguard++;

      const dow = cursor.getDay();
      const dateStr = this.toDateStr(cursor);

      // Skip holidays and non-business days
      if (holidays.has(dateStr) || !dayMap.has(dow)) {
        cursor = this.nextDayStart(cursor, dayMap);
        continue;
      }

      const { startMs, endMs } = dayMap.get(dow)!;
      const dayStart = this.dayStartOf(cursor);
      const bStart = new Date(dayStart.getTime() + startMs);
      const bEnd   = new Date(dayStart.getTime() + endMs);

      // If cursor is before business start → jump to business start
      if (cursor < bStart) {
        cursor = bStart;
        continue;
      }

      // If cursor is at/past business end → jump to next business day start
      if (cursor >= bEnd) {
        cursor = this.nextDayStart(cursor, dayMap);
        continue;
      }

      // Cursor is inside business window: consume as much as possible
      const available = bEnd.getTime() - cursor.getTime(); // ms available today
      if (remaining <= available) {
        cursor = new Date(cursor.getTime() + remaining);
        remaining = 0;
      } else {
        remaining -= available;
        cursor = this.nextDayStart(cursor, dayMap);
      }
    }

    return cursor;
  }

  private nextDayStart(from: Date, dayMap: Map<number, { startMs: number; endMs: number }>): Date {
    // Advance to start of next day that has business hours defined
    let next = this.dayStartOf(from);
    next = new Date(next.getTime() + 86_400_000); // +1 day

    // Find next day with business hours (max 7 attempts = one week)
    for (let i = 0; i < 7; i++) {
      if (dayMap.has(next.getDay())) {
        const { startMs } = dayMap.get(next.getDay())!;
        return new Date(next.getTime() + startMs);
      }
      next = new Date(next.getTime() + 86_400_000);
    }

    // If somehow no business days in a week, just add 1 day raw
    return new Date(from.getTime() + 86_400_000);
  }

  private dayStartOf(d: Date): Date {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    return s;
  }

  private timeToMs(t: string): number {
    // "07:00" or "17:30:00"
    const [h, m, s] = t.split(':').map(Number);
    return ((h * 60 + m) * 60 + (s ?? 0)) * 1000;
  }

  private toDateStr(d: Date): string {
    return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
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

  /* ── Suggest priority from damage_type ───────────────────────────────── */

  async suggestPriorityFromDamageType(damageTypeId: string): Promise<string | null> {
    const [row] = await this.db.query<{ default_priority: string }[]>(
      `SELECT default_priority FROM tickets.damage_types WHERE id = $1 AND is_active = TRUE`,
      [damageTypeId],
    );
    return row?.default_priority ?? null;
  }
}
