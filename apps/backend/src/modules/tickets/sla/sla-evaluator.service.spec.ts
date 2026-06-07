import 'reflect-metadata';
import { SlaEvaluatorService } from './sla-evaluator.service';

// Monday–Friday 08:00–17:00 UTC
const WEEKDAY_HOURS = [
  { day_of_week: 1, start_time: '08:00:00', end_time: '17:00:00' },
  { day_of_week: 2, start_time: '08:00:00', end_time: '17:00:00' },
  { day_of_week: 3, start_time: '08:00:00', end_time: '17:00:00' },
  { day_of_week: 4, start_time: '08:00:00', end_time: '17:00:00' },
  { day_of_week: 5, start_time: '08:00:00', end_time: '17:00:00' },
];
const NO_HOLIDAYS = new Set<string>();

describe('SlaEvaluatorService', () => {
  let service: SlaEvaluatorService;
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    mockDb = { query: jest.fn() };
    service = new SlaEvaluatorService(mockDb as any);
  });

  afterEach(() => jest.clearAllMocks());

  /* ── advanceBusinessTime ──────────────────────────────────────────────── */

  describe('advanceBusinessTime', () => {
    function advance(start: Date, hours: number, holidays = NO_HOLIDAYS): Date {
      return (service as any).advanceBusinessTime(start, hours, WEEKDAY_HOURS, holidays);
    }

    it('adds hours within the same business day', () => {
      // Monday 2024-01-15 09:00 UTC + 2h → 11:00
      const start = new Date('2024-01-15T09:00:00.000Z');
      expect(advance(start, 2).toISOString()).toBe('2024-01-15T11:00:00.000Z');
    });

    it('spills over to the next business day', () => {
      // Monday 09:00 + 10h: 8h today (09–17), 2h Tuesday (08–10)
      const start = new Date('2024-01-15T09:00:00.000Z');
      expect(advance(start, 10).toISOString()).toBe('2024-01-16T10:00:00.000Z');
    });

    it('skips weekend days', () => {
      // Friday 2024-01-19 16:00 + 2h: 1h today, skip Sat+Sun, 1h Monday → 09:00
      const start = new Date('2024-01-19T16:00:00.000Z');
      expect(advance(start, 2).toISOString()).toBe('2024-01-22T09:00:00.000Z');
    });

    it('skips a holiday', () => {
      // Monday 2024-01-15 16:00 + 2h; Tuesday 2024-01-16 is holiday
      // 1h on Monday, skip Tuesday, 1h on Wednesday → 09:00
      const holidays = new Set(['2024-01-16']);
      const start = new Date('2024-01-15T16:00:00.000Z');
      expect(advance(start, 2, holidays).toISOString()).toBe('2024-01-17T09:00:00.000Z');
    });

    it('advances cursor to business start when started before opening', () => {
      // Monday 2024-01-15 06:00 UTC (before 08:00) + 1h → 09:00
      const start = new Date('2024-01-15T06:00:00.000Z');
      expect(advance(start, 1).toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('handles exactly 0 hours remaining gracefully', () => {
      const start = new Date('2024-01-15T10:00:00.000Z');
      expect(advance(start, 0).toISOString()).toBe(start.toISOString());
    });
  });

  /* ── conditionPasses ──────────────────────────────────────────────────── */

  describe('conditionPasses', () => {
    function pass(field: string, operator: string, value: string, ctxOverride: object = {}): boolean {
      const cond = { rule_id: 'r1', field, operator, value, logical_group: 0 };
      const ctx = { priority: 'alta', module_id: 'm1', policy_id: 'p1', ...ctxOverride };
      return (service as any).conditionPasses(cond, ctx);
    }

    it('= operator: match', () => expect(pass('priority', '=', 'alta')).toBe(true));
    it('= operator: no match', () => expect(pass('priority', '=', 'baja')).toBe(false));
    it('!= operator: returns true when values differ', () => expect(pass('priority', '!=', 'baja')).toBe(true));
    it('IN operator with JSON array: match', () => expect(pass('priority', 'IN', '["alta","critica"]')).toBe(true));
    it('IN operator: no match', () => expect(pass('priority', 'IN', '["baja","media"]')).toBe(false));
    it('IN operator: invalid JSON returns false', () => expect(pass('priority', 'IN', 'not-json')).toBe(false));
    it('> operator: numeric comparison', () => expect(pass('priority', '>', '3', { priority: '5' })).toBe(true));
    it('< operator: numeric comparison', () => expect(pass('priority', '<', '10', { priority: '5' })).toBe(true));
    it('unknown field returns false', () => expect(pass('nonexistent', '=', 'x')).toBe(false));
    it('unknown operator returns false', () => expect(pass('priority', 'LIKE', 'alta')).toBe(false));
  });

  /* ── resolveDeadline ─────────────────────────────────────────────────── */

  describe('resolveDeadline', () => {
    it('adds raw calendar hours when no business hours are configured', async () => {
      mockDb.query
        .mockResolvedValueOnce([])  // no module business hours
        .mockResolvedValueOnce([])  // no global business hours
        .mockResolvedValueOnce([]); // holidays

      const from = new Date('2024-01-15T10:00:00.000Z');
      const result = await service.resolveDeadline(4, from, 'mod-x');
      expect(result.toISOString()).toBe('2024-01-15T14:00:00.000Z');
    });

    it('uses business hours when configured', async () => {
      mockDb.query
        .mockResolvedValueOnce(WEEKDAY_HOURS)  // module business hours (returned directly)
        .mockResolvedValueOnce([]);             // holidays

      // Monday 09:00 + 2h = 11:00
      const from = new Date('2024-01-15T09:00:00.000Z');
      const result = await service.resolveDeadline(2, from, 'mod-x');
      expect(result.toISOString()).toBe('2024-01-15T11:00:00.000Z');
    });
  });

  /* ── ruleMatches (OR-groups of AND-conditions) ───────────────────────── */

  describe('ruleMatches', () => {
    function match(conditions: object[]): boolean {
      const ctx = { priority: 'alta', module_id: 'm1', policy_id: 'p1' };
      return (service as any).ruleMatches(conditions, ctx);
    }

    it('single condition match → true', () => {
      expect(match([{ rule_id: 'r1', field: 'priority', operator: '=', value: 'alta', logical_group: 0 }])).toBe(true);
    });

    it('two conditions in same group (AND): both match → true', () => {
      expect(match([
        { rule_id: 'r1', field: 'priority', operator: '=', value: 'alta', logical_group: 0 },
        { rule_id: 'r1', field: 'module_id', operator: '=', value: 'm1', logical_group: 0 },
      ])).toBe(true);
    });

    it('two conditions in same group (AND): one fails → false', () => {
      expect(match([
        { rule_id: 'r1', field: 'priority', operator: '=', value: 'alta', logical_group: 0 },
        { rule_id: 'r1', field: 'module_id', operator: '=', value: 'wrong', logical_group: 0 },
      ])).toBe(false);
    });

    it('two groups (OR): first group fails, second matches → true', () => {
      expect(match([
        { rule_id: 'r1', field: 'priority', operator: '=', value: 'baja',  logical_group: 0 },
        { rule_id: 'r1', field: 'priority', operator: '=', value: 'alta',  logical_group: 1 },
      ])).toBe(true);
    });
  });
});
