'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Download, CheckCircle2, XCircle, AlertTriangle,
  X, FileSpreadsheet, ChevronRight, Users, AlertCircle, SkipForward,
} from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import styles from './bulk-import.module.css';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface ParsedRow {
  _rowIndex:     number;
  first_name:    string;
  last_name:     string;
  email:         string;
  phone?:        string;
  document?:     string;
  employee_code?: string;
  position?:     string;
  department?:   string;
  site?:         string;
  global_role?:  string;
  _valid:        boolean;
  _warnings:     string[];
  _errors:       string[];
}

interface ImportResult {
  summary: { created: number; exists: number; errors: number; total: number };
  results: { email: string; status: 'created' | 'exists' | 'error'; detail?: string }[];
}

type Step = 1 | 2 | 3 | 4 | 5;

/* ── Constants ──────────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COLUMNS = [
  { key: 'first_name',    label: 'Nombre',     required: true  },
  { key: 'last_name',     label: 'Apellido',   required: true  },
  { key: 'email',         label: 'Correo',     required: true  },
  { key: 'phone',         label: 'Teléfono',   required: false },
  { key: 'document',      label: 'Documento',  required: false },
  { key: 'employee_code', label: 'Cód.',       required: false },
  { key: 'position',      label: 'Cargo',      required: false },
  { key: 'department',    label: 'Área',       required: false },
  { key: 'site',          label: 'Sede',       required: false },
  { key: 'global_role',   label: 'Rol',        required: false },
] as const;

const STEP_LABELS = ['Archivo', 'Vista previa', 'Validación', 'Confirmar', 'Resultado'];

/* ── Parsers ────────────────────────────────────────────────────────────────── */

function normalizeKey(raw: string): string {
  const h = raw.trim().toLowerCase();
  const aliases: Record<string, string> = {
    nombre: 'first_name', name: 'first_name',
    apellido: 'last_name', surname: 'last_name',
    correo: 'email', mail: 'email',
    telefono: 'phone', 'teléfono': 'phone', tel: 'phone',
    documento: 'document', cedula: 'document', 'cédula': 'document',
    cargo: 'position', puesto: 'position',
    area: 'department', 'área': 'department', departamento: 'department',
    sede: 'site', headquarters: 'site',
    rol: 'global_role', role: 'global_role',
    'código': 'employee_code', codigo: 'employee_code',
  };
  return aliases[h] ?? h;
}

function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = normalizeKey(h.replace(/^"|"$/g, ''));
    if (!(key in map)) map[key] = i;
  });
  return map;
}

function validateRow(partial: Partial<ParsedRow>, seenEmails: Set<string>): ParsedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!partial.first_name?.trim()) errors.push('Nombre requerido');
  if (!partial.last_name?.trim())  errors.push('Apellido requerido');
  const emailVal = partial.email?.trim().toLowerCase() ?? '';
  if (!emailVal) {
    errors.push('Correo requerido');
  } else if (!EMAIL_RE.test(emailVal)) {
    errors.push('Correo inválido');
  } else if (seenEmails.has(emailVal)) {
    warnings.push('Duplicado en el archivo');
  } else {
    seenEmails.add(emailVal);
  }
  return {
    _rowIndex: partial._rowIndex ?? 0,
    first_name:    partial.first_name?.trim() ?? '',
    last_name:     partial.last_name?.trim() ?? '',
    email:         emailVal,
    phone:         partial.phone     || undefined,
    document:      partial.document  || undefined,
    employee_code: partial.employee_code || undefined,
    position:      partial.position  || undefined,
    department:    partial.department || undefined,
    site:          partial.site      || undefined,
    global_role:   partial.global_role || undefined,
    _valid:    errors.length === 0,
    _errors:   errors,
    _warnings: warnings,
  };
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const rawHeaders = lines[0].replace(/^﻿/, '').split(',');
  const idx = buildHeaderMap(rawHeaders);
  const seen = new Set<string>();
  return lines.slice(1).map((line, i): ParsedRow => {
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const g = (key: string) => idx[key] !== undefined ? (cells[idx[key]] ?? '').trim() : '';
    return validateRow({
      _rowIndex: i + 2,
      first_name: g('first_name'), last_name: g('last_name'), email: g('email'),
      phone: g('phone') || undefined, document: g('document') || undefined,
      employee_code: g('employee_code') || undefined, position: g('position') || undefined,
      department: g('department') || undefined, site: g('site') || undefined,
      global_role: g('global_role') || undefined,
    }, seen);
  });
}

async function parseExcel(file: File): Promise<ParsedRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length < 2) return [];
  const idx = buildHeaderMap(raw[0].map(String));
  const seen = new Set<string>();
  return raw.slice(1)
    .filter(cells => cells.some(c => String(c).trim()))
    .map((cells, i): ParsedRow => {
      const g = (key: string) => idx[key] !== undefined ? String(cells[idx[key]] ?? '').trim() : '';
      return validateRow({
        _rowIndex: i + 2,
        first_name: g('first_name'), last_name: g('last_name'), email: g('email'),
        phone: g('phone') || undefined, document: g('document') || undefined,
        employee_code: g('employee_code') || undefined, position: g('position') || undefined,
        department: g('department') || undefined, site: g('site') || undefined,
        global_role: g('global_role') || undefined,
      }, seen);
    });
}

/* ── Template download (via Next.js API route — server-side ExcelJS) ─────────── */

function downloadTemplate() {
  const a = Object.assign(document.createElement('a'), {
    href:     '/api/bulk-import-template',
    download: 'plantilla_nexo_usuarios.xlsx',
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ── Error report ───────────────────────────────────────────────────────────── */

function downloadErrorReport(rows: ParsedRow[]) {
  const bad = rows.filter(r => !r._valid || r._warnings.length > 0);
  const csv = [
    ['Fila', 'Email', 'Nombre', 'Apellido', 'Errores', 'Advertencias'],
    ...bad.map(r => [String(r._rowIndex), r.email, r.first_name, r.last_name, r._errors.join('; '), r._warnings.join('; ')]),
  ].map(r => r.join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'nexo_errores_importacion.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Step bar ───────────────────────────────────────────────────────────────── */

function StepBar({ current }: { current: Step }) {
  return (
    <div className={styles.stepBar}>
      {STEP_LABELS.map((label, i) => {
        const num = (i + 1) as Step;
        const done   = num < current;
        const active = num === current;
        return (
          <div key={num} className={styles.stepItem}>
            <div className={`${styles.stepNum} ${done ? styles.stepDone : active ? styles.stepActive : styles.stepInactive}`}>
              {done ? <CheckCircle2 size={12} /> : num}
            </div>
            <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ''}`}>{label}</span>
            {i < STEP_LABELS.length - 1 && (
              <div className={`${styles.stepLine} ${done ? styles.stepLineDone : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

export function BulkImportModal({ onClose }: { onClose: () => void }) {
  const qc      = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step,    setStep]    = useState<Step>(1);
  const [file,    setFile]    = useState<File | null>(null);
  const [rows,    setRows]    = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [drag,    setDrag]    = useState(false);
  const [result,  setResult]  = useState<ImportResult | null>(null);

  const validRows = rows.filter(r => r._valid);
  const warnRows  = rows.filter(r => r._valid && r._warnings.length > 0);
  const errorRows = rows.filter(r => !r._valid);

  async function processFile(f: File) {
    setLoading(true);
    setFile(f);
    try {
      const parsed = (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))
        ? await parseExcel(f)
        : parseCSV(await f.text());
      setRows(parsed);
      setStep(2);
    } finally {
      setLoading(false);
    }
  }

  const importMut = useMutation({
    mutationFn: () =>
      systemConfigService.bulkImport(
        validRows.map(r => ({
          email:             r.email,
          first_name:        r.first_name,
          last_name:         r.last_name,
          phone:             r.phone,
          job_title:         r.position,
          department:        r.department,
          headquarters_name: r.site,
          global_role_name:  r.global_role,
        })),
      ),
    onSuccess: (data) => {
      setResult(data as ImportResult);
      qc.invalidateQueries({ queryKey: ['users'] });
      setStep(5);
    },
  });

  /* ── Step 1: Upload ─────────────────────────────────────────────────────── */

  function renderStep1() {
    return (
      <div className={styles.body}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Selecciona el archivo</h2>
          <p className={styles.stepDesc}>Soporta Excel (.xlsx) y CSV (.csv). Solo necesitas tres campos para empezar.</p>
        </div>

        <div
          className={`${styles.dropzone} ${drag ? styles.dropzoneDrag : ''} ${loading ? styles.dropzoneLoading : ''}`}
          onClick={() => !loading && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => {
            e.preventDefault(); setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) processFile(f);
          }}
        >
          {loading ? (
            <div className={styles.dropzoneSpinner}>
              <div className={styles.spinner} />
              <p>Procesando archivo…</p>
            </div>
          ) : (
            <>
              <div className={styles.dropzoneIcon}><FileSpreadsheet size={36} /></div>
              <p className={styles.dropzoneTitle}>Arrastra tu archivo aquí</p>
              <p className={styles.dropzoneSub}>o haz clic para seleccionar</p>
              <div className={styles.dropzoneBadges}><span>.xlsx</span><span>.csv</span></div>
            </>
          )}
        </div>

        <input
          ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        />

        <div className={styles.templateBox}>
          <div className={styles.templateInfo}>
            <FileSpreadsheet size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className={styles.templateTitle}>¿Primera vez? Descarga la plantilla Excel</p>
              <p className={styles.templateDesc}>Obligatorios: first_name, last_name, email — el resto es opcional.</p>
            </div>
          </div>
          <button type="button" className={styles.btnOutline} onClick={downloadTemplate}>
            <Download size={13} /> Descargar plantilla
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 2: Preview ────────────────────────────────────────────────────── */

  function renderStep2() {
    return (
      <div className={styles.body}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Vista previa</h2>
          <p className={styles.stepDesc}>
            <strong>{rows.length}</strong> registro{rows.length !== 1 ? 's' : ''} detectado{rows.length !== 1 ? 's' : ''} en <strong>{file?.name}</strong>
          </p>
        </div>

        <div className={styles.previewStats}>
          <span className={styles.statValid}><CheckCircle2 size={12} /> {validRows.length} válidos</span>
          {warnRows.length > 0 && <span className={styles.statWarn}><AlertTriangle size={12} /> {warnRows.length} advertencias</span>}
          {errorRows.length > 0 && <span className={styles.statError}><XCircle size={12} /> {errorRows.length} errores</span>}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th />
                {COLUMNS.map(c => (
                  <th key={c.key}>{c.label}{c.required && <span className={styles.req}>*</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row._rowIndex}
                  className={!row._valid ? styles.rowError : row._warnings.length > 0 ? styles.rowWarn : ''}
                >
                  <td className={styles.rowStatus}>
                    {!row._valid
                      ? <XCircle size={13} style={{ color: '#ef4444' }} />
                      : row._warnings.length > 0
                        ? <AlertTriangle size={13} style={{ color: '#f59e0b' }} />
                        : <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
                    }
                  </td>
                  {COLUMNS.map(c => (
                    <td key={c.key}>
                      {(row as Record<string, unknown>)[c.key]
                        ? String((row as Record<string, unknown>)[c.key])
                        : <span className={styles.emptyCell}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnGhost} onClick={() => { setStep(1); setRows([]); setFile(null); }}>
            Cambiar archivo
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => setStep(3)} disabled={validRows.length === 0}>
            Continuar <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 3: Validation ─────────────────────────────────────────────────── */

  function renderStep3() {
    const pureOk  = rows.filter(r => r._valid && r._warnings.length === 0);
    const warned  = rows.filter(r => r._valid && r._warnings.length > 0);
    const errored = rows.filter(r => !r._valid);
    const issues  = [...errored, ...warned];

    return (
      <div className={styles.body}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Validación</h2>
          <p className={styles.stepDesc}>Resumen antes de importar. Los errores serán omitidos automáticamente.</p>
        </div>

        <div className={styles.validCards}>
          <div className={`${styles.validCard} ${styles.validCardGreen}`}>
            <CheckCircle2 size={24} />
            <div>
              <span className={styles.validCount}>{pureOk.length}</span>
              <span className={styles.validLabel}>Válidos</span>
            </div>
          </div>
          {warned.length > 0 && (
            <div className={`${styles.validCard} ${styles.validCardYellow}`}>
              <AlertTriangle size={24} />
              <div>
                <span className={styles.validCount}>{warned.length}</span>
                <span className={styles.validLabel}>Duplicados en archivo</span>
              </div>
            </div>
          )}
          <div className={`${styles.validCard} ${styles.validCardRed}`}>
            <XCircle size={24} />
            <div>
              <span className={styles.validCount}>{errored.length}</span>
              <span className={styles.validLabel}>Con errores</span>
            </div>
          </div>
        </div>

        {issues.length > 0 && (
          <div className={styles.errorList}>
            <div className={styles.errorListHeader}>
              <p>Detalle de problemas</p>
              <button type="button" className={styles.btnOutline} onClick={() => downloadErrorReport(rows)}>
                <Download size={12} /> Descargar reporte
              </button>
            </div>
            <div className={styles.errorListBody}>
              {issues.slice(0, 60).map(row => (
                <div key={row._rowIndex} className={styles.errorRow}>
                  <span className={styles.errorRowNum}>Fila {row._rowIndex}</span>
                  <span className={styles.errorRowEmail}>{row.email || '—'}</span>
                  <span className={styles.errorRowMsg}>{[...row._errors, ...row._warnings].join(' · ')}</span>
                </div>
              ))}
              {issues.length > 60 && (
                <p className={styles.errorMore}>…y {issues.length - 60} más. Descarga el reporte completo.</p>
              )}
            </div>
          </div>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.btnGhost} onClick={() => setStep(2)}>Atrás</button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={validRows.length === 0}
            onClick={() => setStep(4)}
          >
            <SkipForward size={14} />
            Continuar con {validRows.length} válidos
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 4: Confirm ────────────────────────────────────────────────────── */

  function renderStep4() {
    const skipped = rows.length - validRows.length;
    return (
      <div className={styles.body}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Confirmar importación</h2>
          <p className={styles.stepDesc}>Resumen ejecutivo. Esta acción creará los usuarios en el sistema.</p>
        </div>

        <div className={styles.confirmTable}>
          <div className={styles.confirmRow}>
            <div className={styles.confirmIcon} style={{ background: '#dcfce7', color: '#16a34a' }}>
              <Users size={20} />
            </div>
            <div>
              <p className={styles.confirmValue}>{validRows.length}</p>
              <p className={styles.confirmLabel}>Usuarios a crear</p>
            </div>
          </div>
          {skipped > 0 && (
            <div className={styles.confirmRow}>
              <div className={styles.confirmIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
                <AlertCircle size={20} />
              </div>
              <div>
                <p className={styles.confirmValue}>{skipped}</p>
                <p className={styles.confirmLabel}>Omitidos por errores</p>
              </div>
            </div>
          )}
          <div className={styles.confirmRow}>
            <div className={styles.confirmIcon} style={{ background: '#f1f5f9', color: '#64748b' }}>
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <p className={styles.confirmValue}>{rows.length}</p>
              <p className={styles.confirmLabel}>Total en archivo</p>
            </div>
          </div>
        </div>

        <div className={styles.confirmNote}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Contraseña temporal: <code>Ticket2026!</code> — Los usuarios deberán cambiarla al iniciar sesión por primera vez.</span>
        </div>

        {importMut.isError && (
          <p style={{ color: '#ef4444', fontSize: 12, margin: 0 }}>
            Error al importar. Verifica el archivo e intenta de nuevo.
          </p>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.btnGhost} onClick={() => setStep(3)}>Atrás</button>
          <button
            type="button"
            className={styles.btnImport}
            disabled={importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            {importMut.isPending
              ? <><div className={styles.spinnerSm} /> Importando…</>
              : <>Importar {validRows.length} usuario{validRows.length !== 1 ? 's' : ''}</>
            }
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 5: Result ─────────────────────────────────────────────────────── */

  function renderStep5() {
    if (!result) return null;
    const { summary } = result;
    const total      = summary.total || validRows.length;
    const pct        = total > 0 ? Math.round((summary.created / total) * 100) : 0;
    const allOk      = summary.errors === 0;
    const errResults = result.results?.filter(r => r.status === 'error') ?? [];
    const extResults = result.results?.filter(r => r.status === 'exists') ?? [];

    return (
      <div className={styles.body}>
        <div className={`${styles.resultBanner} ${allOk ? styles.resultBannerOk : styles.resultBannerWarn}`}>
          {allOk ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
          <div>
            <p className={styles.resultTitle}>
              {allOk ? 'Importación completada' : 'Importación completada con advertencias'}
            </p>
            <p className={styles.resultSub}>{summary.created} usuario{summary.created !== 1 ? 's' : ''} creado{summary.created !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%`, background: allOk ? '#22c55e' : '#f59e0b' }} />
          </div>
          <span className={styles.progressPct}>{pct}%</span>
        </div>

        <div className={styles.resultStats}>
          {[
            { num: summary.created, label: 'Creados',    color: '#22c55e' },
            { num: summary.exists,  label: 'Ya existían',color: '#f59e0b' },
            { num: summary.errors,  label: 'Errores',    color: '#ef4444' },
            { num: summary.total,   label: 'Total',      color: '#64748b' },
          ].map(s => (
            <div key={s.label} className={styles.statBox}>
              <span className={styles.statBoxNum} style={{ color: s.color }}>{s.num}</span>
              <span className={styles.statBoxLabel}>{s.label}</span>
            </div>
          ))}
        </div>

        {(errResults.length > 0 || extResults.length > 0) && (
          <div className={styles.errorList}>
            <div className={styles.errorListHeader}><p>Detalle de problemas</p></div>
            <div className={styles.errorListBody}>
              {errResults.map((r, i) => (
                <div key={i} className={styles.errorRow}>
                  <span className={styles.errorRowNum} style={{ color: '#ef4444' }}>Error</span>
                  <span className={styles.errorRowEmail}>{r.email}</span>
                  <span className={styles.errorRowMsg}>{r.detail ?? 'Error desconocido'}</span>
                </div>
              ))}
              {extResults.map((r, i) => (
                <div key={i} className={styles.errorRow}>
                  <span className={styles.errorRowNum} style={{ color: '#f59e0b' }}>Existe</span>
                  <span className={styles.errorRowEmail}>{r.email}</span>
                  <span className={styles.errorRowMsg}>Ya registrado — omitido</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.btnPrimary} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.wizard}>
        <div className={styles.wizardHeader}>
          <div>
            <p className={styles.wizardTitle}>Importación masiva de usuarios</p>
            <p className={styles.wizardSub}>NEXO ITSM · Administración de usuarios</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <StepBar current={step} />

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </div>
    </div>
  );
}
