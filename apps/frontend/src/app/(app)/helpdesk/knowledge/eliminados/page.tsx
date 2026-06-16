'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, X, BookOpen, MessageSquare, File, FileText, Image, Film, AlertTriangle } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../_components/KnowledgeNav';
import { docsService, forumService, type DeletedItem } from '../_lib/knowledge.service';
import { fmtDate } from '@/lib/formatters';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

function getFileIcon(mime?: string | null): React.ReactNode {
  const s = { color: C.coral };
  if (!mime) return <File size={16} style={s} />;
  if (mime === 'application/pdf') return <FileText size={16} style={{ color: '#ef4444' }} />;
  if (mime.includes('msword') || mime.includes('wordprocessingml')) return <FileText size={16} style={{ color: '#1d4ed8' }} />;
  if (mime.includes('excel') || mime.includes('spreadsheetml')) return <FileText size={16} style={{ color: '#16a34a' }} />;
  if (mime.startsWith('image/')) return <Image size={16} style={{ color: '#7c3aed' }} />;
  if (mime.startsWith('video/')) return <Film size={16} style={{ color: '#0ea5e9' }} />;
  return <File size={16} style={s} />;
}

function DaysChip({ days }: { days: number }) {
  const urgent = days <= 7;
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
      background: urgent ? '#fef2f2' : '#f1f5f9',
      color: urgent ? '#ef4444' : C.sub,
      border: `1px solid ${urgent ? '#fecaca' : C.border}`,
      whiteSpace: 'nowrap' as const,
    }}>
      {days === 0 ? 'Expira hoy' : `${days}d restantes`}
    </span>
  );
}

type Tab = 'docs' | 'foros';

export default function EliminadosPage() {
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc = useQueryClient();

  const { modules } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const [tab, setTab] = useState<Tab>('docs');
  const [confirmItem, setConfirmItem] = useState<{ id: string; type: 'article' | 'post'; title: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-deleted', helpdeskId],
    queryFn:  () => docsService.getDeleted(helpdeskId!),
    enabled:  !!helpdeskId,
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['knowledge-deleted', helpdeskId] });

  const restoreMut = useMutation({
    mutationFn: (item: { id: string; type: 'article' | 'post' }) =>
      item.type === 'article' ? docsService.restoreArticle(item.id) : forumService.restorePost(item.id),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['knowledge', helpdeskId] }); qc.invalidateQueries({ queryKey: ['knowledge-posts', helpdeskId] }); },
  });

  const permanentMut = useMutation({
    mutationFn: (item: { id: string; type: 'article' | 'post' }) =>
      item.type === 'article' ? docsService.permanentDeleteArticle(item.id) : forumService.permanentDeletePost(item.id),
    onSuccess: () => { invalidate(); setConfirmItem(null); },
  });

  const articles = data?.articles ?? [];
  const posts    = data?.posts    ?? [];
  const items: DeletedItem[] = tab === 'docs' ? articles : posts;

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: '0 0 3px' }}>Eliminados</h1>
        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
          Contenido eliminado de Knowledge · eliminación permanente automática a los 90 días
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {([['docs', 'Documentos', BookOpen, articles.length], ['foros', 'Foros', MessageSquare, posts.length]] as const).map(([key, label, Icon, count]) => (
          <button key={key} type="button" onClick={() => setTab(key as Tab)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${tab === key ? C.navy : C.border}`, background: tab === key ? `${C.navy}08` : '#fff', color: tab === key ? C.navy : C.sub, fontSize: 12, fontWeight: tab === key ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}>
            <Icon size={13} />
            {label}
            {count > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: tab === key ? C.navy : C.border, color: tab === key ? '#fff' : C.sub }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Trash2 size={32} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>Sin elementos eliminados</p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
            {tab === 'docs' ? 'Los documentos y artículos eliminados aparecerán aquí.' : 'Los foros eliminados aparecerán aquí.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <div key={item.id} style={{ background: 'var(--app-card)', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Icon */}
              <div style={{ width: 40, height: 40, borderRadius: 9, background: `${C.coral}10`, border: `1px solid ${C.coral}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {item.type === 'post'
                  ? <MessageSquare size={16} style={{ color: C.coral }} />
                  : item.doc_type === 'file'
                    ? getFileIcon(item.file_mime)
                    : <BookOpen size={16} style={{ color: C.coral }} />}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>
                  {item.author_name} · eliminado {fmtDate(item.deleted_at)}
                </p>
              </div>

              {/* Days remaining */}
              {item.scheduled_hard_delete_at && <DaysChip days={item.days_remaining} />}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button"
                  disabled={restoreMut.isPending && (restoreMut.variables as any)?.id === item.id}
                  onClick={() => restoreMut.mutate({ id: item.id, type: item.type })}
                  title="Restaurar"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1.5px solid ${C.navy}30`, background: `${C.navy}06`, color: C.navy, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: restoreMut.isPending ? 0.6 : 1 }}>
                  <RotateCcw size={12} />
                  Restaurar
                </button>
                <button type="button"
                  onClick={() => setConfirmItem({ id: item.id, type: item.type, title: item.title })}
                  title="Eliminar permanentemente"
                  style={{ width: 32, height: 32, borderRadius: 7, border: '1.5px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#ef4444' }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Permanent delete confirm modal */}
      {confirmItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmItem(null)}>
          <div style={{ background: 'var(--app-card)', borderRadius: 14, padding: '28px 28px 24px', width: 380, boxShadow: '0 8px 40px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fef2f2', border: '1.5px solid #fecaca', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <AlertTriangle size={18} style={{ color: '#ef4444' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.navy, margin: '0 0 2px' }}>¿Eliminar permanentemente?</p>
                <p style={{ fontSize: 11, color: C.sub, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{confirmItem.title}</p>
              </div>
            </div>
            <p style={{ fontSize: 12, color: C.muted, margin: '0 0 20px', lineHeight: 1.6 }}>
              Esta acción no se puede deshacer. El contenido se eliminará de forma permanente y no podrá recuperarse.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmItem(null)}
                style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button type="button" disabled={permanentMut.isPending}
                onClick={() => permanentMut.mutate({ id: confirmItem.id, type: confirmItem.type })}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ef4444', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: permanentMut.isPending ? 0.6 : 1 }}>
                {permanentMut.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
