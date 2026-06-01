'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check, ChevronDown, Plus, X, QrCode, Package, User, Clock, Pencil,
  Trash2, Search, AlertTriangle, ArrowLeft, Upload, Shield,
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
import { ADMIN_ROLES } from '@/constants/roles';
import { fmtDate } from '@/lib/formatters';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Types                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

type ViewMode   = 'card' | 'list' | 'summary';
type ScopeKey   = 'all' | 'disponible' | 'attention' | 'baja';
type DrawerTab  = 'general' | 'relaciones' | 'tickets' | 'historial';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Constants                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

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
  critica: '#EF4444',
  alta:    '#F97316',
  media:   '#F59E0B',
  baja:    '#22C55E',
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Shared styles                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 12,
  border: '1px solid #E2E8F0', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', background: '#fff',
};

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4,
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* StatusBadge                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: AssetStatus }) {
  const color = ASSET_STATUS_COLORS[status];
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      textTransform: 'uppercase', letterSpacing: '.04em',
    }}>
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* QrModal                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

function QrModal({ assetId, assetName, onClose }: { assetId: string; assetName: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['asset-qr', assetId],
    queryFn:  () => inventoryService.getQr(assetId),
    staleTime: 10 * 60_000,
  });
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', textAlign: 'center', maxWidth: 300, width: '100%', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={15} /></button>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>{assetName}</p>
        <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 18px' }}>Código QR del activo</p>
        {isLoading && <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13 }}>Generando…</div>}
        {data?.qr_image && (
          <>
            <img src={data.qr_image} alt="QR" style={{ width: 180, height: 180, margin: '0 auto', display: 'block', borderRadius: 8 }} />
            <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 10, fontFamily: 'monospace' }}>{data.qr_code}</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* ScanModal — buscar por QR / serial / ID                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function ScanModal({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [query, setQuery]   = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const results = await inventoryService.getAll(undefined, undefined, q);
      if (!results.length) { setError('No se encontró ningún activo con ese código o serial.'); return; }
      onClose();
      onOpen(results[0].id);
    } catch {
      setError('Error al buscar el activo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={15} /></button>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 4px' }}>QR / Serial</p>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0e2235', margin: '0 0 6px' }}>Buscar activo físico</h2>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 16px', lineHeight: 1.5 }}>Ingresa el código QR, número de serie o ID del activo.</p>
        <form onSubmit={handleSubmit}>
          <div style={{ background: '#F8FAFC', border: '2px dashed #FF5E3A44', borderRadius: 8, padding: '20px', textAlign: 'center', marginBottom: 12 }}>
            <QrCode size={40} style={{ color: '#0e2235', margin: '0 auto 8px', display: 'block' }} />
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: 0 }}>Simulador de lectura</p>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ej: QR-INF-SRV-01, SN-XXXX, AST-..."
            style={{ ...INPUT, textAlign: 'center', fontSize: 13, marginBottom: 10, borderColor: '#CBD5E1' }}
          />
          {error && <p style={{ fontSize: 11, color: '#EF4444', marginBottom: 8, textAlign: 'center' }}>{error}</p>}
          <button type="submit" disabled={!query.trim() || loading} style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: '#FF5E3A', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!query.trim() || loading) ? .6 : 1 }}>
            {loading ? 'Buscando…' : 'Abrir activo'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* BulkImportModal                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function BulkImportModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState('');
  const [result, setResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const [error, setError] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['ticket-categories', moduleId],
    queryFn:  () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
  });
  const { data: environments } = useQuery({
    queryKey: ['ticket-environments', moduleId],
    queryFn:  () => ticketsService.getEnvironments(moduleId),
    staleTime: 5 * 60_000,
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const lines = rows.trim().split('\n').filter(l => l.trim());
      const parsed = lines.map(line => {
        const [name, category_id, environment_id, serial_number, description] = line.split(',').map(s => s.trim());
        return { name, category_id, environment_id, serial_number: serial_number || undefined, description: description || undefined };
      });
      return inventoryService.bulkImport(moduleId, parsed);
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.created > 0) qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error en importación'),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={15} /></button>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 4px' }}>Importación masiva</p>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0e2235', margin: '0 0 12px' }}>Importar activos (CSV)</h2>

        {!result ? (
          <>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>Formato por línea (separado por coma):</strong>
              <code style={{ fontFamily: 'monospace', fontSize: 10, color: '#0e2235' }}>nombre, category_id, environment_id, serial (opcional), descripción (opcional)</code>
              <div style={{ marginTop: 8 }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>Categorías disponibles:</strong>
                {(categories ?? []).slice(0, 5).map((c: any) => (
                  <span key={c.id} style={{ display: 'inline-block', background: '#E2E8F0', borderRadius: 4, padding: '1px 6px', marginRight: 4, marginBottom: 2, fontSize: 10 }}>{c.id.slice(0,8)}… = {c.name}</span>
                ))}
                <strong style={{ display: 'block', marginTop: 6, marginBottom: 4 }}>Ambientes disponibles:</strong>
                {(environments ?? []).slice(0, 5).map((e: any) => (
                  <span key={e.id} style={{ display: 'inline-block', background: '#E2E8F0', borderRadius: 4, padding: '1px 6px', marginRight: 4, marginBottom: 2, fontSize: 10 }}>{e.id.slice(0,8)}… = {e.name}</span>
                ))}
              </div>
            </div>
            <textarea
              value={rows}
              onChange={e => setRows(e.target.value)}
              placeholder={'Laptop Dell XPS, cat-id-aqui, env-id-aqui, SN-001\nMonitor LG 27", cat-id-aqui, env-id-aqui'}
              style={{ ...INPUT, minHeight: 140, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
            />
            {error && <p style={{ fontSize: 11, color: '#EF4444', margin: '8px 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Cancelar</button>
              <button type="button" disabled={!rows.trim() || importMut.isPending} onClick={() => importMut.mutate()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0e2235', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (!rows.trim() || importMut.isPending) ? .6 : 1 }}>
                <Upload size={13} />{importMut.isPending ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ background: result.created > 0 ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${result.created > 0 ? '#BBF7D0' : '#FECACA'}`, borderRadius: 8, padding: '14px', marginBottom: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: result.created > 0 ? '#16A34A' : '#EF4444', margin: '0 0 4px' }}>{result.created} activo{result.created !== 1 ? 's' : ''} importado{result.created !== 1 ? 's' : ''}</p>
              {result.errors.length > 0 && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{result.errors.length} error{result.errors.length !== 1 ? 'es' : ''}</p>}
            </div>
            {result.errors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {result.errors.map(e => (
                  <div key={e.row} style={{ padding: '6px 10px', background: '#FEF2F2', borderRadius: 6, marginBottom: 4, fontSize: 11, color: '#EF4444' }}>
                    Fila {e.row}: {e.message}
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={onClose} style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: '#0e2235', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* CreateModal                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function CreateModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ['ticket-categories', moduleId], queryFn: () => ticketsService.getCategories(moduleId), staleTime: 5 * 60_000 });
  const { data: environments } = useQuery({ queryKey: ['ticket-environments', moduleId], queryFn: () => ticketsService.getEnvironments(moduleId), staleTime: 5 * 60_000 });

  const [form, setForm] = useState<Partial<CreateAssetDto>>({ module_id: moduleId });
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: () => inventoryService.create(form as CreateAssetDto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear el activo.'),
  });

  function set(key: keyof CreateAssetDto, val: string) { setForm(f => ({ ...f, [key]: val })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim())   { setError('Nombre requerido.'); return; }
    if (!form.category_id)    { setError('Categoría requerida.'); return; }
    if (!form.environment_id) { setError('Ambiente requerido.'); return; }
    setError('');
    createMut.mutate();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={15} /></button>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 4px' }}>Registro rápido</p>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0e2235', margin: '0 0 20px' }}>Nuevo activo</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LABEL}>Nombre *</label>
            <input type="text" value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Ej: Laptop Dell XPS 15…" maxLength={255} style={INPUT} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Categoría *</label>
              <select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value)} style={INPUT}>
                <option value="">Seleccionar…</option>
                {(categories ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Ambiente *</label>
              <select value={form.environment_id ?? ''} onChange={e => set('environment_id', e.target.value)} style={INPUT}>
                <option value="">Seleccionar…</option>
                {(environments ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={LABEL}>Número de serie</label>
            <input type="text" value={form.serial_number ?? ''} onChange={e => set('serial_number', e.target.value)} placeholder="SN-XXXX-0000" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Descripción</label>
            <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Descripción del activo…" rows={3} style={{ ...INPUT, resize: 'vertical' }} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Cancelar</button>
            <button type="submit" disabled={createMut.isPending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0e2235', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: createMut.isPending ? .7 : 1 }}>
              <Plus size={13} />{createMut.isPending ? 'Registrando…' : 'Registrar activo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* ViewModeDropdown                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

function ViewModeDropdown({ value, onChange }: { value: ViewMode; onChange: (m: ViewMode) => void }) {
  const opts: [ViewMode, string, React.ReactNode][] = [
    ['card',    'Tarjeta', <LayoutGrid size={12} />],
    ['list',    'Lista',   <List size={12} />],
    ['summary', 'Resumen', <AlignJustify size={12} />],
  ];
  const label = opts.find(([m]) => m === value)?.[1] ?? 'Tarjeta';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" style={{ height: 34, minWidth: 116, padding: '0 12px', borderRadius: 6, border: '1px solid #FF5E3A', background: '#FF5E3A', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
        {label}<ChevronDown size={12} />
      </button>
      <div className="inv-view-menu" style={{ position: 'absolute', right: 0, top: 38, width: 140, padding: '4px 0', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 10px 24px rgba(0,0,0,.1)', zIndex: 30 }}>
        {opts.map(([mode, lbl, icon]) => (
          <button key={mode} type="button" onClick={() => onChange(mode)} style={{ width: '100%', padding: '8px 12px', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: value === mode ? '#0e2235' : '#475569', fontFamily: 'inherit' }}>
            <Check size={12} style={{ color: value === mode ? '#0e2235' : 'transparent' }} />
            {icon}{lbl}
          </button>
        ))}
      </div>
      <style jsx>{`.inv-view-menu{opacity:0;pointer-events:none;transform:translateY(-4px);transition:opacity .12s,transform .12s} div:hover>.inv-view-menu,div:focus-within>.inv-view-menu{opacity:1;pointer-events:auto;transform:translateY(0)}`}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Asset card / list / summary                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function AssetCard({ asset, onOpen, onFullDetail }: { asset: AssetListItem; onOpen: () => void; onFullDetail: () => void }) {
  const color = ASSET_STATUS_COLORS[asset.status];
  return (
    <article style={{ background: '#fff', borderRadius: 8, border: '1px solid #E8EDF3', borderTop: `3px solid ${color}`, cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(0,0,0,.07)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={16} style={{ color }} />
          </div>
          <StatusBadge status={asset.status} />
        </div>
        <button type="button" onClick={onOpen} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0e2235', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</p>
          <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.category_name} · {asset.environment_name}</p>
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#CBD5E1' }}>{asset.location_name}</span>
          {asset.serial_number && <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>{asset.serial_number.length > 14 ? asset.serial_number.slice(0, 14) + '…' : asset.serial_number}</span>}
        </div>
      </div>
      <div style={{ borderTop: '1px solid #F1F5F9', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFBFC' }}>
        <button type="button" onClick={onOpen} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#94A3B8', fontFamily: 'inherit' }}>Quick view</button>
        <button type="button" onClick={onFullDetail} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#0e2235', fontFamily: 'inherit' }}>Ver detalles →</button>
      </div>
    </article>
  );
}

function AssetListRow({ asset, onOpen, onFullDetail }: { asset: AssetListItem; onOpen: () => void; onFullDetail: () => void }) {
  const color = ASSET_STATUS_COLORS[asset.status];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px 150px 120px auto', gap: 12, alignItems: 'center', padding: '10px 14px', background: '#fff', border: '1px solid #E8EDF3', borderRadius: 8 }}>
      <button type="button" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'transparent', cursor: 'pointer', minWidth: 0, textAlign: 'left', fontFamily: 'inherit' }}>
        <span style={{ width: 64, height: 48, borderRadius: 6, background: `${color}18`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Package size={14} style={{ color }} />
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 13, color: '#0e2235', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</strong>
          <small style={{ display: 'block', fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{asset.category_name}</small>
        </span>
      </button>
      <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.environment_name}</span>
      <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.location_name}</span>
      <StatusBadge status={asset.status} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onOpen} style={{ border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', color: '#0e2235', padding: '6px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Drawer</button>
        <button type="button" onClick={onFullDetail} style={{ border: 0, borderRadius: 6, background: '#0e2235', color: '#fff', padding: '6px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Ver más</button>
      </div>
    </div>
  );
}

function AssetSummaryItem({ asset, onOpen }: { asset: AssetListItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} style={{ minHeight: 72, padding: 14, borderRadius: 8, border: '1px solid #E8EDF3', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 9, fontWeight: 800, color: '#FF5E3A', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{asset.category_name}</span>
        <strong style={{ display: 'block', fontSize: 13, color: '#0e2235', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</strong>
        <small style={{ display: 'block', fontSize: 10, color: '#94A3B8', marginTop: 3 }}>{asset.location_name}</small>
      </span>
      <StatusBadge status={asset.status} />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* AssetDrawer — panel lateral deslizante (4 tabs)                             */
/* ─────────────────────────────────────────────────────────────────────────── */

interface DrawerProps {
  assetId:    string;
  moduleId:   string;
  canEdit:    boolean;
  onClose:    () => void;
  onFullDetail: () => void;
}

function AssetDrawer({ assetId, moduleId, canEdit, onClose, onFullDetail }: DrawerProps) {
  const qc = useQueryClient();
  const [tab,           setTab]           = useState<DrawerTab>('general');
  const [showQr,        setShowQr]        = useState(false);
  const [editing,       setEditing]       = useState(false);
  const [editForm,      setEditForm]      = useState({ name: '', description: '', serial_number: '' });
  const [assignUid,     setAssignUid]     = useState('');
  const [assignNote,    setAssignNote]    = useState('');
  const [unassignReason, setUnassignReason] = useState('');
  const [transReason,   setTransReason]   = useState('');
  const [actionErr,     setActionErr]     = useState('');

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['asset-detail', assetId] });
    qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] });
    qc.invalidateQueries({ queryKey: ['asset-history', assetId] });
  }, [qc, assetId]);

  const { data: asset, isLoading } = useQuery<AssetDetail>({
    queryKey: ['asset-detail', assetId],
    queryFn:  () => inventoryService.getOne(assetId),
    staleTime: 30_000,
  });

  const { data: assignment } = useQuery<AssetAssignment | null>({
    queryKey: ['asset-assignment', assetId],
    queryFn:  () => inventoryService.getCurrentAssignment(assetId),
    staleTime: 30_000,
    enabled: tab === 'general' && asset?.status === 'asignado',
  });

  const { data: moduleUsers = [] } = useQuery({
    queryKey: ['module-members', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId),
    staleTime: 5 * 60_000,
    enabled: tab === 'general' && canEdit && asset?.status === 'disponible',
  });

  const { data: history = [] } = useQuery<AssetHistoryEntry[]>({
    queryKey: ['asset-history', assetId],
    queryFn:  () => inventoryService.getHistory(assetId),
    staleTime: 30_000,
    enabled: tab === 'historial',
  });

  const { data: assetTickets = [] } = useQuery<AssetTicket[]>({
    queryKey: ['asset-tickets', assetId],
    queryFn:  () => inventoryService.getAssetTickets(assetId),
    staleTime: 60_000,
    enabled: tab === 'tickets',
  });

  const updateMut = useMutation({
    mutationFn: () => inventoryService.update(assetId, { name: editForm.name.trim() || undefined, description: editForm.description.trim() || undefined, serial_number: editForm.serial_number.trim() || undefined }),
    onSuccess: () => { setEditing(false); setActionErr(''); invalidate(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error al editar'),
  });

  const deleteMut = useMutation({
    mutationFn: () => inventoryService.remove(assetId),
    onSuccess: () => { onClose(); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error al eliminar'),
  });

  const assignMut = useMutation({
    mutationFn: () => inventoryService.assign(assetId, { user_id: assignUid, notes: assignNote || undefined }),
    onSuccess: () => { setActionErr(''); setAssignUid(''); setAssignNote(''); invalidate(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error al asignar'),
  });

  const unassignMut = useMutation({
    mutationFn: () => inventoryService.unassign(assetId, unassignReason || undefined),
    onSuccess: () => { setActionErr(''); setUnassignReason(''); invalidate(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error al devolver'),
  });

  const transMut = useMutation({
    mutationFn: (status: AssetStatus) => inventoryService.transition(assetId, { status, reason: transReason || undefined }),
    onSuccess: () => { setActionErr(''); setTransReason(''); invalidate(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error al cambiar estado'),
  });

  const tabs: [DrawerTab, string][] = [['general', 'General'], ['relaciones', 'Relaciones'], ['tickets', 'Tickets'], ['historial', 'Historial']];

  return (
    <>
      {/* Overlay */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.3)', zIndex: 48 }} onClick={onClose} />

      {/* Drawer panel */}
      <div style={{ position: 'fixed', inset: 0, right: 0, left: 'auto', width: '100%', maxWidth: 560, background: '#fff', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,.12)', borderLeft: '1px solid #E2E8F0' }}>

        {/* Drawer header */}
        <div style={{ background: '#0e2235', padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 4px' }}>
                {asset?.module_name ?? 'Inventario'} · {asset?.category_name ?? '…'}
              </p>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isLoading ? 'Cargando…' : (asset?.name ?? '…')}
              </h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', margin: 0 }}>
                {asset ? `${asset.qr_code} · ${asset.environment_name}` : '…'}
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,.1)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2 }}>
            {tabs.map(([t, label]) => (
              <button key={t} type="button" onClick={() => { setTab(t); setActionErr(''); }}
                style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '6px 6px 0 0', background: tab === t ? '#fff' : 'rgba(255,255,255,.08)', color: tab === t ? '#0e2235' : 'rgba(255,255,255,.7)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Drawer body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {isLoading && <div style={{ padding: '40px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando…</div>}

          {asset && (
            <>
              {/* ── GENERAL ── */}
              {tab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Summary card */}
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px', border: '1px solid #E8EDF3' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                      <div>
                        <StatusBadge status={asset.status} />
                        {asset.description && <p style={{ fontSize: 12, color: '#475569', margin: '8px 0 0', lineHeight: 1.5 }}>{asset.description}</p>}
                      </div>
                      <button type="button" onClick={() => setShowQr(true)} style={{ border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: '6px 10px', cursor: 'pointer', color: '#FF5E3A', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                        <QrCode size={13} /> QR
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
                      {([['Módulo', asset.module_name], ['Categoría', asset.category_name], ['Ambiente', asset.environment_name], ['Sede', asset.location_name], ['QR Code', asset.qr_code], ['Serial', asset.serial_number ?? '—']] as [string, string][]).map(([l, v]) => (
                        <div key={l}>
                          <span style={{ color: '#94A3B8', fontWeight: 500 }}>{l}: </span>
                          <span style={{ color: '#334155', fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Specs */}
                  {asset.specifications && Object.keys(asset.specifications).length > 0 && (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 8px' }}>Especificaciones</p>
                      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', border: '1px solid #E8EDF3' }}>
                        {Object.entries(asset.specifications).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: '#94A3B8', minWidth: 110 }}>{k}:</span>
                            <span style={{ color: '#334155', fontWeight: 600 }}>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assignment info */}
                  {asset.status === 'asignado' && (
                    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '12px 14px' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#3B82F6', margin: '0 0 8px' }}>Asignado a</p>
                      {assignment ? (
                        <>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F', margin: '0 0 2px' }}>{assignment.user_name}</p>
                          <p style={{ fontSize: 11, color: '#3B82F6', margin: '0 0 4px' }}>{assignment.user_email}</p>
                          <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>Por {assignment.assigned_by_name} · {fmtDate(assignment.assigned_at)}</p>
                        </>
                      ) : <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Cargando…</p>}
                    </div>
                  )}

                  {/* Assign form (disponible) */}
                  {canEdit && asset.status === 'disponible' && (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 8px' }}>Asignar a usuario</p>
                      <select style={{ ...INPUT, marginBottom: 8 }} value={assignUid} onChange={e => setAssignUid(e.target.value)}>
                        <option value="">Seleccionar usuario…</option>
                        {(moduleUsers as any[]).map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.role_name}</option>)}
                      </select>
                      <input style={{ ...INPUT, marginBottom: 8 }} placeholder="Notas (opcional)…" value={assignNote} onChange={e => setAssignNote(e.target.value)} />
                      <button type="button" disabled={!assignUid || assignMut.isPending} onClick={() => assignMut.mutate()}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: '#3B82F6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (!assignUid || assignMut.isPending) ? .5 : 1 }}>
                        <User size={12} />{assignMut.isPending ? 'Asignando…' : 'Asignar'}
                      </button>
                    </div>
                  )}

                  {/* Unassign */}
                  {canEdit && asset.status === 'asignado' && assignment && (
                    <div>
                      <input style={{ ...INPUT, marginBottom: 8 }} placeholder="Motivo de devolución (opcional)…" value={unassignReason} onChange={e => setUnassignReason(e.target.value)} />
                      <button type="button" disabled={unassignMut.isPending} onClick={() => unassignMut.mutate()}
                        style={{ padding: '7px 14px', borderRadius: 6, border: '1.5px solid #EF444466', background: '#EF444411', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {unassignMut.isPending ? 'Devolviendo…' : 'Registrar devolución'}
                      </button>
                    </div>
                  )}

                  {/* FSM transitions */}
                  {canEdit && asset.status !== 'dado_de_baja' && FSM_TRANSITIONS[asset.status].length > 0 && (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 8px' }}>Cambiar estado</p>
                      <input style={{ ...INPUT, marginBottom: 8 }} placeholder="Motivo (opcional)…" value={transReason} onChange={e => setTransReason(e.target.value)} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {FSM_TRANSITIONS[asset.status].map(s => {
                          const c = FSM_COLORS[s] ?? '#64748B';
                          return (
                            <button key={s} type="button" disabled={transMut.isPending} onClick={() => transMut.mutate(s)}
                              style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1.5px solid ${c}66`, background: `${c}11`, color: c, cursor: 'pointer', fontFamily: 'inherit', opacity: transMut.isPending ? .6 : 1 }}>
                              {FSM_LABELS[s] ?? s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Edit / Delete */}
                  {canEdit && asset.status !== 'dado_de_baja' && (
                    <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                      {!editing && (
                        <button type="button" onClick={() => { setEditForm({ name: asset.name, description: asset.description ?? '', serial_number: asset.serial_number ?? '' }); setEditing(true); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                      {asset.status !== 'asignado' && (
                        <button type="button" disabled={deleteMut.isPending} onClick={() => { if (confirm(`¿Eliminar "${asset.name}"?`)) deleteMut.mutate(); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <Trash2 size={12} />{deleteMut.isPending ? 'Eliminando…' : 'Eliminar'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Edit form */}
                  {editing && (
                    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 14, border: '1px solid #E8EDF3' }}>
                      <div style={{ marginBottom: 10 }}><label style={LABEL}>Nombre *</label><input style={INPUT} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div style={{ marginBottom: 10 }}><label style={LABEL}>Serial</label><input style={INPUT} value={editForm.serial_number} onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))} /></div>
                      <div style={{ marginBottom: 12 }}><label style={LABEL}>Descripción</label><textarea style={{ ...INPUT, minHeight: 72, resize: 'vertical' }} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" disabled={!editForm.name.trim() || updateMut.isPending} onClick={() => updateMut.mutate()}
                          style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#0e2235', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (!editForm.name.trim() || updateMut.isPending) ? .6 : 1 }}>
                          {updateMut.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" onClick={() => setEditing(false)} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  {actionErr && <p style={{ fontSize: 11, color: '#EF4444' }}>{actionErr}</p>}

                  {/* Full detail link */}
                  <button type="button" onClick={onFullDetail} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 12, fontWeight: 600, color: '#0e2235', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                    Ver ficha completa →
                  </button>
                </div>
              )}

              {/* ── RELACIONES ── */}
              {tab === 'relaciones' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px', border: '1px solid #E8EDF3' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 10px' }}>Jerarquía del activo</p>
                    <div style={{ borderLeft: '2px solid rgba(255,94,58,.3)', paddingLeft: 14 }}>
                      <div style={{ padding: '10px 12px', borderRadius: 6, background: asset.specifications?.parent_id ? '#F8FAFC' : '#0e2235', color: asset.specifications?.parent_id ? '#334155' : '#fff', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                        {asset.specifications?.parent_id ? `Padre: ${asset.specifications.parent_id}` : 'Activo raíz'}
                      </div>
                      <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 8px', fontWeight: 600 }}>Sin activos hijos registrados.</p>
                      <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>Las relaciones entre activos se configuran desde la ficha completa.</p>
                    </div>
                  </div>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px', border: '1px solid #E8EDF3' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 8px' }}>Nodo organizacional</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: 0 }}>{asset.environment_name} — {asset.location_name}</p>
                  </div>
                </div>
              )}

              {/* ── TICKETS ── */}
              {tab === 'tickets' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {assetTickets.length === 0 ? (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}>
                      <CheckCircle2 size={28} style={{ color: '#CBD5E1', marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
                      <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Sin tickets asociados a este activo.</p>
                    </div>
                  ) : (
                    assetTickets.map(ticket => {
                      const pColor = PRIORITY_COLORS[ticket.priority] ?? '#94A3B8';
                      const stateBg = ticket.is_final ? '#F0FDF4' : '#FFF7ED';
                      const stateColor = ticket.is_final ? '#16A34A' : '#C2410C';
                      return (
                        <div key={ticket.id} style={{ border: '1px solid #E8EDF3', borderRadius: 8, padding: '12px 14px', background: '#fff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#FF5E3A', fontFamily: 'monospace' }}>#{ticket.id.slice(0, 8)}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: stateBg, color: stateColor }}>{ticket.state_label}</span>
                          </div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                            <span style={{ fontWeight: 600, color: pColor, textTransform: 'uppercase' }}>• {ticket.priority}</span>
                            <span>{ticket.creator_name} · {fmtDate(ticket.created_at)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ── HISTORIAL ── */}
              {tab === 'historial' && (
                <div>
                  {history.length === 0 ? (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}>
                      <Clock size={26} style={{ color: '#CBD5E1', display: 'block', margin: '0 auto 10px' }} />
                      <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Sin eventos registrados.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {history.map((h, i) => {
                        const color = ASSET_ACTION_COLORS[h.action] ?? '#94A3B8';
                        const label = ASSET_ACTION_LABELS[h.action] ?? h.action;
                        return (
                          <div key={h.id} style={{ display: 'flex', gap: 12, paddingBottom: 16, position: 'relative' }}>
                            {i < history.length - 1 && <div style={{ position: 'absolute', left: 14, top: 28, width: 2, height: 'calc(100% - 8px)', background: '#F1F5F9' }} />}
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${color}15`, border: `2px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                            </div>
                            <div style={{ flex: 1, paddingTop: 3 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: '#0e2235', margin: '0 0 2px' }}>{label} {h.user_name && h.user_name !== h.actor_name && <span style={{ fontWeight: 400, color: '#64748B' }}>{h.user_name}</span>}</p>
                              <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 2px' }}>por {h.actor_name} · {fmtDate(h.created_at)}</p>
                              {h.reason && <p style={{ fontSize: 11, color: '#64748B', margin: 0, fontStyle: 'italic' }}>{h.reason}</p>}
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

/* ─────────────────────────────────────────────────────────────────────────── */
/* AssetFullDetail — vista completa inline                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function AssetFullDetail({ assetId, canEdit, onBack }: { assetId: string; canEdit: boolean; onBack: () => void }) {
  const [showQr, setShowQr]   = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const { data: asset, isLoading } = useQuery<AssetDetail>({
    queryKey: ['asset-detail', assetId],
    queryFn:  () => inventoryService.getOne(assetId),
    staleTime: 30_000,
  });

  const { data: assignment } = useQuery<AssetAssignment | null>({
    queryKey: ['asset-assignment', assetId],
    queryFn:  () => inventoryService.getCurrentAssignment(assetId),
    staleTime: 30_000,
    enabled: asset?.status === 'asignado',
  });

  const { data: assetTickets = [] } = useQuery<AssetTicket[]>({
    queryKey: ['asset-tickets', assetId],
    queryFn:  () => inventoryService.getAssetTickets(assetId),
    staleTime: 60_000,
  });

  if (isLoading) return <div style={{ padding: '60px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando ficha…</div>;
  if (!asset) return null;

  const color = ASSET_STATUS_COLORS[asset.status];

  const InfoCell = ({ label, value }: { label: string; value: string }) => (
    <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: 0, wordBreak: 'break-word' }}>{value || '—'}</p>
    </div>
  );

  return (
    <div>
      {/* Header bar */}
      <div style={{ background: '#fff', border: '1px solid #E8EDF3', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={onBack} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#0e2235' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 2px' }}>Ficha completa del activo</p>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0e2235', margin: 0 }}>{asset.name}</h2>
            <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{asset.qr_code} · {asset.category_name} · {asset.module_name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatusBadge status={asset.status} />
          <button type="button" onClick={() => setShowQr(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, fontWeight: 600, color: '#FF5E3A', cursor: 'pointer', fontFamily: 'inherit' }}>
            <QrCode size={12} /> Ver QR
          </button>
          {canEdit && (
            <button type="button" onClick={() => setShowDrawer(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0e2235', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Pencil size={12} /> Editar / Acciones
            </button>
          )}
        </div>
      </div>

      {/* Main two-column layout */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr) 320px', alignItems: 'start' }}>
        {/* Left: ficha técnica */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Ficha técnica */}
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E8EDF3', overflow: 'hidden' }}>
            <div style={{ background: '#D9E8F6', padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid #E8EDF3' }}>
              <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0e2235', margin: 0 }}>Ficha técnica y operacional</p>
            </div>
            {asset.description && (
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
                <p style={{ fontSize: 12, color: '#475569', margin: 0, lineHeight: 1.6 }}>{asset.description}</p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
              {/* Características técnicas */}
              <div style={{ padding: '16px', borderRight: '1px solid #F1F5F9' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0e2235', margin: '0 0 12px' }}>Técnicas</p>
                {asset.serial_number && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 2px' }}>Serial</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: 0, fontFamily: 'monospace' }}>{asset.serial_number}</p>
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 2px' }}>QR Code</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0, fontFamily: 'monospace' }}>{asset.qr_code}</p>
                </div>
                {asset.specifications && Object.entries(asset.specifications).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 6 }}>
                    <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 2px' }}>{k}</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: 0 }}>{String(v)}</p>
                  </div>
                ))}
              </div>
              {/* Características operativas */}
              <div style={{ padding: '16px', borderRight: '1px solid #F1F5F9' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0e2235', margin: '0 0 12px' }}>Operativas</p>
                {[['Estado', ASSET_STATUS_LABELS[asset.status]], ['Categoría', asset.category_name], ['Ambiente', asset.environment_name], ['Sede', asset.location_name], ['Módulo', asset.module_name], ['Actualizado', fmtDate(asset.updated_at)]].map(([l, v]) => (
                  <div key={l} style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 2px' }}>{l}</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: 0 }}>{v}</p>
                  </div>
                ))}
              </div>
              {/* Responsable */}
              <div style={{ padding: '16px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0e2235', margin: '0 0 12px' }}>Responsable</p>
                {assignment ? (
                  <div>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#0e2235', display: 'grid', placeItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                        {assignment.user_name.split(' ').slice(0, 2).map(w => w[0]).join('')}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0e2235', margin: '0 0 2px' }}>{assignment.user_name}</p>
                    <p style={{ fontSize: 11, color: '#64748B', margin: '0 0 6px' }}>{assignment.user_email}</p>
                    <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 2px' }}>Asignado por</p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0 }}>{assignment.assigned_by_name}</p>
                    <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>{fmtDate(assignment.assigned_at)}</p>
                  </div>
                ) : (
                  <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                    <Package size={20} style={{ color: '#CBD5E1', display: 'block', margin: '0 auto 6px' }} />
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>
                      {asset.status === 'disponible' ? 'Sin asignación activa' : ASSET_STATUS_LABELS[asset.status]}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Relaciones */}
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E8EDF3', padding: '16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 6px' }}>Relaciones y ciclo de vida</p>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#0e2235', margin: '0 0 14px' }}>Jerarquía del activo</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <InfoCell label="Activo padre" value={asset.specifications?.parent_id ? String(asset.specifications.parent_id) : 'Activo raíz / sin padre'} />
              <InfoCell label="Activos hijos" value="Sin activos hijos registrados" />
            </div>
          </div>
        </div>

        {/* Right: tickets + acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Tickets recientes */}
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E8EDF3', padding: '16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 4px' }}>Tickets recientes</p>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#0e2235', margin: '0 0 14px' }}>Últimos casos</p>
            {assetTickets.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <CheckCircle2 size={24} style={{ color: '#CBD5E1', display: 'block', margin: '0 auto 8px' }} />
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Sin tickets asociados</p>
              </div>
            ) : assetTickets.slice(0, 4).map(ticket => {
              const pColor = PRIORITY_COLORS[ticket.priority] ?? '#94A3B8';
              return (
                <div key={ticket.id} style={{ border: '1px solid #E8EDF3', borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#FF5E3A', fontFamily: 'monospace' }}>#{ticket.id.slice(0, 8)}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: ticket.is_final ? '#16A34A' : '#C2410C' }}>{ticket.state_label}</span>
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#0e2235', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                    <span style={{ color: pColor, fontWeight: 600 }}>● {ticket.priority}</span>
                    <span>{fmtDate(ticket.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Privacidad / info */}
          <div style={{ background: '#0e2235', borderRadius: 8, padding: '16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', margin: '0 0 4px' }}>Visibilidad</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Datos por capa de acceso</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', margin: 0, lineHeight: 1.5 }}>
              {canEdit ? 'Vista técnica completa. Serial, QR, historial y auditoría disponibles.' : 'Vista de usuario final: datos sensibles ocultos por RBAC.'}
            </p>
          </div>
        </div>
      </div>

      {showQr && <QrModal assetId={assetId} assetName={asset.name} onClose={() => setShowQr(false)} />}
      {showDrawer && (
        <AssetDrawer assetId={assetId} moduleId={''} canEdit={canEdit} onClose={() => setShowDrawer(false)} onFullDetail={() => setShowDrawer(false)} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* MetricsRow                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

function MetricsRow({ assets }: { assets: AssetListItem[] }) {
  const total      = assets.length;
  const disponible = assets.filter(a => a.status === 'disponible').length;
  const asignado   = assets.filter(a => a.status === 'asignado').length;
  const reparacion = assets.filter(a => a.status === 'en_reparacion').length;
  const baja       = assets.filter(a => a.status === 'dado_de_baja').length;
  const health     = total > 0 ? Math.round(((disponible + asignado) / total) * 100) : 0;

  const cards = [
    { label: 'Total activos',   value: total,      icon: <Boxes size={16} />,       color: '#0e2235' },
    { label: 'Disponibles',     value: disponible, icon: <CheckCircle2 size={16} />, color: '#22C55E' },
    { label: 'Asignados',       value: asignado,   icon: <User size={16} />,         color: '#3B82F6' },
    { label: 'Mantenimiento',   value: reparacion, icon: <Wrench size={16} />,       color: '#F59E0B' },
    { label: 'Dados de baja',   value: baja,       icon: <Ban size={16} />,          color: '#94A3B8' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
      {cards.map(({ label, value, icon, color }) => (
        <div key={label} style={{ background: '#fff', borderRadius: 8, border: '1px solid #E8EDF3', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: 0 }}>{label}</p>
            <span style={{ color }}>{icon}</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color, margin: 0 }}>{label === 'Salud global' ? `${health}%` : value}</p>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* InventoryClient — componente principal                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

export function InventoryClient() {
  const { modules } = useModules();
  const inventoryId = modules?.find(isInventoryModule)?.id;
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const activeModules = useMemo(() => {
    const roles = user?.module_roles?.filter(r => r.status === 'active') ?? [];
    const seen  = new Set<string>();
    const unique: { module_id: string; module_name: string; role_name: string }[] = [];
    for (const r of roles) { if (!seen.has(r.module_id)) { seen.add(r.module_id); unique.push(r); } }
    return unique;
  }, [user]);

  const canEdit = useMemo(() => {
    if (isSuperadmin) return true;
    const roles = user?.module_roles?.filter(r => r.status === 'active').map(r => r.role_name) ?? [];
    return roles.some(r => (ADMIN_ROLES as string[]).includes(r));
  }, [user, isSuperadmin]);

  const [selectedModule, setSelectedModule] = useState(activeModules[0]?.module_id ?? '');
  const [scope,         setScope]           = useState<ScopeKey>('all');
  const [search,        setSearch]          = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [viewMode,      setViewMode]        = useState<ViewMode>('card');
  const [drawerAssetId, setDrawerAssetId]   = useState<string | null>(null);
  const [fullDetailId,  setFullDetailId]    = useState<string | null>(null);
  const [showCreate,    setShowCreate]      = useState(false);
  const [showScan,      setShowScan]        = useState(false);
  const [showBulk,      setShowBulk]        = useState(false);

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQ, setDebouncedQ] = useState('');

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
    queryFn:  () => inventoryService.getAll(selectedModule || undefined, undefined, undefined),
    staleTime: 60_000,
    enabled:  !!selectedModule || isSuperadmin,
  });

  /* client-side filtering */
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

  /* category counts for sidebar */
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

  const SCOPES: [ScopeKey, string, React.ReactNode, string][] = [
    ['all',        'Todos los activos',    <Boxes size={14} />,         'all'],
    ['disponible', 'Disponibles',          <CheckCircle2 size={14} />,  'disponible'],
    ['attention',  'Requieren atención',   <AlertTriangle size={14} />, 'attention'],
    ['baja',       'Dados de baja',        <Ban size={14} />,           'baja'],
  ];

  /* ── FULL DETAIL MODE ── */
  if (fullDetailId) {
    return (
      <ModuleLayout moduleId={inventoryId || selectedModule || undefined} title="Inventario" description="Ficha completa del activo." isSuperadmin={isSuperadmin}>
        <AssetFullDetail assetId={fullDetailId} canEdit={canEdit} onBack={() => setFullDetailId(null)} />
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout moduleId={inventoryId || selectedModule || undefined} title="Inventario" description="Registro y trazabilidad de activos organizacionales." isSuperadmin={isSuperadmin}>

      {/* Module tabs */}
      {activeModules.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {!isSuperadmin && (
            <button type="button" onClick={() => setSelectedModule('')}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: `1.5px solid ${!selectedModule ? '#0e2235' : '#E2E8F0'}`, background: !selectedModule ? '#0e2235' : '#fff', color: !selectedModule ? '#fff' : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Todos
            </button>
          )}
          {activeModules.map(m => (
            <button key={m.module_id} type="button" onClick={() => setSelectedModule(m.module_id)}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: `1.5px solid ${selectedModule === m.module_id ? '#0e2235' : '#E2E8F0'}`, background: selectedModule === m.module_id ? '#0e2235' : '#fff', color: selectedModule === m.module_id ? '#fff' : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              {m.module_name}
            </button>
          ))}
        </div>
      )}

      {/* Metrics */}
      <MetricsRow assets={allAssets} />

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT SIDEBAR ── */}
        <aside style={{ background: '#fff', borderRadius: 8, border: '1px solid #E8EDF3', padding: '16px', position: 'sticky', top: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 2px' }}>Navegación</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#0e2235', margin: 0 }}>Inventario</p>
            </div>
            <button type="button" onClick={() => { setScope('all'); setSearch(''); setDebouncedQ(''); setCategoryFilter(''); }}
              style={{ border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Limpiar
            </button>
          </div>

          {/* Scope nav */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
            {SCOPES.map(([key, label, icon]) => {
              const active = scope === key;
              const count  = scopeCounts[key];
              return (
                <button key={key} type="button" onClick={() => setScope(key)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, border: 'none', background: active ? '#0e2235' : 'transparent', color: active ? '#fff' : '#475569', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{icon}{label}</span>
                  <span style={{ fontSize: 10, opacity: .7 }}>{count}</span>
                </button>
              );
            })}
          </nav>

          {/* Category summary */}
          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 8px' }}>Tipos de activo</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Object.entries(categoryCounts).map(([cat, count]) => (
                <button key={cat} type="button" onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, border: 'none', background: categoryFilter === cat ? '#FF5E3A11' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: categoryFilter === cat ? '#FF5E3A' : '#475569', textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Package size={12} />{cat}</span>
                  <span style={{ fontSize: 10 }}>{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Admin panel */}
          {canEdit && (
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 8px' }}>Panel técnico</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button type="button" onClick={() => setShowScan(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: '#0e2235', textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><QrCode size={12} style={{ color: '#FF5E3A' }} /> Escanear QR</span>
                  <ChevronDown size={10} style={{ transform: 'rotate(-90deg)' }} />
                </button>
                <button type="button" onClick={() => setShowBulk(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, border: 'none', background: '#0e2235', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: '#fff', textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Upload size={12} style={{ color: '#20c933' }} /> Importación masiva</span>
                  <ChevronDown size={10} style={{ transform: 'rotate(-90deg)', opacity: .5 }} />
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div>
          {/* Scope title */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5E3A', margin: '0 0 2px' }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''} visibles</p>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0e2235', margin: 0 }}>
              {scope === 'all' ? 'Todos los activos' : scope === 'disponible' ? 'Activos disponibles' : scope === 'attention' ? 'Requieren atención' : 'Dados de baja'}
            </h2>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 180px', position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
              <input type="text" value={search} onChange={e => handleSearch(e.target.value)} placeholder="Nombre, serial, QR, ambiente…"
                style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
            </div>
            <ViewModeDropdown value={viewMode} onChange={changeViewMode} />
            {canEdit && selectedModule && (
              <button type="button" onClick={() => setShowCreate(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: 'none', background: '#0e2235', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                <Plus size={12} style={{ color: '#20c933' }} /> Registrar activo
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={() => setShowScan(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1px solid #E2E8F0', background: '#fff', color: '#0e2235', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                <QrCode size={12} style={{ color: '#FF5E3A' }} /> Escanear QR
              </button>
            )}
          </div>

          {/* Loading / empty */}
          {isLoading && <div style={{ padding: '60px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando activos…</div>}

          {!isLoading && filtered.length === 0 && (
            <div style={{ padding: '60px 0', textAlign: 'center', background: '#fff', borderRadius: 8, border: '2px dashed #E8EDF3' }}>
              <Package size={32} style={{ color: '#CBD5E1', display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 4px' }}>
                {debouncedQ ? `Sin resultados para "${debouncedQ}".` : 'No hay activos en este filtro.'}
              </p>
              {canEdit && selectedModule && scope === 'all' && !debouncedQ && (
                <button type="button" onClick={() => setShowCreate(true)}
                  style={{ marginTop: 12, padding: '7px 16px', borderRadius: 6, border: 'none', background: '#0e2235', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={12} /> Registrar primer activo
                </button>
              )}
            </div>
          )}

          {/* Asset grid */}
          {!isLoading && filtered.length > 0 && (
            <>
              {viewMode === 'card' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                  {filtered.map(a => (
                    <AssetCard key={a.id} asset={a} onOpen={() => setDrawerAssetId(a.id)} onFullDetail={() => setFullDetailId(a.id)} />
                  ))}
                </div>
              )}
              {viewMode === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtered.map(a => (
                    <AssetListRow key={a.id} asset={a} onOpen={() => setDrawerAssetId(a.id)} onFullDetail={() => setFullDetailId(a.id)} />
                  ))}
                </div>
              )}
              {viewMode === 'summary' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                  {filtered.map(a => (
                    <AssetSummaryItem key={a.id} asset={a} onOpen={() => setDrawerAssetId(a.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modales y drawer ── */}
      {drawerAssetId && (
        <AssetDrawer
          assetId={drawerAssetId}
          moduleId={selectedModule || inventoryId || ''}
          canEdit={canEdit}
          onClose={() => setDrawerAssetId(null)}
          onFullDetail={() => { setFullDetailId(drawerAssetId); setDrawerAssetId(null); }}
        />
      )}
      {showCreate && selectedModule && <CreateModal moduleId={selectedModule} onClose={() => setShowCreate(false)} />}
      {showScan && <ScanModal onClose={() => setShowScan(false)} onOpen={id => setDrawerAssetId(id)} />}
      {showBulk && selectedModule && <BulkImportModal moduleId={selectedModule} onClose={() => setShowBulk(false)} />}
    </ModuleLayout>
  );
}
