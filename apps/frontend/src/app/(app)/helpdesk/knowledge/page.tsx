'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Search, Tag, Eye, Clock, X, ChevronRight, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { fmtDate } from '@/lib/formatters';
import api from '@/services/api';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

interface Article {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  is_published: boolean;
  view_count: number;
  author_name: string;
  created_at: string;
  updated_at: string;
  ticket_id: string | null;
}

const knowledgeService = {
  getAll: (moduleId: string, q?: string, includeDrafts = false): Promise<Article[]> =>
    api.get('/tickets/knowledge', { params: { module_id: moduleId, ...(q ? { q } : {}), ...(includeDrafts ? { include_drafts: 'true' } : {}) } }).then((r: { data: Article[] }) => r.data),
  getOne: (id: string): Promise<Article> =>
    api.get(`/tickets/knowledge/${id}`).then((r: { data: Article }) => r.data),
  create: (dto: Partial<Article>): Promise<Article> =>
    api.post('/tickets/knowledge', dto).then((r: { data: Article }) => r.data),
  update: (id: string, dto: Partial<Article>): Promise<Article> =>
    api.patch(`/tickets/knowledge/${id}`, dto).then((r: { data: Article }) => r.data),
  delete: (id: string): Promise<void> =>
    api.delete(`/tickets/knowledge/${id}`).then((r: { data: void }) => r.data),
};

/* ── Article form ── */
function ArticleForm({
  initial,
  moduleId,
  onSave,
  onClose,
}: {
  initial?: Partial<Article>;
  moduleId: string;
  onSave: (a: Article) => void;
  onClose: () => void;
}) {
  const [title,     setTitle]     = useState(initial?.title ?? '');
  const [content,   setContent]   = useState(initial?.content ?? '');
  const [category,  setCategory]  = useState(initial?.category ?? '');
  const [tagsStr,   setTagsStr]   = useState((initial?.tags ?? []).join(', '));
  const [published, setPublished] = useState(initial?.is_published ?? false);
  const [err,       setErr]       = useState('');

  const mut = useMutation({
    mutationFn: () => {
      const dto = {
        module_id: moduleId,
        title:        title.trim(),
        content:      content.trim(),
        category:     category.trim() || undefined,
        tags:         tagsStr.split(',').map(t => t.trim()).filter(Boolean),
        is_published: published,
      };
      return initial?.id ? knowledgeService.update(initial.id, dto) : knowledgeService.create(dto);
    },
    onSuccess: (a) => { onSave(a); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const FIELD = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.6)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(14,34,53,.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>Base de conocimiento</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>{initial?.id ? 'Editar artículo' : 'Nuevo artículo'}</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
            <X size={14} />
          </button>
        </div>

        <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 5 }}>Título *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del artículo…" style={FIELD} />

        <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 5 }}>Contenido *</label>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={10}
          placeholder="Describe el proceso, solución o información relevante…"
          style={{ ...FIELD, resize: 'vertical', lineHeight: 1.6 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 5 }}>Categoría</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Ej: Redes, Hardware, Software…" style={{ ...FIELD, marginBottom: 0 }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 5 }}>Etiquetas (separadas por comas)</label>
            <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="wifi, impresora, correo…" style={{ ...FIELD, marginBottom: 0 }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 18px', padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <input type="checkbox" id="pub" checked={published} onChange={e => setPublished(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="pub" style={{ fontSize: 12, fontWeight: 600, color: C.navy, cursor: 'pointer' }}>
            {published ? 'Publicado — visible para el equipo' : 'Borrador — solo visible para administradores'}
          </label>
        </div>

        {err && <p style={{ fontSize: 11, color: '#dc2626', margin: '0 0 10px' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!title.trim() || !content.trim() || mut.isPending} onClick={() => mut.mutate()}
            style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: title.trim() && content.trim() ? C.navy : C.muted, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {mut.isPending ? 'Guardando…' : initial?.id ? 'Actualizar' : 'Crear artículo'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Article detail ── */
function ArticleDetail({ article, canEdit, onEdit, onClose, onDelete }: { article: Article; canEdit: boolean; onEdit: () => void; onClose: () => void; onDelete: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.55)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '32px 36px', maxWidth: 700, width: '100%', boxShadow: '0 24px 60px rgba(14,34,53,.2)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div style={{ flex: 1 }}>
            {article.category && (
              <span style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.1em', display: 'block', marginBottom: 6 }}>
                {article.category}
              </span>
            )}
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: '0 0 8px' }}>{article.title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: C.muted }}>Por {article.author_name}</span>
              <span style={{ fontSize: 10, color: C.muted }}>{fmtDate(article.updated_at)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.muted }}><Eye size={10} /> {article.view_count} vistas</span>
              {!article.is_published && (
                <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>BORRADOR</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {canEdit && (
              <>
                <button type="button" onClick={onEdit} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.sub }}>
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={onDelete} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#ef4444' }}>
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 20 }}>
            {article.tags.map(t => (
              <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.75, whiteSpace: 'pre-wrap', borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
          {article.content}
        </div>

        {article.ticket_id && (
          <div style={{ marginTop: 20, padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 11, color: C.sub }}>
            Derivado del ticket: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: C.navy }}>#{article.ticket_id.slice(0, 8).toUpperCase()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function KnowledgePage() {
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc = useQueryClient();

  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return user.module_roles.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  }, [user, helpdeskId]);
  const canEdit = isSuperadmin || moduleRole === 'admin_modulo' || moduleRole === 'jefe_tecnico';

  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [viewArticle, setViewArticle] = useState<Article | null>(null);

  const { data: articles = [], isLoading } = useQuery({
    queryKey:  ['knowledge', helpdeskId, search, canEdit],
    queryFn:   () => knowledgeService.getAll(helpdeskId!, search || undefined, canEdit),
    enabled:   !!helpdeskId,
    staleTime: 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => knowledgeService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', helpdeskId] });
      setViewArticle(null);
    },
  });

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    articles.forEach(a => { if (a.category && !seen.has(a.category)) { seen.add(a.category); out.push(a.category); }});
    return out.sort();
  }, [articles]);

  const filtered = useMemo(() => {
    if (!catFilter) return articles;
    return articles.filter(a => a.category === catFilter);
  }, [articles, catFilter]);

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>Mesa de Ayuda</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: '0 0 4px' }}>Base de conocimiento</h1>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Soluciones, procedimientos y documentación técnica del equipo</p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => { setEditArticle(null); setShowForm(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={13} /> Nuevo artículo
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar artículos…"
            style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }} />
        </div>
        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setCatFilter('')}
              style={{ padding: '6px 11px', borderRadius: 7, border: `1.5px solid ${!catFilter ? C.navy : C.border}`, background: !catFilter ? `${C.navy}10` : '#fff', color: !catFilter ? C.navy : C.sub, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Todos
            </button>
            {categories.map(cat => (
              <button key={cat} type="button" onClick={() => setCatFilter(cat === catFilter ? '' : cat)}
                style={{ padding: '6px 11px', borderRadius: 7, border: `1.5px solid ${catFilter === cat ? C.coral : C.border}`, background: catFilter === cat ? `${C.coral}10` : '#fff', color: catFilter === cat ? C.coral : C.sub, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Articles */}
      {isLoading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando artículos…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <BookOpen size={32} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>
            {articles.length === 0 ? 'Aún no hay artículos publicados' : 'Sin resultados'}
          </p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
            {articles.length === 0 && canEdit ? 'Crea el primer artículo para compartir conocimiento con el equipo.' : ''}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map(a => (
            <div key={a.id}
              onClick={() => setViewArticle(a)}
              style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '18px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, transition: 'box-shadow .15s, border-color .15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(14,34,53,.08)'; (e.currentTarget as HTMLDivElement).style.borderColor = `${C.coral}60`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.borderColor = C.border; }}
            >
              {a.category && (
                <span style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.1em' }}>{a.category}</span>
              )}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '0 0 5px', lineHeight: 1.35 }}>{a.title}</p>
                <p style={{ fontSize: 11, color: C.sub, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                  {a.content.slice(0, 120)}{a.content.length > 120 ? '…' : ''}
                </p>
              </div>
              {a.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {a.tags.slice(0, 3).map(t => (
                    <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>
                  ))}
                  {a.tags.length > 3 && <span style={{ fontSize: 9, color: C.muted }}>+{a.tags.length - 3}</span>}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                <span style={{ fontSize: 10, color: C.muted }}>{a.author_name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.muted, marginLeft: 'auto' }}><Eye size={10} /> {a.view_count}</span>
                <span style={{ fontSize: 10, color: C.muted }}>{fmtDate(a.updated_at)}</span>
                <ChevronRight size={12} style={{ color: C.muted }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && helpdeskId && (
        <ArticleForm
          initial={editArticle ?? undefined}
          moduleId={helpdeskId}
          onSave={() => qc.invalidateQueries({ queryKey: ['knowledge', helpdeskId] })}
          onClose={() => { setShowForm(false); setEditArticle(null); }}
        />
      )}

      {viewArticle && (
        <ArticleDetail
          article={viewArticle}
          canEdit={canEdit}
          onEdit={() => { setEditArticle(viewArticle); setViewArticle(null); setShowForm(true); }}
          onClose={() => setViewArticle(null)}
          onDelete={() => { if (confirm('¿Eliminar este artículo?')) deleteMut.mutate(viewArticle.id); }}
        />
      )}
    </ModuleLayout>
  );
}
