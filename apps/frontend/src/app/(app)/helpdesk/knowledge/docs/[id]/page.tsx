'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Trash2, Eye, Calendar, User, Tag, FileText } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../../_components/KnowledgeNav';
import { docsService } from '../../_lib/knowledge.service';
import { fmtDate } from '@/lib/formatters';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/vnd.ms-powerpoint': '📋',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📋',
  'text/plain': '📃',
  'application/zip': '🗜️',
};

function getFileIcon(mime?: string | null): string {
  if (!mime) return '📁';
  if (FILE_ICONS[mime]) return FILE_ICONS[mime];
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  return '📁';
}

function fmtSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getExt(name?: string | null): string {
  if (!name) return '';
  const m = name.match(/\.([^.]+)$/);
  return m ? m[1].toUpperCase() : '';
}

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

  const delMut = useMutation({
    mutationFn: () => docsService.deleteArticle(id),
    onSuccess:  () => router.replace('/helpdesk/knowledge/docs'),
  });

  if (isLoading) {
    return (
      <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
        <KnowledgeNav />
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted }}>Cargando documento…</div>
      </ModuleLayout>
    );
  }

  if (!article) {
    return (
      <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
        <KnowledgeNav />
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted }}>Documento no encontrado.</div>
      </ModuleLayout>
    );
  }

  const isFile   = article.doc_type === 'file';
  const isPdf    = article.file_mime === 'application/pdf';
  const isImage  = article.file_mime?.startsWith('image/') ?? false;
  const ext      = getExt(article.file_name);

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      {/* Back + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <button type="button" onClick={() => router.push('/helpdesk/knowledge/docs')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.sub, fontFamily: 'inherit', padding: 0, fontWeight: 600 }}>
          <ArrowLeft size={14} /> Volver a la base documental
        </button>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            {isFile && article.file_url && (
              <a href={article.file_url} download={article.file_name ?? true}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
                <Download size={12} /> Descargar
              </a>
            )}
            <button type="button" onClick={() => { if (confirm('¿Eliminar este documento permanentemente?')) delMut.mutate(); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', fontSize: 12, fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>

        {/* Document header */}
        <div style={{ padding: '28px 32px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            {/* File type icon */}
            <div style={{ width: 64, height: 64, borderRadius: 14, background: `${C.coral}10`, border: `1.5px solid ${C.coral}25`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 2 }}>
              <span style={{ fontSize: 28 }}>{getFileIcon(article.file_mime)}</span>
              {ext && <span style={{ fontSize: 8, fontWeight: 800, color: C.coral, letterSpacing: '.06em' }}>{ext}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {article.category && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.1em', padding: '3px 10px', borderRadius: 99, background: `${C.coral}12`, border: `1px solid ${C.coral}30` }}>
                    {article.category}
                  </span>
                )}
                {!article.is_published && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 5, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>BORRADOR</span>
                )}
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: C.navy, margin: '0 0 12px', lineHeight: 1.2 }}>
                {article.title}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.muted }}>
                  <User size={12} /> {article.author_name}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.muted }}>
                  <Calendar size={12} /> {fmtDate(article.updated_at)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.muted }}>
                  <Eye size={12} /> {article.view_count} vistas
                </span>
                {isFile && article.file_size && (
                  <span style={{ fontSize: 12, color: C.muted }}>{fmtSize(article.file_size)}</span>
                )}
              </div>
            </div>
            {/* Download button (for all users) */}
            {isFile && article.file_url && (
              <a href={article.file_url} download={article.file_name ?? true}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9, border: 'none', background: C.coral, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', cursor: 'pointer', flexShrink: 0, boxShadow: `0 4px 14px ${C.coral}40` }}>
                <Download size={15} /> Descargar
              </a>
            )}
          </div>
        </div>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div style={{ padding: '14px 32px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Tag size={13} style={{ color: C.muted, flexShrink: 0 }} />
            {article.tags.map(t => (
              <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>
            ))}
          </div>
        )}

        {/* Preview / Content */}
        {isFile && article.file_url ? (
          <div style={{ padding: '24px 32px' }}>
            {isPdf ? (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>Vista previa</p>
                <iframe
                  src={article.file_url}
                  style={{ width: '100%', height: 600, border: `1px solid ${C.border}`, borderRadius: 10 }}
                  title={article.title}
                />
              </div>
            ) : isImage ? (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>Vista previa</p>
                <img src={article.file_url} alt={article.title}
                  style={{ maxWidth: '100%', borderRadius: 10, border: `1px solid ${C.border}` }} />
              </div>
            ) : (
              /* Non-previewable file */
              <div style={{ textAlign: 'center', padding: '48px 24px', background: C.bg, borderRadius: 12, border: `1px dashed ${C.border}` }}>
                <span style={{ fontSize: 56, display: 'block', marginBottom: 16 }}>{getFileIcon(article.file_mime)}</span>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.navy, margin: '0 0 6px' }}>{article.file_name}</p>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 20px' }}>
                  {fmtSize(article.file_size)} · {article.file_mime || ext}
                </p>
                <a href={article.file_url} download={article.file_name ?? true}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 9, border: 'none', background: C.navy, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  <Download size={16} /> Descargar archivo
                </a>
              </div>
            )}
          </div>
        ) : article.content ? (
          <div style={{ padding: '32px', minHeight: 120 }}>
            <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.85, whiteSpace: 'pre-wrap', maxWidth: 760 }}>
              {article.content}
            </div>
          </div>
        ) : null}

      </div>
    </ModuleLayout>
  );
}
