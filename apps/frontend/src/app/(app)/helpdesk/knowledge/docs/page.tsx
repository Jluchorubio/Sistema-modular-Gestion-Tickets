'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Search, Eye, ChevronRight, Pencil, Trash2, ThumbsUp, Download, FileText, File, Image, Film } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../_components/KnowledgeNav';
import { docsService, type Article } from '../_lib/knowledge.service';
import { fmtDate } from '@/lib/formatters';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

function getFileIcon(mime?: string | null, size = 18): React.ReactNode {
  const s = { color: C.coral };
  if (!mime) return <File size={size} style={s} />;
  if (mime === 'application/pdf') return <FileText size={size} style={{ color: '#ef4444' }} />;
  if (mime.includes('msword') || mime.includes('wordprocessingml')) return <FileText size={size} style={{ color: '#1d4ed8' }} />;
  if (mime.includes('excel') || mime.includes('spreadsheetml')) return <FileText size={size} style={{ color: '#16a34a' }} />;
  if (mime.includes('powerpoint') || mime.includes('presentationml')) return <FileText size={size} style={{ color: '#ea580c' }} />;
  if (mime === 'text/plain') return <FileText size={size} style={{ color: '#64748b' }} />;
  if (mime === 'application/zip') return <File size={size} style={{ color: '#64748b' }} />;
  if (mime.startsWith('image/')) return <Image size={size} style={{ color: '#7c3aed' }} />;
  if (mime.startsWith('video/')) return <Film size={size} style={{ color: '#0ea5e9' }} />;
  return <File size={size} style={s} />;
}
function fmtSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc = useQueryClient();

  const { modules } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const moduleRole = user?.module_roles?.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  const canEdit    = isSuperadmin || moduleRole === 'admin_modulo' || moduleRole === 'jefe_tecnico';

  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('');

  const { data: articles = [], isLoading } = useQuery({
    queryKey:  ['knowledge', helpdeskId, search, canEdit],
    queryFn:   () => docsService.getArticles(helpdeskId!, search || undefined, canEdit),
    enabled:   !!helpdeskId,
    staleTime: 60_000,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => docsService.deleteArticle(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['knowledge', helpdeskId] }),
  });

  const categories = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    articles.forEach(a => { if (a.category && !seen.has(a.category)) { seen.add(a.category); out.push(a.category); }});
    return out.sort();
  }, [articles]);

  const filtered = useMemo(() => catFilter ? articles.filter(a => a.category === catFilter) : articles, [articles, catFilter]);

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: '0 0 3px' }}>Base documental</h1>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Artículos oficiales, procedimientos y guías técnicas</p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => router.push('/helpdesk/knowledge/docs/create')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={13} /> Nuevo artículo
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar artículos…"
          style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }} />
      </div>

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

      {/* Articles */}
      {isLoading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando artículos…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <BookOpen size={32} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>{articles.length === 0 ? 'Aún no hay artículos' : 'Sin resultados'}</p>
          {articles.length === 0 && canEdit && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Crea el primer artículo para la base documental.</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(a => (
            <div key={a.id}
              onClick={() => router.push(`/helpdesk/knowledge/docs/${a.id}`)}
              style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color .15s, box-shadow .15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${C.coral}50`; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(14,34,53,.06)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
            >
              {/* Icon */}
              <div style={{ width: 44, height: 44, borderRadius: 10, background: `${C.coral}10`, border: `1px solid ${C.coral}25`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {(a as any).doc_type === 'file'
                  ? getFileIcon((a as any).file_mime, 18)
                  : <BookOpen size={18} style={{ color: C.coral }} />}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  {a.category && <span style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em' }}>{a.category}</span>}
                  {!a.is_published && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>BORRADOR</span>}
                </div>
                <p style={{ margin: '0 0 3px', fontSize: 13.5, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
                <p style={{ margin: 0, fontSize: 11, color: C.sub }}>
                  {a.author_name} · {fmtDate(a.updated_at)}
                  {(a as any).file_size ? ` · ${fmtSize((a as any).file_size)}` : ''}
                </p>
              </div>
              {/* Tags */}
              {a.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {a.tags.slice(0, 2).map(t => <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>)}
                </div>
              )}
              {/* Stats */}
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#15803d' }}><ThumbsUp size={10} /> {a.helpful_count}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.muted }}><Eye size={10} /> {a.view_count}</span>
              </div>
              {/* Actions */}
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => router.push(`/helpdesk/knowledge/docs/create?edit=${a.id}`)} title="Editar"
                    style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.sub }}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => { if (confirm('¿Eliminar este artículo?')) delMut.mutate(a.id); }}
                    style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#ef4444' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
              <ChevronRight size={14} style={{ color: C.muted, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </ModuleLayout>
  );
}
