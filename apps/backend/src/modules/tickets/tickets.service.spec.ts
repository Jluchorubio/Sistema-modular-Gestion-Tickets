import 'reflect-metadata';
import { TicketsService } from './tickets.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

const NOOP_MESSAGING = { emit: jest.fn() };
const NOOP_SLA_EVAL  = { compute: jest.fn().mockResolvedValue({ deadline: new Date(), rule_id: 'rule-1', matched_by: 'priority' }) };
const NOOP_PRIORITY  = {
  compute:           jest.fn().mockResolvedValue({ priority: 'media' }),
  checkRecurrence:   jest.fn().mockResolvedValue(0),
  escalatePriority:  jest.fn().mockReturnValue('alta'),
};
const NOOP_ASSIGNMENT = { assign: jest.fn().mockResolvedValue(null) };

function makeQr(queryResults: any[] = []) {
  let callIdx = 0;
  return {
    connect:            jest.fn().mockResolvedValue(undefined),
    startTransaction:   jest.fn().mockResolvedValue(undefined),
    commitTransaction:  jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release:            jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockImplementation(() => {
      const result = queryResults[callIdx] ?? [];
      callIdx++;
      return Promise.resolve(result);
    }),
  };
}

function makeService() {
  const mockDb = {
    query:            jest.fn(),
    createQueryRunner: jest.fn(),
  };
  const svc = new TicketsService(
    mockDb as any,
    NOOP_MESSAGING as any,
    NOOP_SLA_EVAL as any,
    NOOP_PRIORITY as any,
    NOOP_ASSIGNMENT as any,
  );
  return { svc, mockDb };
}

const TICKET_ROW = {
  id:                   'ticket-1',
  title:                'Server Down',
  priority:             'alta',
  urgency:              'alta',
  impact:               'alto',
  module_id:            'mod-1',
  current_state_id:     'state-open',
  workflow_version_id:  'wv-1',
  created_by:           'user-1',
  state_name:           'open',
  state_label:          'Abierto',
  is_final:             false,
  sla_status:           'active',
};

describe('TicketsService', () => {
  beforeEach(() => jest.clearAllMocks());

  /* ── findAll ─────────────────────────────────────────────────────────────── */
  describe('findAll', () => {
    it('returns paginated result with default page/limit', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ count: '5' }])  // COUNT
        .mockResolvedValueOnce([TICKET_ROW]);      // rows

      const result = await svc.findAll({});
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
      expect(result.data).toHaveLength(1);
    });

    it('applies moduleId filter in WHERE clause', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await svc.findAll({ moduleId: 'mod-abc' });
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('t.module_id');
      expect(params).toContain('mod-abc');
    });

    it('applies slaStatus filter', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await svc.findAll({ slaStatus: 'breached' });
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('st.status');
      expect(params).toContain('breached');
    });

    it('clamps page to 1 minimum', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      const result = await svc.findAll({ page: -5 });
      expect(result.page).toBe(1);
    });

    it('clamps limit to 200 maximum', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      const result = await svc.findAll({ limit: 9999 });
      expect(result.limit).toBe(200);
    });
  });

  /* ── findOne ─────────────────────────────────────────────────────────────── */
  describe('findOne', () => {
    it('returns ticket with assignments, history, transitions', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([TICKET_ROW])  // ticket SELECT
        .mockResolvedValueOnce([])            // assignments
        .mockResolvedValueOnce([])            // history
        .mockResolvedValueOnce([]);           // transitions

      const result = await svc.findOne('ticket-1');
      expect(result.id).toBe('ticket-1');
      expect(result.assignments).toEqual([]);
      expect(result.history).toEqual([]);
      expect(result.transitions).toEqual([]);
    });

    it('throws NotFoundException when ticket missing', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);

      await expect(svc.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('filters transitions by role when userId provided', async () => {
      const { svc, mockDb } = makeService();
      const transitions = [
        { id: 'tr-1', allowed_roles: ['tecnico'], from_state_id: 'state-open', to_state_id: 'state-wip' },
        { id: 'tr-2', allowed_roles: [], from_state_id: 'state-open', to_state_id: 'state-closed' },
      ];
      mockDb.query
        .mockResolvedValueOnce([TICKET_ROW])
        .mockResolvedValueOnce([])           // assignments
        .mockResolvedValueOnce([])           // history
        .mockResolvedValueOnce(transitions)  // transitions
        // filterTransitionsByRole query:
        .mockResolvedValueOnce([{ is_superadmin: false, role_name: 'usuario' }]);

      const result = await svc.findOne('ticket-1', 'user-1');
      // tr-1 allowed_roles=['tecnico'], user role='usuario' → filtered out
      // tr-2 allowed_roles=[] → open to all
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0].id).toBe('tr-2');
    });

    it('returns all transitions for superadmin', async () => {
      const { svc, mockDb } = makeService();
      const transitions = [
        { id: 'tr-1', allowed_roles: ['tecnico'] },
        { id: 'tr-2', allowed_roles: ['jefe_tecnico'] },
      ];
      mockDb.query
        .mockResolvedValueOnce([TICKET_ROW])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(transitions)
        .mockResolvedValueOnce([{ is_superadmin: true, role_name: null }]);

      const result = await svc.findOne('ticket-1', 'superadmin-id');
      expect(result.transitions).toHaveLength(2);
    });
  });

  /* ── getModuleCategories ─────────────────────────────────────────────────── */
  describe('getModuleCategories', () => {
    it('returns categories for module', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([
        { id: 'cat-1', name: 'Hardware', parent_id: null },
        { id: 'cat-2', name: 'Software', parent_id: null },
      ]);

      const result = await svc.getModuleCategories('mod-1');
      expect(result).toHaveLength(2);
      expect(mockDb.query.mock.calls[0][1]).toEqual(['mod-1']);
    });
  });

  /* ── transition ──────────────────────────────────────────────────────────── */
  describe('transition', () => {
    it('throws NotFoundException when ticket missing', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);  // ticket SELECT → not found

      await expect(
        svc.transition('user-1', 'bad-ticket', { transition_id: 'tr-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid/unavailable transition', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([TICKET_ROW])  // ticket found
        .mockResolvedValueOnce([]);            // transition NOT found

      await expect(
        svc.transition('user-1', 'ticket-1', { transition_id: 'bad-tr' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when user role not in allowed_roles', async () => {
      const { svc, mockDb } = makeService();
      const trans = {
        id: 'tr-1',
        from_state_id: 'state-open',
        to_state_id: 'state-wip',
        allowed_roles: ['jefe_tecnico'],
      };
      mockDb.query
        .mockResolvedValueOnce([TICKET_ROW])  // ticket
        .mockResolvedValueOnce([trans])       // transition found
        // role guard query:
        .mockResolvedValueOnce([{ is_superadmin: false, role_name: 'usuario' }]);

      await expect(
        svc.transition('user-1', 'ticket-1', { transition_id: 'tr-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('executes transition successfully with no role restriction', async () => {
      const { svc, mockDb } = makeService();
      const trans = {
        id: 'tr-1',
        from_state_id: 'state-open',
        to_state_id: 'state-closed',
        allowed_roles: [],  // open to all
      };
      const qr = makeQr([
        [],  // set_config
        [],  // UPDATE tickets
        [{ is_final: true, name: 'closed', label: 'Cerrado', is_pause_state: false, is_approval_state: false }], // toState
        [],  // resume SLA (paused → active)
        [],  // final state: mark met/breached
        [],  // auto-close assignments
      ]);
      mockDb.query
        .mockResolvedValueOnce([TICKET_ROW])  // ticket
        .mockResolvedValueOnce([trans]);       // transition
      mockDb.createQueryRunner.mockReturnValue(qr);

      const result = await svc.transition('user-1', 'ticket-1', { transition_id: 'tr-1' });
      expect(result).toEqual({ ok: true });
      expect(qr.commitTransaction).toHaveBeenCalled();
      expect(qr.release).toHaveBeenCalled();
    });

    it('rolls back and rethrows on transaction error', async () => {
      const { svc, mockDb } = makeService();
      const trans = { id: 'tr-1', from_state_id: 'state-open', to_state_id: 'state-wip', allowed_roles: [] };
      const qr = makeQr();
      qr.query = jest.fn()
        .mockResolvedValueOnce([])  // set_config OK
        .mockRejectedValueOnce(new Error('DB error'));  // UPDATE fails

      mockDb.query
        .mockResolvedValueOnce([TICKET_ROW])
        .mockResolvedValueOnce([trans]);
      mockDb.createQueryRunner.mockReturnValue(qr);

      await expect(
        svc.transition('user-1', 'ticket-1', { transition_id: 'tr-1' }),
      ).rejects.toThrow('DB error');

      expect(qr.rollbackTransaction).toHaveBeenCalled();
      expect(qr.release).toHaveBeenCalled();
    });
  });
});
