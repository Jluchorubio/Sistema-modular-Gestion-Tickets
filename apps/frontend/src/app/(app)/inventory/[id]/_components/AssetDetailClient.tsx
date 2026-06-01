'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, QrCode, Pencil, Package, CheckCircle2,
  X, User, Clock, Save, Boxes, FileText, Link2,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { usersService } from '@/services/users.service';
import { ticketsService } from '@/services/tickets.service';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../../_nav';
import {
  inventoryService,
  type AssetDetail, type AssetStatus, type AssetAssignment,
  type AssetHistoryEntry, type AssetTicket, type AssetChild, type FieldDef,
  ASSET_STATUS_LABELS, ASSET_STATUS_COLORS,
  ASSET_ACTION_LABELS, ASSET_ACTION_COLORS,
} from '@/services/inventory.service';
import { ADMIN_ROLES } from '@/constants/roles';
import { fmtDate } from '@/lib/formatters';

/* ── Tokens ──────────────────────────────────────────────────────────────── */
const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  green:  '#20c933',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  text:   '#1e293b',
  bg:     '#f8fafc',
};

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
  en_reparacion: '#f59e0b', dado_de_baja: '#ef4444', disponible: '#22c55e',
};
const PRIORITY_COLORS: Record<string, string> = {
  critica: '#ef4444', alta: '#f97316', media: '#f59e0b', baja: '#22c55e',
};

const INPUT: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 12,
  border: `1px solid ${C.border}`, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', color: C.text,
};

/* ── StatusBadge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: AssetStatus }) {
  const color = ASSET_STATUS_COLORS[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: `${color}15`, color, border: `1px solid ${color}30`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.6)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '28px 32px', textAlign: 'center', maxWidth: 280, width: '100%', position: 'relative', boxShadow: '0 32px 72px rgba(14,34,53,.2)' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}><X size={13} /></button>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: `${C.coral}12`, display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
          <QrCode size={20} style={{ color: C.coral }} />
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>{assetName}</p>
        <p style={{ fontSize: 10, color: C.muted, margin: '0 0 18px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Código QR</p>
        {isLoading && <div style={{ height: 180, display: 'grid', placeItems: 'center', color: C.muted, fontSize: 12 }}>Generando…</div>}
        {data?.qr_image && (
          <>
            <img src={data.qr_image} alt="QR" style={{ width: 180, height: 180, margin: '0 auto', display: 'block', borderRadius: 8, border: `1px solid ${C.border}` }} />
            <p style={{ fontSize: 10, color: C.muted, marginTop: 12, fontFamily: 'monospace', letterSpacing: '.06em' }}>{data.qr_code}</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Stat chip ───────────────────────────────────────────────────────────── */
function StatChip({ icon, label, value, color = C.muted }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, background: '#fff', border: `1px solid ${C.border}` }}>
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <div>
        <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</p>
        <p style={{ fontSize: 13, fontWeight: 800, color: C.navy, margin: 0 }}>{value}</p>
      </div>
    </div>
  );
}

/* ── AssetDetailClient ───────────────────────────────────────────────────── */
export function AssetDetailClient({ assetId }: { assetId: string }) {
  const router = useRouter();
  const qc     = useQueryClient();
  const { modules } = useModules();
  const inventoryId = modules?.find(isInventoryModule)?.id;
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;
  const canEdit      = isSuperadmin || (user?.module_roles?.filter(r => r.status === 'active').some(r => (ADMIN_ROLES as string[]).includes(r.role_name)) ?? false);
  const moduleId     = inventoryId ?? '';

  /* ── UI state ── */
  const [showQr,    setShowQr]    = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'historial' | 'hijos'>('tickets');
  const [actionErr, setActionErr] = useState('');
  const [transReason, setTransReason] = useState('');

  /* ── Queries ── */
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
    enabled: activeTab === 'tickets',
  });

  const { data: history = [] } = useQuery<AssetHistoryEntry[]>({
    queryKey: ['asset-history', assetId],
    queryFn:  () => inventoryService.getHistory(assetId),
    staleTime: 30_000,
    enabled: activeTab === 'historial',
  });

  const { data: children = [] } = useQuery<AssetChild[]>({
    queryKey: ['asset-children', assetId],
    queryFn:  () => inventoryService.getChildAssets(assetId),
    staleTime: 60_000,
    enabled: activeTab === 'hijos',
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['ticket-categories', moduleId],
    queryFn:  () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
    enabled: editing && !!moduleId,
  });

  const { data: environments = [] } = useQuery({
    queryKey: ['ticket-environments', moduleId],
    queryFn:  () => ticketsService.getEnvironments(moduleId),
    staleTime: 5 * 60_000,
    enabled: editing && !!moduleId,
  });

  const { data: moduleUsers = [] } = useQuery({
    queryKey: ['module-members', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId),
    staleTime: 5 * 60_000,
    enabled: !!moduleId && (asset?.status === 'disponible'),
  });

  /* ── Edit form state ── */
  const [editForm, setEditForm] = useState<{
    name: string; description: string; serial_number: string;
    category_id: string; environment_id: string;
    specifications: Record<string, string>;
  }>({ name: '', description: '', serial_number: '', category_id: '', environment_id: '', specifications: {} });

  function startEditing() {
    if (!asset) return;
    const specs: Record<string, string> = {};
    if (asset.specifications) {
      Object.entries(asset.specifications).forEach(([k, v]) => { specs[k] = String(v); });
    }
    setEditForm({
      name:          asset.name,
      description:   asset.description ?? '',
      serial_number: asset.serial_number ?? '',
      category_id:   asset.category_id,
      environment_id: asset.environment_id,
      specifications: specs,
    });
    setEditing(true);
    setActionErr('');
  }

  /* ── Mutations ── */
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['asset-detail', assetId] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const updateMut = useMutation({
    mutationFn: () => {
      const specs: Record<string, unknown> = {};
      Object.entries(editForm.specifications).forEach(([k, v]) => { if (v.trim()) specs[k] = v; });
      return inventoryService.update(assetId, {
        name:           editForm.name.trim() || undefined,
        description:    editForm.description.trim() || undefined,
        serial_number:  editForm.serial_number.trim() || undefined,
        category_id:    editForm.category_id || undefined,
        environment_id: editForm.environment_id || undefined,
        specifications: Object.keys(specs).length ? specs : undefined,
      });
    },
    onSuccess: () => { setEditing(false); setActionErr(''); inv(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const transMut = useMutation({
    mutationFn: (s: AssetStatus) => inventoryService.transition(assetId, { status: s, reason: transReason || undefined }),
    onSuccess: () => { setTransReason(''); setActionErr(''); inv(); qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] }); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error'),
  });

  const assignMut   = useMutation({
    mutationFn: (userId: string) => inventoryService.assign(assetId, { user_id: userId }),
    onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] }); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error'),
  });
  const unassignMut = useMutation({
    mutationFn: () => inventoryService.unassign(assetId),
    onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] }); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error'),
  });

  /* ── Field schema for inline editing ── */
  const fieldSchema: FieldDef[] = useMemo(() => {
    return asset?.field_schema ?? [];
  }, [asset]);

  /* ── Loading / not found ── */
  if (isLoading) return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin} hideInfo>
      <div style={{ padding: '80px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando ficha…</div>
    </ModuleLayout>
  );
  if (!asset) return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin} hideInfo>
      <div style={{ padding: '80px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Activo no encontrado.</div>
    </ModuleLayout>
  );

  const statusColor = ASSET_STATUS_COLORS[asset.status];

  /* ── READ mode: data cell ── */
  const DataCell = ({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) => (
    <div style={{ paddingBottom: 14 }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: 0, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all', lineHeight: 1.4 }}>{value || '—'}</p>
    </div>
  );

  /* ── EDIT mode: field input ── */
  const EditField = ({ label, field, type = 'text', ...rest }: {
    label: string; field: keyof typeof editForm;
    type?: string; placeholder?: string;
  }) => (
    <div style={{ paddingBottom: 14 }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.coral, margin: '0 0 4px' }}>{label}</p>
      <input
        type={type}
        value={editForm[field] as string}
        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
        style={{ ...INPUT }}
        {...rest}
      />
    </div>
  );

  /* ── Col header ── */
  const ColHeader = ({ label }: { label: string }) => (
    <div style={{ paddingBottom: 10, marginBottom: 16, borderBottom: `2px solid ${C.coral}` }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.navy, margin: 0 }}>{label}</p>
    </div>
  );

  return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin} hideInfo>

      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => router.push('/inventory')}
            style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.navy }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.background = C.bg)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.coral, margin: '0 0 3px' }}>
              {asset.module_name} · {asset.category_name}
            </p>
            <h1 style={{ fontSize: 19, fontWeight: 800, color: C.navy, margin: 0, lineHeight: 1.2 }}>{asset.name}</h1>
            <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0', fontFamily: 'monospace', letterSpacing: '.05em' }}>{asset.qr_code}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={asset.status} />
          <button type="button" onClick={() => setShowQr(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.coral, cursor: 'pointer', fontFamily: 'inherit' }}>
            <QrCode size={13} /> Ver QR
          </button>
        </div>
      </div>

      {/* ── Stat chips row ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatChip icon={<Boxes size={14} />}    label="Hijos"   value={asset.children_count} color={C.coral} />
        <StatChip icon={<FileText size={14} />} label="Tickets" value={asset.tickets_count}  color='#3b82f6' />
        <StatChip icon={<Link2 size={14} />}    label="Archivos" value={asset.files_count}   color='#8b5cf6' />
        <StatChip icon={<Package size={14} />}  label="Versión" value={`v${asset.version}`} />
      </div>

      {/* ── Main two-column layout ── */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr) 300px', alignItems: 'start' }}>

        {/* ── LEFT: ficha técnica ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* FICHA PRINCIPAL */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(14,34,53,.06)' }}>

            {/* Card header band */}
            <div style={{ background: '#d9e8f6', padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.navy, margin: 0 }}>
                Ficha técnica y operacional
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {editing ? (
                  <>
                    <button type="button" disabled={updateMut.isPending} onClick={() => updateMut.mutate()}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, border: 'none', background: C.navy, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: updateMut.isPending ? .6 : 1 }}>
                      <Save size={12} />{updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button type="button" onClick={() => { setEditing(false); setActionErr(''); }}
                      style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>
                      Cancelar
                    </button>
                  </>
                ) : canEdit && asset.status !== 'dado_de_baja' ? (
                  <button type="button" onClick={startEditing}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Pencil size={12} /> Editar
                  </button>
                ) : null}
              </div>
            </div>

            {actionErr && (
              <div style={{ padding: '8px 20px', background: '#FEF2F2', borderBottom: `1px solid #FECACA` }}>
                <p style={{ fontSize: 11, color: '#EF4444', margin: 0 }}>{actionErr}</p>
              </div>
            )}

            {/* Name + desc + image */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ padding: '18px 20px' }}>
                {editing ? (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.coral, margin: '0 0 4px' }}>Nombre *</p>
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ ...INPUT, fontSize: 14, fontWeight: 700 }} />
                    </div>
                    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.coral, margin: '0 0 4px' }}>Descripción</p>
                    <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...INPUT, resize: 'vertical' }} />
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 5px' }}>Componente</p>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '0 0 8px', lineHeight: 1.2 }}>{asset.name}</h2>
                    {asset.description && <p style={{ fontSize: 12, color: C.sub, margin: 0, lineHeight: 1.65 }}>{asset.description}</p>}
                  </>
                )}
              </div>
              {/* Image / icon panel */}
              <div style={{ borderLeft: `1px solid ${C.border}`, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px' }}>
                <div style={{ width: 72, height: 72, borderRadius: 14, background: `${statusColor}12`, border: `1px solid ${statusColor}25`, display: 'grid', placeItems: 'center' }}>
                  <Package size={32} style={{ color: statusColor }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: C.navy, margin: '0 0 2px' }}>{asset.category_name}</p>
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em', margin: 0 }}>{asset.module_name}</p>
                </div>
              </div>
            </div>

            {/* 3-column data grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>

              {/* Col 1: Identificación */}
              <div style={{ padding: '18px 20px', borderRight: `1px solid ${C.border}` }}>
                <ColHeader label="Identificación" />
                {editing ? (
                  <>
                    <EditField label="Número de serie" field="serial_number" placeholder="SN-XXXX-0000" />
                  </>
                ) : (
                  <>
                    {asset.serial_number && <DataCell label="Serial" value={asset.serial_number} mono />}
                    <DataCell label="QR Code"     value={asset.qr_code} mono />
                    <DataCell label="Estado"      value={ASSET_STATUS_LABELS[asset.status]} />
                    <DataCell label="Versión"     value={`v${asset.version}`} />
                    <DataCell label="Creado"      value={fmtDate(asset.created_at)} />
                    <DataCell label="Actualizado" value={fmtDate(asset.updated_at)} />
                  </>
                )}
                {/* QR siempre visible */}
                {editing && (
                  <>
                    <DataCell label="QR Code" value={asset.qr_code} mono />
                    <DataCell label="Estado"  value={ASSET_STATUS_LABELS[asset.status]} />
                  </>
                )}
              </div>

              {/* Col 2: Ubicación */}
              <div style={{ padding: '18px 20px', borderRight: `1px solid ${C.border}` }}>
                <ColHeader label="Ubicación" />
                {editing ? (
                  <>
                    <div style={{ paddingBottom: 14 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.coral, margin: '0 0 4px' }}>Categoría</p>
                      <select value={editForm.category_id} onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))} style={INPUT}>
                        {(categories as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div style={{ paddingBottom: 14 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.coral, margin: '0 0 4px' }}>Ambiente</p>
                      <select value={editForm.environment_id} onChange={e => setEditForm(f => ({ ...f, environment_id: e.target.value }))} style={INPUT}>
                        {(environments as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ''}</option>)}
                      </select>
                    </div>
                    <DataCell label="Módulo" value={asset.module_name} />
                  </>
                ) : (
                  <>
                    <DataCell label="Módulo"    value={asset.module_name} />
                    <DataCell label="Categoría" value={asset.category_name} />
                    <DataCell label="Ambiente"  value={asset.environment_name} />
                    <DataCell label="Sede"      value={asset.location_name} />
                  </>
                )}
              </div>

              {/* Col 3: Asignación (always read-only — managed via actions panel) */}
              <div style={{ padding: '18px 20px' }}>
                <ColHeader label="Asignación" />
                {assignment ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: C.navy, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                          {assignment.user_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
                        </span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a5f', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignment.user_name}</p>
                        <p style={{ fontSize: 10, color: '#3b82f6', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignment.user_email}</p>
                      </div>
                    </div>
                    <DataCell label="Asignado por"     value={assignment.assigned_by_name} />
                    <DataCell label="Fecha asignación" value={fmtDate(assignment.assigned_at)} />
                    {assignment.notes && <DataCell label="Notas" value={assignment.notes} />}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Package size={22} style={{ color: C.border, display: 'block', margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                      {asset.status === 'disponible' ? 'Sin asignación activa' : ASSET_STATUS_LABELS[asset.status]}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Specs section */}
            {(asset.specifications && Object.keys(asset.specifications).length > 0) || editing ? (
              <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>Especificaciones técnicas</p>
                {editing && fieldSchema.length > 0 ? (
                  /* Dynamic fields from field_schema */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {fieldSchema.map((f: FieldDef) => (
                      <div key={f.key}>
                        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.coral, margin: '0 0 4px' }}>{f.label}{f.required ? ' *' : ''}</p>
                        {f.type === 'select' && f.options ? (
                          <select value={editForm.specifications[f.key] ?? ''} onChange={e => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [f.key]: e.target.value } }))} style={INPUT}>
                            <option value="">—</option>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={editForm.specifications[f.key] ?? ''} onChange={e => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [f.key]: e.target.value } }))} style={INPUT} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : editing ? (
                  /* Free-form key-value pairs */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {Object.entries(editForm.specifications).map(([k, v]) => (
                      <div key={k}>
                        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.coral, margin: '0 0 4px' }}>{k}</p>
                        <input value={v} onChange={e => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [k]: e.target.value } }))} style={INPUT} />
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Read mode: chips */
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(asset.specifications!).map(([k, v]) => (
                      <span key={k} style={{ fontSize: 11, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', color: C.sub }}>
                        <strong style={{ color: C.navy, fontWeight: 700 }}>{k}:</strong> {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* Parent asset */}
            {(asset.parent_asset_id || editing) && (
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, background: C.bg, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Link2 size={13} style={{ color: C.muted, flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em' }}>Activo padre: </span>
                  {asset.parent_asset_name ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{asset.parent_asset_name} <StatusBadge status={asset.parent_asset_status!} /></span>
                  ) : (
                    <span style={{ fontSize: 12, color: C.muted }}>Activo raíz / sin padre</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tabs: Tickets / Historial / Hijos */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 20px' }}>
              {([
                ['tickets',   `Tickets (${asset.tickets_count})`],
                ['historial', 'Historial'],
                ['hijos',     `Activos hijos (${asset.children_count})`],
              ] as [typeof activeTab, string][]).map(([tab, label]) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: activeTab === tab ? C.navy : C.muted, borderBottom: `2px solid ${activeTab === tab ? C.coral : 'transparent'}`, marginBottom: -1, transition: 'color .13s, border-color .13s', whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding: '18px 20px' }}>
              {/* TICKETS */}
              {activeTab === 'tickets' && (
                assetTickets.length === 0
                  ? <EmptyState icon={<CheckCircle2 size={24} />} text="Sin tickets asociados a este activo." />
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {assetTickets.map(ticket => {
                      const pColor = PRIORITY_COLORS[ticket.priority] ?? C.muted;
                      return (
                        <div key={ticket.id} style={{ display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: '0 14px', alignItems: 'center', padding: '12px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                          <div style={{ width: 3, height: '100%', background: pColor, borderRadius: 2, alignSelf: 'stretch' }} />
                          <div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: C.coral, fontFamily: 'monospace' }}>#{ticket.id.slice(0, 8)}</span>
                              <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: ticket.is_final ? '#16a34a' : '#c2410c', background: ticket.is_final ? '#f0fdf4' : '#fff7ed', padding: '2px 6px', borderRadius: 4 }}>{ticket.state_label}</span>
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 3px' }}>{ticket.title}</p>
                            <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{ticket.creator_name} · {fmtDate(ticket.created_at)}</p>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: pColor, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>● {ticket.priority}</span>
                        </div>
                      );
                    })}
                  </div>
              )}

              {/* HISTORIAL */}
              {activeTab === 'historial' && (
                history.length === 0
                  ? <EmptyState icon={<Clock size={24} />} text="Sin eventos registrados en el historial." />
                  : <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {history.map((h, i) => {
                      const color = ASSET_ACTION_COLORS[h.action] ?? C.muted;
                      const label = ASSET_ACTION_LABELS[h.action] ?? h.action;
                      return (
                        <div key={h.id} style={{ display: 'flex', gap: 12, paddingBottom: 16, position: 'relative' }}>
                          {i < history.length - 1 && <div style={{ position: 'absolute', left: 12, top: 24, width: 2, height: 'calc(100% - 4px)', background: C.border }} />}
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${color}14`, border: `2px solid ${color}35`, display: 'grid', placeItems: 'center', flexShrink: 0, zIndex: 1 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                          </div>
                          <div style={{ flex: 1, paddingTop: 2 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 2px' }}>{label} {h.user_name && h.user_name !== h.actor_name && <span style={{ fontWeight: 500, color: C.sub }}>{h.user_name}</span>}</p>
                            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 2px' }}>por {h.actor_name} · {fmtDate(h.created_at)}</p>
                            {h.reason && <p style={{ fontSize: 11, color: C.sub, margin: 0, fontStyle: 'italic' }}>{h.reason}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
              )}

              {/* HIJOS */}
              {activeTab === 'hijos' && (
                children.length === 0
                  ? <EmptyState icon={<Boxes size={24} />} text="Este activo no tiene componentes hijos registrados." />
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {children.map(child => {
                      const cc = ASSET_STATUS_COLORS[child.status];
                      return (
                        <div key={child.id} style={{ display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: '0 12px', alignItems: 'center', padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                          <div style={{ width: 3, height: '100%', background: cc, borderRadius: 2, alignSelf: 'stretch' }} />
                          <div>
                            <button type="button" onClick={() => router.push(`/inventory/${child.id}`)}
                              style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textAlign: 'left' }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 3px' }}>{child.name}</p>
                            </button>
                            <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{child.category_name} · {child.qr_code}</p>
                          </div>
                          <StatusBadge status={child.status} />
                        </div>
                      );
                    })}
                  </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: actions panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* FSM transitions */}
          {canEdit && asset.status !== 'dado_de_baja' && FSM_TRANSITIONS[asset.status].length > 0 && (
            <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px' }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.coral, margin: '0 0 10px' }}>Cambiar estado</p>
              <input style={{ ...INPUT, marginBottom: 8 }} placeholder="Motivo (opcional)…" value={transReason} onChange={e => setTransReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FSM_TRANSITIONS[asset.status].map(s => { const c = FSM_COLORS[s] ?? C.muted; return (
                  <button key={s} type="button" disabled={transMut.isPending} onClick={() => transMut.mutate(s)}
                    style={{ padding: '7px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, border: `1.5px solid ${c}55`, background: `${c}12`, color: c, cursor: 'pointer', fontFamily: 'inherit', opacity: transMut.isPending ? .5 : 1 }}>
                    {FSM_LABELS[s] ?? s}
                  </button>
                ); })}
              </div>
            </div>
          )}

          {/* Assign / unassign */}
          {canEdit && (
            <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px' }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.coral, margin: '0 0 10px' }}>Asignación</p>
              {asset.status === 'disponible' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select style={INPUT} defaultValue="" onChange={e => { if (e.target.value) assignMut.mutate(e.target.value); }}>
                    <option value="">Seleccionar usuario…</option>
                    {(moduleUsers as any[]).map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.role_name}</option>)}
                  </select>
                  <button type="button" disabled={assignMut.isPending}
                    onClick={() => {}} /* triggered by select onChange */
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'not-allowed', fontFamily: 'inherit', opacity: .4 }}>
                    <User size={12} /> Seleccionar arriba para asignar
                  </button>
                </div>
              ) : asset.status === 'asignado' && assignment ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>Actualmente asignado a <strong style={{ color: C.navy }}>{assignment.user_name}</strong></p>
                  <button type="button" disabled={unassignMut.isPending} onClick={() => unassignMut.mutate()}
                    style={{ padding: '7px 12px', borderRadius: 6, border: '1.5px solid #ef444455', background: '#ef444410', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {unassignMut.isPending ? 'Devolviendo…' : 'Registrar devolución'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Estado {ASSET_STATUS_LABELS[asset.status]} — sin asignación disponible.</p>
              )}
            </div>
          )}

          {/* Privacy card */}
          <div style={{ background: C.navy, borderRadius: 10, padding: '16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', margin: '0 0 4px' }}>Privacidad</p>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Control de acceso</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', margin: 0, lineHeight: 1.55 }}>
              {canEdit ? 'Vista técnica completa. Serial, QR, historial y auditoría habilitados.' : 'Vista de usuario final. Datos sensibles ocultos por RBAC.'}
            </p>
          </div>
        </div>
      </div>

      {showQr && <QrModal assetId={assetId} assetName={asset.name} onClose={() => setShowQr(false)} />}
    </ModuleLayout>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: '36px 0', textAlign: 'center' }}>
      <div style={{ color: C.border, display: 'flex', justifyContent: 'center', marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{text}</p>
    </div>
  );
}
