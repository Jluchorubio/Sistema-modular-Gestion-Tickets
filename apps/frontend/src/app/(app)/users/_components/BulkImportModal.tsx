'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';
import { usersService } from '@/services/users.service';
import mstyles from '@/components/ui/modal.module.css';

/* ── CSV template ─────────────────────────────────────────────────────────── */

const TEMPLATE_HEADERS = ['first_name', 'last_name', 'email', 'username', 'is_superadmin'];
const TEMPLATE_EXAMPLE = [
  ['Juan', 'Pérez', 'juan.perez@empresa.com', 'jperez', 'false'],
  ['María', 'García', 'maria.garcia@empresa.com', 'mgarcia', 'false'],
];

function downloadTemplate() {
  const rows = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]
    .map((r) => r.join(','))
    .join('\r\n');
  const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'plantilla_usuarios.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ── CSV / simple-table parser ────────────────────────────────────────────── */

interface ParsedRow {
  first_name:   string;
  last_name:    string;
  email:        string;
  username:     string;
  is_superadmin: boolean;
  _valid:       boolean;
  _errors:      string[];
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Find header row (skip BOM)
  const headerLine = lines[0].replace(/^﻿/, '');
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  const idx = {
    first_name:   headers.indexOf('first_name'),
    last_name:    headers.indexOf('last_name'),
    email:        headers.indexOf('email'),
    username:     headers.indexOf('username'),
    is_superadmin: headers.indexOf('is_superadmin'),
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return lines.slice(1).map((line): ParsedRow => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const get   = (i: number) => (i >= 0 ? cells[i] ?? '' : '');

    const first_name    = get(idx.first_name);
    const last_name     = get(idx.last_name);
    const email         = get(idx.email).toLowerCase();
    const username      = get(idx.username);
    const superRaw      = get(idx.is_superadmin).toLowerCase();
    const is_superadmin = superRaw === 'true' || superRaw === '1' || superRaw === 'sí' || superRaw === 'si';

    const errors: string[] = [];
    if (!first_name) errors.push('Nombre requerido');
    if (!last_name)  errors.push('Apellido requerido');
    if (!email)      errors.push('Email requerido');
    else if (!EMAIL_RE.test(email)) errors.push('Email inválido');

    return { first_name, last_name, email, username, is_superadmin, _valid: errors.length === 0, _errors: errors };
  });
}

/* ── Types ────────────────────────────────────────────────────────────────── */

interface ImportResult {
  created: number;
  failed:  { row: number; email: string; error: string }[];
  total:   number;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function BulkImportModal({ onClose }: { onClose: () => void }) {
  const qc          = useQueryClient();
  const fileRef     = useRef<HTMLInputElement>(null);
  const [rows, setRows]         = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult]     = useState<ImportResult | null>(null);

  const validRows   = rows.filter((r) => r._valid);
  const invalidRows = rows.filter((r) => !r._valid);

  const importMut = useMutation({
    mutationFn: () =>
      usersService.bulkImport(
        validRows.map(({ first_name, last_name, email, username, is_superadmin }) => ({
          first_name, last_name, email,
          username:     username || undefined,
          is_superadmin,
        })),
      ),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRows(parseCSV(text));
    };
    reader.readAsText(file, 'UTF-8');
  }

  const canImport = validRows.length > 0 && !importMut.isPending && !result;

  return (
    <div className={mstyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={mstyles.modal} style={{ maxWidth: 720, width: '95vw' }}>
        {/* Header */}
        <div className={mstyles.header}>
          <p className={mstyles.title}>Importar usuarios</p>
          <button className={mstyles.closeBtn} type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Step 1 — Plantilla */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
              Paso 1 — Descarga la plantilla
            </p>
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 12px', lineHeight: 1.6 }}>
              Descarga el archivo CSV, complétalo en Excel o Google Sheets y vuélvelo a subir.
              Los campos <strong>first_name</strong>, <strong>last_name</strong> y <strong>email</strong> son obligatorios.
              Usa <code style={{ background: '#E2E8F0', borderRadius: 4, padding: '1px 5px', fontSize: 11 }}>false</code> en <strong>is_superadmin</strong> para usuarios normales.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', background: '#f1f5f9', color: '#0e2235',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12,
                fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <Download size={13} />
              Descargar plantilla_usuarios.csv
            </button>
          </div>

          {/* Step 2 — Upload */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
              Paso 2 — Sube el archivo
            </p>
            <div
              style={{
                border: '2px dashed #CBD5E1', borderRadius: 10, padding: '24px 16px',
                textAlign: 'center', cursor: 'pointer', background: '#fff',
                transition: 'border-color .15s',
              }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  setFileName(file.name);
                  setResult(null);
                  const reader = new FileReader();
                  reader.onload = (ev) => setRows(parseCSV(ev.target?.result as string));
                  reader.readAsText(file, 'UTF-8');
                }
              }}
            >
              <Upload size={22} style={{ color: '#94A3B8', marginBottom: 8 }} />
              <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
                {fileName
                  ? <><strong style={{ color: '#0F172A' }}>{fileName}</strong> — {rows.length} fila{rows.length !== 1 ? 's' : ''} detectada{rows.length !== 1 ? 's' : ''}</>
                  : 'Arrastra tu archivo CSV aquí o haz clic para seleccionar'
                }
              </p>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>Solo archivos .csv</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={onFile}
            />
          </div>

          {/* Preview table */}
          {rows.length > 0 && !result && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Vista previa
                </p>
                {validRows.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 99, padding: '2px 8px' }}>
                    {validRows.length} válido{validRows.length !== 1 ? 's' : ''}
                  </span>
                )}
                {invalidRows.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 99, padding: '2px 8px' }}>
                    {invalidRows.length} con error{invalidRows.length !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9' }}>
                      {['', 'Nombre', 'Apellido', 'Email', 'Username', 'Superadmin'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F1F5F9', background: row._valid ? '#fff' : '#FFF5F5' }}>
                        <td style={{ padding: '7px 10px', width: 24 }}>
                          {row._valid
                            ? <CheckCircle2 size={13} style={{ color: '#22C55E' }} />
                            : <XCircle     size={13} style={{ color: '#EF4444' }} />
                          }
                        </td>
                        <td style={{ padding: '7px 12px', color: '#0F172A' }}>{row.first_name || <em style={{ color: '#EF4444' }}>vacío</em>}</td>
                        <td style={{ padding: '7px 12px', color: '#0F172A' }}>{row.last_name  || <em style={{ color: '#EF4444' }}>vacío</em>}</td>
                        <td style={{ padding: '7px 12px', color: '#0F172A' }}>{row.email      || <em style={{ color: '#EF4444' }}>vacío</em>}</td>
                        <td style={{ padding: '7px 12px', color: '#64748B' }}>{row.username   || '—'}</td>
                        <td style={{ padding: '7px 12px', color: '#64748B' }}>{row.is_superadmin ? 'Sí' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {invalidRows.length > 0 && (
                <div style={{ marginTop: 8, padding: '10px 14px', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 8 }}>
                  {invalidRows.map((r, i) => (
                    <p key={i} style={{ fontSize: 11, color: '#EF4444', margin: i > 0 ? '3px 0 0' : 0 }}>
                      <strong>Fila {rows.indexOf(r) + 2}:</strong> {r._errors.join(' · ')}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{
                padding: '14px 18px',
                background: result.failed.length === 0 ? '#DCFCE7' : '#FEF3C7',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {result.failed.length === 0
                  ? <CheckCircle2 size={18} style={{ color: '#16A34A' }} />
                  : <AlertTriangle size={18} style={{ color: '#D97706' }} />
                }
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    {result.created} usuario{result.created !== 1 ? 's' : ''} creado{result.created !== 1 ? 's' : ''}
                    {result.failed.length > 0 && ` · ${result.failed.length} fallido${result.failed.length !== 1 ? 's' : ''}`}
                  </p>
                  <p style={{ fontSize: 11, color: '#64748B', margin: '2px 0 0' }}>
                    Contraseña temporal: <code style={{ background: '#E2E8F0', borderRadius: 4, padding: '1px 5px' }}>Ticket2026!</code>
                  </p>
                </div>
              </div>
              {result.failed.length > 0 && (
                <div style={{ padding: '12px 18px', maxHeight: 180, overflowY: 'auto' }}>
                  {result.failed.map((f) => (
                    <p key={f.row} style={{ fontSize: 12, color: '#EF4444', margin: '0 0 4px' }}>
                      <strong>Fila {f.row} ({f.email}):</strong> {f.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {importMut.isError && (
            <p style={{ color: '#EF4444', fontSize: 12 }}>
              Error al importar. Verifica el archivo e intenta de nuevo.
            </p>
          )}

          {/* Actions */}
          <div className={mstyles.actions}>
            <button type="button" className={mstyles.actCancel} onClick={onClose}>
              {result ? 'Cerrar' : 'Cancelar'}
            </button>
            {!result && (
              <button
                type="button"
                className={mstyles.actSubmit}
                disabled={!canImport}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending
                  ? 'Importando…'
                  : `Importar ${validRows.length} usuario${validRows.length !== 1 ? 's' : ''}`
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
