'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, QrCode, Pencil, Package, CheckCircle2,
  X, User, Clock, Trash2,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { usersService } from '@/services/users.service';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../../_nav';
import {
  inventoryService,
  type AssetDetail, type AssetStatus, type AssetAssignment,
  type AssetHistoryEntry, type AssetTicket,
  ASSET_STATUS_LABELS, ASSET_STATUS_COLORS,
  ASSET_ACTION_LABELS, ASSET_ACTION_COLORS,
} from '@/services/inventory.service';
import { ADMIN_ROLES } from '@/constants/roles';
import { fmtDate } from '@/lib/formatters';

/* ── Design tokens ────────────────────────────────────────────────────────── */
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
  en_reparacion: '#f59e0b',
  dado_de_baja:  '#ef4444',
  disponible:    '#22c55e',
};
const PRIORITY_COLORS: Record<string, string> = {
  critica: '#ef4444', alta: '#f97316', media: '#f59e0b', baja: '#22c55e',
};

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 12,
  border: `1px solid ${C.border}`, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
};

/* ── StatusBadge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: AssetStatus }) {
  const color = ASSET_STATUS_COLORS[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
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

/* ── ActionsPanel ────────────────────────────────────────────────────────── */
function ActionsPanel({
  asset, moduleId, canEdit,
}: {
  asset: AssetDetail; moduleId: string; canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [assignUid,      setAssignUid]      = useState('');
  const [assignNote,     setAssignNote]     = useState('');
  const [unassignReason, setUnassignReason] = useState('');
  const [transReason,    setTransReason]    = useState('');
  const [editing,        setEditing]        = useState(false);
  const [editForm,       setEditForm]       = useState({ name: asset.name, description: asset.description ?? '', serial_number: asset.serial_number ?? '' });
  const [err,            setErr]            = useState('');

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['asset-detail', asset.id] });
    qc.invalidateQueries({ queryKey: ['asset-assignment', asset.id] });
    qc.invalidateQueries({ queryKey: ['asset-history', asset.id] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const { data: assignment } = useQuery<AssetAssignment | null>({
    queryKey: ['asset-assignment', asset.id],
    queryFn:  () => inventoryService.getCurrentAssignment(asset.id),
    staleTime: 30_000,
    enabled: asset.status === 'asignado',
  });

  const { data: moduleUsers = [] } = useQuery({
    queryKey: ['module-members', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId),
    staleTime: 5 * 60_000,
    enabled: canEdit && asset.status === 'disponible',
  });

  const updateMut   = useMutation({ mutationFn: () => inventoryService.update(asset.id, { name: editForm.name.trim() || undefined, description: editForm.description.trim() || undefined, serial_number: editForm.serial_number.trim() || undefined }), onSuccess: () => { setEditing(false); setErr(''); inv(); }, onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error') });
  const assignMut   = useMutation({ mutationFn: () => inventoryService.assign(asset.id, { user_id: assignUid, notes: assignNote || undefined }), onSuccess: () => { setAssignUid(''); setAssignNote(''); setErr(''); inv(); }, onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error') });
  const unassignMut = useMutation({ mutationFn: () => inventoryService.unassign(asset.id, unassignReason || undefined), onSuccess: () => { setUnassignReason(''); setErr(''); inv(); }, onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error') });
  const transMut    = useMutation({ mutationFn: (s: AssetStatus) => inventoryService.transition(asset.id, { status: s, reason: transReason || undefined }), onSuccess: () => { setTransReason(''); setErr(''); inv(); }, onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error') });

  const sectionTitle = (label: string) => (
    <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.coral, margin: '0 0 10px' }}>{label}</p>
  );

  if (!canEdit) return (
    <div style={{ background: C.navy, borderRadius: 10, padding: '16px' }}>
      {sectionTitle('Acceso')}
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', margin: 0, lineHeight: 1.55 }}>Sin permisos de edición para este activo.</p>
    </div>
  );

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sectionTitle('Acciones')}

      {/* Edit */}
      {asset.status !== 'dado_de_baja' && (
        editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Nombre</p><input style={INPUT} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Serial</p><input style={INPUT} value={editForm.serial_number} onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))} /></div>
            <div><p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Descripción</p><textarea style={{ ...INPUT, minHeight: 64, resize: 'vertical' }} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={!editForm.name.trim() || updateMut.isPending} onClick={() => updateMut.mutate()}
                style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: C.navy, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!editForm.name.trim() || updateMut.isPending) ? .5 : 1 }}>
                {updateMut.isPending ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setEditing(false)} style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, fontSize: 12, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Pencil size={13} /> Editar datos
          </button>
        )
      )}

      {/* Assign */}
      {asset.status === 'disponible' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '.06em' }}>Asignar a usuario</p>
          <select style={INPUT} value={assignUid} onChange={e => setAssignUid(e.target.value)}>
            <option value="">Seleccionar…</option>
            {(moduleUsers as any[]).map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.role_name}</option>)}
          </select>
          <input style={INPUT} placeholder="Notas (opcional)…" value={assignNote} onChange={e => setAssignNote(e.target.value)} />
          <button type="button" disabled={!assignUid || assignMut.isPending} onClick={() => assignMut.mutate()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!assignUid || assignMut.isPending) ? .5 : 1 }}>
            <User size={13} />{assignMut.isPending ? 'Asignando…' : 'Asignar activo'}
          </button>
        </div>
      )}

      {/* Unassign */}
      {asset.status === 'asignado' && assignment && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
          <input style={INPUT} placeholder="Motivo de devolución (opcional)…" value={unassignReason} onChange={e => setUnassignReason(e.target.value)} />
          <button type="button" disabled={unassignMut.isPending} onClick={() => unassignMut.mutate()}
            style={{ padding: '7px 12px', borderRadius: 6, border: '1.5px solid #ef444455', background: '#ef444410', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {unassignMut.isPending ? 'Devolviendo…' : 'Registrar devolución'}
          </button>
        </div>
      )}

      {/* FSM */}
      {asset.status !== 'dado_de_baja' && FSM_TRANSITIONS[asset.status].length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '.06em' }}>Cambiar estado</p>
          <input style={INPUT} placeholder="Motivo (opcional)…" value={transReason} onChange={e => setTransReason(e.target.value)} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FSM_TRANSITIONS[asset.status].map(s => { const c = FSM_COLORS[s] ?? C.muted; return (
              <button key={s} type="button" disabled={transMut.isPending} onClick={() => transMut.mutate(s)}
                style={{ padding: '7px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: `1.5px solid ${c}55`, background: `${c}12`, color: c, cursor: 'pointer', fontFamily: 'inherit', opacity: transMut.isPending ? .5 : 1 }}>
                {FSM_LABELS[s] ?? s}
              </button>
            ); })}
          </div>
        </div>
      )}

      {err && <p style={{ fontSize: 11, color: '#ef4444', margin: 0 }}>{err}</p>}
    </div>
  );
}

/* ── AssetDetailClient ───────────────────────────────────────────────────── */
export function AssetDetailClient({ assetId }: { assetId: string }) {
  const router   = useRouter();
  const { modules } = useModules();
  const inventoryId = modules?.find(isInventoryModule)?.id;
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;
  const canEdit = isSuperadmin || (user?.module_roles?.filter(r => r.status === 'active').some(r => (ADMIN_ROLES as string[]).includes(r.role_name)) ?? false);
  const moduleId = inventoryId ?? '';

  const [showQr,      setShowQr]      = useState(false);
  const [activeTab,   setActiveTab]   = useState<'historial' | 'tickets'>('tickets');

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

  /* ── helpers ── */
  const DataRow = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 12 }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  );

  const ColHeader = ({ label }: { label: string }) => (
    <div style={{ paddingBottom: 10, marginBottom: 14, borderBottom: `2px solid ${C.coral}` }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.navy, margin: 0 }}>{label}</p>
    </div>
  );

  if (isLoading) return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin}>
      <div style={{ padding: '80px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando ficha…</div>
    </ModuleLayout>
  );

  if (!asset) return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin}>
      <div style={{ padding: '80px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Activo no encontrado.</div>
    </ModuleLayout>
  );

  const statusColor = ASSET_STATUS_COLORS[asset.status];

  return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="Ficha completa del activo." isSuperadmin={isSuperadmin}>

      {/* ── Breadcrumb / nav bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => router.push('/inventory')}
            style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.navy, transition: 'background .13s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.background = C.bg)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.coral, margin: '0 0 3px' }}>
              {asset.module_name} · {asset.category_name}
            </p>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: 0, lineHeight: 1.2 }}>{asset.name}</h1>
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

      {/* ── Main 2-col layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 296px', gap: 14, alignItems: 'start' }}>

        {/* ── LEFT: Ficha técnica ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* FICHA PRINCIPAL */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(14,34,53,.06)' }}>

            {/* Card header band */}
            <div style={{ background: '#d9e8f6', padding: '14px 20px', borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.navy, margin: 0 }}>Ficha técnica y operacional del componente</p>
            </div>

            {/* Name + desc + image placeholder */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ padding: '20px' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>Componente</p>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: C.navy, margin: '0 0 10px', lineHeight: 1.2 }}>{asset.name}</h2>
                {asset.description && <p style={{ fontSize: 12, color: C.sub, margin: 0, lineHeight: 1.65 }}>{asset.description}</p>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
                  {[
                    ['Estado',    ASSET_STATUS_LABELS[asset.status]],
                    ['Categoría', asset.category_name],
                    ['Módulo',    asset.module_name],
                    ['Serial',    asset.serial_number ?? '—'],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: C.bg, borderRadius: 6, padding: '8px 10px' }}>
                      <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</p>
                      <p style={{ fontSize: 11, fontWeight: 800, color: C.navy, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: l === 'Serial' ? 'monospace' : 'inherit' }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Image / category panel */}
              <div style={{ borderLeft: `1px solid ${C.border}`, background: C.bg, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ width: 80, height: 80, borderRadius: 16, background: `${statusColor}12`, border: `1px solid ${statusColor}25`, display: 'grid', placeItems: 'center' }}>
                  <Package size={36} style={{ color: statusColor }} />
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
                <DataRow label="QR Code"     value={asset.qr_code} mono />
                {asset.serial_number && <DataRow label="Serial" value={asset.serial_number} mono />}
                <DataRow label="Estado"      value={ASSET_STATUS_LABELS[asset.status]} />
                <DataRow label="Creado"      value={fmtDate(asset.created_at)} />
                <DataRow label="Actualizado" value={fmtDate(asset.updated_at)} />
              </div>

              {/* Col 2: Ubicación */}
              <div style={{ padding: '18px 20px', borderRight: `1px solid ${C.border}` }}>
                <ColHeader label="Ubicación" />
                <DataRow label="Módulo"    value={asset.module_name} />
                <DataRow label="Categoría" value={asset.category_name} />
                <DataRow label="Ambiente"  value={asset.environment_name} />
                <DataRow label="Sede"      value={asset.location_name} />
              </div>

              {/* Col 3: Asignación */}
              <div style={{ padding: '18px 20px' }}>
                <ColHeader label="Asignación" />
                {assignment ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 8, background: C.navy, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                          {assignment.user_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
                        </span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a5f', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignment.user_name}</p>
                        <p style={{ fontSize: 10, color: '#3b82f6', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignment.user_email}</p>
                      </div>
                    </div>
                    <DataRow label="Asignado por"     value={assignment.assigned_by_name} />
                    <DataRow label="Fecha asignación" value={fmtDate(assignment.assigned_at)} />
                    {assignment.notes && <DataRow label="Notas" value={assignment.notes} />}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <Package size={22} style={{ color: C.border, display: 'block', margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                      {asset.status === 'disponible' ? 'Sin asignación activa' : ASSET_STATUS_LABELS[asset.status]}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Specs (if any) */}
            {asset.specifications && Object.keys(asset.specifications).length > 0 && (
              <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>Especificaciones técnicas</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(asset.specifications).map(([k, v]) => (
                    <span key={k} style={{ fontSize: 11, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', color: C.sub }}>
                      <strong style={{ color: C.navy, fontWeight: 700 }}>{k}:</strong> {String(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Relaciones */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '18px 20px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.coral, margin: '0 0 4px' }}>Relaciones y ciclo de vida</p>
            <p style={{ fontSize: 14, fontWeight: 800, color: C.navy, margin: '0 0 14px' }}>Jerarquía del activo</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['Activo padre', 'Activo raíz / sin padre'], ['Activos hijos', 'Sin activos hijos registrados']].map(([l, v]) => (
                <div key={l} style={{ background: C.bg, borderRadius: 7, padding: '12px 14px' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: 0 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tickets + Historial tabs */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 20px' }}>
              {(['tickets', 'historial'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: activeTab === tab ? C.navy : C.muted, borderBottom: `2px solid ${activeTab === tab ? C.coral : 'transparent'}`, marginBottom: -1, transition: 'color .13s, border-color .13s' }}>
                  {tab === 'tickets' ? 'Tickets asociados' : 'Historial de cambios'}
                </button>
              ))}
            </div>
            <div style={{ padding: '18px 20px' }}>
              {activeTab === 'tickets' && (
                assetTickets.length === 0
                  ? <EmptyState icon={<CheckCircle2 size={26} />} text="Sin tickets asociados a este activo." />
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {assetTickets.map(ticket => {
                      const pColor = PRIORITY_COLORS[ticket.priority] ?? C.muted;
                      return (
                        <div key={ticket.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0 14px', alignItems: 'center', padding: '12px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                          <div style={{ width: 3, height: 36, borderRadius: 2, background: pColor, alignSelf: 'stretch' }} />
                          <div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: C.coral, fontFamily: 'monospace' }}>#{ticket.id.slice(0, 8)}</span>
                              <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: ticket.is_final ? '#16a34a' : '#c2410c', background: ticket.is_final ? '#f0fdf4' : '#fff7ed', padding: '2px 6px', borderRadius: 4 }}>{ticket.state_label}</span>
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: 0 }}>{ticket.title}</p>
                            <p style={{ fontSize: 10, color: C.muted, margin: '3px 0 0' }}>{ticket.creator_name} · {fmtDate(ticket.created_at)}</p>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: pColor, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>● {ticket.priority}</span>
                        </div>
                      );
                    })}
                  </div>
              )}
              {activeTab === 'historial' && (
                history.length === 0
                  ? <EmptyState icon={<Clock size={26} />} text="Sin eventos registrados en el historial." />
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
            </div>
          </div>
        </div>

        {/* ── RIGHT: actions + context ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ActionsPanel asset={asset} moduleId={moduleId} canEdit={canEdit} />
          <div style={{ background: C.navy, borderRadius: 10, padding: '16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', margin: '0 0 4px' }}>Privacidad</p>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Visibilidad por capas</p>
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
      <div style={{ color: C.border, display: 'block', marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{text}</p>
    </div>
  );
}
