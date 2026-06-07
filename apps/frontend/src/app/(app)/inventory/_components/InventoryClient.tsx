'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check, ChevronDown, Plus, X, QrCode, Package, User, Clock, Pencil,
  Trash2, Search, AlertTriangle, Upload, Printer,
  Boxes, CheckCircle2, Wrench, Ban, LayoutGrid, List, AlignJustify,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { usersService } from '@/services/users.service';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';
import {
  inventoryService,
  type AssetListItem, type AssetDetail, type AssetStatus, type CreateAssetDto,
  type AssetAssignment, type AssetHistoryEntry, type AssetTicket,
  ASSET_STATUS_LABELS, ASSET_STATUS_COLORS, ASSET_ACTION_LABELS, ASSET_ACTION_COLORS,
} from '@/services/inventory.service';
import { ticketsService } from '@/services/tickets.service';
import { modulesService, type FieldDef } from '@/services/modules.service';
import { usePermission } from '@/hooks/usePermission';
import { fmtDate } from '@/lib/formatters';

/* ── Types ───────────────────────────────────────────────────────────────── */
type ViewMode  = 'card' | 'list' | 'summary';
type ScopeKey  = 'all' | 'disponible' | 'attention' | 'baja';
type DrawerTab = 'general' | 'relaciones' | 'tickets' | 'historial';

/* ── FSM ─────────────────────────────────────────────────────────────────── */
const FSM_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  disponible:    ['en_reparacion', 'dado_de_baja'],
  asignado:      ['en_reparacion', 'dado_de_baja'],
  en_reparacion: ['disponible', 'dado_de_baja'],
  dado_de_baja:  [],
};
const FSM_LABELS: Partial<Record<AssetStatus, string>> = {
  en_reparacion: 'Enviar a reparación',
  dado_de_baja:  'Dar de baja',
  disponible:    'Marcar disponible',
};
const FSM_COLORS: Partial<Record<AssetStatus, string>> = {
  en_reparacion: '#F59E0B',
  dado_de_baja:  '#EF4444',
  disponible:    '#22C55E',
};
const PRIORITY_COLORS: Record<string, string> = {
  critica: '#EF4444', alta: '#F97316', media: '#F59E0B', baja: '#22C55E',
};

/* ── Shared style tokens ─────────────────────────────────────────────────── */
const C = {
  navy:    '#0e2235',
  coral:   '#FF5E3A',
  green:   '#20c933',
  border:  '#E8EDF3',
  muted:   '#94A3B8',
  surface: '#F8FAFC',
  text:    '#1E293B',
  sub:     '#64748B',
};

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 7, fontSize: 12,
  border: `1px solid ${C.border}`, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', background: '#fff', color: C.text,
};
const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
  color: C.muted, display: 'block', marginBottom: 5,
};
const SECTION_HEAD: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: '.12em',
  textTransform: 'uppercase', color: C.coral, margin: '0 0 3px',
};

/* ── StatusBadge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status, size = 'sm' }: { status: AssetStatus; size?: 'sm' | 'md' }) {
  const color = ASSET_STATUS_COLORS[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: size === 'md' ? '4px 10px' : '3px 8px',
      borderRadius: 99, fontWeight: 700,
      fontSize: size === 'md' ? 11 : 10,
      background: `${color}14`, color,
      border: `1px solid ${color}30`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

/* ── QrModal ─────────────────────────────────────────────────────────────── */
function QrModal({ assetId, assetName, onClose }: { assetId: string; assetName: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['asset-qr', assetId],
    queryFn:  () => inventoryService.getQr(assetId),
    staleTime: 10 * 60_000,
  });
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', textAlign: 'center', maxWidth: 290, width: '100%', position: 'relative', boxShadow: '0 24px 60px rgba(14,34,53,.18)' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
          <X size={13} />
        </button>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: `${C.coral}14`, display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
          <QrCode size={20} style={{ color: C.coral }} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 3px' }}>{assetName}</p>
        <p style={{ fontSize: 11, color: C.muted, margin: '0 0 18px' }}>Código QR del activo</p>
        {isLoading && <div style={{ height: 180, display: 'grid', placeItems: 'center', color: C.muted, fontSize: 12 }}>Generando…</div>}
        {data?.qr_image && (
          <>
            <img src={data.qr_image} alt="QR" style={{ width: 180, height: 180, margin: '0 auto', display: 'block', borderRadius: 8, border: `1px solid ${C.border}` }} />
            <p style={{ fontSize: 10, color: C.muted, marginTop: 12, fontFamily: 'monospace', letterSpacing: '.04em' }}>{data.qr_code}</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── BulkQrPrintModal ────────────────────────────────────────────────────── */
function BulkQrPrintModal({
  assets,
  onClose,
}: {
  assets: Array<{ id: string; name: string; qr_code: string }>;
  onClose: () => void;
}) {
  const queries = useQueries({
    queries: assets.map(a => ({
      queryKey: ['asset-qr', a.id],
      queryFn:  () => inventoryService.getQr(a.id),
      staleTime: 10 * 60_000,
    })),
  });

  const loading = queries.some(q => q.isLoading);
  const loaded  = queries.filter(q => q.data).length;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.65)', zIndex: 80,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
               backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <style>{`@media print {
        body > * { visibility: hidden; }
        #bulk-qr-sheet, #bulk-qr-sheet * { visibility: visible; }
        #bulk-qr-sheet { position: fixed; inset: 0; overflow: visible;
          background: #fff; padding: 24px; z-index: 9999;
          display: grid !important;
          grid-template-columns: repeat(3, 1fr); gap: 16px;
          align-content: start; }
      }`}</style>
      <div
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 700,
                 maxHeight: '88vh', display: 'flex', flexDirection: 'column',
                 boxShadow: '0 28px 70px rgba(14,34,53,.22)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={SECTION_HEAD}>Impresión masiva</p>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: C.navy, margin: 0 }}>
              {loading
                ? `Cargando QRs… (${loaded}/${assets.length})`
                : `${assets.length} código${assets.length !== 1 ? 's' : ''} QR listos`}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                       borderRadius: 8, border: 'none',
                       background: loading ? C.muted : C.navy, color: '#fff',
                       fontSize: 12, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
                       fontFamily: 'inherit', opacity: loading ? .6 : 1 }}
            >
              <Printer size={13} /> Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`,
                       background: '#fff', cursor: 'pointer', display: 'grid',
                       placeItems: 'center', color: C.muted }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div
          id="bulk-qr-sheet"
          style={{ flex: 1, overflowY: 'auto', padding: 20,
                   display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}
        >
          {assets.map((a, i) => {
            const qData = queries[i]?.data;
            return (
              <div key={a.id} style={{ border: `1px solid ${C.border}`, borderRadius: 9,
                                       padding: '14px 10px', textAlign: 'center', background: '#fff' }}>
                {qData?.qr_image ? (
                  <img src={qData.qr_image} alt="QR"
                    style={{ width: 140, height: 140, display: 'block', margin: '0 auto 8px', borderRadius: 6 }} />
                ) : (
                  <div style={{ width: 140, height: 140, margin: '0 auto 8px', borderRadius: 6,
                                background: C.surface, display: 'grid', placeItems: 'center' }}>
                    <QrCode size={32} style={{ color: C.border }} />
                  </div>
                )}
                <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, margin: '0 0 3px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: 0, fontFamily: 'monospace', letterSpacing: '.04em' }}>
                  {a.qr_code}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── ScanModal ───────────────────────────────────────────────────────────── */
function ScanModal({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [query, setQuery]     = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 80); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim(); if (!q) return;
    setLoading(true); setError('');
    try {
      const results = await inventoryService.getAll(undefined, undefined, q);
      if (!results.length) { setError('No se encontró ningún activo con ese código o serial.'); return; }
      onClose(); onOpen(results[0].id);
    } catch { setError('Error al buscar el activo.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 400, padding: '24px', position: 'relative', boxShadow: '0 24px 60px rgba(14,34,53,.18)' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}><X size={13} /></button>
        <p style={SECTION_HEAD}>QR / Serial</p>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '0 0 6px' }}>Buscar activo físico</h2>
        <p style={{ fontSize: 12, color: C.sub, margin: '0 0 18px', lineHeight: 1.55 }}>Ingresa el QR, número de serie o nombre del activo.</p>
        <form onSubmit={handleSubmit}>
          <div style={{ background: C.surface, border: `2px dashed ${C.coral}40`, borderRadius: 10, padding: '18px', textAlign: 'center', marginBottom: 12 }}>
            <QrCode size={36} style={{ color: C.navy, opacity: .3, display: 'block', margin: '0 auto 6px' }} />
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>Área de escaneo</p>
          </div>
          <input ref={ref} value={query} onChange={e => setQuery(e.target.value)} placeholder="Código QR, serial o nombre…"
            style={{ ...INPUT, textAlign: 'center', fontSize: 13, marginBottom: 10 }} />
          {error && <p style={{ fontSize: 11, color: '#EF4444', marginBottom: 10, textAlign: 'center' }}>{error}</p>}
          <button type="submit" disabled={!query.trim() || loading}
            style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: C.coral, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!query.trim() || loading) ? .55 : 1, transition: 'opacity .15s' }}>
            {loading ? 'Buscando…' : 'Abrir activo'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── BulkImportModal ─────────────────────────────────────────────────────── */
function BulkImportModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows]     = useState('');
  const [result, setResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const [error, setError]   = useState('');

  const { data: categories }   = useQuery({ queryKey: ['ticket-categories', moduleId],   queryFn: () => ticketsService.getCategories(moduleId),   staleTime: 5 * 60_000 });
  const { data: environments } = useQuery({ queryKey: ['ticket-environments', moduleId], queryFn: () => ticketsService.getEnvironments(moduleId), staleTime: 5 * 60_000 });

  const importMut = useMutation({
    mutationFn: async () => {
      const lines  = rows.trim().split('\n').filter(l => l.trim());
      const parsed = lines.map(line => {
        const [name, category_id, environment_id, serial_number, description] = line.split(',').map(s => s.trim());
        return { name, category_id, environment_id, serial_number: serial_number || undefined, description: description || undefined };
      });
      return inventoryService.bulkImport(moduleId, parsed);
    },
    onSuccess: (data) => { setResult(data); if (data.created > 0) qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error en importación'),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative', boxShadow: '0 24px 60px rgba(14,34,53,.18)' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}><X size={13} /></button>
        <p style={SECTION_HEAD}>Importación masiva</p>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '0 0 16px' }}>Importar activos vía CSV</h2>
        {!result ? (
          <>
            <div style={{ background: C.surface, borderRadius: 8, padding: '12px 14px', marginBottom: 14, fontSize: 11, color: C.sub, lineHeight: 1.7, border: `1px solid ${C.border}` }}>
              <strong style={{ display: 'block', color: C.navy, marginBottom: 4 }}>Formato por línea (separado por coma):</strong>
              <code style={{ fontFamily: 'monospace', fontSize: 10, color: C.coral }}>nombre, category_id, environment_id, serial (opcional), descripción (opcional)</code>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.muted }}>Categorías:</span>
                {(categories ?? []).slice(0, 4).map((c: any) => <span key={c.id} style={{ fontSize: 10, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 7px', color: C.sub }}>{c.name}</span>)}
              </div>
            </div>
            <textarea value={rows} onChange={e => setRows(e.target.value)}
              placeholder={'Laptop Dell XPS, cat-id, env-id, SN-001\nMonitor 27", cat-id, env-id'}
              style={{ ...INPUT, minHeight: 130, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }} />
            {error && <p style={{ fontSize: 11, color: '#EF4444', margin: '8px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>Cancelar</button>
              <button type="button" disabled={!rows.trim() || importMut.isPending} onClick={() => importMut.mutate()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, border: 'none', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!rows.trim() || importMut.isPending) ? .6 : 1 }}>
                <Upload size={13} />{importMut.isPending ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ background: result.created > 0 ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${result.created > 0 ? '#BBF7D0' : '#FECACA'}`, borderRadius: 10, padding: '16px', marginBottom: 14, textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: result.created > 0 ? '#16A34A' : '#EF4444', margin: '0 0 4px' }}>{result.created} activo{result.created !== 1 ? 's' : ''} importado{result.created !== 1 ? 's' : ''}</p>
              {result.errors.length > 0 && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{result.errors.length} error{result.errors.length !== 1 ? 'es' : ''}</p>}
            </div>
            {result.errors.map(e => <div key={e.row} style={{ padding: '6px 10px', background: '#FEF2F2', borderRadius: 6, marginBottom: 4, fontSize: 11, color: '#EF4444' }}>Fila {e.row}: {e.message}</div>)}
            <button type="button" onClick={onClose} style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 8, border: 'none', background: C.navy, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CreateModal ─────────────────────────────────────────────────────────── */
function CreateModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories }   = useQuery({ queryKey: ['inv-categories', moduleId],      queryFn: () => modulesService.getCategories(moduleId),  staleTime: 5 * 60_000 });
  const { data: environments } = useQuery({ queryKey: ['ticket-environments', moduleId], queryFn: () => ticketsService.getEnvironments(moduleId), staleTime: 5 * 60_000 });
  const [form,  setForm]  = useState<Partial<CreateAssetDto>>({ module_id: moduleId });
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const selectedCategory = useMemo(
    () => (categories ?? []).find((c: any) => c.id === form.category_id),
    [categories, form.category_id],
  );
  const fieldSchema: FieldDef[] = useMemo(
    () => selectedCategory?.field_schema ?? [],
    [selectedCategory],
  );

  const createMut = useMutation({
    mutationFn: () => {
      const specsPayload = Object.fromEntries(
        Object.entries(specs).filter(([, v]) => v !== ''),
      );
      return inventoryService.create({
        ...(form as CreateAssetDto),
        specifications: Object.keys(specsPayload).length ? specsPayload : undefined,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear el activo.'),
  });

  function set(key: keyof CreateAssetDto, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    if (key === 'category_id') setSpecs({});
  }
  function setSpec(key: string, val: string) { setSpecs(s => ({ ...s, [key]: val })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim())   { setError('Nombre requerido.'); return; }
    if (!form.category_id)    { setError('Categoría requerida.'); return; }
    if (!form.environment_id) { setError('Ambiente requerido.'); return; }
    const missing = fieldSchema.filter(f => f.required && !specs[f.key]?.trim());
    if (missing.length > 0) { setError(`Campo requerido: ${missing[0].label}`); return; }
    setError(''); createMut.mutate();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative', boxShadow: '0 24px 60px rgba(14,34,53,.18)' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}><X size={13} /></button>
        <p style={SECTION_HEAD}>Registro rápido</p>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '0 0 20px' }}>Nuevo activo</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div><label style={LABEL}>Nombre *</label><input type="text" value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Ej: Laptop Dell XPS 15" maxLength={255} style={INPUT} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={LABEL}>Categoría *</label>
              <select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value)} style={INPUT}>
                <option value="">Seleccionar…</option>
                {(categories ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.parent_id ? `  ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div><label style={LABEL}>Ambiente *</label>
              <select value={form.environment_id ?? ''} onChange={e => set('environment_id', e.target.value)} style={INPUT}>
                <option value="">Seleccionar…</option>
                {(environments ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div><label style={LABEL}>Número de serie</label><input type="text" value={form.serial_number ?? ''} onChange={e => set('serial_number', e.target.value)} placeholder="SN-XXXX-0000" style={INPUT} /></div>
          <div><label style={LABEL}>Descripción</label><textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Descripción del activo…" rows={2} style={{ ...INPUT, resize: 'vertical' }} /></div>

          {/* Dynamic fields from category field_schema */}
          {fieldSchema.length > 0 && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px' }}>
                Campos de {selectedCategory?.name}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {fieldSchema.map(f => (
                  <div key={f.key}>
                    <label style={LABEL}>{f.label}{f.required ? ' *' : ''}</label>
                    {f.type === 'select' && f.options ? (
                      <select value={specs[f.key] ?? ''} onChange={e => setSpec(f.key, e.target.value)} style={INPUT}>
                        <option value="">Seleccionar…</option>
                        {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === 'boolean' ? (
                      <select value={specs[f.key] ?? ''} onChange={e => setSpec(f.key, e.target.value)} style={INPUT}>
                        <option value="">Seleccionar…</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        value={specs[f.key] ?? ''}
                        onChange={e => setSpec(f.key, e.target.value)}
                        style={INPUT}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p style={{ fontSize: 11, color: '#EF4444', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>Cancelar</button>
            <button type="submit" disabled={createMut.isPending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, border: 'none', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: createMut.isPending ? .7 : 1 }}>
              <Plus size={13} />{createMut.isPending ? 'Registrando…' : 'Registrar activo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── ViewModeDropdown ────────────────────────────────────────────────────── */
function ViewModeDropdown({ value, onChange }: { value: ViewMode; onChange: (m: ViewMode) => void }) {
  const opts: [ViewMode, string, React.ReactNode][] = [
    ['card',    'Tarjeta', <LayoutGrid size={12} />],
    ['list',    'Lista',   <List size={12} />],
    ['summary', 'Resumen', <AlignJustify size={12} />],
  ];
  const label = opts.find(([m]) => m === value)?.[1] ?? 'Tarjeta';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" style={{ height: 34, minWidth: 116, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.coral}`, background: C.coral, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
        {label}<ChevronDown size={12} />
      </button>
      <div className="inv-vm-menu" style={{ position: 'absolute', right: 0, top: 38, width: 136, padding: '4px 0', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: '0 10px 30px rgba(14,34,53,.1)', zIndex: 30 }}>
        {opts.map(([mode, lbl, icon]) => (
          <button key={mode} type="button" onClick={() => onChange(mode)} style={{ width: '100%', padding: '8px 12px', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: value === mode ? C.navy : C.sub, fontFamily: 'inherit' }}>
            <Check size={12} style={{ color: value === mode ? C.coral : 'transparent' }} />
            {icon}{lbl}
          </button>
        ))}
      </div>
      <style jsx>{`.inv-vm-menu{opacity:0;pointer-events:none;transform:translateY(-4px);transition:opacity .12s,transform .12s} div:hover>.inv-vm-menu,div:focus-within>.inv-vm-menu{opacity:1;pointer-events:auto;transform:translateY(0)}`}</style>
    </div>
  );
}

/* ── AssetCard (grid view) — estilo mockup ───────────────────────────────── */
function AssetCard({
  asset, onOpen, onFullDetail, selected, onSelect,
}: {
  asset: AssetListItem; onOpen: () => void; onFullDetail: () => void;
  selected?: boolean; onSelect?: () => void;
}) {
  const color   = ASSET_STATUS_COLORS[asset.status];
  const [hov, setHov] = useState(false);
  return (
    <article
      style={{
        background: '#fff', borderRadius: 8, position: 'relative',
        border: `1px solid ${selected ? C.coral : hov ? 'rgba(255,94,58,.36)' : C.border}`,
        boxShadow: hov ? '0 14px 34px rgba(14,34,53,.09)' : '0 1px 4px rgba(14,34,53,.04)',
        transform: hov ? 'translateY(-2px)' : 'none',
        transition: 'border-color .18s, box-shadow .18s, transform .18s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {onSelect && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onSelect(); }}
          style={{ position: 'absolute', top: 10, left: 10, zIndex: 2,
                   width: 20, height: 20, borderRadius: 5,
                   border: `2px solid ${selected ? C.coral : C.border}`,
                   background: selected ? C.coral : '#fff',
                   cursor: 'pointer', display: 'grid', placeItems: 'center',
                   transition: 'background .14s, border-color .14s' }}
        >
          {selected && <Check size={11} style={{ color: '#fff', strokeWidth: 3 }} />}
        </button>
      )}
      <div style={{ padding: '16px' }}>
        {/* Icon + status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 8, background: `${color}12`, display: 'grid', placeItems: 'center', border: `1px solid ${color}20` }}>
            <Package size={19} style={{ color }} />
          </div>
          <StatusBadge status={asset.status} />
        </div>
        {/* Name */}
        <button type="button" onClick={onOpen} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 4 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: hov ? C.coral : C.navy, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color .15s', lineHeight: 1.3 }}>{asset.name}</p>
        </button>
        {/* Meta */}
        <p style={{ fontSize: 10, color: C.muted, margin: '0 0 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', letterSpacing: '.03em' }}>
          {asset.qr_code}
        </p>
        {/* Location + env */}
        <div style={{ background: C.surface, borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.environment_name}</p>
              <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.location_name}</p>
            </div>
            <button type="button" onClick={onOpen} title="Vista rápida"
              style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.coral, flexShrink: 0 }}>
              <QrCode size={13} />
            </button>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${C.surface}99`, borderRadius: '0 0 8px 8px' }}>
        <button type="button" onClick={onOpen}
          style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted, fontFamily: 'inherit' }}>
          Quick view
        </button>
        <button type="button" onClick={onFullDetail}
          style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: C.navy, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}>
          Ver detalles <span style={{ color: C.coral, fontSize: 12 }}>→</span>
        </button>
      </div>
    </article>
  );
}

/* ── AssetListRow ────────────────────────────────────────────────────────── */
function AssetListRow({
  asset, onOpen, onFullDetail, selected, onSelect,
}: {
  asset: AssetListItem; onOpen: () => void; onFullDetail: () => void;
  selected?: boolean; onSelect?: () => void;
}) {
  const color = ASSET_STATUS_COLORS[asset.status];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${onSelect ? '28px ' : ''}minmax(0,1fr) 140px 130px 110px auto`, gap: 12, alignItems: 'center', padding: '11px 14px', background: '#fff', border: `1px solid ${selected ? C.coral : C.border}`, borderLeft: `3px solid ${selected ? C.coral : color}`, borderRadius: 9 }}>
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${selected ? C.coral : C.border}`,
                   background: selected ? C.coral : '#fff', cursor: 'pointer',
                   display: 'grid', placeItems: 'center', flexShrink: 0 }}
        >
          {selected && <Check size={11} style={{ color: '#fff', strokeWidth: 3 }} />}
        </button>
      )}
      <button type="button" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 11, border: 0, background: 'transparent', cursor: 'pointer', minWidth: 0, textAlign: 'left', fontFamily: 'inherit' }}>
        <span style={{ width: 40, height: 40, borderRadius: 8, background: `${color}12`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Package size={15} style={{ color }} />
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 13, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{asset.name}</strong>
          <small style={{ display: 'block', fontSize: 10, color: C.muted, marginTop: 2, fontWeight: 600 }}>{asset.category_name}</small>
        </span>
      </button>
      <span style={{ fontSize: 11, color: C.sub, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.environment_name}</span>
      <span style={{ fontSize: 11, color: C.sub, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.location_name}</span>
      <StatusBadge status={asset.status} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onOpen} style={{ border: `1px solid ${C.border}`, borderRadius: 7, background: '#fff', color: C.navy, padding: '6px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Vista rápida</button>
        <button type="button" onClick={onFullDetail} style={{ border: 'none', borderRadius: 7, background: C.navy, color: '#fff', padding: '6px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Ficha →</button>
      </div>
    </div>
  );
}

/* ── AssetSummaryItem ────────────────────────────────────────────────────── */
function AssetSummaryItem({
  asset, onOpen, selected, onSelect,
}: {
  asset: AssetListItem; onOpen: () => void;
  selected?: boolean; onSelect?: () => void;
}) {
  const color = ASSET_STATUS_COLORS[asset.status];
  return (
    <div
      style={{ padding: '14px 16px', borderRadius: 9, border: `1px solid ${selected ? C.coral : C.border}`,
               borderLeft: `3px solid ${selected ? C.coral : color}`, background: '#fff',
               display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', position: 'relative',
               boxSizing: 'border-box' }}
    >
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected ? C.coral : C.border}`,
                   background: selected ? C.coral : '#fff', cursor: 'pointer', flexShrink: 0,
                   display: 'grid', placeItems: 'center' }}
        >
          {selected && <Check size={10} style={{ color: '#fff', strokeWidth: 3 }} />}
        </button>
      )}
      <button type="button" onClick={onOpen}
        style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', cursor: 'pointer',
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                 textAlign: 'left', fontFamily: 'inherit', padding: 0 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '.8')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 9, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 4 }}>{asset.category_name}</span>
          <strong style={{ display: 'block', fontSize: 13, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{asset.name}</strong>
          <small style={{ display: 'block', fontSize: 10, color: C.muted, marginTop: 3, fontWeight: 500 }}>{asset.location_name}</small>
        </span>
        <StatusBadge status={asset.status} />
      </button>
    </div>
  );
}

/* ── MetricsRow ──────────────────────────────────────────────────────────── */
function MetricsRow({ assets }: { assets: AssetListItem[] }) {
  const total      = assets.length;
  const disponible = assets.filter(a => a.status === 'disponible').length;
  const asignado   = assets.filter(a => a.status === 'asignado').length;
  const reparacion = assets.filter(a => a.status === 'en_reparacion').length;
  const baja       = assets.filter(a => a.status === 'dado_de_baja').length;

  const cards: [string, number, string, React.ReactNode][] = [
    ['Total activos',   total,      C.navy,         <Boxes size={15} />],
    ['Disponibles',     disponible, '#22C55E',       <CheckCircle2 size={15} />],
    ['Asignados',       asignado,   '#3B82F6',       <User size={15} />],
    ['Mantenimiento',   reparacion, '#F59E0B',       <Wrench size={15} />],
    ['Dados de baja',   baja,       C.muted,         <Ban size={15} />],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
      {cards.map(([label, value, color, icon]) => (
        <div key={label} style={{ background: '#fff', borderRadius: 9, border: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>{label}</p>
            <span style={{ color, opacity: .7 }}>{icon}</span>
          </div>
          <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
        </div>
      ))}
    </div>
  );
}

/* ── AssetDrawer ─────────────────────────────────────────────────────────── */
interface DrawerProps {
  assetId: string; moduleId: string; canEdit: boolean; canDelete: boolean;
  onClose: () => void; onFullDetail: () => void;
}
function AssetDrawer({ assetId, moduleId, canEdit, canDelete, onClose, onFullDetail }: DrawerProps) {
  const qc = useQueryClient();
  const [tab,            setTab]            = useState<DrawerTab>('general');
  const [showQr,         setShowQr]         = useState(false);
  const [editing,        setEditing]        = useState(false);
  const [editForm,       setEditForm]       = useState({ name: '', description: '', serial_number: '' });
  const [assignUid,      setAssignUid]      = useState('');
  const [assignNote,     setAssignNote]     = useState('');
  const [unassignReason, setUnassignReason] = useState('');
  const [transReason,    setTransReason]    = useState('');
  const [actionErr,      setActionErr]      = useState('');

  const inv = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['asset-detail', assetId] });
    qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] });
    qc.invalidateQueries({ queryKey: ['asset-history', assetId] });
  }, [qc, assetId]);

  const { data: asset, isLoading } = useQuery<AssetDetail>({ queryKey: ['asset-detail', assetId], queryFn: () => inventoryService.getOne(assetId), staleTime: 30_000 });
  const { data: assignment }       = useQuery<AssetAssignment | null>({ queryKey: ['asset-assignment', assetId], queryFn: () => inventoryService.getCurrentAssignment(assetId), staleTime: 30_000, enabled: tab === 'general' && asset?.status === 'asignado' });
  const { data: moduleUsers = [] } = useQuery({ queryKey: ['module-members', moduleId], queryFn: () => usersService.getModuleUsers(moduleId), staleTime: 5 * 60_000, enabled: tab === 'general' && canEdit && asset?.status === 'disponible' });
  const { data: history = [] }     = useQuery<AssetHistoryEntry[]>({ queryKey: ['asset-history', assetId], queryFn: () => inventoryService.getHistory(assetId), staleTime: 30_000, enabled: tab === 'historial' });
  const { data: assetTickets = [] } = useQuery<AssetTicket[]>({ queryKey: ['asset-tickets', assetId], queryFn: () => inventoryService.getAssetTickets(assetId), staleTime: 60_000, enabled: tab === 'tickets' });

  const updateMut   = useMutation({ mutationFn: () => inventoryService.update(assetId, { name: editForm.name.trim() || undefined, description: editForm.description.trim() || undefined, serial_number: editForm.serial_number.trim() || undefined }), onSuccess: () => { setEditing(false); setActionErr(''); inv(); }, onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error') });
  const deleteMut   = useMutation({ mutationFn: () => inventoryService.remove(assetId), onSuccess: () => { onClose(); qc.invalidateQueries({ queryKey: ['inventory'] }); }, onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error') });
  const assignMut   = useMutation({ mutationFn: () => inventoryService.assign(assetId, { user_id: assignUid, notes: assignNote || undefined }), onSuccess: () => { setActionErr(''); setAssignUid(''); setAssignNote(''); inv(); }, onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error') });
  const unassignMut = useMutation({ mutationFn: () => inventoryService.unassign(assetId, unassignReason || undefined), onSuccess: () => { setActionErr(''); setUnassignReason(''); inv(); }, onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error') });
  const transMut    = useMutation({ mutationFn: (s: AssetStatus) => inventoryService.transition(assetId, { status: s, reason: transReason || undefined }), onSuccess: () => { setActionErr(''); setTransReason(''); inv(); }, onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error') });

  const tabs: [DrawerTab, string][] = [['general', 'General'], ['relaciones', 'Relaciones'], ['tickets', 'Tickets'], ['historial', 'Historial']];

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.25)', zIndex: 101, backdropFilter: 'blur(1px)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 540, background: '#fff', zIndex: 102, display: 'flex', flexDirection: 'column', boxShadow: '-6px 0 40px rgba(14,34,53,.14)', borderLeft: `1px solid ${C.border}` }}>

        {/* Header */}
        <div style={{ background: C.navy, padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.coral, margin: '0 0 5px' }}>
                {asset?.module_name ?? 'Inventario'} · {asset?.category_name ?? '…'}
              </p>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                {isLoading ? 'Cargando…' : (asset?.name ?? '…')}
              </h2>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', margin: 0, fontFamily: 'monospace', letterSpacing: '.04em' }}>
                {asset ? `${asset.qr_code}` : '…'}
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.1)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0, transition: 'background .14s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}>
              <X size={15} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {tabs.map(([t, label]) => (
              <button key={t} type="button" onClick={() => { setTab(t); setActionErr(''); }}
                style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '7px 7px 0 0', background: tab === t ? '#fff' : 'rgba(255,255,255,.07)', color: tab === t ? C.navy : 'rgba(255,255,255,.6)', transition: 'background .12s, color .12s' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {isLoading && <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando…</div>}
          {asset && (
            <>
              {/* ── GENERAL ── */}
              {tab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Status + QR */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <StatusBadge status={asset.status} size="md" />
                    <button type="button" onClick={() => setShowQr(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', color: C.coral, fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                      <QrCode size={13} /> Ver QR
                    </button>
                  </div>

                  {/* Info card */}
                  <div style={{ background: C.surface, borderRadius: 9, padding: '14px', border: `1px solid ${C.border}` }}>
                    {asset.description && <p style={{ fontSize: 12, color: C.sub, margin: '0 0 12px', lineHeight: 1.6 }}>{asset.description}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 12 }}>
                      {([['Módulo', asset.module_name], ['Categoría', asset.category_name], ['Ambiente', asset.environment_name], ['Sede', asset.location_name], ['QR Code', asset.qr_code], ['Serial', asset.serial_number ?? '—']] as [string, string][]).map(([l, v]) => (
                        <div key={l}>
                          <span style={{ color: C.muted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</span>
                          <p style={{ color: C.navy, fontWeight: 700, margin: '2px 0 0', fontFamily: l === 'QR Code' || l === 'Serial' ? 'monospace' : 'inherit', fontSize: l === 'QR Code' || l === 'Serial' ? 10 : 12 }}>{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Specs */}
                  {asset.specifications && Object.keys(asset.specifications).length > 0 && (
                    <div style={{ background: C.surface, borderRadius: 9, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                      <p style={{ ...LABEL, marginBottom: 10 }}>Especificaciones</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(asset.specifications).map(([k, v]) => (
                          <span key={k} style={{ fontSize: 11, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 9px', color: C.sub }}>
                            <strong style={{ color: C.navy }}>{k}:</strong> {String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assignment info */}
                  {asset.status === 'asignado' && assignment && (
                    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '13px 14px' }}>
                      <p style={{ ...LABEL, color: '#3B82F6', marginBottom: 8 }}>Asignado a</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F', margin: '0 0 2px' }}>{assignment.user_name}</p>
                      <p style={{ fontSize: 11, color: '#3B82F6', margin: '0 0 5px' }}>{assignment.user_email}</p>
                      <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>Por <strong>{assignment.assigned_by_name}</strong> · {fmtDate(assignment.assigned_at)}</p>
                    </div>
                  )}

                  {/* Assign (disponible) */}
                  {canEdit && asset.status === 'disponible' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={LABEL}>Asignar a usuario</p>
                      <select style={INPUT} value={assignUid} onChange={e => setAssignUid(e.target.value)}>
                        <option value="">Seleccionar usuario…</option>
                        {(moduleUsers as any[]).map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.role_name}</option>)}
                      </select>
                      <input style={INPUT} placeholder="Notas (opcional)…" value={assignNote} onChange={e => setAssignNote(e.target.value)} />
                      <button type="button" disabled={!assignUid || assignMut.isPending} onClick={() => assignMut.mutate()}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: 'none', background: '#3B82F6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!assignUid || assignMut.isPending) ? .5 : 1 }}>
                        <User size={12} />{assignMut.isPending ? 'Asignando…' : 'Asignar activo'}
                      </button>
                    </div>
                  )}

                  {/* Unassign */}
                  {canEdit && asset.status === 'asignado' && assignment && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input style={INPUT} placeholder="Motivo de devolución (opcional)…" value={unassignReason} onChange={e => setUnassignReason(e.target.value)} />
                      <button type="button" disabled={unassignMut.isPending} onClick={() => unassignMut.mutate()}
                        style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #EF444466', background: '#EF444411', color: '#EF4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {unassignMut.isPending ? 'Devolviendo…' : 'Registrar devolución'}
                      </button>
                    </div>
                  )}

                  {/* FSM */}
                  {canEdit && asset.status !== 'dado_de_baja' && FSM_TRANSITIONS[asset.status].length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={LABEL}>Cambiar estado</p>
                      <input style={INPUT} placeholder="Motivo (opcional)…" value={transReason} onChange={e => setTransReason(e.target.value)} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {FSM_TRANSITIONS[asset.status].map(s => { const c = FSM_COLORS[s] ?? C.muted; return (
                          <button key={s} type="button" disabled={transMut.isPending} onClick={() => transMut.mutate(s)}
                            style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: `1.5px solid ${c}55`, background: `${c}10`, color: c, cursor: 'pointer', fontFamily: 'inherit', opacity: transMut.isPending ? .6 : 1 }}>
                            {FSM_LABELS[s] ?? s}
                          </button>
                        ); })}
                      </div>
                    </div>
                  )}

                  {/* Edit / Delete */}
                  {(canEdit || canDelete) && asset.status !== 'dado_de_baja' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {canEdit && !editing && (
                        <button type="button" onClick={() => { setEditForm({ name: asset.name, description: asset.description ?? '', serial_number: asset.serial_number ?? '' }); setEditing(true); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.sub, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                      {canDelete && asset.status !== 'asignado' && (
                        <button type="button" disabled={deleteMut.isPending} onClick={() => { if (confirm(`¿Eliminar "${asset.name}"?`)) deleteMut.mutate(); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #FECACA', background: '#FEF2F2', color: '#EF4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <Trash2 size={12} />{deleteMut.isPending ? 'Eliminando…' : 'Eliminar'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Edit form */}
                  {editing && (
                    <div style={{ background: C.surface, borderRadius: 9, padding: 14, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div><label style={LABEL}>Nombre *</label><input style={INPUT} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div><label style={LABEL}>Serial</label><input style={INPUT} value={editForm.serial_number} onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))} /></div>
                      <div><label style={LABEL}>Descripción</label><textarea style={{ ...INPUT, minHeight: 68, resize: 'vertical' }} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" disabled={!editForm.name.trim() || updateMut.isPending} onClick={() => updateMut.mutate()}
                          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!editForm.name.trim() || updateMut.isPending) ? .6 : 1 }}>
                          {updateMut.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" onClick={() => setEditing(false)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  {actionErr && <p style={{ fontSize: 11, color: '#EF4444' }}>{actionErr}</p>}

                  <button type="button" onClick={onFullDetail}
                    style={{ width: '100%', padding: '11px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', marginTop: 2 }}>
                    Ver ficha completa →
                  </button>
                </div>
              )}

              {/* ── RELACIONES ── */}
              {tab === 'relaciones' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: C.surface, borderRadius: 9, padding: '14px', border: `1px solid ${C.border}` }}>
                    <p style={LABEL}>Jerarquía del activo</p>
                    <div style={{ marginTop: 10, borderLeft: `2px solid ${C.coral}35`, paddingLeft: 14 }}>
                      <div style={{ padding: '10px 12px', borderRadius: 7, background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'inline-block' }}>Activo raíz</div>
                      <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Las relaciones se configuran desde la ficha completa.</p>
                    </div>
                  </div>
                  <div style={{ background: C.surface, borderRadius: 9, padding: '14px', border: `1px solid ${C.border}` }}>
                    <p style={LABEL}>Nodo organizacional</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '6px 0 0' }}>{asset.environment_name} · {asset.location_name}</p>
                  </div>
                </div>
              )}

              {/* ── TICKETS ── */}
              {tab === 'tickets' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {assetTickets.length === 0 ? (
                    <div style={{ padding: '44px 0', textAlign: 'center' }}>
                      <CheckCircle2 size={28} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
                      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Sin tickets asociados a este activo.</p>
                    </div>
                  ) : assetTickets.map(ticket => {
                    const pColor = PRIORITY_COLORS[ticket.priority] ?? C.muted;
                    return (
                      <div key={ticket.id} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '12px 14px', background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.coral, fontFamily: 'monospace' }}>#{ticket.id.slice(0, 8)}</span>
                          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 7px', borderRadius: 4, background: ticket.is_final ? '#F0FDF4' : '#FFF7ED', color: ticket.is_final ? '#16A34A' : '#C2410C' }}>{ticket.state_label}</span>
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: C.muted }}>
                          <span style={{ fontWeight: 700, color: pColor }}>● {ticket.priority}</span>
                          <span>{ticket.creator_name} · {fmtDate(ticket.created_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── HISTORIAL ── */}
              {tab === 'historial' && (
                <div>
                  {history.length === 0 ? (
                    <div style={{ padding: '44px 0', textAlign: 'center' }}>
                      <Clock size={26} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
                      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Sin eventos registrados.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {history.map((h, i) => {
                        const color = ASSET_ACTION_COLORS[h.action] ?? C.muted;
                        const label = ASSET_ACTION_LABELS[h.action] ?? h.action;
                        return (
                          <div key={h.id} style={{ display: 'flex', gap: 12, paddingBottom: 16, position: 'relative' }}>
                            {i < history.length - 1 && <div style={{ position: 'absolute', left: 13, top: 26, width: 2, height: 'calc(100% - 6px)', background: C.border }} />}
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${color}14`, border: `2px solid ${color}35`, display: 'grid', placeItems: 'center', flexShrink: 0, zIndex: 1 }}>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                            </div>
                            <div style={{ flex: 1, paddingTop: 3 }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 2px' }}>{label} {h.user_name && h.user_name !== h.actor_name && <span style={{ fontWeight: 500, color: C.sub }}>{h.user_name}</span>}</p>
                              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 2px' }}>por {h.actor_name} · {fmtDate(h.created_at)}</p>
                              {h.reason && <p style={{ fontSize: 11, color: C.sub, margin: 0, fontStyle: 'italic' }}>{h.reason}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {showQr && asset && <QrModal assetId={assetId} assetName={asset.name} onClose={() => setShowQr(false)} />}
    </>
  );
}

/* ── InventoryClient (main) ──────────────────────────────────────────────── */
export function InventoryClient() {
  const router = useRouter();
  const { modules } = useModules();
  const inventoryId = modules?.find(isInventoryModule)?.id;
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const activeModules = useMemo(() => {
    const roles = user?.module_roles?.filter(r => r.status === 'active') ?? [];
    const seen  = new Set<string>();
    const out: { module_id: string; module_name: string; role_name: string }[] = [];
    for (const r of roles) { if (!seen.has(r.module_id)) { seen.add(r.module_id); out.push(r); } }
    return out;
  }, [user]);

  const canCreate = usePermission('inventario:items:create');
  const canEdit   = usePermission('inventario:items:edit');
  const canDelete = usePermission('inventario:items:delete');

  /* ── Module admin info (for contact button) ── */
  const { data: inventoryMembers } = useQuery({
    queryKey: ['inventory-module-admin', inventoryId],
    queryFn:  () => usersService.getModuleUsers(inventoryId!),
    enabled:  !!inventoryId && canEdit,
    staleTime: 10 * 60_000,
  });
  const inventoryAdmin = (inventoryMembers as any[] | undefined)?.find(
    (m) => m.role_name === 'admin_modulo',
  ) ?? null;
  const adminName  = inventoryAdmin ? `${inventoryAdmin.first_name} ${inventoryAdmin.last_name}` : null;
  const adminEmail = inventoryAdmin?.email ?? null;

  const [selectedModule,  setSelectedModule]  = useState(activeModules[0]?.module_id ?? '');
  const [scope,           setScope]           = useState<ScopeKey>('all');
  const [search,          setSearch]          = useState('');
  const [debouncedQ,      setDebouncedQ]      = useState('');
  const [categoryFilter,  setCategoryFilter]  = useState('');
  const [viewMode,        setViewMode]        = useState<ViewMode>('card');
  const [drawerAssetId,   setDrawerAssetId]   = useState<string | null>(null);
  const [showCreate,      setShowCreate]      = useState(false);
  const [showScan,        setShowScan]        = useState(false);
  const [showBulk,        setShowBulk]        = useState(false);
  const [selectMode,      setSelectMode]      = useState(false);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [showBulkQr,      setShowBulkQr]      = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toggleSelectAsset(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function exitSelectMode() { setSelectMode(false); setSelectedIds(new Set()); }

  useEffect(() => {
    const stored = window.localStorage.getItem('inventory:assets:view') as ViewMode | null;
    if (stored) setViewMode(stored);
  }, []);

  useEffect(() => {
    if (activeModules.length > 0 && !selectedModule) setSelectedModule(activeModules[0].module_id);
  }, [activeModules, selectedModule]);

  function changeViewMode(v: ViewMode) { setViewMode(v); window.localStorage.setItem('inventory:assets:view', v); }
  function handleSearch(v: string) {
    setSearch(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setDebouncedQ(v.trim()), 350);
  }

  const { data: allAssets = [], isLoading } = useQuery({
    queryKey: ['inventory', selectedModule],
    queryFn:  () => inventoryService.getAll(selectedModule || undefined),
    staleTime: 60_000,
    enabled:  !!selectedModule || isSuperadmin,
  });

  const filtered = useMemo(() => {
    let list = allAssets;
    if (scope === 'disponible') list = list.filter(a => a.status === 'disponible');
    else if (scope === 'attention') list = list.filter(a => a.status === 'en_reparacion');
    else if (scope === 'baja') list = list.filter(a => a.status === 'dado_de_baja');
    if (categoryFilter) list = list.filter(a => a.category_name === categoryFilter);
    if (debouncedQ) {
      const q = debouncedQ.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.serial_number ?? '').toLowerCase().includes(q) ||
        a.qr_code.toLowerCase().includes(q) ||
        a.environment_name.toLowerCase().includes(q) ||
        a.category_name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allAssets, scope, categoryFilter, debouncedQ]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allAssets.forEach(a => { counts[a.category_name] = (counts[a.category_name] ?? 0) + 1; });
    return counts;
  }, [allAssets]);

  const scopeCounts = useMemo(() => ({
    all:        allAssets.length,
    disponible: allAssets.filter(a => a.status === 'disponible').length,
    attention:  allAssets.filter(a => a.status === 'en_reparacion').length,
    baja:       allAssets.filter(a => a.status === 'dado_de_baja').length,
  }), [allAssets]);

  const SCOPES: [ScopeKey, string, React.ReactNode][] = [
    ['all',        'Todos los activos',   <Boxes size={13} />],
    ['disponible', 'Disponibles',         <CheckCircle2 size={13} />],
    ['attention',  'Requieren atención',  <AlertTriangle size={13} />],
    ['baja',       'Dados de baja',       <Ban size={13} />],
  ];

  const goToDetail = (id: string) => router.push(`/inventory/${id}`);

  return (
    <ModuleLayout moduleId={inventoryId || selectedModule || undefined} title="Inventario" description="Registro y trazabilidad de activos organizacionales." isSuperadmin={isSuperadmin} hideInfo alwaysOpen>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.coral, margin: '0 0 3px' }}>
            Módulo · Inventario
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: '0 0 4px', lineHeight: 1.2 }}>Activos operativos</h1>
          {adminName && (
            <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>
              Administrador responsable: <strong style={{ color: '#334155', fontWeight: 700 }}>{adminName}</strong>
            </p>
          )}
        </div>
        {adminEmail && (
          <a
            href={`mailto:${adminEmail}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(255,94,58,0.09)', color: '#ff5e3a', border: '1px solid rgba(255,94,58,0.25)', borderRadius: 10, fontSize: 11.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            Contactar administrador
          </a>
        )}
      </div>

      {/* Module selector */}
      {activeModules.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {!isSuperadmin && (
            <button type="button" onClick={() => setSelectedModule('')}
              style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, border: `1.5px solid ${!selectedModule ? C.navy : C.border}`, background: !selectedModule ? C.navy : '#fff', color: !selectedModule ? '#fff' : C.sub, cursor: 'pointer', fontFamily: 'inherit' }}>
              Todos
            </button>
          )}
          {activeModules.map(m => (
            <button key={m.module_id} type="button" onClick={() => setSelectedModule(m.module_id)}
              style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, border: `1.5px solid ${selectedModule === m.module_id ? C.navy : C.border}`, background: selectedModule === m.module_id ? C.navy : '#fff', color: selectedModule === m.module_id ? '#fff' : C.sub, cursor: 'pointer', fontFamily: 'inherit' }}>
              {m.module_name}
            </button>
          ))}
        </div>
      )}

      {/* Metrics */}
      <MetricsRow assets={allAssets} />

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '252px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>

        {/* ── SIDEBAR ── */}
        <aside style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px', position: 'sticky', top: 16, boxShadow: '0 2px 8px rgba(14,34,53,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <p style={SECTION_HEAD}>Navegación</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: C.navy, margin: 0 }}>Inventario</p>
            </div>
            <button type="button" onClick={() => { setScope('all'); setSearch(''); setDebouncedQ(''); setCategoryFilter(''); }}
              style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, padding: '4px 9px', fontSize: 10, fontWeight: 700, color: C.sub, cursor: 'pointer', fontFamily: 'inherit' }}>
              Limpiar
            </button>
          </div>

          {/* Scope nav */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 18 }}>
            {SCOPES.map(([key, label, icon]) => {
              const active = scope === key;
              return (
                <button key={key} type="button" onClick={() => setScope(key)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', borderRadius: 7, border: 'none', background: active ? C.navy : 'transparent', color: active ? '#fff' : C.sub, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, textAlign: 'left', transition: 'background .13s, color .13s' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{icon}{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, opacity: .65 }}>{scopeCounts[key]}</span>
                </button>
              );
            })}
          </nav>

          {/* Category summary */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginBottom: 18 }}>
            <p style={{ ...LABEL, marginBottom: 8 }}>Tipos de activo</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {Object.entries(categoryCounts).map(([cat, count]) => (
                <button key={cat} type="button" onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 7, border: 'none', background: categoryFilter === cat ? `${C.coral}12` : 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: categoryFilter === cat ? C.coral : C.sub, textAlign: 'left', transition: 'background .12s' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Package size={11} />{cat}</span>
                  <span style={{ fontSize: 10 }}>{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Admin panel */}
          {(canEdit || canCreate) && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <p style={{ ...LABEL, marginBottom: 8 }}>Panel técnico</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button type="button" onClick={() => setShowScan(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: C.navy }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><QrCode size={12} style={{ color: C.coral }} />Escanear QR</span>
                  <span style={{ color: C.muted, fontSize: 10 }}>→</span>
                </button>
                <button type="button" onClick={() => setShowBulk(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', borderRadius: 7, border: 'none', background: C.navy, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Upload size={12} style={{ color: C.green }} />Importación masiva</span>
                  <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 10 }}>→</span>
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div>
          {/* Scope title */}
          <div style={{ marginBottom: 13 }}>
            <p style={{ ...SECTION_HEAD, margin: '0 0 2px' }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</p>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: C.navy, margin: 0 }}>
              {scope === 'all' ? 'Todos los activos' : scope === 'disponible' ? 'Activos disponibles' : scope === 'attention' ? 'Requieren atención' : 'Dados de baja'}
            </h2>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
              <input type="text" value={search} onChange={e => handleSearch(e.target.value)} placeholder="Nombre, serial, QR…"
                style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff', color: C.text } as React.CSSProperties} />
            </div>
            <ViewModeDropdown value={viewMode} onChange={changeViewMode} />
            {canCreate && selectedModule && (
              <button type="button" onClick={() => setShowCreate(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: 'none', background: C.navy, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                <Plus size={12} style={{ color: C.green }} /> Registrar activo
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={() => setShowScan(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: `1px solid ${C.border}`, background: '#fff', color: C.navy, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                <QrCode size={12} style={{ color: C.coral }} /> Escanear QR
              </button>
            )}
            <button
              type="button"
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: `1px solid ${selectMode ? C.coral : C.border}`, background: selectMode ? `${C.coral}12` : '#fff', color: selectMode ? C.coral : C.sub, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s' }}>
              <Printer size={12} />
              {selectMode && selectedIds.size > 0 ? `${selectedIds.size} sel.` : selectMode ? 'Cancelar' : 'Imprimir QRs'}
            </button>
          </div>

          {/* States */}
          {isLoading && <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando activos…</div>}

          {!isLoading && filtered.length === 0 && (
            <div style={{ padding: '60px 24px', textAlign: 'center', background: '#fff', borderRadius: 10, border: `2px dashed ${C.border}` }}>
              <Package size={30} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 4px', fontWeight: 600 }}>
                {debouncedQ ? `Sin resultados para "${debouncedQ}"` : 'No hay activos en este filtro.'}
              </p>
              {canCreate && selectedModule && scope === 'all' && !debouncedQ && (
                <button type="button" onClick={() => setShowCreate(true)}
                  style={{ marginTop: 12, padding: '7px 16px', borderRadius: 7, border: 'none', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={12} /> Registrar primer activo
                </button>
              )}
            </div>
          )}

          {/* Grids */}
          {!isLoading && filtered.length > 0 && (
            <>
              {viewMode === 'card' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                  {filtered.map(a => (
                    <AssetCard key={a.id} asset={a}
                      onOpen={() => !selectMode && setDrawerAssetId(a.id)}
                      onFullDetail={() => !selectMode && goToDetail(a.id)}
                      selected={selectedIds.has(a.id)}
                      onSelect={selectMode ? () => toggleSelectAsset(a.id) : undefined}
                    />
                  ))}
                </div>
              )}
              {viewMode === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {filtered.map(a => (
                    <AssetListRow key={a.id} asset={a}
                      onOpen={() => !selectMode && setDrawerAssetId(a.id)}
                      onFullDetail={() => !selectMode && goToDetail(a.id)}
                      selected={selectedIds.has(a.id)}
                      onSelect={selectMode ? () => toggleSelectAsset(a.id) : undefined}
                    />
                  ))}
                </div>
              )}
              {viewMode === 'summary' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 7 }}>
                  {filtered.map(a => (
                    <AssetSummaryItem key={a.id} asset={a}
                      onOpen={() => !selectMode && setDrawerAssetId(a.id)}
                      selected={selectedIds.has(a.id)}
                      onSelect={selectMode ? () => toggleSelectAsset(a.id) : undefined}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Drawer + Modals */}
      {drawerAssetId && (
        <AssetDrawer assetId={drawerAssetId} moduleId={selectedModule || inventoryId || ''} canEdit={canEdit} canDelete={canDelete}
          onClose={() => setDrawerAssetId(null)}
          onFullDetail={() => { goToDetail(drawerAssetId!); setDrawerAssetId(null); }} />
      )}
      {showCreate && selectedModule && <CreateModal moduleId={selectedModule} onClose={() => setShowCreate(false)} />}
      {showScan   && <ScanModal onClose={() => setShowScan(false)} onOpen={id => setDrawerAssetId(id)} />}
      {showBulk   && selectedModule && <BulkImportModal moduleId={selectedModule} onClose={() => setShowBulk(false)} />}
      {showBulkQr && selectedIds.size > 0 && (
        <BulkQrPrintModal
          assets={filtered.filter(a => selectedIds.has(a.id)).map(a => ({ id: a.id, name: a.name, qr_code: a.qr_code }))}
          onClose={() => setShowBulkQr(false)}
        />
      )}

      {/* Floating selection bar */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: C.navy, color: '#fff', padding: '12px 20px', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12, zIndex: 60,
          boxShadow: '0 8px 30px rgba(14,34,53,.28)', whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>
            {selectedIds.size} activo{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => setShowBulkQr(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                     borderRadius: 8, border: 'none', background: C.coral, color: '#fff',
                     fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Printer size={12} /> Imprimir QRs
          </button>
          <button
            type="button"
            onClick={exitSelectMode}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.2)',
                     background: 'transparent', color: 'rgba(255,255,255,.7)',
                     fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancelar
          </button>
        </div>
      )}
    </ModuleLayout>
  );
}
