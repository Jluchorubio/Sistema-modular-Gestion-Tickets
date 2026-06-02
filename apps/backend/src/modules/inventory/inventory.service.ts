import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QrService } from './qr/qr.service';
import { FilesService } from '../files/files.service';

export type AssetStatus = 'disponible' | 'asignado' | 'en_reparacion' | 'dado_de_baja';

export interface CreateAssetDto {
  module_id:       string;
  environment_id:  string;
  category_id:     string;
  name:            string;
  description?:    string;
  serial_number?:  string;
  specifications?: Record<string, unknown>;
}

const FSM: Record<AssetStatus, AssetStatus[]> = {
  disponible:    ['asignado', 'en_reparacion', 'dado_de_baja'],
  asignado:      ['disponible', 'en_reparacion', 'dado_de_baja'],
  en_reparacion: ['disponible', 'dado_de_baja'],
  dado_de_baja:  [],
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly qr: QrService,
    private readonly files: FilesService,
  ) {}

  async findAll(moduleId?: string, status?: string, q?: string) {
    const conditions: string[] = ['a.deleted_at IS NULL'];
    const params: any[] = [];
    let i = 1;
    if (moduleId) { conditions.push(`a.module_id = $${i++}`); params.push(moduleId); }
    if (status)   { conditions.push(`a.status = $${i++}`);    params.push(status); }
    if (q) {
      conditions.push(`(a.name ILIKE $${i} OR a.serial_number ILIKE $${i} OR a.qr_code ILIKE $${i})`);
      params.push(`%${q.trim()}%`);
      i++;
    }

    return this.db.query<any[]>(
      `SELECT a.id, a.name, a.description, a.qr_code, a.serial_number,
              a.status, a.version, a.created_at, a.updated_at,
              m.name  AS module_name,
              e.name  AS environment_name,
              c.name  AS category_name,
              l.name  AS location_name
       FROM   inventory.assets a
       JOIN   modules.modules      m ON m.id = a.module_id
       JOIN   modules.environments e ON e.id = a.environment_id
       JOIN   modules.categories   c ON c.id = a.category_id
       JOIN   modules.locations    l ON l.id = e.location_id
       WHERE  ${conditions.join(' AND ')}
       ORDER  BY a.created_at DESC
       LIMIT  200`,
      params,
    );
  }

  async findOne(id: string) {
    const [asset] = await this.db.query<any[]>(
      `SELECT a.id, a.name, a.description, a.qr_code, a.serial_number,
              a.status, a.version, a.specifications, a.created_at, a.updated_at,
              a.parent_asset_id, a.module_id, a.environment_id, a.category_id,
              m.name  AS module_name,
              e.name  AS environment_name,
              c.name  AS category_name,
              c.field_schema,
              l.name  AS location_name,
              pa.name   AS parent_asset_name,
              pa.status AS parent_asset_status,
              (SELECT COUNT(*)::int FROM inventory.assets ch
               WHERE ch.parent_asset_id = a.id AND ch.deleted_at IS NULL)  AS children_count,
              (SELECT COUNT(*)::int FROM inventory.ticket_assets ta
               WHERE ta.asset_id = a.id)                                   AS tickets_count,
              (SELECT COUNT(*)::int FROM files.files f
               WHERE f.entity_type = 'asset' AND f.entity_id = a.id)      AS files_count
       FROM   inventory.assets a
       JOIN   modules.modules      m  ON m.id  = a.module_id
       JOIN   modules.environments e  ON e.id  = a.environment_id
       JOIN   modules.categories   c  ON c.id  = a.category_id
       JOIN   modules.locations    l  ON l.id  = e.location_id
       LEFT JOIN inventory.assets  pa ON pa.id = a.parent_asset_id AND pa.deleted_at IS NULL
       WHERE  a.id = $1 AND a.deleted_at IS NULL`,
      [id],
    );
    if (!asset) throw new NotFoundException(`Asset ${id} no encontrado`);
    return asset;
  }

  async getChildAssets(id: string) {
    return this.db.query<any[]>(
      `SELECT a.id, a.name, a.status, a.qr_code, a.serial_number,
              c.name AS category_name
       FROM   inventory.assets a
       JOIN   modules.categories c ON c.id = a.category_id
       WHERE  a.parent_asset_id = $1 AND a.deleted_at IS NULL
       ORDER  BY a.name`,
      [id],
    );
  }

  async create(dto: CreateAssetDto) {
    const { module_id, environment_id, category_id, name, description, serial_number, specifications } = dto;
    const [asset] = await this.db.query<any[]>(
      `INSERT INTO inventory.assets
         (module_id, environment_id, category_id, name, description, serial_number, specifications)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, qr_code, status, created_at`,
      [module_id, environment_id, category_id, name,
       description ?? null, serial_number ?? null,
       specifications ? JSON.stringify(specifications) : null],
    );
    return asset;
  }

  async updateStatus(id: string, status: string) {
    const validStatuses: AssetStatus[] = ['disponible', 'asignado', 'en_reparacion', 'dado_de_baja'];
    if (!validStatuses.includes(status as AssetStatus)) throw new BadRequestException(`Estado inválido: ${status}`);
    const [asset] = await this.db.query<any[]>(
      `UPDATE inventory.assets SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, name, status`,
      [status, id],
    );
    if (!asset) throw new NotFoundException(`Asset ${id} no encontrado`);
    return asset;
  }

  /* ── FSM: assign to user ─────────────────────────────────────────────────── */

  async assign(assetId: string, actorId: string, dto: { user_id: string; notes?: string }) {
    const [asset] = await this.db.query<{ status: AssetStatus }[]>(
      `SELECT status FROM inventory.assets WHERE id = $1 AND deleted_at IS NULL`,
      [assetId],
    );
    if (!asset) throw new NotFoundException(`Asset ${assetId} no encontrado`);
    if (!FSM[asset.status].includes('asignado')) {
      throw new BadRequestException(`No se puede asignar un activo en estado "${asset.status}"`);
    }
    if (asset.status === 'asignado') {
      throw new BadRequestException('El activo ya está asignado. Devuélvelo primero.');
    }

    await this.db.query(
      `UPDATE inventory.assets SET status = 'asignado' WHERE id = $1`,
      [assetId],
    );

    const [assignment] = await this.db.query<{ id: string }[]>(
      `INSERT INTO inventory.asset_assignments (asset_id, user_id, assigned_by, notes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [assetId, dto.user_id, actorId, dto.notes ?? null],
    );

    await this.db.query(
      `INSERT INTO inventory.asset_assignment_history
         (asset_id, user_id, assigned_by, assignment_id, action, reason)
       VALUES ($1, $2, $3, $4, 'asignado', $5)`,
      [assetId, dto.user_id, actorId, assignment.id, dto.notes ?? null],
    );

    return { ok: true, assignment_id: assignment.id };
  }

  /* ── FSM: unassign ───────────────────────────────────────────────────────── */

  async unassign(assetId: string, actorId: string, reason?: string) {
    const [asset] = await this.db.query<{ status: AssetStatus }[]>(
      `SELECT status FROM inventory.assets WHERE id = $1 AND deleted_at IS NULL`,
      [assetId],
    );
    if (!asset) throw new NotFoundException(`Asset ${assetId} no encontrado`);
    if (asset.status !== 'asignado') {
      throw new BadRequestException('El activo no está asignado actualmente.');
    }

    const [activeAssignment] = await this.db.query<{ id: string; user_id: string }[]>(
      `SELECT id, user_id FROM inventory.asset_assignments
       WHERE asset_id = $1 AND status = 'activo'
       ORDER BY assigned_at DESC LIMIT 1`,
      [assetId],
    );

    await this.db.query(
      `UPDATE inventory.assets SET status = 'disponible' WHERE id = $1`,
      [assetId],
    );

    if (activeAssignment) {
      await this.db.query(
        `UPDATE inventory.asset_assignments
         SET status = 'devuelto', unassigned_at = now()
         WHERE id = $1`,
        [activeAssignment.id],
      );

      await this.db.query(
        `INSERT INTO inventory.asset_assignment_history
           (asset_id, user_id, assigned_by, assignment_id, action, reason)
         VALUES ($1, $2, $3, $4, 'devuelto', $5)`,
        [assetId, activeAssignment.user_id, actorId, activeAssignment.id, reason ?? null],
      );
    }

    return { ok: true };
  }

  /* ── FSM: generic transition ─────────────────────────────────────────────── */

  async transition(assetId: string, actorId: string, dto: { status: AssetStatus; reason?: string }) {
    const [asset] = await this.db.query<{ status: AssetStatus }[]>(
      `SELECT status FROM inventory.assets WHERE id = $1 AND deleted_at IS NULL`,
      [assetId],
    );
    if (!asset) throw new NotFoundException(`Asset ${assetId} no encontrado`);

    const allowed = FSM[asset.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Transición inválida: ${asset.status} → ${dto.status}. Permitidas: ${allowed.join(', ') || 'ninguna'}`,
      );
    }
    if (dto.status === 'asignado') {
      throw new BadRequestException('Para asignar usa el endpoint /assign');
    }

    if (asset.status === 'asignado' && dto.status !== 'disponible') {
      const [activeAssignment] = await this.db.query<{ id: string; user_id: string }[]>(
        `SELECT id, user_id FROM inventory.asset_assignments
         WHERE asset_id = $1 AND status = 'activo'
         ORDER BY assigned_at DESC LIMIT 1`,
        [assetId],
      );
      if (activeAssignment) {
        await this.db.query(
          `UPDATE inventory.asset_assignments SET status = 'devuelto', unassigned_at = now() WHERE id = $1`,
          [activeAssignment.id],
        );
        await this.db.query(
          `INSERT INTO inventory.asset_assignment_history
             (asset_id, user_id, assigned_by, assignment_id, action, reason)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [assetId, activeAssignment.user_id, actorId, activeAssignment.id,
           dto.status === 'dado_de_baja' ? 'dado_de_baja' : 'reparacion', dto.reason ?? null],
        );
      }
    } else {
      const actionMap: Record<string, string> = {
        en_reparacion: 'reparacion',
        dado_de_baja:  'dado_de_baja',
        disponible:    'devuelto',
      };
      const histAction = actionMap[dto.status] ?? dto.status;
      await this.db.query(
        `INSERT INTO inventory.asset_assignment_history
           (asset_id, user_id, assigned_by, action, reason)
         VALUES ($1, $1, $2, $3, $4)`,
        [assetId, actorId, histAction, dto.reason ?? null],
      );
    }

    await this.db.query(
      `UPDATE inventory.assets SET status = $1 WHERE id = $2`,
      [dto.status, assetId],
    );

    return { ok: true, status: dto.status };
  }

  /* ── Current assignment ──────────────────────────────────────────────────── */

  async getCurrentAssignment(assetId: string) {
    const [row] = await this.db.query<any[]>(
      `SELECT aa.id, aa.assigned_at, aa.notes, aa.status AS assignment_status,
              p.id AS user_id,
              p.first_name || ' ' || p.last_name AS user_name,
              p.email AS user_email,
              p.avatar_url,
              ab.first_name || ' ' || ab.last_name AS assigned_by_name
       FROM   inventory.asset_assignments aa
       JOIN   users.profiles p  ON p.id  = aa.user_id
       JOIN   users.profiles ab ON ab.id = aa.assigned_by
       WHERE  aa.asset_id = $1 AND aa.status = 'activo'
       ORDER  BY aa.assigned_at DESC LIMIT 1`,
      [assetId],
    );
    return row ?? null;
  }

  /* ── History ─────────────────────────────────────────────────────────────── */

  async getHistory(assetId: string) {
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

  async updateAsset(id: string, dto: {
    name?:            string;
    description?:     string;
    serial_number?:   string;
    specifications?:  Record<string, unknown>;
    environment_id?:  string;
    category_id?:     string;
  }) {
    const fields: string[] = [];
    const values: any[]    = [];
    let idx = 1;
    const allowed = ['name','description','serial_number','specifications','environment_id','category_id'] as const;
    for (const k of allowed) {
      if (dto[k] !== undefined) {
        fields.push(`${k} = $${idx++}`);
        values.push(k === 'specifications' ? JSON.stringify(dto[k]) : dto[k]);
      }
    }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(id);
    const [row] = await this.db.query<any[]>(
      `UPDATE inventory.assets SET ${fields.join(', ')}
       WHERE id = $${idx} AND deleted_at IS NULL RETURNING id, name, serial_number, status`,
      values,
    );
    if (!row) throw new NotFoundException(`Asset ${id} no encontrado`);
    return row;
  }

  async deleteAsset(id: string, actorId: string) {
    const [asset] = await this.db.query<{ status: AssetStatus }[]>(
      `SELECT status FROM inventory.assets WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!asset) throw new NotFoundException(`Asset ${id} no encontrado`);
    if (asset.status === 'asignado')
      throw new BadRequestException('No se puede eliminar un activo asignado. Devuélvelo primero.');

    await this.db.query(
      `UPDATE inventory.assets SET deleted_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
    await this.db.query(
      `INSERT INTO inventory.asset_assignment_history (asset_id, user_id, assigned_by, action, reason)
       VALUES ($1, $1, $2, 'dado_de_baja', 'Eliminado del sistema')`,
      [id, actorId],
    );
    return { ok: true };
  }

  async bulkImport(
    moduleId: string,
    rows: Array<Omit<CreateAssetDto, 'module_id'>>,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    if (rows.length > 100) throw new BadRequestException('Máximo 100 activos por importación');
    const errors: { row: number; message: string }[] = [];
    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.name?.trim())      { errors.push({ row: i + 1, message: 'Nombre requerido'     }); continue; }
      if (!r.environment_id)    { errors.push({ row: i + 1, message: 'environment_id requerido' }); continue; }
      if (!r.category_id)       { errors.push({ row: i + 1, message: 'category_id requerido' }); continue; }
      try {
        await this.create({ ...r, module_id: moduleId });
        created++;
      } catch (e: any) {
        errors.push({ row: i + 1, message: e.message ?? 'Error desconocido' });
      }
    }
    return { created, errors };
  }

  /* ── Asset images ───────────────────────────────────────────────────────── */

  async getAssetImages(assetId: string) {
    return this.db.query<any[]>(
      `SELECT f.id, f.file_name, f.file_size, f.mime_type, f.storage_url, f.created_at,
              p.first_name || ' ' || p.last_name AS uploaded_by_name
       FROM   files.files f
       LEFT JOIN users.profiles p ON p.id = f.uploaded_by
       WHERE  f.entity_type = 'asset' AND f.entity_id = $1
       ORDER  BY f.created_at DESC`,
      [assetId],
    );
  }

  async uploadAssetImage(assetId: string, actorId: string, file: Express.Multer.File) {
    const { url } = await this.files.save(file);
    const [record] = await this.db.query<any[]>(
      `INSERT INTO files.files (uploaded_by, entity_type, entity_id, file_name, file_size, mime_type, storage_url)
       VALUES ($1, 'asset', $2, $3, $4, $5, $6)
       RETURNING id, file_name, file_size, mime_type, storage_url, created_at`,
      [actorId, assetId, file.originalname, file.size, file.mimetype, url],
    );
    await this.db.query(
      `UPDATE inventory.assets SET updated_at = now() WHERE id = $1`,
      [assetId],
    );
    return record;
  }

  async deleteAssetImage(imageId: string, assetId: string) {
    const [file] = await this.db.query<{ storage_url: string }[]>(
      `DELETE FROM files.files
       WHERE id = $1 AND entity_type = 'asset' AND entity_id = $2
       RETURNING storage_url`,
      [imageId, assetId],
    );
    if (!file) throw new NotFoundException('Imagen no encontrada');
    await this.files.delete(file.storage_url);
    return { ok: true };
  }

  async getAssetTickets(assetId: string) {
    return this.db.query<any[]>(
      `SELECT t.id, t.title, t.priority, t.created_at,
              s.label AS state_label, s.name AS state_name, s.is_final,
              p.first_name || ' ' || p.last_name AS creator_name
       FROM   inventory.ticket_assets ta
       JOIN   tickets.tickets t  ON t.id  = ta.ticket_id
       JOIN   tickets.states  s  ON s.id  = t.current_state_id
       JOIN   users.profiles  p  ON p.id  = t.created_by
       WHERE  ta.asset_id = $1
       ORDER  BY t.created_at DESC
       LIMIT  30`,
      [assetId],
    );
  }

  /* ── Asset relations (parent / child) ───────────────────────────────────── */

  async relate(
    assetId: string,
    actorId: string,
    dto: { target_id: string; relation: 'set-child' | 'set-parent' | 'remove-parent' },
  ) {
    if (dto.relation === 'remove-parent') {
      const [asset] = await this.db.query<{ id: string; parent_asset_id: string | null }[]>(
        `SELECT id, parent_asset_id FROM inventory.assets WHERE id = $1 AND deleted_at IS NULL`,
        [assetId],
      );
      if (!asset) throw new NotFoundException(`Asset ${assetId} no encontrado`);
      if (!asset.parent_asset_id) throw new BadRequestException('Este activo no tiene un padre asignado');

      await this.db.query(
        `UPDATE inventory.assets SET parent_asset_id = NULL, updated_at = now() WHERE id = $1`,
        [assetId],
      );
      await this.db.query(
        `INSERT INTO inventory.asset_assignment_history (asset_id, user_id, assigned_by, action, reason)
         VALUES ($1, $2, $2, 'desasociado', 'Desasociado de activo padre')`,
        [assetId, actorId],
      );
      return { ok: true };
    }

    /* Look up target by UUID or QR code */
    const [target] = await this.db.query<{ id: string; name: string; parent_asset_id: string | null }[]>(
      `SELECT id, name, parent_asset_id FROM inventory.assets
       WHERE (id = $1 OR qr_code = $1) AND deleted_at IS NULL`,
      [dto.target_id],
    );
    if (!target) throw new NotFoundException(`Activo "${dto.target_id}" no encontrado`);
    if (target.id === assetId) throw new BadRequestException('Un activo no puede relacionarse consigo mismo');

    if (dto.relation === 'set-child') {
      /* current asset is parent, target becomes its child */
      if (target.parent_asset_id === assetId) throw new BadRequestException('El activo ya es componente de este equipo');
      await this.db.query(
        `UPDATE inventory.assets SET parent_asset_id = $1, updated_at = now() WHERE id = $2`,
        [assetId, target.id],
      );
      await this.db.query(
        `INSERT INTO inventory.asset_assignment_history (asset_id, user_id, assigned_by, action, reason)
         VALUES ($1, $2, $2, 'asociado', $3)`,
        [target.id, actorId, `Asociado como componente de: ${assetId}`],
      );
    } else {
      /* dto.relation === 'set-parent': target becomes this asset's parent */
      await this.db.query(
        `UPDATE inventory.assets SET parent_asset_id = $1, updated_at = now() WHERE id = $2`,
        [target.id, assetId],
      );
      await this.db.query(
        `INSERT INTO inventory.asset_assignment_history (asset_id, user_id, assigned_by, action, reason)
         VALUES ($1, $2, $2, 'asociado', $3)`,
        [assetId, actorId, `Asociado como componente de: ${target.id}`],
      );
    }

    return { ok: true, target: { id: target.id, name: target.name } };
  }

  async getQr(id: string) {
    const [asset] = await this.db.query<{ qr_code: string }[]>(
      `SELECT qr_code FROM inventory.assets WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!asset) throw new NotFoundException(`Asset ${id} no encontrado`);
    const dataUrl = await this.qr.generate(id);
    return { id, qr_code: asset.qr_code, qr_image: dataUrl };
  }
}
