'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2, ThumbsUp, ThumbsDown, Eye, Calendar, User, Tag } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../../_components/KnowledgeNav';
import { docsService } from '../../_lib/knowledge.service';
import { fmtDate } from '@/lib/formatters';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

export default function DocDetailPage() {
  const { id }       = useParams<{ id: string }>();
  const router       = useRouter();
  const { user }     = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc           = useQueryClient();

  const { modules }  = useModules();
  const helpdeskId   = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const moduleRole = user?.module_roles?.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  const canEdit    = isSuperadmin || moduleRole === 'admin_modulo' || moduleRole === 'jefe_tecnico';

  const { data: article, isLoading } = useQuery({
    queryKey: ['knowledge-article', id],
    queryFn:  () => docsService.getArticle(id),
    enabled:  !!id,
    staleTime: 30_000,
  });

  const voteMut = useMutation({
    mutationFn: (value: 1 | -1) => docsService.voteArticle(id, value),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['knowledge-article', id] }),
  });

  const delMut = useMutation({
    mutationFn: () => docsService.deleteArticle(id),
    onSuccess:  () => router.replace('/helpdesk/knowledge/docs'),
  });

  if (isLoading) {
    return (
      <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
        <KnowledgeNav />
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted }}>Cargando artículo…</div>
      </ModuleLayout>
    );
  }

  if (!article) {
    return (
      <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
        <KnowledgeNav />
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted }}>Artículo no encontrado.</div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      {/* Back + actions row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <button type="button" onClick={() => router.push('/helpdesk/knowledge/docs')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.sub, fontFamily: 'inherit', padding: 0, fontWeight: 600 }}>
          <ArrowLeft size={14} /> Volver a la base documental
        </button>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => router.push(`/helpdesk/knowledge/docs/create?edit=${id}`)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 700, color: C.sub, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Pencil size={12} /> Editar
            </button>
            <button type="button" onClick={() => { if (confirm('¿Eliminar este artículo permanentemente?')) delMut.mutate(); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', fontSize: 12, fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        )}
      </div>

      {/* Article card */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>

        {/* Article header */}
        <div style={{ padding: '28px 32px', borderBottom: `1px solid ${C.border}` }}>
          {/* Category + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {article.category && (
              <span style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.1em', padding: '3px 10px', borderRadius: 99, background: `${C.coral}12`, border: `1px solid ${C.coral}30` }}>
                {article.category}
              </span>
            )}
            {!article.is_published && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 5, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                BORRADOR
              </span>
            )}
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.navy, margin: '0 0 16px', lineHeight: 1.2 }}>
            {article.title}
          </h1>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
              <User size={13} /> {article.author_name}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
              <Calendar size={13} /> Actualizado {fmtDate(article.updated_at)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
              <Eye size={13} /> {article.view_count} vistas
            </span>
          </div>
        </div>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div style={{ padding: '14px 32px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Tag size={13} style={{ color: C.muted, flexShrink: 0 }} />
            {article.tags.map(t => (
              <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '32px', minHeight: 200 }}>
          <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.85, whiteSpace: 'pre-wrap', maxWidth: 760 }}>
            {article.content}
          </div>
        </div>

        {/* Ticket reference */}
        {article.ticket_id && (
          <div style={{ padding: '14px 32px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
            <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>
              Derivado del ticket:{' '}
              <button type="button" onClick={() => router.push(`/helpdesk/ticket/${article.ticket_id}`)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: C.coral, padding: 0, textDecoration: 'underline' }}>
                #{article.ticket_id.slice(0, 8).toUpperCase()}
              </button>
            </p>
          </div>
        )}

        {/* Feedback bar */}
        <div style={{ padding: '20px 32px', borderTop: `1px solid ${C.border}`, background: C.bg, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>¿Este artículo fue útil?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => voteMut.mutate(1)} disabled={voteMut.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', fontSize: 12, fontWeight: 700, color: '#15803d', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#dcfce7'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#f0fdf4'}>
              <ThumbsUp size={14} /> Sí, me ayudó
              <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d', marginLeft: 2 }}>{article.helpful_count}</span>
            </button>
            <button type="button" onClick={() => voteMut.mutate(-1)} disabled={voteMut.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', fontSize: 12, fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'}>
              <ThumbsDown size={14} /> No me ayudó
              <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#fee2e2', color: '#ef4444', marginLeft: 2 }}>{article.not_helpful_count}</span>
            </button>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.muted }}>
            {article.helpful_count + article.not_helpful_count} persona{article.helpful_count + article.not_helpful_count !== 1 ? 's' : ''} valoraron este artículo
          </span>
        </div>
      </div>
    </ModuleLayout>
  );
}
