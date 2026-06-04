'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertCircle, Paperclip, X, ChevronDown, ChevronUp } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../../_components/KnowledgeNav';
import { docsService } from '../../_lib/knowledge.service';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

const CATEGORIES = ['Hardware', 'Software', 'Red y Conectividad', 'Acceso y Cuentas', 'Impresoras y Periféricos', 'General'];

export default function DocsCreatePage() {
  const router       = useRouter();
  const params       = useSearchParams();
  const editId       = params.get('edit');
  const isEdit       = !!editId;

  const { user }     = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;

  const { modules }  = useModules();
  const helpdeskId   = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const [title,     setTitle]     = useState('');
  const [content,   setContent]   = useState('');
  const [category,  setCategory]  = useState('');
  const [tagsStr,   setTagsStr]   = useState('');
  const [published, setPublished] = useState(true);
  const [showAdv,   setShowAdv]   = useState(false);
  const [files,     setFiles]     = useState<File[]>([]);
  const [err,       setErr]       = useState('');

  /* Load article for edit mode */
  const { data: existing } = useQuery({
    queryKey: ['knowledge-article', editId],
    queryFn:  () => docsService.getArticle(editId!),
    enabled:  !!editId,
    staleTime: 0,
  });

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setContent(existing.content);
      setCategory(existing.category ?? '');
      setTagsStr((existing.tags ?? []).join(', '));
      setPublished(existing.is_published);
    }
  }, [existing]);

  const mut = useMutation({
    mutationFn: (asDraft: boolean) => {
      const dto = {
        module_id:    helpdeskId!,
        title:        title.trim(),
        content:      content.trim(),
        category:     category.trim() || undefined,
        tags:         tagsStr.split(',').map(t => t.trim()).filter(Boolean),
        is_published: asDraft ? false : published,
      };
      return isEdit ? docsService.updateArticle(editId!, dto) : docsService.createArticle(dto);
    },
    onSuccess: (data: any) => {
      const id = data?.id ?? editId;
      router.push(id ? `/helpdesk/knowledge/docs/${id}` : '/helpdesk/knowledge/docs');
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error al guardar'),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 5));
    e.target.value = '';
  }

  const ROW: React.CSSProperties     = { display: 'grid', gridTemplateColumns: '180px 1fr', borderBottom: `1px solid ${C.border}`, alignItems: 'start' };
  const LABEL: React.CSSProperties   = { padding: '14px 20px', fontSize: 14, fontWeight: 500, color: '#334155', display: 'flex', alignItems: 'flex-start', gap: 8 };
  const FIELD: React.CSSProperties   = { padding: '10px 20px 10px 0' };
  const INPUT: React.CSSProperties   = { width: '100%', padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const };

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      {/* Page title button */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 8, background: C.navy, color: '#fff', fontSize: 13, fontWeight: 700 }}>
          {isEdit ? 'Editar artículo' : 'Nuevo artículo'}
        </div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>

        {/* Título */}
        <div style={ROW}>
          <div style={LABEL}>
            Título
            <AlertCircle size={14} style={{ color: C.coral, flexShrink: 0, marginTop: 2 }} />
          </div>
          <div style={FIELD}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del artículo…" style={INPUT} />
          </div>
        </div>

        {/* Categoría */}
        <div style={ROW}>
          <div style={LABEL}>Categoría</div>
          <div style={FIELD}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => setCategory(category === c ? '' : c)}
                  style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, border: `1.5px solid ${category === c ? C.coral : C.border}`, background: category === c ? `${C.coral}12` : '#fff', color: category === c ? C.coral : C.sub, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}>
                  {c}
                </button>
              ))}
            </div>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="O escribe una categoría personalizada…"
              style={{ ...INPUT, marginTop: 0 }} />
          </div>
        </div>

        {/* Contenido */}
        <div style={ROW}>
          <div style={{ ...LABEL, paddingTop: 14 }}>
            Contenido
            <AlertCircle size={14} style={{ color: C.coral, flexShrink: 0, marginTop: 2 }} />
          </div>
          <div style={FIELD}>
            {/* Toolbar visual */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', background: C.bg, border: `1px solid ${C.border}`, borderBottom: 'none', borderRadius: '7px 7px 0 0', flexWrap: 'wrap' }}>
              {['↕', 'A▾', 'B', 'I', '≡', '≡', '≡', '≡', '🔗', '⚙'].map((t, i) => (
                <button key={i} type="button" tabIndex={-1}
                  style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: 12, color: C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontWeight: 700 }}>
                  {t}
                </button>
              ))}
              <span style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
              {['😊', '🖼', '📎', '🎤', '🎥', '📋'].map((t, i) => (
                <button key={i} type="button" tabIndex={-1}
                  style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {t}
                </button>
              ))}
            </div>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={16}
              placeholder="Describe el procedimiento, solución o información técnica…"
              style={{ width: '100%', padding: '12px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 7px 7px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, lineHeight: 1.7 }} />
          </div>
        </div>

        {/* Estado */}
        <div style={ROW}>
          <div style={LABEL}>Estado</div>
          <div style={{ ...FIELD, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="pub" checked={published} onChange={e => setPublished(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: C.coral, cursor: 'pointer' }} />
            <label htmlFor="pub" style={{ fontSize: 13, color: C.navy, cursor: 'pointer', fontWeight: 500 }}>
              {published ? 'Publicado — visible para todo el equipo' : 'Borrador — solo visible para administradores'}
            </label>
          </div>
        </div>

        {/* Buttons row */}
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <button type="button"
            disabled={!title.trim() || !content.trim() || mut.isPending || !helpdeskId}
            onClick={() => mut.mutate(false)}
            style={{ padding: '9px 22px', borderRadius: 7, border: 'none', background: title.trim() && content.trim() ? C.navy : C.muted, color: '#fff', fontSize: 13, fontWeight: 700, cursor: title.trim() && content.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {mut.isPending ? 'Guardando…' : isEdit ? 'Actualizar artículo' : 'Publicar artículo'}
          </button>
          {!isEdit && (
            <button type="button"
              disabled={!title.trim() || !content.trim() || mut.isPending}
              onClick={() => mut.mutate(true)}
              style={{ padding: '9px 18px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Guardar borrador
            </button>
          )}
          <button type="button" onClick={() => router.back()}
            style={{ padding: '9px 18px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#e2e8f0', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button type="button" onClick={() => setShowAdv(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px', borderRadius: 7, border: 'none', background: 'none', color: C.coral, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Avanzado {showAdv ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Advanced */}
        {showAdv && (
          <div style={{ padding: '20px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Tags */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', alignItems: 'center' }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#334155' }}>Etiquetas</label>
              <input value={tagsStr} onChange={e => setTagsStr(e.target.value)}
                placeholder="wifi, impresora, correo…  (separadas por comas)"
                style={INPUT} />
            </div>

            {/* Attachments */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', alignItems: 'start' }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#334155', paddingTop: 6 }}>Archivos adjuntos</label>
              <div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 600, color: C.sub, cursor: 'pointer' }}>
                  <Paperclip size={13} /> Adjuntar archivo
                  <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.gif,.mp4" onChange={handleFile} style={{ display: 'none' }} />
                </label>
                <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 8px' }}>PDF, Word, Excel, imágenes, videos · máx. 5 archivos · 10 MB c/u</p>
                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {files.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: C.bg, border: `1px solid ${C.border}` }}>
                        <Paperclip size={12} style={{ color: C.muted, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: C.navy, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', padding: 0 }}>
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {err && (
          <div style={{ padding: '10px 20px', background: '#fef2f2', borderTop: `1px solid #fecaca` }}>
            <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{err}</p>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: C.muted, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertCircle size={13} style={{ color: C.coral }} />
        En este formulario hay campos obligatorios.
      </p>
    </ModuleLayout>
  );
}
