'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCircle2, Trash2, Paperclip, X, Pencil } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../../_components/KnowledgeNav';
import { forumService } from '../../_lib/knowledge.service';
import { fmtDate, fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import { ADMIN_ROLES } from '@/constants/roles';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: C.navy, color: '#fff', fontSize: size * 0.35, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ForumThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc = useQueryClient();

  const { modules } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const moduleRole = user?.module_roles?.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  const canModerate = isSuperadmin || ADMIN_ROLES.includes(moduleRole as any);

  const [replyText,  setReplyText]  = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  /* edit post */
  const [editingPost,   setEditingPost]   = useState(false);
  const [editTitle,     setEditTitle]     = useState('');
  const [editContent,   setEditContent]   = useState('');
  const [editTags,      setEditTags]      = useState('');

  /* edit reply */
  const [editingReply,  setEditingReply]  = useState<string | null>(null);
  const [editReplyText, setEditReplyText] = useState('');

  /* delete confirmations */
  const [deletePostConfirm,  setDeletePostConfirm]  = useState(false);
  const [deleteReplyConfirm, setDeleteReplyConfirm] = useState<string | null>(null);

  const { data: post, isLoading, refetch } = useQuery({
    queryKey: ['knowledge-post', id],
    queryFn:  () => forumService.getPost(id),
    enabled:  !!id,
    staleTime: 0,
  });

  const replyMut = useMutation({
    mutationFn: () => forumService.createReply(id, replyText.trim()),
    onSuccess: () => { setReplyText(''); setReplyFiles([]); refetch(); },
  });

  const acceptMut = useMutation({
    mutationFn: (replyId: string) => forumService.acceptReply(id, replyId),
    onSuccess: () => refetch(),
  });

  const delReplyMut = useMutation({
    mutationFn: (replyId: string) => forumService.deleteReply(id, replyId),
    onSuccess: () => { setDeleteReplyConfirm(null); refetch(); },
  });

  const delPostMut = useMutation({
    mutationFn: () => forumService.deletePost(id),
    onSuccess: () => router.replace('/helpdesk/knowledge/forum'),
  });

  const updatePostMut = useMutation({
    mutationFn: () => forumService.updatePost(id, {
      title:   editTitle.trim(),
      content: editContent.trim(),
      tags:    editTags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: () => { setEditingPost(false); refetch(); },
  });

  const updateReplyMut = useMutation({
    mutationFn: (replyId: string) => forumService.updateReply(id, replyId, { content: editReplyText.trim() }),
    onSuccess: () => { setEditingReply(null); setEditReplyText(''); refetch(); },
  });

  function startEditPost() {
    if (!post) return;
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditTags((post.tags ?? []).join(', '));
    setEditingPost(true);
  }

  if (isLoading || !post) {
    return (
      <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
        <KnowledgeNav />
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted }}>Cargando debate…</div>
      </ModuleLayout>
    );
  }

  const canDelPost  = canModerate || post.created_by === user?.id;
  const canEditPost = canModerate || post.created_by === user?.id;
  const isAuthor    = post.created_by === user?.id;

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      {/* Back */}
      <button type="button" onClick={() => router.push('/helpdesk/knowledge/forum')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.sub, fontFamily: 'inherit', marginBottom: 20, padding: 0, fontWeight: 600 }}>
        <ArrowLeft size={14} /> Volver al foro
      </button>

      {/* Thread post */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>

        {/* Thread header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingPost ? (
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${C.coral}`, fontSize: 18, fontWeight: 800, color: C.navy, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 8 }} />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {post.is_resolved
                    ? <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={11} /> RESUELTO</span>
                    : <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>ABIERTO</span>
                  }
                  <span style={{ fontSize: 11, color: C.muted }}>{post.reply_count} {Number(post.reply_count) === 1 ? 'respuesta' : 'respuestas'} · {post.view_count} vistas</span>
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: '0 0 10px', lineHeight: 1.25 }}>{post.title}</h1>
                {post.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                    {post.tags.map(t => <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>#{t}</span>)}
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {canEditPost && !editingPost && (
              <button type="button" onClick={startEditPost}
                style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.sub }}>
                <Pencil size={13} />
              </button>
            )}
            {canDelPost && !editingPost && (
              deletePostConfirm ? (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>¿Eliminar?</span>
                  <button type="button" onClick={() => delPostMut.mutate()} disabled={delPostMut.isPending}
                    style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {delPostMut.isPending ? '…' : 'Sí'}
                  </button>
                  <button type="button" onClick={() => setDeletePostConfirm(false)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    No
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setDeletePostConfirm(true)}
                  style={{ width: 32, height: 32, borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#ef4444', flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              )
            )}
          </div>
        </div>

        {/* Original post content */}
        <div style={{ padding: '20px 24px', display: 'flex', gap: 16, borderBottom: `1px solid ${C.border}` }}>
          <Avatar name={post.author_name} url={post.author_avatar} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{post.author_name}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{fmtRelative(post.created_at)}</span>
              {isAuthor && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 5, background: '#eff6ff', color: '#1d4ed8' }}>AUTOR</span>}
            </div>
            {editingPost ? (
              <div>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={5}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: `1.5px solid ${C.coral}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, lineHeight: 1.65, marginBottom: 8 }} />
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.sub, display: 'block', marginBottom: 4 }}>Etiquetas (separadas por comas)</label>
                  <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="wifi, impresora, red…"
                    style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => updatePostMut.mutate()} disabled={updatePostMut.isPending || !editTitle.trim() || !editContent.trim()}
                    style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: C.coral, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: updatePostMut.isPending ? 0.7 : 1 }}>
                    {updatePostMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button type="button" onClick={() => setEditingPost(false)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>{post.content}</p>
            )}
          </div>
        </div>

        {/* Replies */}
        {post.replies.length > 0 && (
          <div>
            <div style={{ padding: '12px 24px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {post.replies.length} {post.replies.length === 1 ? 'Respuesta' : 'Respuestas'}
              </span>
            </div>
            {post.replies.map(reply => {
              const canDelReply  = canModerate || reply.created_by === user?.id;
              const canEditReply = canModerate || reply.created_by === user?.id;
              const isEditingThis  = editingReply === reply.id;
              const isDeletingThis = deleteReplyConfirm === reply.id;
              return (
                <div key={reply.id}
                  style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}`, background: reply.is_accepted ? '#f0fdf4' : '#fff', display: 'flex', gap: 16 }}>
                  <Avatar name={reply.author_name} url={reply.author_avatar} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{reply.author_name}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>{fmtRelative(reply.created_at)}</span>
                      {reply.is_accepted && (
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={9} /> Respuesta aceptada
                        </span>
                      )}
                    </div>

                    {isEditingThis ? (
                      <div>
                        <textarea value={editReplyText} onChange={e => setEditReplyText(e.target.value)} rows={3} autoFocus
                          style={{ width: '100%', padding: '9px 13px', borderRadius: 8, border: `1.5px solid ${C.coral}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, lineHeight: 1.65, marginBottom: 8 }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={() => updateReplyMut.mutate(reply.id)} disabled={updateReplyMut.isPending || !editReplyText.trim()}
                            style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: C.coral, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: updateReplyMut.isPending ? 0.7 : 1 }}>
                            {updateReplyMut.isPending ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button type="button" onClick={() => { setEditingReply(null); setEditReplyText(''); }}
                            style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.7, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{reply.content}</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {isAuthor && !reply.is_accepted && !post.is_resolved && (
                            <button type="button" onClick={() => acceptMut.mutate(reply.id)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid #bbf7d0', background: '#f0fdf4', fontSize: 11, fontWeight: 700, color: '#15803d', cursor: 'pointer', fontFamily: 'inherit' }}>
                              <CheckCircle2 size={12} /> Aceptar como solución
                            </button>
                          )}
                          {canEditReply && (
                            <button type="button" onClick={() => { setEditingReply(reply.id); setEditReplyText(reply.content); }}
                              style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', color: C.sub, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                              <Pencil size={11} /> Editar
                            </button>
                          )}
                          {canDelReply && (
                            isDeletingThis ? (
                              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>¿Eliminar?</span>
                                <button type="button" onClick={() => delReplyMut.mutate(reply.id)} disabled={delReplyMut.isPending}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {delReplyMut.isPending ? '…' : 'Sí'}
                                </button>
                                <button type="button" onClick={() => setDeleteReplyConfirm(null)}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  No
                                </button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setDeleteReplyConfirm(reply.id)}
                                style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}>
                                <Trash2 size={12} />
                              </button>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reply box */}
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 12px' }}>Tu respuesta</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Avatar name={user?.first_name ?? 'U'} url={user?.avatar_url} size={36} />
            <div style={{ flex: 1 }}>
              <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={4}
                placeholder="Escribe tu respuesta aquí…"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, lineHeight: 1.65 }} />

              {/* File attachment */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 600, color: C.sub, cursor: 'pointer' }}>
                  <Paperclip size={12} /> Adjuntar archivo
                  <input type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif" onChange={e => setReplyFiles(prev => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 3))} style={{ display: 'none' }} />
                </label>
                {replyFiles.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.sub, background: C.bg, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}` }}>
                    {f.name.slice(0, 20)} <button type="button" onClick={() => setReplyFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, display: 'flex' }}><X size={11} /></button>
                  </span>
                ))}
              </div>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button"
                  disabled={!replyText.trim() || replyMut.isPending}
                  onClick={() => replyMut.mutate()}
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: replyText.trim() ? C.coral : C.muted, color: '#fff', fontSize: 13, fontWeight: 700, cursor: replyText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  {replyMut.isPending ? 'Enviando…' : 'Enviar respuesta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModuleLayout>
  );
}
