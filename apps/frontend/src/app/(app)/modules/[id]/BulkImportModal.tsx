'use client';

import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Upload, FileText, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { modulesService } from '@/services/modules.service';

interface ParsedRow {
  first_name: string;
  last_name:  string;
  email:      string;
  username?:  string;
  _valid:     boolean;
  _error?:    string;
}

interface Props {
  moduleId:   string;
  moduleName: string;
  onClose:    () => void;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const parseFields = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const header = parseFields(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));

  const idx = {
    first_name: header.indexOf('first_name') !== -1 ? header.indexOf('first_name') : header.indexOf('nombre'),
    last_name:  header.indexOf('last_name')  !== -1 ? header.indexOf('last_name')  : header.indexOf('apellido'),
    email:      header.indexOf('email')      !== -1 ? header.indexOf('email')       : header.indexOf('correo'),
    username:   header.indexOf('username')   !== -1 ? header.indexOf('username')    : header.indexOf('usuario'),
  };

  const hasHeader = idx.email !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const f = parseFields(line);
    if (hasHeader) {
      const first_name = (idx.first_name !== -1 ? f[idx.first_name] : '') ?? '';
      const last_name  = (idx.last_name  !== -1 ? f[idx.last_name]  : '') ?? '';
      const email      = (idx.email      !== -1 ? f[idx.email]      : '') ?? '';
      const username   = (idx.username   !== -1 ? f[idx.username]   : undefined);
      const valid = !!first_name && !!last_name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      return { first_name, last_name, email, username: username || undefined, _valid: valid, _error: valid ? undefined : 'Faltan campos o email inválido' };
    }
    // No header: assume first_name,last_name,email[,username]
    const [first_name = '', last_name = '', email = '', username] = f;
    const valid = !!first_name && !!last_name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    return { first_name, last_name, email, username: username || undefined, _valid: valid, _error: valid ? undefined : 'Faltan campos o email inválido' };
  }).filter((r) => r.first_name || r.last_name || r.email);
}

const TEMPLATE = `first_name,last_name,email,username\nJuan,Pérez,juan.perez@empresa.com,jperez\nAna,García,ana.garcia@empresa.com,\n`;

export function BulkImportModal({ moduleId, moduleName, onClose }: Props) {
  const qc          = useQueryClient();
  const fileRef     = useRef<HTMLInputElement>(null);
  const [rows, setRows]       = useState<ParsedRow[]>([]);
  const [roleId, setRoleId]   = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult]   = useState<{ created: number; existing: number; assigned: number; failed: { row: number; email: string; error: string }[] } | null>(null);

  const { data: roles } = useQuery({
    queryKey: ['module-roles', moduleId],
    queryFn:  () => modulesService.getModuleRoles(moduleId),
  });

  const importMut = useMutation({
    mutationFn: () => usersService.bulkImportAndAssign(moduleId, {
      rows:    rows.filter((r) => r._valid).map(({ first_name, last_name, email, username }) => ({ first_name, last_name, email, username })),
      role_id: roleId,
    }),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['module-members', moduleId] });
      qc.invalidateQueries({ queryKey: ['module', moduleId] });
    },
  });

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setRows(parseCSV(e.target?.result as string ?? ''));
    reader.readAsText(file, 'UTF-8');
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'plantilla_usuarios.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const validRows   = rows.filter((r) => r._valid);
  const invalidRows = rows.filter((r) => !r._valid);
  const canSubmit   = validRows.length > 0 && roleId && !importMut.isPending;

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    border: '1px solid #E2E8F0', borderRadius: 8,
    background: '#fff', color: '#0F172A', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: 0 }}>Importar usuarios desde CSV</p>
            <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{moduleName}</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {result ? (
            /* ── Results view ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Creados',   value: result.created,  color: '#15803d', bg: '#f0fdf4' },
                  { label: 'Existentes', value: result.existing, color: '#b45309', bg: '#fefce8' },
                  { label: 'Asignados', value: result.assigned, color: '#1d4ed8', bg: '#eff6ff' },
                ].map((s) => (
                  <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: s.color, fontWeight: 500 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {result.failed.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#991B1B', marginBottom: 8 }}>Errores ({result.failed.length})</p>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12, maxHeight: 160, overflowY: 'auto' }}>
                    {result.failed.map((f) => (
                      <div key={f.row} style={{ fontSize: 12, color: '#991B1B', marginBottom: 4 }}>
                        <strong>Fila {f.row}</strong> · {f.email} — {f.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Import view ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Template download */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={14} color="#64748B" />
                  <span style={{ fontSize: 12, color: '#475569' }}>Formato: <code style={{ fontSize: 11 }}>first_name, last_name, email, username</code></span>
                </div>
                <button type="button" onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'none', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 11, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Download size={12} /> Plantilla
                </button>
              </div>

              {/* File drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                style={{ border: '2px dashed #CBD5E1', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: '#FAFAFA', transition: 'border-color .15s' }}
              >
                <Upload size={24} color="#94A3B8" style={{ marginBottom: 8 }} />
                <p style={{ fontSize: 13, color: '#475569', margin: '0 0 4px', fontWeight: 500 }}>
                  {fileName || 'Haz clic o arrastra un archivo CSV'}
                </p>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>Solo archivos .csv · Máx 200 filas</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {/* Role selector */}
              {rows.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>ROL A ASIGNAR</label>
                  <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Seleccionar rol…</option>
                    {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}

              {/* Preview table */}
              {rows.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', margin: 0 }}>
                      Vista previa · {rows.length} filas
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {validRows.length > 0   && <span style={{ fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={11} /> {validRows.length} válidas</span>}
                      {invalidRows.length > 0 && <span style={{ fontSize: 11, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: 3 }}><AlertCircle size={11} /> {invalidRows.length} con error</span>}
                    </div>
                  </div>
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['Nombre', 'Apellido', 'Email', 'Username', ''].map((h) => (
                            <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#64748B', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} style={{ background: row._valid ? '#fff' : '#FEF2F2' }}>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #F1F5F9' }}>{row.first_name}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #F1F5F9' }}>{row.last_name}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #F1F5F9' }}>{row.email}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #F1F5F9', color: '#94A3B8' }}>{row.username ?? '—'}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #F1F5F9' }}>
                              {row._valid
                                ? <CheckCircle2 size={13} color="#15803d" />
                                : <span title={row._error}><AlertCircle size={13} color="#B91C1C" /></span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importMut.isError && (
                <p style={{ fontSize: 12, color: '#B91C1C', margin: 0 }}>
                  {(importMut.error as Error)?.message ?? 'Error al importar'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {result ? (
            <button type="button" onClick={onClose} style={{ padding: '8px 20px', background: '#6366F1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cerrar
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} style={{ padding: '8px 14px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => importMut.mutate()}
                disabled={!canSubmit}
                style={{ padding: '8px 18px', background: canSubmit ? '#6366F1' : '#A5B4FC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
              >
                {importMut.isPending ? 'Importando…' : `Importar ${validRows.length} usuario${validRows.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
