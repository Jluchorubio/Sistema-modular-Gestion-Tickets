import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SystemModulesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async findAll() {
    return this.db.query<any[]>(
      `SELECT id, name, slug, description, type, is_active, created_at
       FROM modules.modules
       WHERE deleted_at IS NULL AND is_active = true
       ORDER BY name`,
    );
  }

  async findOne(id: string) {
    const rows = await this.db.query<any[]>(
      `SELECT m.id, m.name, m.slug, m.description, m.type, m.is_active,
              COUNT(DISTINCT umr.user_id) AS member_count
       FROM   modules.modules m
       LEFT JOIN modules.user_module_roles umr ON umr.module_id = m.id AND umr.is_active = true
       WHERE  m.id = $1 AND m.deleted_at IS NULL
       GROUP  BY m.id`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(dto: Record<string, unknown>) {
    const { name, slug, description, type } = dto as any;
    const rows = await this.db.query<any[]>(
      `INSERT INTO modules.modules (name, slug, description, type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, slug, description ?? null, type ?? 'custom'],
    );
    return rows[0];
  }
}
