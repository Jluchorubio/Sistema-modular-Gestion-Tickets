import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateKnowledgeArticleDto, UpdateKnowledgeArticleDto } from '../dto/knowledge-article.dto';

@Injectable()
export class KnowledgeService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /* ── Articles ────────────────────────────────────────────────────────────── */

  async getArticles(moduleId: string, search?: string, includeDrafts = false) {
    const params: any[] = [moduleId];
    let searchClause = '';
    if (search?.trim() && search.trim().length >= 2) {
      params.push(`%${search.trim()}%`);
      searchClause = `AND (a.title ILIKE $${params.length} OR a.content ILIKE $${params.length} OR a.category ILIKE $${params.length})`;
    }
    const publishedClause = includeDrafts ? '' : 'AND a.is_published = true';
    return this.db.query<any[]>(
      `SELECT a.id, a.title, a.content, a.category, a.tags, a.is_published,
              a.status, a.helpful_count, a.not_helpful_count,
              a.view_count, a.created_at, a.updated_at,
              a.doc_type, a.file_url, a.file_name, a.file_size, a.file_mime,
              p.first_name || ' ' || p.last_name AS author_name,
              a.ticket_id
       FROM   tickets.knowledge_articles a
       JOIN   users.profiles p ON p.id = a.created_by
       WHERE  a.module_id = $1 AND a.deleted_at IS NULL ${publishedClause}
         ${searchClause}
       ORDER  BY a.view_count DESC, a.created_at DESC
       LIMIT  100`,
      params,
    );
  }

  async getArticle(id: string) {
    const [article] = await this.db.query<any[]>(
      `SELECT a.*, p.first_name || ' ' || p.last_name AS author_name
       FROM   tickets.knowledge_articles a
       JOIN   users.profiles p ON p.id = a.created_by
       WHERE  a.id = $1 AND a.deleted_at IS NULL`,
      [id],
    );
    if (!article) throw new NotFoundException('Article not found');
    await this.db.query(
      `UPDATE tickets.knowledge_articles SET view_count = view_count + 1 WHERE id = $1`,
      [id],
    ).catch(() => {});
    return article;
  }

  async createArticle(userId: string, dto: CreateKnowledgeArticleDto) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.knowledge_articles
         (module_id, title, content, category, tags, ticket_id, is_published,
          doc_type, file_url, file_name, file_size, file_mime, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, title, doc_type, created_at`,
      [
        dto.module_id, dto.title.trim(), (dto.content ?? '').trim(),
        dto.category ?? null, dto.tags ?? [], dto.ticket_id ?? null,
        dto.is_published ?? true,
        dto.doc_type ?? 'article', dto.file_url ?? null,
        dto.file_name ?? null, dto.file_size ?? null, dto.file_mime ?? null,
        userId,
      ],
    );
    return row;
  }

  async updateArticle(id: string, userId: string, dto: UpdateKnowledgeArticleDto) {
    const fields: string[] = ['updated_by = $1', 'updated_at = now()'];
    const params: any[] = [userId];
    let p = 2;
    if (dto.title        !== undefined) { fields.push(`title = $${p++}`);        params.push(dto.title.trim()); }
    if (dto.content      !== undefined) { fields.push(`content = $${p++}`);      params.push(dto.content.trim()); }
    if (dto.category     !== undefined) { fields.push(`category = $${p++}`);     params.push(dto.category); }
    if (dto.tags         !== undefined) { fields.push(`tags = $${p++}`);         params.push(dto.tags); }
    if (dto.is_published !== undefined) { fields.push(`is_published = $${p++}`); params.push(dto.is_published); }
    params.push(id);
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.knowledge_articles SET ${fields.join(', ')} WHERE id = $${p} RETURNING id, title, is_published`,
      params,
    );
    if (!row) throw new NotFoundException('Article not found');
    return row;
  }

  async deleteArticle(id: string) {
    await this.db.query(
      `UPDATE tickets.knowledge_articles
       SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days'
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return { ok: true };
  }

  async restoreArticle(id: string, userId: string) {
    const [[art], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_articles WHERE id = $1 AND deleted_at IS NOT NULL`, [id]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!art) throw new NotFoundException('Artículo no encontrado en eliminados');
    if (!actor?.is_superadmin && art.created_by !== userId) throw new ForbiddenException('Sin permisos para restaurar este artículo');
    await this.db.query(
      `UPDATE tickets.knowledge_articles SET deleted_at = NULL, scheduled_hard_delete_at = NULL WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  async permanentDeleteArticle(id: string, userId: string) {
    const [[art], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_articles WHERE id = $1 AND deleted_at IS NOT NULL`, [id]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!art) throw new NotFoundException('Artículo no encontrado en eliminados');
    if (!actor?.is_superadmin && art.created_by !== userId) throw new ForbiddenException('Sin permisos para eliminar permanentemente este artículo');
    await this.db.query(`DELETE FROM tickets.knowledge_articles WHERE id = $1`, [id]);
    return { ok: true };
  }

  async voteArticle(userId: string, articleId: string, value: number) {
    if (value !== 1 && value !== -1) throw new BadRequestException('El valor del voto debe ser 1 o -1');

    await this.db.query(
      `INSERT INTO tickets.knowledge_votes (user_id, entity_id, entity_type, value)
       VALUES ($1, $2, 'article', $3)
       ON CONFLICT (user_id, entity_id, entity_type) DO UPDATE SET value = $3`,
      [userId, articleId, value],
    );
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.knowledge_articles
       SET helpful_count     = (SELECT COUNT(*) FROM tickets.knowledge_votes WHERE entity_id=$1 AND entity_type='article' AND value=1),
           not_helpful_count = (SELECT COUNT(*) FROM tickets.knowledge_votes WHERE entity_id=$1 AND entity_type='article' AND value=-1)
       WHERE id = $1
       RETURNING helpful_count, not_helpful_count`,
      [articleId],
    );
    return row;
  }

  async convertTicketToArticle(
    userId: string,
    ticketId: string,
    dto: { module_id: string; title: string; content: string; category?: string; tags?: string[] },
  ) {
    const [ticket] = await this.db.query<any[]>(
      `SELECT id FROM tickets.tickets WHERE id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.knowledge_articles
         (module_id, title, content, category, tags, ticket_id, is_published, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'published', $7)
       RETURNING id, title, created_at`,
      [dto.module_id, dto.title.trim(), dto.content.trim(), dto.category ?? null, dto.tags ?? [], ticketId, userId],
    );
    return row;
  }

  /* ── Forum posts ─────────────────────────────────────────────────────────── */

  async getPosts(moduleId: string, q?: string, filter?: string) {
    const params: any[] = [moduleId];
    let filterClause = '';
    if (filter === 'resolved')   filterClause = 'AND kp.is_resolved = true';
    if (filter === 'unresolved') filterClause = 'AND kp.is_resolved = false';
    let searchClause = '';
    if (q?.trim() && q.trim().length >= 2) {
      params.push(`%${q.trim()}%`);
      searchClause = `AND (kp.title ILIKE $${params.length} OR kp.content ILIKE $${params.length})`;
    }
    return this.db.query<any[]>(
      `SELECT kp.id, kp.title, kp.content, kp.tags, kp.is_resolved, kp.view_count,
              kp.created_at, kp.updated_at, kp.created_by,
              p.first_name || ' ' || p.last_name AS author_name,
              p.avatar_url AS author_avatar,
              (SELECT COUNT(*) FROM tickets.knowledge_replies kr WHERE kr.post_id = kp.id) AS reply_count,
              (SELECT COUNT(*) FROM tickets.knowledge_votes kv WHERE kv.entity_id = kp.id AND kv.entity_type='post' AND kv.value=1) AS vote_count,
              (SELECT kr2.created_at FROM tickets.knowledge_replies kr2 WHERE kr2.post_id = kp.id ORDER BY kr2.created_at DESC LIMIT 1) AS last_reply_at,
              (SELECT p2.first_name || ' ' || p2.last_name FROM tickets.knowledge_replies kr2 JOIN users.profiles p2 ON p2.id = kr2.created_by WHERE kr2.post_id = kp.id ORDER BY kr2.created_at DESC LIMIT 1) AS last_reply_author,
              (SELECT p2.avatar_url FROM tickets.knowledge_replies kr2 JOIN users.profiles p2 ON p2.id = kr2.created_by WHERE kr2.post_id = kp.id ORDER BY kr2.created_at DESC LIMIT 1) AS last_reply_avatar
       FROM   tickets.knowledge_posts kp
       JOIN   users.profiles p ON p.id = kp.created_by
       WHERE  kp.module_id = $1 AND kp.deleted_at IS NULL ${filterClause} ${searchClause}
       ORDER  BY kp.is_resolved ASC, COALESCE(
         (SELECT MAX(kr.created_at) FROM tickets.knowledge_replies kr WHERE kr.post_id = kp.id),
         kp.created_at
       ) DESC
       LIMIT  100`,
      params,
    );
  }

  async getPost(id: string) {
    const [post] = await this.db.query<any[]>(
      `SELECT kp.*,
              p.first_name || ' ' || p.last_name AS author_name,
              p.avatar_url AS author_avatar
       FROM   tickets.knowledge_posts kp
       JOIN   users.profiles p ON p.id = kp.created_by
       WHERE  kp.id = $1 AND kp.deleted_at IS NULL`,
      [id],
    );
    if (!post) throw new NotFoundException('Post not found');
    await this.db.query(
      `UPDATE tickets.knowledge_posts SET view_count = view_count + 1 WHERE id = $1`,
      [id],
    ).catch(() => {});
    const replies = await this.db.query<any[]>(
      `SELECT kr.*,
              p.first_name || ' ' || p.last_name AS author_name,
              p.avatar_url AS author_avatar,
              (SELECT COUNT(*) FROM tickets.knowledge_votes kv WHERE kv.entity_id = kr.id AND kv.entity_type='reply' AND kv.value=1) AS vote_count
       FROM   tickets.knowledge_replies kr
       JOIN   users.profiles p ON p.id = kr.created_by
       WHERE  kr.post_id = $1 AND kr.deleted_at IS NULL
       ORDER  BY kr.is_accepted DESC, kr.created_at ASC`,
      [id],
    );
    return { ...post, replies };
  }

  async createPost(userId: string, dto: { module_id: string; title: string; content: string; tags?: string[] }) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.knowledge_posts (module_id, title, content, tags, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, created_at`,
      [dto.module_id, dto.title.trim(), dto.content.trim(), dto.tags ?? [], userId],
    );
    return row;
  }

  async createReply(userId: string, postId: string, dto: { content: string }) {
    const [post] = await this.db.query<any[]>(
      `SELECT id FROM tickets.knowledge_posts WHERE id = $1`,
      [postId],
    );
    if (!post) throw new NotFoundException('Post not found');
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.knowledge_replies (post_id, content, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [postId, dto.content.trim(), userId],
    );
    return row;
  }

  async acceptReply(userId: string, postId: string, replyId: string) {
    const [post] = await this.db.query<any[]>(
      `SELECT id, created_by FROM tickets.knowledge_posts WHERE id = $1`,
      [postId],
    );
    if (!post) throw new NotFoundException('Post not found');
    if (post.created_by !== userId) throw new ForbiddenException('Solo el autor del post puede aceptar una respuesta.');
    await this.db.query(`UPDATE tickets.knowledge_replies SET is_accepted = false WHERE post_id = $1`, [postId]);
    await this.db.query(`UPDATE tickets.knowledge_replies SET is_accepted = true  WHERE id = $1`, [replyId]);
    await this.db.query(`UPDATE tickets.knowledge_posts    SET is_resolved = true  WHERE id = $1`, [postId]);
    return { ok: true };
  }

  async deletePost(userId: string, postId: string) {
    const [[post], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_posts WHERE id = $1`, [postId]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!post) throw new NotFoundException('Post not found');
    if (!actor?.is_superadmin && post.created_by !== userId) throw new ForbiddenException('Sin permisos para eliminar este post.');
    await this.db.query(
      `UPDATE tickets.knowledge_posts
       SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days'
       WHERE id = $1 AND deleted_at IS NULL`,
      [postId],
    );
    return { ok: true };
  }

  async restorePost(postId: string, userId: string) {
    const [[post], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_posts WHERE id = $1 AND deleted_at IS NOT NULL`, [postId]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!post) throw new NotFoundException('Post no encontrado en eliminados');
    if (!actor?.is_superadmin && post.created_by !== userId) throw new ForbiddenException('Sin permisos para restaurar este post');
    await this.db.query(
      `UPDATE tickets.knowledge_posts SET deleted_at = NULL, scheduled_hard_delete_at = NULL WHERE id = $1`,
      [postId],
    );
    return { ok: true };
  }

  async permanentDeletePost(postId: string, userId: string) {
    const [[post], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_posts WHERE id = $1 AND deleted_at IS NOT NULL`, [postId]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!post) throw new NotFoundException('Post no encontrado en eliminados');
    if (!actor?.is_superadmin && post.created_by !== userId) throw new ForbiddenException('Sin permisos para eliminar permanentemente este post');
    await this.db.query(`DELETE FROM tickets.knowledge_posts WHERE id = $1`, [postId]);
    return { ok: true };
  }

  async deleteReply(userId: string, replyId: string) {
    const [[reply], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_replies WHERE id = $1`, [replyId]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!reply) throw new NotFoundException('Reply not found');
    if (!actor?.is_superadmin && reply.created_by !== userId) throw new ForbiddenException('Sin permisos para eliminar esta respuesta.');
    await this.db.query(
      `UPDATE tickets.knowledge_replies SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days' WHERE id = $1 AND deleted_at IS NULL`,
      [replyId],
    );
    return { ok: true };
  }

  async updatePost(userId: string, postId: string, dto: { title?: string; content?: string; tags?: string[] }) {
    const [[post], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_posts WHERE id = $1`, [postId]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!post) throw new NotFoundException('Post not found');
    if (!actor?.is_superadmin && post.created_by !== userId) throw new ForbiddenException('Sin permisos para editar este post.');
    const fields: string[] = [];
    const params: any[] = [];
    let p = 1;
    if (dto.title   !== undefined) { fields.push(`title   = $${p++}`); params.push(dto.title.trim()); }
    if (dto.content !== undefined) { fields.push(`content = $${p++}`); params.push(dto.content.trim()); }
    if (dto.tags    !== undefined) { fields.push(`tags    = $${p++}`); params.push(dto.tags); }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push('updated_at = now()');
    params.push(postId);
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.knowledge_posts SET ${fields.join(', ')} WHERE id = $${p} RETURNING id, title, content, tags, updated_at`,
      params,
    );
    return row;
  }

  async updateReply(userId: string, replyId: string, dto: { content: string }) {
    const [[reply], [actor]] = await Promise.all([
      this.db.query<any[]>(`SELECT id, created_by FROM tickets.knowledge_replies WHERE id = $1`, [replyId]),
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
    ]);
    if (!reply) throw new NotFoundException('Reply not found');
    if (!actor?.is_superadmin && reply.created_by !== userId) throw new ForbiddenException('Sin permisos para editar esta respuesta.');
    if (!dto.content?.trim()) throw new BadRequestException('El contenido no puede estar vacío');
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.knowledge_replies SET content = $1, updated_at = now() WHERE id = $2 RETURNING id, content, updated_at`,
      [dto.content.trim(), replyId],
    );
    return row;
  }

  /* ── Eliminados (soft-deleted content) ────────────────────────────────────── */

  async getDeleted(moduleId: string, userId: string) {
    const [[actor], [adminRole]] = await Promise.all([
      this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]),
      this.db.query<any[]>(
        `SELECT 1 FROM modules.user_module_roles umr
         JOIN modules.module_roles mr ON mr.id = umr.role_id
         WHERE umr.user_id = $1 AND umr.module_id = $2 AND mr.name = 'admin_modulo' AND umr.is_active = true`,
        [userId, moduleId],
      ),
    ]);
    const canSeeAll = (actor?.is_superadmin ?? false) || !!adminRole;
    const params: any[] = canSeeAll ? [moduleId] : [moduleId, userId];
    const articleOwner = canSeeAll ? '' : 'AND a.created_by = $2';
    const postOwner    = canSeeAll ? '' : 'AND kp.created_by = $2';
    const articles = await this.db.query<any[]>(
      `SELECT 'article'::text AS type,
              a.id, a.title, a.doc_type, a.file_mime,
              a.created_by, a.deleted_at, a.scheduled_hard_delete_at,
              p.first_name || ' ' || p.last_name AS author_name,
              p.avatar_url AS author_avatar,
              GREATEST(0, EXTRACT(DAY FROM a.scheduled_hard_delete_at - now()))::int AS days_remaining
       FROM   tickets.knowledge_articles a
       JOIN   users.profiles p ON p.id = a.created_by
       WHERE  a.module_id = $1 AND a.deleted_at IS NOT NULL ${articleOwner}
       ORDER  BY a.deleted_at DESC`,
      params,
    );
    const posts = await this.db.query<any[]>(
      `SELECT 'post'::text AS type,
              kp.id, kp.title, NULL::text AS doc_type, NULL::text AS file_mime,
              kp.created_by, kp.deleted_at, kp.scheduled_hard_delete_at,
              p.first_name || ' ' || p.last_name AS author_name,
              p.avatar_url AS author_avatar,
              GREATEST(0, EXTRACT(DAY FROM kp.scheduled_hard_delete_at - now()))::int AS days_remaining
       FROM   tickets.knowledge_posts kp
       JOIN   users.profiles p ON p.id = kp.created_by
       WHERE  kp.module_id = $1 AND kp.deleted_at IS NOT NULL ${postOwner}
       ORDER  BY kp.deleted_at DESC`,
      params,
    );
    return { articles, posts };
  }
}
