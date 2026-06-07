import 'reflect-metadata';
import { AutoCloseService } from './auto-close.service';

const NOOP_MESSAGING = { emit: jest.fn() };

describe('AutoCloseService', () => {
  let service: AutoCloseService;
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    mockDb = { query: jest.fn() };
    service = new AutoCloseService(mockDb as any, NOOP_MESSAGING as any);
    jest.clearAllMocks();
  });

  describe('SQL correctness', () => {
    it('uses transitioned_at (not changed_at) in the LATERAL subquery', async () => {
      // No tickets → nothing to close
      mockDb.query.mockResolvedValueOnce([]);
      await (service as any).closeExpiredResolved();

      const sql: string = mockDb.query.mock.calls[0][0];
      expect(sql).toContain('transitioned_at');
      expect(sql).not.toContain('changed_at');
    });

    it('does not close tickets when none are eligible', async () => {
      mockDb.query.mockResolvedValueOnce([]);
      await (service as any).closeExpiredResolved();

      // Only the SELECT was called (no UPDATE)
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(NOOP_MESSAGING.emit).not.toHaveBeenCalled();
    });

    it('emits ticket.state_changed for each closed ticket', async () => {
      const ticket = { ticket_id: 'tid-1', title: 'Test', created_by: 'uid-1', close_state_id: 'state-closed' };
      mockDb.query
        .mockResolvedValueOnce([ticket])              // SELECT tickets
        .mockResolvedValueOnce(undefined)             // set_config
        .mockResolvedValueOnce(undefined);            // UPDATE

      await (service as any).closeExpiredResolved();

      expect(NOOP_MESSAGING.emit).toHaveBeenCalledWith(
        'ticket.state_changed',
        expect.objectContaining({ ticketId: 'tid-1', actorId: 'system' }),
      );
    });

    it('continues processing remaining tickets if one fails', async () => {
      const tickets = [
        { ticket_id: 'tid-1', title: 'A', created_by: 'u1', close_state_id: 's1' },
        { ticket_id: 'tid-2', title: 'B', created_by: 'u2', close_state_id: 's2' },
      ];
      mockDb.query
        .mockResolvedValueOnce(tickets)                   // SELECT
        .mockResolvedValueOnce(undefined)                 // set_config tid-1
        .mockRejectedValueOnce(new Error('DB error'))     // UPDATE tid-1 → throws
        .mockResolvedValueOnce(undefined)                 // set_config tid-2
        .mockResolvedValueOnce(undefined);                // UPDATE tid-2

      await expect((service as any).closeExpiredResolved()).resolves.not.toThrow();
      // Only tid-2 emits (tid-1 failed)
      expect(NOOP_MESSAGING.emit).toHaveBeenCalledTimes(1);
      expect(NOOP_MESSAGING.emit).toHaveBeenCalledWith('ticket.state_changed', expect.objectContaining({ ticketId: 'tid-2' }));
    });
  });

  describe('countPending', () => {
    it('also uses transitioned_at in countPending query', async () => {
      mockDb.query.mockResolvedValueOnce([{ count: '0' }]);
      await (service as any).countPending();

      const sql: string = mockDb.query.mock.calls[0][0];
      expect(sql).toContain('transitioned_at');
      expect(sql).not.toContain('changed_at');
    });
  });
});
