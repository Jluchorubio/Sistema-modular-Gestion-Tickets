import 'reflect-metadata';
import { SlaBreachService } from './sla-breach.service';

const NOOP_NOTIFICATIONS = {
  notifyUser: jest.fn().mockResolvedValue(undefined),
};

function makeService() {
  const mockDb = { query: jest.fn() };
  const svc = new SlaBreachService(mockDb as any, NOOP_NOTIFICATIONS as any);
  return { svc, mockDb };
}

describe('SlaBreachService', () => {
  beforeEach(() => jest.clearAllMocks());

  /* ── runBreachCycle (via triggerManual) ─────────────────────────────────── */
  describe('detectBreaches / runBreachCycle', () => {
    it('returns early without notifying when no breaches found', async () => {
      const { svc, mockDb } = makeService();
      // countActiveBreached → 0, then runBreachCycle UPDATE → empty
      mockDb.query
        .mockResolvedValueOnce([{ count: '0' }])   // triggerManual → countActiveBreached
        .mockResolvedValueOnce([]);                 // runBreachCycle UPDATE RETURNING → no rows

      const result = await svc.triggerManual();
      expect(result).toEqual({ breached: 0 });
      expect(NOOP_NOTIFICATIONS.notifyUser).not.toHaveBeenCalled();
    });

    it('calls notifyUser for each breached ticket', async () => {
      const { svc, mockDb } = makeService();
      const breachedTickets = [
        {
          ticket_id:    'ticket-1',
          title:        'Server Down',
          module_id:    'mod-1',
          module_name:  'Helpdesk',
          priority:     'critica',
          tracking_id:  'trk-1',
          assignee_id:  'user-2',
          creator_id:   'user-1',
          tech_chief_id: 'user-3',
        },
        {
          ticket_id:    'ticket-2',
          title:        'Printer Broken',
          module_id:    'mod-1',
          module_name:  'Helpdesk',
          priority:     'media',
          tracking_id:  'trk-2',
          assignee_id:  null,
          creator_id:   'user-4',
          tech_chief_id: null,
        },
      ];

      mockDb.query
        .mockResolvedValueOnce([{ count: '2' }])   // triggerManual → countActiveBreached
        .mockResolvedValueOnce(breachedTickets);    // runBreachCycle UPDATE RETURNING

      const result = await svc.triggerManual();
      expect(result).toEqual({ breached: 2 });

      // ticket-1: assignee + tech_chief notified (2 targets)
      // ticket-2: no assignee → creator notified (1 target)
      expect(NOOP_NOTIFICATIONS.notifyUser).toHaveBeenCalledTimes(3);
    });

    it('notifies creator when ticket has no assignee', async () => {
      const { svc, mockDb } = makeService();
      const breached = [{
        ticket_id:    'ticket-3',
        title:        'Unassigned Issue',
        module_id:    'mod-1',
        module_name:  'Helpdesk',
        priority:     'alta',
        tracking_id:  'trk-3',
        assignee_id:  null,
        creator_id:   'creator-uuid',
        tech_chief_id: null,
      }];

      mockDb.query
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce(breached);

      await svc.triggerManual();

      const calls = NOOP_NOTIFICATIONS.notifyUser.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0].userId).toBe('creator-uuid');
      expect(calls[0][0].eventType).toBe('ticket.sla_breached');
    });

    it('does not duplicate notify when tech_chief is same as assignee', async () => {
      const { svc, mockDb } = makeService();
      const breached = [{
        ticket_id:    'ticket-4',
        title:        'Same Person',
        module_id:    'mod-1',
        module_name:  'Helpdesk',
        priority:     'baja',
        tracking_id:  'trk-4',
        assignee_id:  'user-5',
        creator_id:   'user-6',
        tech_chief_id: 'user-5',  // same as assignee → Set deduplicates
      }];

      mockDb.query
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce(breached);

      await svc.triggerManual();
      // Only 1 notification (Set deduplication)
      expect(NOOP_NOTIFICATIONS.notifyUser).toHaveBeenCalledTimes(1);
    });
  });

  /* ── countActiveBreached ────────────────────────────────────────────────── */
  describe('countActiveBreached (via triggerManual)', () => {
    it('returns count before running cycle', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ count: '7' }])  // countActiveBreached
        .mockResolvedValueOnce([]);               // runBreachCycle → no actual breaches to notify

      const result = await svc.triggerManual();
      expect(result).toEqual({ breached: 7 });
    });
  });
});
