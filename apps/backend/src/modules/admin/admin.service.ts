import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';

const VALID_TYPES = new Set(['module', 'user', 'role', 'request']);

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getTrash(type?: string, page = 1, limit = 20) {
    page  = Math.max(1, page);
    limit = Math.min(100, Math.max(1, limit));
    const offset = (page - 1) * limit;

    const parts: Promise<any[]>[] = [];

    if (!type || type === 'module') {
      parts.push(this.db.query<any[]>(
        `SELECT id, name AS display_name, 'module' AS item_type,
                deleted_at, scheduled_hard_delete_at,
                EXTRACT(EPOCH FROM (scheduled_hard_delete_at - now())) / 86400 AS days_remaining,
                type AS extra
         FROM modules.modules WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
      ));
    }
    if (!type || type === 'user') {
      parts.push(this.db.query<any[]>(
        `SELECT p.id, p.first_name || ' ' || p.last_name AS display_name, 'user' AS item_type,
                p.deleted_at, p.scheduled_hard_delete_at,
                EXTRACT(EPOCH FROM (p.scheduled_hard_delete_at - now())) / 86400 AS days_remaining,
                c.email AS extra
         FROM users.profiles p
         JOIN auth.credentials c ON c.user_id = p.id
         WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC`,
      ));
    }
    if (!type || type === 'role') {
      parts.push(this.db.query<any[]>(
        `SELECT id, name AS display_name, 'role' AS item_type,
                deleted_at, scheduled_hard_delete_at,
                EXTRACT(EPOCH FROM (scheduled_hard_delete_at - now())) / 86400 AS days_remaining,
                description AS extra
         FROM config.global_roles WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
      ));
    }
    if (!type || type === 'request') {
      parts.push(this.db.query<any[]>(
        `SELECT r.id, r.title AS display_name, 'request' AS item_type,
                r.deleted_at, r.scheduled_hard_delete_at,
                EXTRACT(EPOCH FROM (r.scheduled_hard_delete_at - now())) / 86400 AS days_remaining,
                r.type AS extra
         FROM requests.admin_requests r
         WHERE r.deleted_at IS NOT NULL ORDER BY r.deleted_at DESC`,
      ));
    }

    const all = (await Promise.all(parts)).flat()
      .sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    const total = all.length;
    const data  = all.slice(offset, offset + limit);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async restoreItems(type: string, ids: string[]) {
    this.assertValidType(type);
    const results = await Promise.all(ids.map(id => this.restoreOne(type, id)));
    return { restored: results.filter(r => r.ok).length, errors: results.filter(r => !r.ok) };
  }

  async permanentDeleteItems(type: string, ids: string[]) {
    this.assertValidType(type);
    const results = await Promise.all(ids.map(id => this.permanentDeleteOne(type, id)));
    return { deleted: results.filter(r => r.ok).length, errors: results.filter(r => !r.ok) };
  }

  async bulkSoftDelete(type: string, ids: string[], actorId: string) {
    this.assertValidType(type);
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        if (type === 'user' && id === actorId) throw new BadRequestException('No puedes eliminarte a ti mismo');
        await this.softDeleteOne(type, id);
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e.message });
      }
    }
    this.logger.log(`Bulk soft-delete ${type}: ${results.filter(r => r.ok).length}/${ids.length} ok by ${actorId}`);
    return { deleted: results.filter(r => r.ok).length, errors: results.filter(r => !r.ok) };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private assertValidType(type: string) {
    if (!VALID_TYPES.has(type)) throw new BadRequestException(`Tipo inválido: ${type}`);
  }

  private async restoreOne(type: string, id: string) {
    try {
      if (type === 'module') {
        await this.db.query(
          `UPDATE modules.modules
           SET deleted_at = NULL, scheduled_hard_delete_at = NULL, is_active = true
           WHERE id = $1 AND deleted_at IS NOT NULL`, [id],
        );
      } else if (type === 'user') {
        await this.db.query(
          `UPDATE users.profiles
           SET deleted_at = NULL, scheduled_hard_delete_at = NULL, is_active = true
           WHERE id = $1 AND deleted_at IS NOT NULL`, [id],
        );
        await this.db.query(
          `UPDATE auth.credentials SET is_active = true WHERE user_id = $1`, [id],
        );
      } else if (type === 'role') {
        await this.db.query(
          `UPDATE config.global_roles
           SET deleted_at = NULL, scheduled_hard_delete_at = NULL, is_active = true
           WHERE id = $1 AND deleted_at IS NOT NULL`, [id],
        );
      } else if (type === 'request') {
        await this.db.query(
          `UPDATE requests.admin_requests
           SET deleted_at = NULL, scheduled_hard_delete_at = NULL
           WHERE id = $1 AND deleted_at IS NOT NULL`, [id],
        );
      }
      return { id, ok: true };
    } catch (e: any) {
      return { id, ok: false, error: e.message };
    }
  }

  private async permanentDeleteOne(type: string, id: string) {
    try {
      if (type === 'module') {
        await this.db.query(
          `DELETE FROM modules.modules WHERE id = $1 AND deleted_at IS NOT NULL`, [id],
        );
      } else if (type === 'user') {
        await this.db.query(`DELETE FROM auth.credentials WHERE user_id = $1`, [id]);
        await this.db.query(
          `DELETE FROM users.profiles WHERE id = $1 AND deleted_at IS NOT NULL`, [id],
        );
      } else if (type === 'role') {
        await this.db.query(
          `DELETE FROM config.global_roles WHERE id = $1 AND deleted_at IS NOT NULL`, [id],
        );
      } else if (type === 'request') {
        await this.db.query(
          `DELETE FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NOT NULL`, [id],
        );
      }
      return { id, ok: true };
    } catch (e: any) {
      return { id, ok: false, error: e.message };
    }
  }

  private async softDeleteOne(type: string, id: string) {
    if (type === 'module') {
      await this.db.query(
        `UPDATE modules.modules
         SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days', is_active = false
         WHERE id = $1 AND deleted_at IS NULL`, [id],
      );
    } else if (type === 'user') {
      await this.db.query(
        `UPDATE users.profiles
         SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days', is_active = false
         WHERE id = $1 AND deleted_at IS NULL`, [id],
      );
      await this.db.query(`UPDATE auth.credentials SET is_active = false WHERE user_id = $1`, [id]);
      await this.db.query(`DELETE FROM auth.refresh_tokens WHERE user_id = $1`, [id]);
    } else if (type === 'role') {
      await this.db.query(
        `UPDATE config.global_roles
         SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days', is_active = false
         WHERE id = $1 AND deleted_at IS NULL`, [id],
      );
    } else if (type === 'request') {
      await this.db.query(
        `UPDATE requests.admin_requests
         SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days'
         WHERE id = $1 AND deleted_at IS NULL`, [id],
      );
    }
  }
}
