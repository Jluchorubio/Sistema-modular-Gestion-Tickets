'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  AlertCircle, Paperclip, X, ChevronDown, ChevronUp,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link, Settings2, Smile, Image, Mic, Video, FileText, ChevronsUpDown, Type,
  type LucideIcon,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../../_components/KnowledgeNav';
import { forumService } from '../../_lib/knowledge.service';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov';

export default function ForumCreatePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;

  const { modules } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const [title,       setTitle]       = useState('');
  const [content,     setContent]     = useState('');
  const [tagsStr,     setTagsStr]     = useState('');
  const [showAdv,     setShowAdv]     = useState(false);
  const [files,       setFiles]       = useState<File[]>([]);
  const [err,         setErr]         = useState('');

  const mut = useMutation({
    mutationFn: () => forumService.createPost({
      module_id: helpdeskId!,
      title:   title.trim(),
      content: content.trim(),
      tags:    tagsStr.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: (data: any) => {
      router.push(`/helpdesk/knowledge/forum/${data.id}`);
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error al publicar'),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...selected].slice(0, 5));
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  const ROW: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '160px 1fr', gap: 0,
    borderBottom: `1px solid ${C.border}`, alignItems: 'start',
  };
  const LABEL: React.CSSProperties = {
    padding: '14px 20px', fontSize: 14, fontWeight: 500, color: '#334155',
    display: 'flex', alignItems: 'flex-start', gap: 8,
  };
  const FIELD_WRAP: React.CSSProperties = {
    padding: '10px 20px 10px 0',
  };

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <button type="button"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', background: C.coral, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 20 }}
          onClick={() => mut.isPending ? null : null}>
          Añadir un nuevo tema de debate
        </button>
      </div>

      {/* Form */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>

        {/* Asunto */}
        <div style={ROW}>
          <div style={LABEL}>
            Asunto
            <AlertCircle size={14} style={{ color: C.coral, flexShrink: 0, marginTop: 2 }} />
          </div>
          <div style={FIELD_WRAP}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder=""
              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Mensaje */}
        <div style={ROW}>
          <div style={{ ...LABEL, paddingTop: 14 }}>
            Mensaje
            <AlertCircle size={14} style={{ color: C.coral, flexShrink: 0, marginTop: 2 }} />
          </div>
          <div style={FIELD_WRAP}>
            {/* Toolbar hint */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', background: '#f8fafc', border: `1px solid ${C.border}`, borderBottom: 'none', borderRadius: '7px 7px 0 0', flexWrap: 'wrap' }}>
              {([
                [ChevronsUpDown, 'Tamaño'],
                [Type,           'Fuente'],
                [Bold,           'Negrita'],
                [Italic,         'Cursiva'],
                [AlignLeft,      'Izquierda'],
                [AlignCenter,    'Centro'],
                [AlignRight,     'Derecha'],
                [AlignJustify,   'Justificar'],
                [Link,           'Enlace'],
                [Settings2,      'Opciones'],
              ] as [LucideIcon, string][]).map(([Icon, title], i) => (
                <button key={i} type="button" title={title}
                  style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', color: C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={13} />
                </button>
              ))}
              <span style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
              {([
                [Smile,    'Emoji'],
                [Image,    'Imagen'],
                [Paperclip,'Adjunto'],
                [Mic,      'Audio'],
                [Video,    'Video'],
                [FileText, 'Archivo'],
              ] as [LucideIcon, string][]).map(([Icon, title], i) => (
                <button key={i} type="button" title={title}
                  style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', color: C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={14}
              style={{ width: '100%', padding: '12px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 7px 7px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.65 }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <button type="button"
            disabled={!title.trim() || !content.trim() || mut.isPending || !helpdeskId}
            onClick={() => mut.mutate()}
            style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: title.trim() && content.trim() ? C.coral : '#94a3b8', color: '#fff', fontSize: 13, fontWeight: 700, cursor: title.trim() && content.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {mut.isPending ? 'Enviando…' : 'Enviar al foro'}
          </button>
          <button type="button" onClick={() => router.back()}
            style={{ padding: '9px 18px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#e2e8f0', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button type="button" onClick={() => setShowAdv(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px', borderRadius: 7, border: 'none', background: 'none', color: C.coral, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Avanzado {showAdv ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Advanced section */}
        {showAdv && (
          <div style={{ padding: '20px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Tags */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 0, alignItems: 'center' }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#334155', padding: '0 20px 0 0' }}>Etiquetas</label>
              <input value={tagsStr} onChange={e => setTagsStr(e.target.value)}
                placeholder="wifi, impresora, correo…  (separadas por comas)"
                style={{ padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
            </div>

            {/* File attachments */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 0, alignItems: 'start' }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#334155', padding: '8px 20px 0 0' }}>Adjuntos</label>
              <div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 600, color: C.sub, cursor: 'pointer' }}>
                  <Paperclip size={13} /> Adjuntar archivos
                  <input type="file" multiple accept={ACCEPT} onChange={handleFile} style={{ display: 'none' }} />
                </label>
                <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0' }}>PDF, Word, Excel, imágenes, videos · máx. 5 archivos · 10 MB c/u</p>
                {files.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {files.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: C.bg, border: `1px solid ${C.border}` }}>
                        <Paperclip size={12} style={{ color: C.muted, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: C.navy, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button type="button" onClick={() => removeFile(i)}
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

        {/* Error */}
        {err && (
          <div style={{ padding: '10px 20px', background: '#fef2f2', borderTop: `1px solid #fecaca` }}>
            <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{err}</p>
          </div>
        )}
      </div>

      {/* Required note */}
      <p style={{ fontSize: 12, color: C.muted, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertCircle size={13} style={{ color: C.coral }} />
        En este formulario hay campos obligatorios.
      </p>
    </ModuleLayout>
  );
}
