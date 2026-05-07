import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SystemModulesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async findAll(userId: string) {
    const [profile] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );

    if (profile?.is_superadmin) {
      return this.db.query<any[]>(
        `SELECT id, name, slug, description, type, image_url, is_active, created_at
         FROM modules.modules
         WHERE deleted_at IS NULL AND is_active = true
         ORDER BY name`,
      );
    }

    // Regular users: only modules where they have an active role
    return this.db.query<any[]>(
      `SELECT DISTINCT m.id, m.name, m.slug, m.description, m.type, m.image_url, m.is_active, m.created_at
       FROM modules.modules m
       JOIN modules.user_module_roles umr
         ON umr.module_id = m.id AND umr.user_id = $1 AND umr.is_active = true
       WHERE m.deleted_at IS NULL AND m.is_active = true
       ORDER BY m.name`,
      [userId],
    );
  }

  async findOne(id: string) {
    const rows = await this.db.query<any[]>(
      `SELECT m.id, m.name, m.slug, m.description, m.type, m.image_url, m.is_active,
              COUNT(DISTINCT umr.user_id) AS member_count
       FROM   modules.modules m
       LEFT JOIN modules.user_module_roles umr ON umr.module_id = m.id AND umr.is_active = true
       WHERE  m.id = $1 AND m.deleted_at IS NULL
       GROUP  BY m.id`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Módulo ${id} no encontrado`);
    return rows[0];
  }

  async getModuleRoles(moduleId: string) {
    return this.db.query<any[]>(
      `SELECT id, name, description, is_active
       FROM modules.module_roles
       WHERE module_id = $1 AND is_active = true
       ORDER BY name`,
      [moduleId],
    );
  }

  async create(dto: Record<string, unknown>) {
    const { name, description, type, image_url } = dto as any;

    // Auto-generate slug from name
    const slug = String(name ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Handle slug conflicts by appending counter
    let finalSlug = slug;
    let counter = 1;
    while (true) {
      const [conflict] = await this.db.query<{ id: string }[]>(
        `SELECT id FROM modules.modules WHERE slug = $1 AND deleted_at IS NULL`,
        [finalSlug],
      );
      if (!conflict) break;
      finalSlug = `${slug}-${counter++}`;
    }

    const rows = await this.db.query<any[]>(
      `INSERT INTO modules.modules (name, slug, description, type, image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, finalSlug, description ?? null, type ?? 'custom', image_url ?? null],
    );
    return rows[0];
  }

  async updateModule(id: string, dto: Record<string, unknown>) {
    const { name, description, type, image_url } = dto as any;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) {
      const slug = String(name).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-').replace(/^-|-$/g, '');

      let finalSlug = slug;
      let counter = 1;
      while (true) {
        const [conflict] = await this.db.query<{ id: string }[]>(
          `SELECT id FROM modules.modules WHERE slug = $1 AND id != $2 AND deleted_at IS NULL`,
          [finalSlug, id],
        );
        if (!conflict) break;
        finalSlug = `${slug}-${counter++}`;
      }
      fields.push(`name = $${idx++}`); values.push(name);
      fields.push(`slug = $${idx++}`); values.push(finalSlug);
    }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (type !== undefined) { fields.push(`type = $${idx++}`); values.push(type); }
    if (image_url !== undefined) { fields.push(`image_url = $${idx++}`); values.push(image_url); }

    if (!fields.length) throw new BadRequestException('Nada que actualizar');

    values.push(id);
    const rows = await this.db.query<any[]>(
      `UPDATE modules.modules SET ${fields.join(', ')}
       WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (!rows[0]) throw new NotFoundException(`Módulo ${id} no encontrado`);
    return rows[0];
  }

  async deleteModule(id: string) {
    const result = await this.db.query(
      `UPDATE modules.modules SET deleted_at = now(), is_active = false
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return { ok: true };
  }
}
