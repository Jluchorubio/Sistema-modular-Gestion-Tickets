'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, MoreVertical, Trash2, CheckCircle2, X } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../_components/KnowledgeNav';
import { forumService, type ForumPost } from '../_lib/knowledge.service';
import { fmtDate } from '@/lib/formatters';
import { ADMIN_ROLES } from '@/constants/roles';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.375, fontWeight: 700, color: C.sub, flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ForumPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc = useQueryClient();

  const { modules } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const moduleRole = user?.module_roles?.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  const canModerate = isSuperadmin || ADMIN_ROLES.includes(moduleRole as any);
  const canPost     = !!moduleRole || isSuperadmin;

  const [filter,        setFilter]        = useState<'all' | 'resolved' | 'unresolved'>('all');
  const [starred,       setStarred]       = useState<Set<string>>(new Set());
  const [subscribed,    setSubscribed]    = useState<Set<string>>(new Set());
  const [menuOpen,      setMenuOpen]      = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  /* inline create */
  const [showCreate,  setShowCreate]  = useState(false);
  const [newTitle,    setNewTitle]    = useState('');
  const [newContent,  setNewContent]  = useState('');
  const [newTags,     setNewTags]     = useState('');
  const [createErr,   setCreateErr]   = useState('');

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['knowledge-posts', helpdeskId, filter],
    queryFn:  () => forumService.getPosts(helpdeskId!, undefined, filter !== 'all' ? filter : undefined),
    enabled:  !!helpdeskId,
    staleTime: 30_000,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => forumService.deletePost(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['knowledge-posts', helpdeskId] }); setMenuOpen(null); setDeleteConfirm(null); },
  });

  const createMut = useMutation({
    mutationFn: () => forumService.createPost({
      module_id: helpdeskId!,
      title:   newTitle.trim(),
      content: newContent.trim(),
      tags:    newTags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['knowledge-posts', helpdeskId] });
      setShowCreate(false);
      setNewTitle(''); setNewContent(''); setNewTags(''); setCreateErr('');
      router.push(`/helpdesk/knowledge/forum/${data.id}`);
    },
    onError: (e: any) => setCreateErr(e?.response?.data?.message ?? 'Error al publicar.'),
  });

  function toggleStar(id: string) {
    setStarred(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleSub(id: string) {
    setSubscribed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: '0 0 3px' }}>Foro técnico</h1>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Preguntas, debates y colaboración del equipo</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Filter pills */}
          {(['all', 'unresolved', 'resolved'] as const).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              style={{ padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, border: `1.5px solid ${filter === f ? C.coral : C.border}`, background: filter === f ? `${C.coral}12` : '#fff', color: filter === f ? C.coral : C.sub, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}>
              {f === 'all' ? 'Todos' : f === 'unresolved' ? 'Abiertos' : 'Resueltos'}
            </button>
          ))}
          {canPost && (
            <button type="button" onClick={() => setShowCreate(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: `1.5px solid ${showCreate ? C.coral : 'transparent'}`, background: showCreate ? `${C.coral}10` : C.coral, color: showCreate ? C.coral : '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
              {showCreate ? <><X size={13} /> Cancelar</> : <>+ Nuevo debate</>}
            </button>
          )}
        </div>
      </div>

      {/* ── Inline create form ── */}
      {showCreate && (
        <div style={{ background: '#fff', border: `1.5px solid ${C.coral}40`, borderRadius: 12, padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(255,94,58,.08)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 14px' }}>Nuevo debate</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Asunto */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 4 }}>Asunto <span style={{ color: C.coral }}>*</span></label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título del debate…" autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>

            {/* Mensaje */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 4 }}>Mensaje <span style={{ color: C.coral }}>*</span></label>
              <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Describe el problema, pregunta o tema…" rows={4}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
            </div>

            {/* Tags (optional) */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 4 }}>Etiquetas <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}>(opcional, separadas por comas)</span></label>
              <input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="wifi, impresora, correo…"
                style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>

            {createErr && <p style={{ fontSize: 11, color: '#dc2626', margin: 0 }}>{createErr}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={!newTitle.trim() || !newContent.trim() || createMut.isPending || !helpdeskId}
                onClick={() => createMut.mutate()}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: newTitle.trim() && newContent.trim() ? C.coral : '#94a3b8', color: '#fff', fontSize: 12, fontWeight: 700, cursor: newTitle.trim() && newContent.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {createMut.isPending ? 'Publicando…' : 'Publicar debate'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setNewTitle(''); setNewContent(''); setNewTags(''); setCreateErr(''); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 200px 200px 70px 80px 36px', gap: 0, padding: '10px 16px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          <span />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.coral, cursor: 'pointer', textDecoration: 'underline' }}>Debate</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.coral, cursor: 'pointer', textDecoration: 'underline' }}>Comenzado por</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.coral, cursor: 'pointer', textDecoration: 'underline' }}>Último mensaje ↓</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, textAlign: 'center' }}>Réplicas</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, textAlign: 'center' }}>Suscribir</span>
          <span />
        </div>

        {isLoading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando debates…</div>
        ) : posts.length === 0 ? (
          <div style={{ padding: '56px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>Sin debates aún</p>
            {canPost && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Inicia el primer debate del equipo.</p>}
          </div>
        ) : (
          posts.map((post: ForumPost) => {
            const lastAuthor = post.last_reply_author ?? post.author_name;
            const lastAvatar = post.last_reply_avatar ?? post.author_avatar;
            const lastAt     = post.last_reply_at ?? post.created_at;
            const isStarred  = starred.has(post.id);
            const isSub      = subscribed.has(post.id);
            const canDel     = canModerate || post.created_by === user?.id;

            return (
              <div key={post.id}
                style={{ display: 'grid', gridTemplateColumns: '28px 1fr 200px 200px 70px 80px 36px', alignItems: 'center', gap: 0, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: '#fff', position: 'relative' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.bg}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = '#fff'}
              >
                {/* Star */}
                <button type="button" onClick={() => toggleStar(post.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: isStarred ? '#f59e0b' : '#d1d5db', display: 'flex', alignItems: 'center' }}>
                  <Star size={15} fill={isStarred ? '#f59e0b' : 'none'} />
                </button>

                {/* Title */}
                <div style={{ minWidth: 0, paddingRight: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    {post.is_resolved && (
                      <CheckCircle2 size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                    )}
                    <button type="button" onClick={() => router.push(`/helpdesk/knowledge/forum/${post.id}`)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13.5, fontWeight: 600, color: C.coral, textAlign: 'left', textDecoration: 'underline', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {post.title}
                    </button>
                  </div>
                  {post.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {post.tags.slice(0, 3).map(t => (
                        <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Comenzado por */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
                  <Avatar name={post.author_name} url={post.author_avatar} size={28} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {post.author_name.length > 14 ? post.author_name.slice(0, 14) + '…' : post.author_name}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{fmtDate(post.created_at)}</p>
                  </div>
                </div>

                {/* Último mensaje */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
                  <Avatar name={lastAuthor ?? ''} url={lastAvatar} size={28} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(lastAuthor ?? '').length > 14 ? (lastAuthor ?? '').slice(0, 14) + '…' : (lastAuthor ?? '—')}
                    </p>
                    <button type="button" onClick={() => router.push(`/helpdesk/knowledge/forum/${post.id}`)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, color: C.coral, textDecoration: 'underline', fontFamily: 'inherit' }}>
                      {fmtDate(lastAt)}
                    </button>
                  </div>
                </div>

                {/* Réplicas */}
                <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: C.sub }}>
                  {post.reply_count}
                </div>

                {/* Suscribir toggle */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button type="button" onClick={() => toggleSub(post.id)}
                    style={{ width: 40, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: isSub ? C.coral : '#d1d5db', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, left: isSub ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                  </button>
                </div>

                {/* 3-dot menu */}
                <div style={{ position: 'relative' }}>
                  {canDel && (
                    <>
                      <button type="button" onClick={() => { setMenuOpen(menuOpen === post.id ? null : post.id); setDeleteConfirm(null); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: C.muted, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
                        <MoreVertical size={15} />
                      </button>
                      {menuOpen === post.id && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 160, overflow: 'hidden' }}>
                          {deleteConfirm === post.id ? (
                            <div style={{ padding: '10px 14px' }}>
                              <p style={{ fontSize: 11, fontWeight: 700, color: '#334155', margin: '0 0 8px' }}>¿Eliminar debate?</p>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button type="button" onClick={() => delMut.mutate(post.id)} disabled={delMut.isPending}
                                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {delMut.isPending ? '…' : 'Sí, eliminar'}
                                </button>
                                <button type="button" onClick={() => setDeleteConfirm(null)}
                                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setDeleteConfirm(post.id)}
                              style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', fontWeight: 600, textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7 }}>
                              <Trash2 size={12} /> Eliminar
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </ModuleLayout>
  );
}
