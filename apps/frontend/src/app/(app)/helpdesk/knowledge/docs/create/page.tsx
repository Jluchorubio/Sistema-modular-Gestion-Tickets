'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Upload, FileText, File, X, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { KnowledgeNav } from '../../_components/KnowledgeNav';
import { docsService } from '../../_lib/knowledge.service';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

const CATEGORIES = ['Hardware', 'Software', 'Red y Conectividad', 'Acceso y Cuentas', 'Impresoras y Periféricos', 'General'];

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

function getFileIcon(mime: string): string {
  if (FILE_ICONS[mime]) return FILE_ICONS[mime];
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  return '📁';
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocsCreatePage() {
  const router       = useRouter();
  const { user }     = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;

  const { modules }  = useModules();
  const helpdeskId   = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const [file,      setFile]      = useState<File | null>(null);
  const [title,     setTitle]     = useState('');
  const [category,  setCategory]  = useState('');
  const [tagsStr,   setTagsStr]   = useState('');
  const [showAdv,   setShowAdv]   = useState(false);
  const [dragging,  setDragging]  = useState(false);
  const [err,       setErr]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const mut = useMutation({
    mutationFn: () => {
      if (!file || !helpdeskId) throw new Error('Falta archivo o módulo');
      const fd = new FormData();
      fd.append('file',      file);
      fd.append('module_id', helpdeskId);
      fd.append('title',     title.trim() || file.name);
      if (category.trim()) fd.append('category', category.trim());
      if (tagsStr.trim())  fd.append('tags',     tagsStr.trim());
      return docsService.uploadDoc(fd);
    },
    onSuccess: (data: any) => {
      router.push(data?.id ? `/helpdesk/knowledge/docs/${data.id}` : '/helpdesk/knowledge/docs');
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error al subir el archivo'),
  });

  function handleFileSelect(f: File) {
    if (f.size > 50 * 1024 * 1024) { setErr('El archivo supera el límite de 50 MB.'); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
    setErr('');
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
    e.target.value = '';
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, [title]);

  const ROW: React.CSSProperties   = { display: 'grid', gridTemplateColumns: '180px 1fr', borderBottom: `1px solid ${C.border}`, alignItems: 'start' };
  const LABEL: React.CSSProperties = { padding: '14px 20px', fontSize: 14, fontWeight: 500, color: '#334155' };
  const FIELD: React.CSSProperties = { padding: '10px 20px 10px 0' };
  const INPUT: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const };

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>
      <KnowledgeNav />

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 8, background: C.navy, color: '#fff', fontSize: 13, fontWeight: 700 }}>
          Subir documento
        </div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>

        {/* Drop zone */}
        <div style={{ padding: '0 0 0 0' }}>
          {!file ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              style={{ margin: '24px', borderRadius: 12, border: `2px dashed ${dragging ? C.coral : C.border}`, background: dragging ? `${C.coral}06` : C.bg, padding: '56px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'all .2s' }}
            >
              <div style={{ width: 56, height: 56, borderRadius: 12, background: dragging ? `${C.coral}18` : '#fff', border: `1.5px solid ${dragging ? C.coral : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                <Upload size={24} style={{ color: dragging ? C.coral : C.muted }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.navy, margin: '0 0 5px' }}>
                  Arrastra el archivo aquí o <span style={{ color: C.coral, textDecoration: 'underline' }}>selecciona desde tu dispositivo</span>
                </p>
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                  PDF, Word, Excel, PowerPoint, imágenes, videos, ZIP · máx. 50 MB
                </p>
              </div>
              <input ref={inputRef} type="file" onChange={handleInputChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov"
                style={{ display: 'none' }} />
            </div>
          ) : (
            /* File selected */
            <div style={{ margin: '24px', borderRadius: 12, border: `1.5px solid #bbf7d0`, background: '#f0fdf4', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 36, flexShrink: 0 }}>{getFileIcon(file.type)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: C.sub }}>{fmtSize(file.size)} · {file.type || 'archivo'}</p>
              </div>
              <button type="button" onClick={() => { setFile(null); setTitle(''); setErr(''); }}
                style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid #fecaca`, background: '#fef2f2', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#ef4444', flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Title */}
        <div style={ROW}>
          <div style={{ ...LABEL, display: 'flex', alignItems: 'center', gap: 6 }}>
            Título del documento
            <AlertCircle size={13} style={{ color: C.coral }} />
          </div>
          <div style={FIELD}>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Nombre descriptivo del documento…" style={INPUT} />
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
            <input value={category} onChange={e => setCategory(e.target.value)}
              placeholder="O escribe una categoría personalizada…" style={{ ...INPUT, marginTop: 0 }} />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <button type="button"
            disabled={!file || !helpdeskId || mut.isPending}
            onClick={() => mut.mutate()}
            style={{ padding: '9px 22px', borderRadius: 7, border: 'none', background: file ? C.navy : C.muted, color: '#fff', fontSize: 13, fontWeight: 700, cursor: file ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {mut.isPending ? 'Subiendo…' : 'Subir documento'}
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

        {/* Advanced: tags */}
        {showAdv && (
          <div style={{ padding: '20px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', alignItems: 'center' }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#334155' }}>Etiquetas</label>
              <input value={tagsStr} onChange={e => setTagsStr(e.target.value)}
                placeholder="vpn, manual, procedimiento…  (separadas por comas)" style={INPUT} />
            </div>
          </div>
        )}

        {err && (
          <div style={{ padding: '10px 20px', background: '#fef2f2', borderTop: `1px solid #fecaca` }}>
            <p style={{ fontSize: 12, color: '#dc2626', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={13} /> {err}
            </p>
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
