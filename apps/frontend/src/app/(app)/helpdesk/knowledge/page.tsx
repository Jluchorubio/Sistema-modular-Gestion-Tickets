'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Plus, Search, Eye, X, ChevronRight, Pencil, Trash2,
  CheckCircle2, MessageSquare, ThumbsUp, ThumbsDown, Check,
  FileText, Users, Tag, ArrowLeft,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { fmtDate, fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import api from '@/services/api';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

/* ── Types ── */
interface Article {
  id: string; title: string; content: string; category: string | null;
  tags: string[]; is_published: boolean; status: string;
  view_count: number; helpful_count: number; not_helpful_count: number;
  author_name: string; created_at: string; updated_at: string; ticket_id: string | null;
}
interface ForumPost {
  id: string; title: string; content: string; tags: string[];
  is_resolved: boolean; view_count: number; reply_count: string;
  vote_count: string; author_name: string; author_avatar: string | null;
  created_at: string; updated_at: string;
}
interface ForumReply {
  id: string; content: string; is_accepted: boolean; vote_count: string;
  author_name: string; author_avatar: string | null; created_at: string;
  created_by: string;
}
interface ForumPostDetail extends ForumPost { replies: ForumReply[]; created_by: string; }

/* ── API helpers ── */
const kbService = {
  getArticles: (mid: string, q?: string, drafts = false) =>
    api.get('/tickets/knowledge', { params: { module_id: mid, ...(q ? { q } : {}), ...(drafts ? { include_drafts: 'true' } : {}) } }).then((r: any) => r.data as Article[]),
  createArticle: (dto: any) => api.post('/tickets/knowledge', dto).then((r: any) => r.data),
  updateArticle: (id: string, dto: any) => api.patch(`/tickets/knowledge/${id}`, dto).then((r: any) => r.data),
  deleteArticle: (id: string) => api.delete(`/tickets/knowledge/${id}`).then((r: any) => r.data),
  voteArticle: (id: string, value: 1 | -1) => api.post(`/tickets/knowledge/${id}/vote`, { value }).then((r: any) => r.data),
  getPosts: (mid: string, q?: string, filter?: string) =>
    api.get('/tickets/knowledge-posts', { params: { module_id: mid, ...(q ? { q } : {}), ...(filter ? { filter } : {}) } }).then((r: any) => r.data as ForumPost[]),
  getPost: (id: string) => api.get(`/tickets/knowledge-posts/${id}`).then((r: any) => r.data as ForumPostDetail),
  createPost: (dto: any) => api.post('/tickets/knowledge-posts', dto).then((r: any) => r.data),
  deletePost: (id: string) => api.delete(`/tickets/knowledge-posts/${id}`).then((r: any) => r.data),
  createReply: (postId: string, dto: any) => api.post(`/tickets/knowledge-posts/${postId}/replies`, dto).then((r: any) => r.data),
  acceptReply: (postId: string, replyId: string) => api.post(`/tickets/knowledge-posts/${postId}/replies/${replyId}/accept`).then((r: any) => r.data),
  deleteReply: (postId: string, replyId: string) => api.delete(`/tickets/knowledge-posts/${postId}/replies/${replyId}`).then((r: any) => r.data),
};

/* ── Article form ── */
function ArticleForm({ initial, moduleId, onSave, onClose }: { initial?: Partial<Article>; moduleId: string; onSave: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [tagsStr, setTagsStr] = useState((initial?.tags ?? []).join(', '));
  const [published, setPublished] = useState(initial?.is_published ?? false);
  const [err, setErr] = useState('');
  const mut = useMutation({
    mutationFn: () => {
      const dto = { module_id: moduleId, title: title.trim(), content: content.trim(), category: category.trim() || undefined, tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean), is_published: published };
      return initial?.id ? kbService.updateArticle(initial.id, dto) : kbService.createArticle(dto);
    },
    onSuccess: () => { onSave(); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error al guardar'),
  });
  const F: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 12 };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.6)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(14,34,53,.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>Base de conocimiento</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>{initial?.id ? 'Editar artículo' : 'Nuevo artículo'}</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}><X size={14} /></button>
        </div>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 5 }}>Título *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del artículo…" style={F} />
        <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 5 }}>Contenido *</label>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={10} placeholder="Describe el proceso, solución o información relevante…" style={{ ...F, resize: 'vertical', lineHeight: 1.6 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
          <div><label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 5 }}>Categoría</label><input value={category} onChange={e => setCategory(e.target.value)} placeholder="Ej: Redes, Hardware…" style={{ ...F, marginBottom: 0 }} /></div>
          <div><label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 5 }}>Etiquetas (comas)</label><input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="wifi, impresora…" style={{ ...F, marginBottom: 0 }} /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 18px', padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <input type="checkbox" id="pub" checked={published} onChange={e => setPublished(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="pub" style={{ fontSize: 12, fontWeight: 600, color: C.navy, cursor: 'pointer' }}>{published ? 'Publicado — visible para el equipo' : 'Borrador — solo visible para administradores'}</label>
        </div>
        {err && <p style={{ fontSize: 11, color: '#dc2626', margin: '0 0 10px' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!title.trim() || !content.trim() || mut.isPending} onClick={() => mut.mutate()} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: title.trim() && content.trim() ? C.navy : C.muted, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {mut.isPending ? 'Guardando…' : initial?.id ? 'Actualizar' : 'Crear artículo'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Article detail ── */
function ArticleDetail({ article, canEdit, userId, onEdit, onClose, onDelete, onVote }: { article: Article; canEdit: boolean; userId: string; onEdit: () => void; onClose: () => void; onDelete: () => void; onVote: (v: 1 | -1) => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.55)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '32px 36px', maxWidth: 700, width: '100%', boxShadow: '0 24px 60px rgba(14,34,53,.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div style={{ flex: 1 }}>
            {article.category && <span style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.1em', display: 'block', marginBottom: 6 }}>{article.category}</span>}
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: '0 0 8px' }}>{article.title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: C.muted }}>Por {article.author_name}</span>
              <span style={{ fontSize: 10, color: C.muted }}>{fmtDate(article.updated_at)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.muted }}><Eye size={10} /> {article.view_count}</span>
              {!article.is_published && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>BORRADOR</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {canEdit && <><button type="button" onClick={onEdit} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.sub }}><Pencil size={13} /></button><button type="button" onClick={onDelete} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#ef4444' }}><Trash2 size={13} /></button></>}
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}><X size={14} /></button>
          </div>
        </div>
        {article.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 20 }}>
            {article.tags.map(t => <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>)}
          </div>
        )}
        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.75, whiteSpace: 'pre-wrap', borderTop: `1px solid ${C.border}`, paddingTop: 20, paddingBottom: 20 }}>{article.content}</div>
        {article.ticket_id && <div style={{ marginBottom: 16, padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 11, color: C.sub }}>Derivado del ticket: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: C.navy }}>#{article.ticket_id.slice(0, 8).toUpperCase()}</span></div>}
        {/* Feedback */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>¿Este artículo fue útil?</span>
          <button type="button" onClick={() => onVote(1)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: '#15803d', cursor: 'pointer', fontFamily: 'inherit' }}><ThumbsUp size={12} /> Sí ({article.helpful_count})</button>
          <button type="button" onClick={() => onVote(-1)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}><ThumbsDown size={12} /> No ({article.not_helpful_count})</button>
        </div>
      </div>
    </div>
  );
}

/* ── Forum post form ── */
function PostForm({ moduleId, onSave, onClose }: { moduleId: string; onSave: () => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [err, setErr] = useState('');
  const mut = useMutation({
    mutationFn: () => kbService.createPost({ module_id: moduleId, title: title.trim(), content: content.trim(), tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean) }),
    onSuccess: () => { onSave(); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error'),
  });
  const F: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 12 };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.6)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(14,34,53,.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>Foro técnico</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>Nueva pregunta</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}><X size={14} /></button>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="¿Cuál es tu pregunta o problema?" style={F} />
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={7} placeholder="Describe el problema con detalle…" style={{ ...F, resize: 'vertical', lineHeight: 1.6 }} />
        <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="Etiquetas (comas): wifi, impresora…" style={F} />
        {err && <p style={{ fontSize: 11, color: '#dc2626', margin: '0 0 10px' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!title.trim() || !content.trim() || mut.isPending} onClick={() => mut.mutate()} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: title.trim() && content.trim() ? C.coral : C.muted, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {mut.isPending ? 'Publicando…' : 'Publicar pregunta'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Forum post detail ── */
function PostDetail({ post, currentUserId, canModerate, onClose, onRefresh }: { post: ForumPostDetail; currentUserId: string; canModerate: boolean; onClose: () => void; onRefresh: () => void }) {
  const [replyContent, setReplyContent] = useState('');
  const qc = useQueryClient();
  const replyMut = useMutation({
    mutationFn: () => kbService.createReply(post.id, { content: replyContent.trim() }),
    onSuccess: () => { setReplyContent(''); onRefresh(); },
  });
  const acceptMut  = useMutation({ mutationFn: (rid: string) => kbService.acceptReply(post.id, rid), onSuccess: onRefresh });
  const delReplyMut = useMutation({ mutationFn: (rid: string) => kbService.deleteReply(post.id, rid), onSuccess: onRefresh });
  const delPostMut  = useMutation({ mutationFn: () => kbService.deletePost(post.id), onSuccess: () => { onRefresh(); onClose(); } });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.55)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '32px 36px', maxWidth: 760, width: '100%', boxShadow: '0 24px 60px rgba(14,34,53,.2)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {post.is_resolved
                ? <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>RESUELTO</span>
                : <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>ABIERTO</span>}
              <span style={{ fontSize: 10, color: C.muted }}>por {post.author_name} · {fmtRelative(post.created_at)}</span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: '0 0 12px' }}>{post.title}</h2>
            <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{post.content}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {(canModerate || post.created_by === currentUserId) && (
              <button type="button" onClick={() => { if (confirm('¿Eliminar este post?')) delPostMut.mutate(); }} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#ef4444' }}><Trash2 size={13} /></button>
            )}
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}><X size={14} /></button>
          </div>
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 20, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            {post.tags.map(t => <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>)}
          </div>
        )}

        {/* Replies */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginTop: post.tags.length > 0 ? 0 : 8 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 14px' }}>
            {post.replies.length} {post.replies.length === 1 ? 'respuesta' : 'respuestas'}
          </p>

          {post.replies.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 12 }}>Sin respuestas aún. ¡Sé el primero en responder!</div>
          )}

          {post.replies.map(reply => (
            <div key={reply.id} style={{ display: 'flex', gap: 12, marginBottom: 14, padding: '14px 16px', borderRadius: 10, border: `1px solid ${reply.is_accepted ? '#bbf7d0' : C.border}`, background: reply.is_accepted ? '#f0fdf4' : '#fff' }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: reply.is_accepted ? '#22c55e' : C.navy, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {reply.author_name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{reply.author_name}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{fmtRelative(reply.created_at)}</span>
                  {reply.is_accepted && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 5, background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', gap: 3 }}><Check size={9} /> Respuesta aceptada</span>}
                </div>
                <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{reply.content}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {post.created_by === currentUserId && !reply.is_accepted && (
                    <button type="button" onClick={() => acceptMut.mutate(reply.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', fontSize: 10, fontWeight: 700, color: '#15803d', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <CheckCircle2 size={11} /> Aceptar respuesta
                    </button>
                  )}
                  {(canModerate || reply.created_by === currentUserId) && (
                    <button type="button" onClick={() => delReplyMut.mutate(reply.id)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', fontSize: 10, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center' }}><Trash2 size={10} /></button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Reply box */}
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <textarea value={replyContent} onChange={e => setReplyContent(e.target.value)} rows={3} placeholder="Escribe tu respuesta…"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" disabled={!replyContent.trim() || replyMut.isPending} onClick={() => replyMut.mutate()}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: replyContent.trim() ? C.coral : C.muted, color: '#fff', fontSize: 12, fontWeight: 700, cursor: replyContent.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {replyMut.isPending ? 'Enviando…' : 'Responder'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
type KBTab = 'articulos' | 'foro';
type ForumFilter = 'all' | 'resolved' | 'unresolved';

export default function KnowledgePage() {
  const { user }      = useAuthStore();
  const isSuperadmin  = user?.is_superadmin ?? false;
  const qc            = useQueryClient();

  const { modules }  = useModules();
  const helpdeskId   = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return user.module_roles.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  }, [user, helpdeskId]);

  const canEdit      = isSuperadmin || moduleRole === 'admin_modulo' || moduleRole === 'jefe_tecnico';
  const canWritePost = !!moduleRole || isSuperadmin;

  /* ── State ── */
  const [tab,         setTab]         = useState<KBTab>('articulos');
  const [search,      setSearch]      = useState('');
  const [catFilter,   setCatFilter]   = useState('');
  const [forumFilter, setForumFilter] = useState<ForumFilter>('all');
  const [showArtForm, setShowArtForm] = useState(false);
  const [editArt,     setEditArt]     = useState<Article | null>(null);
  const [viewArt,     setViewArt]     = useState<Article | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [viewPostId,   setViewPostId]   = useState<string | null>(null);

  /* ── Articles query ── */
  const { data: articles = [], isLoading: artLoading } = useQuery({
    queryKey:  ['knowledge', helpdeskId, search, canEdit],
    queryFn:   () => kbService.getArticles(helpdeskId!, search || undefined, canEdit),
    enabled:   !!helpdeskId,
    staleTime: 60_000,
  });

  /* ── Forum query ── */
  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey:  ['knowledge-posts', helpdeskId, search, forumFilter],
    queryFn:   () => kbService.getPosts(helpdeskId!, search || undefined, forumFilter !== 'all' ? forumFilter : undefined),
    enabled:   !!helpdeskId && tab === 'foro',
    staleTime: 60_000,
  });

  /* ── Post detail query ── */
  const { data: postDetail, refetch: refetchPost } = useQuery({
    queryKey:  ['knowledge-post', viewPostId],
    queryFn:   () => kbService.getPost(viewPostId!),
    enabled:   !!viewPostId,
    staleTime: 0,
  });

  /* ── Vote mutation ── */
  const voteMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: 1 | -1 }) => kbService.voteArticle(id, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', helpdeskId] }),
  });

  /* ── Delete article ── */
  const delArtMut = useMutation({
    mutationFn: (id: string) => kbService.deleteArticle(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge', helpdeskId] }); setViewArt(null); },
  });

  const categories = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    articles.forEach(a => { if (a.category && !seen.has(a.category)) { seen.add(a.category); out.push(a.category); }});
    return out.sort();
  }, [articles]);

  const filteredArticles = useMemo(() => {
    if (!catFilter) return articles;
    return articles.filter(a => a.category === catFilter);
  }, [articles, catFilter]);

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>Mesa de Ayuda</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: '0 0 4px' }}>Conocimiento</h1>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Centro de resolución — artículos, procedimientos y foro técnico colaborativo</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'articulos' && canEdit && (
            <button type="button" onClick={() => { setEditArt(null); setShowArtForm(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={13} /> Nuevo artículo
            </button>
          )}
          {tab === 'foro' && canWritePost && (
            <button type="button" onClick={() => setShowPostForm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: C.coral, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={13} /> Nueva pregunta
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        {([
          { key: 'articulos', label: 'Base de conocimiento', Icon: FileText },
          { key: 'foro',      label: 'Foro técnico',         Icon: Users    },
        ] as { key: KBTab; label: string; Icon: typeof FileText }[]).map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); setSearch(''); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: '8px 8px 0 0', border: `1px solid ${active ? C.border : 'transparent'}`, borderBottom: active ? '1px solid #fff' : 'none', background: active ? '#fff' : 'transparent', color: active ? C.navy : C.muted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: active ? -1 : 0 }}>
              <t.Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'articulos' ? 'Buscar artículos…' : 'Buscar en el foro…'}
          style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }} />
      </div>

      {/* ── ARTICULOS TAB ── */}
      {tab === 'articulos' && (
        <>
          {/* Category filters */}
          {categories.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 16 }}>
              <button type="button" onClick={() => setCatFilter('')}
                style={{ padding: '5px 11px', borderRadius: 7, border: `1.5px solid ${!catFilter ? C.navy : C.border}`, background: !catFilter ? `${C.navy}10` : '#fff', color: !catFilter ? C.navy : C.sub, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Todos
              </button>
              {categories.map(cat => (
                <button key={cat} type="button" onClick={() => setCatFilter(cat === catFilter ? '' : cat)}
                  style={{ padding: '5px 11px', borderRadius: 7, border: `1.5px solid ${catFilter === cat ? C.coral : C.border}`, background: catFilter === cat ? `${C.coral}10` : '#fff', color: catFilter === cat ? C.coral : C.sub, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {cat}
                </button>
              ))}
            </div>
          )}

          {artLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando artículos…</div>
          ) : filteredArticles.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <BookOpen size={32} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>{articles.length === 0 ? 'Aún no hay artículos' : 'Sin resultados'}</p>
              {articles.length === 0 && canEdit && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Crea el primer artículo para compartir conocimiento con el equipo.</p>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {filteredArticles.map(a => (
                <div key={a.id} onClick={() => setViewArt(a)}
                  style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '18px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, transition: 'box-shadow .15s, border-color .15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(14,34,53,.08)'; (e.currentTarget as HTMLDivElement).style.borderColor = `${C.coral}60`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.borderColor = C.border; }}
                >
                  {a.category && <span style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.1em' }}>{a.category}</span>}
                  <div>
                    <p style={{ margin: '0 0 5px', fontSize: 13, fontWeight: 700, color: C.navy, lineHeight: 1.35 }}>{a.title}</p>
                    <p style={{ margin: 0, fontSize: 11, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{a.content.slice(0, 120)}{a.content.length > 120 ? '…' : ''}</p>
                  </div>
                  {a.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {a.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>)}
                      {a.tags.length > 3 && <span style={{ fontSize: 9, color: C.muted }}>+{a.tags.length - 3}</span>}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                    <span style={{ fontSize: 10, color: C.muted }}>{a.author_name}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#15803d' }}><ThumbsUp size={9} /> {a.helpful_count}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.muted }}><Eye size={10} /> {a.view_count}</span>
                    </div>
                    <ChevronRight size={12} style={{ color: C.muted }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── FORO TAB ── */}
      {tab === 'foro' && (
        <>
          {/* Forum filters */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
            {([['all', 'Todos'], ['unresolved', 'Abiertos'], ['resolved', 'Resueltos']] as [ForumFilter, string][]).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setForumFilter(key)}
                style={{ padding: '5px 11px', borderRadius: 7, border: `1.5px solid ${forumFilter === key ? C.coral : C.border}`, background: forumFilter === key ? `${C.coral}10` : '#fff', color: forumFilter === key ? C.coral : C.sub, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {label}
              </button>
            ))}
          </div>

          {postsLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando foro…</div>
          ) : posts.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <MessageSquare size={32} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>Sin publicaciones</p>
              {canWritePost && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Publica la primera pregunta para iniciar la colaboración técnica.</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {posts.map(post => (
                <div key={post.id} onClick={() => setViewPostId(post.id)}
                  style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'border-color .15s, box-shadow .15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${C.coral}50`; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 3px 12px rgba(14,34,53,.06)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
                >
                  {/* Status badge */}
                  <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: post.is_resolved ? '#dcfce7' : '#fff7ed', border: `1.5px solid ${post.is_resolved ? '#bbf7d0' : '#fed7aa'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {post.is_resolved ? <CheckCircle2 size={16} style={{ color: '#15803d' }} /> : <MessageSquare size={16} style={{ color: '#f97316' }} />}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                    <p style={{ margin: 0, fontSize: 10, color: C.muted }}>por {post.author_name} · {fmtRelative(post.created_at)}</p>
                  </div>
                  {/* Tags */}
                  {post.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {post.tags.slice(0, 2).map(t => <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>)}
                    </div>
                  )}
                  {/* Stats */}
                  <div style={{ flexShrink: 0, display: 'flex', gap: 10 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.muted }}><MessageSquare size={10} /> {post.reply_count}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.muted }}><Eye size={10} /> {post.view_count}</span>
                  </div>
                  <ChevronRight size={13} style={{ color: C.muted, flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {showArtForm && helpdeskId && (
        <ArticleForm initial={editArt ?? undefined} moduleId={helpdeskId}
          onSave={() => qc.invalidateQueries({ queryKey: ['knowledge', helpdeskId] })}
          onClose={() => { setShowArtForm(false); setEditArt(null); }} />
      )}

      {viewArt && (
        <ArticleDetail article={viewArt} canEdit={canEdit} userId={user?.id ?? ''}
          onEdit={() => { setEditArt(viewArt); setViewArt(null); setShowArtForm(true); }}
          onClose={() => setViewArt(null)}
          onDelete={() => { if (confirm('¿Eliminar este artículo?')) delArtMut.mutate(viewArt.id); }}
          onVote={v => voteMut.mutate({ id: viewArt.id, value: v })} />
      )}

      {showPostForm && helpdeskId && (
        <PostForm moduleId={helpdeskId}
          onSave={() => qc.invalidateQueries({ queryKey: ['knowledge-posts', helpdeskId] })}
          onClose={() => setShowPostForm(false)} />
      )}

      {viewPostId && postDetail && (
        <PostDetail post={postDetail} currentUserId={user?.id ?? ''} canModerate={canEdit}
          onClose={() => setViewPostId(null)}
          onRefresh={() => refetchPost()} />
      )}
    </ModuleLayout>
  );
}
