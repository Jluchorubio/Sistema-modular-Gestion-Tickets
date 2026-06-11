import 'reflect-metadata';
import { InventoryService } from './inventory.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const MOCK_QR    = {};
const MOCK_FILES = {};

function makeService() {
  const mockDb = { query: jest.fn(), createQueryRunner: jest.fn() };
  const svc = new InventoryService(mockDb as any, MOCK_QR as any, MOCK_FILES as any);
  return { svc, mockDb };
}

const ASSET_ROW = {
  id: 'asset-1', name: 'Server Rack', status: 'disponible',
  qr_code: 'QR-001', serial_number: 'SN-001', version: 1,
  module_name: 'Helpdesk', environment_name: 'Datacenter',
  category_name: 'Hardware', location_name: 'Sala A',
  created_at: new Date(), updated_at: new Date(),
};

describe('InventoryService', () => {
  beforeEach(() => jest.clearAllMocks());

  /* ── findAll ─────────────────────────────────────────────────────────────── */
  describe('findAll', () => {
    it('returns list of assets with no filters', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([ASSET_ROW]);

      const result = await svc.findAll();
      expect(result).toEqual([ASSET_ROW]);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('passes moduleId filter in WHERE clause', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);

      await svc.findAll('mod-1');
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('a.module_id');
      expect(params).toContain('mod-1');
    });

    it('passes status filter', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);

      await svc.findAll(undefined, 'asignado');
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('a.status');
      expect(params).toContain('asignado');
    });

    it('passes search query as ILIKE pattern', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);

      await svc.findAll(undefined, undefined, 'rack');
      const [, params] = mockDb.query.mock.calls[0];
      expect(params).toContain('%rack%');
    });
  });

  /* ── findOne ─────────────────────────────────────────────────────────────── */
  describe('findOne', () => {
    it('returns asset when found', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ ...ASSET_ROW, specifications: null, children_count: 0, tickets_count: 0, files_count: 0 }]);

      const result = await svc.findOne('asset-1');
      expect(result.id).toBe('asset-1');
      expect(mockDb.query.mock.calls[0][1]).toEqual(['asset-1']);
    });

    it('throws NotFoundException when asset missing', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);

      await expect(svc.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  /* ── create ─────────────────────────────────────────────────────────────── */
  describe('create', () => {
    it('inserts asset and returns row', async () => {
      const { svc, mockDb } = makeService();
      const created = { id: 'new-1', name: 'Laptop', qr_code: 'QR-002', status: 'disponible', created_at: new Date() };
      mockDb.query
        .mockResolvedValueOnce([])        // set_config (actorId present)
        .mockResolvedValueOnce([created]);// INSERT RETURNING

      const result = await svc.create(
        { module_id: 'mod-1', environment_id: 'env-1', category_id: 'cat-1', name: 'Laptop' },
        'actor-1',
      );
      expect(result).toEqual(created);
    });

    it('skips set_config when no actorId', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ id: 'new-2', name: 'Monitor', qr_code: 'QR-003', status: 'disponible', created_at: new Date() }]);

      await svc.create({ module_id: 'm', environment_id: 'e', category_id: 'c', name: 'Monitor' });
      expect(mockDb.query).toHaveBeenCalledTimes(1);  // only the INSERT, no set_config
    });
  });

  /* ── updateStatus ────────────────────────────────────────────────────────── */
  describe('updateStatus', () => {
    it('updates asset status successfully', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ id: 'asset-1', name: 'Server', status: 'en_reparacion' }]);

      const result = await svc.updateStatus('asset-1', 'en_reparacion');
      expect(result.status).toBe('en_reparacion');
    });

    it('throws BadRequestException for invalid status', async () => {
      const { svc } = makeService();
      await expect(svc.updateStatus('asset-1', 'broken')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when asset not found', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);  // UPDATE returns nothing

      await expect(svc.updateStatus('bad-id', 'disponible')).rejects.toThrow(NotFoundException);
    });
  });

  /* ── assign ──────────────────────────────────────────────────────────────── */
  describe('assign', () => {
    it('throws NotFoundException when asset missing', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);  // SELECT status → empty

      await expect(
        svc.assign('bad-asset', 'actor-1', { user_id: 'user-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when asset is dado_de_baja', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ status: 'dado_de_baja' }]);

      await expect(
        svc.assign('asset-1', 'actor-1', { user_id: 'user-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when user already has active assignment', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ status: 'disponible' }])  // SELECT status
        .mockResolvedValueOnce([{ id: 'assign-old' }]);     // existing assignment found

      await expect(
        svc.assign('asset-1', 'actor-1', { user_id: 'user-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates assignment and returns assignment_id on success', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ status: 'disponible' }])   // SELECT status
        .mockResolvedValueOnce([])                            // no existing assignment
        .mockResolvedValueOnce([])                            // set_config
        .mockResolvedValueOnce([])                            // UPDATE assets status
        .mockResolvedValueOnce([{ id: 'assign-new' }])        // INSERT assignment
        .mockResolvedValueOnce([]);                           // INSERT history

      const result = await svc.assign('asset-1', 'actor-1', { user_id: 'user-1' });
      expect(result).toEqual({ ok: true, assignment_id: 'assign-new' });
    });
  });

  /* ── unassign ────────────────────────────────────────────────────────────── */
  describe('unassign', () => {
    it('throws NotFoundException when asset missing', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);

      await expect(svc.unassign('bad-asset', 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when asset not assigned', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ status: 'disponible' }]);

      await expect(svc.unassign('asset-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('returns ok:true after successful unassign', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ status: 'asignado' }])                   // SELECT status
        .mockResolvedValueOnce([{ id: 'assign-1', user_id: 'user-1' }])   // find active assignment
        .mockResolvedValueOnce([])                                          // UPDATE assignment status
        .mockResolvedValueOnce([])                                          // INSERT history
        .mockResolvedValueOnce([{ cnt: '0' }])                             // count remaining
        .mockResolvedValueOnce([])                                          // set_config
        .mockResolvedValueOnce([]);                                         // UPDATE asset → disponible

      const result = await svc.unassign('asset-1', 'actor-1');
      expect(result).toEqual({ ok: true });
    });

    it('keeps asset as asignado when other assignments remain', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([{ status: 'asignado' }])
        .mockResolvedValueOnce([{ id: 'assign-2', user_id: 'user-2' }])
        .mockResolvedValueOnce([])   // UPDATE assignment
        .mockResolvedValueOnce([])   // INSERT history
        .mockResolvedValueOnce([{ cnt: '1' }]);  // still 1 active → skip status update

      const result = await svc.unassign('asset-1', 'actor-1');
      expect(result).toEqual({ ok: true });

      // No set_config or UPDATE assets called after cnt check
      const queries = mockDb.query.mock.calls.map(([sql]: [string]) => sql);
      const statusUpdates = queries.filter(s => s.includes("SET status = 'disponible'"));
      expect(statusUpdates.length).toBe(0);
    });
  });

  /* ── FSM transition ─────────────────────────────────────────────────────── */
  describe('transition (FSM)', () => {
    it('throws BadRequestException for invalid state transition', async () => {
      const { svc, mockDb } = makeService();
      // dado_de_baja has no allowed transitions
      mockDb.query.mockResolvedValueOnce([{ status: 'dado_de_baja' }]);

      await expect(
        svc.transition('asset-1', 'actor-1', { status: 'disponible' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when trying to "assign" via transition endpoint', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ status: 'disponible' }]);

      await expect(
        svc.transition('asset-1', 'actor-1', { status: 'asignado' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when asset not found', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);

      await expect(
        svc.transition('bad-id', 'actor-1', { status: 'en_reparacion' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
