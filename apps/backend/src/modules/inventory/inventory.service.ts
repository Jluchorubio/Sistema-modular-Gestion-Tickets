import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QrService } from './qr/qr.service';

export interface CreateAssetDto {
  module_id:       string;
  environment_id:  string;
  category_id:     string;
  name:            string;
  description?:    string;
  serial_number?:  string;
  specifications?: Record<string, unknown>;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly qr: QrService,
  ) {}

  async findAll(moduleId?: string, status?: string) {
    const conditions: string[] = ['a.deleted_at IS NULL'];
    const params: any[] = [];
    let i = 1;
    if (moduleId) { conditions.push(`a.module_id = $${i++}`); params.push(moduleId); }
    if (status)   { conditions.push(`a.status = $${i++}`);    params.push(status); }

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
              m.name  AS module_name,
              e.name  AS environment_name,
              c.name  AS category_name,
              l.name  AS location_name
       FROM   inventory.assets a
       JOIN   modules.modules      m ON m.id = a.module_id
       JOIN   modules.environments e ON e.id = a.environment_id
       JOIN   modules.categories   c ON c.id = a.category_id
       JOIN   modules.locations    l ON l.id = e.location_id
       WHERE  a.id = $1 AND a.deleted_at IS NULL`,
      [id],
    );
    if (!asset) throw new NotFoundException(`Asset ${id} no encontrado`);
    return asset;
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
    const validStatuses = ['disponible', 'asignado', 'en_reparacion', 'dado_de_baja'];
    if (!validStatuses.includes(status)) throw new NotFoundException(`Estado inválido: ${status}`);
    const [asset] = await this.db.query<any[]>(
      `UPDATE inventory.assets SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, name, status`,
      [status, id],
    );
    if (!asset) throw new NotFoundException(`Asset ${id} no encontrado`);
    return asset;
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
