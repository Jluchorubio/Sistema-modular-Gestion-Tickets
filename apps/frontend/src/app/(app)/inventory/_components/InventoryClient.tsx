'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, QrCode, Package, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import type { ModuleNavItem } from '@/types/nav.types';
import {
  inventoryService,
  type AssetListItem, type AssetDetail, type AssetStatus, type CreateAssetDto,
  ASSET_STATUS_LABELS, ASSET_STATUS_COLORS, ASSET_STATUSES,
} from '@/services/inventory.service';
import { ticketsService } from '@/services/tickets.service';
import { ADMIN_ROLES } from '@/constants/roles';
import { fmtDate } from '@/lib/formatters';

const INVENTORY_NAV: ModuleNavItem[] = [
  { key: 'inventory', label: 'Inventario', Icon: Package, href: '/inventory' },
];

/* ── Status badge ────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: AssetStatus }) {
  const color = ASSET_STATUS_COLORS[status];
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

/* ── QR modal ────────────────────────────────────────────────────────────── */

function QrModal({ assetId, assetName, onClose }: { assetId: string; assetName: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['asset-qr', assetId],
    queryFn:  () => inventoryService.getQr(assetId),
    staleTime: 10 * 60_000,
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, padding: '28px 32px', textAlign: 'center', maxWidth: 300, width: '100%', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
          <X size={15} />
        </button>
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

/* ── Asset detail modal ──────────────────────────────────────────────────── */

interface DetailModalProps {
  assetId:  string;
  canEdit:  boolean;
  onClose:  () => void;
}

function DetailModal({ assetId, canEdit, onClose }: DetailModalProps) {
  const qc = useQueryClient();
  const [showQr, setShowQr] = useState(false);

  const { data: asset, isLoading } = useQuery<AssetDetail>({
    queryKey: ['asset-detail', assetId],
    queryFn:  () => inventoryService.getOne(assetId),
    staleTime: 30_000,
  });

  const statusMut = useMutation({
    mutationFn: (status: AssetStatus) => inventoryService.updateStatus(assetId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['asset-detail', assetId] });
    },
  });

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0',
    fontSize: 12, background: '#fff', fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
        onClick={onClose}
      >
        <div
          style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, padding: '28px 28px 24px', position: 'relative' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
            <X size={16} />
          </button>

          {isLoading && <div style={{ padding: '48px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando…</div>}

          {asset && (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Package size={18} style={{ color: '#6366F1' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>{asset.name}</h2>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <StatusBadge status={asset.status} />
                    {asset.serial_number && (
                      <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>S/N: {asset.serial_number}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQr(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <QrCode size={13} /> QR
                </button>
              </div>

              {/* Description */}
              {asset.description && (
                <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, fontSize: 13, color: '#334155', marginBottom: 16, lineHeight: 1.6 }}>
                  {asset.description}
                </div>
              )}

              {/* Meta grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 12, marginBottom: 20 }}>
                {([
                  ['Módulo',      asset.module_name],
                  ['Categoría',   asset.category_name],
                  ['Ambiente',    asset.environment_name],
                  ['Sede',        asset.location_name],
                  ['QR Code',     asset.qr_code],
                  ['Actualizado', fmtDate(asset.updated_at)],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label}>
                    <span style={{ color: '#94A3B8', fontWeight: 500 }}>{label}: </span>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Specifications */}
              {asset.specifications && Object.keys(asset.specifications).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', margin: '0 0 8px' }}>ESPECIFICACIONES</p>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px' }}>
                    {Object.entries(asset.specifications).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#94A3B8', fontWeight: 500, minWidth: 100 }}>{k}:</span>
                        <span style={{ color: '#334155' }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status change */}
              {canEdit && !['dado_de_baja'].includes(asset.status) && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', margin: '0 0 8px' }}>CAMBIAR ESTADO</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {ASSET_STATUSES.filter((s) => s !== asset.status).map((s) => {
                      const color = ASSET_STATUS_COLORS[s];
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => statusMut.mutate(s)}
                          disabled={statusMut.isPending}
                          style={{
                            padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                            border: `1.5px solid ${color}66`,
                            background: `${color}11`,
                            color,
                            cursor: 'pointer', fontFamily: 'inherit',
                            opacity: statusMut.isPending ? .6 : 1,
                          }}
                        >
                          → {ASSET_STATUS_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showQr && asset && (
        <QrModal assetId={assetId} assetName={asset.name} onClose={() => setShowQr(false)} />
      )}
    </>
  );
}

/* ── Create modal ────────────────────────────────────────────────────────── */

function CreateModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();

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

  const [form, setForm] = useState<Partial<CreateAssetDto>>({ module_id: moduleId });
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: () => inventoryService.create(form as CreateAssetDto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear el activo.'),
  });

  function set(key: keyof CreateAssetDto, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim())      { setError('Nombre requerido.'); return; }
    if (!form.category_id)       { setError('Categoría requerida.'); return; }
    if (!form.environment_id)    { setError('Ambiente requerido.'); return; }
    setError('');
    createMut.mutate();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    border: '1px solid #E2E8F0', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', background: '#fff',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4,
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '28px 28px 24px', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={15} style={{ color: '#6366F1' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Nuevo activo</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>Registrar activo de inventario</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input type="text" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Laptop Dell XPS 15…" maxLength={255} style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Categoría *</label>
              <select value={form.category_id ?? ''} onChange={(e) => set('category_id', e.target.value)} style={inputStyle}>
                <option value="">Seleccionar…</option>
                {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ambiente *</label>
              <select value={form.environment_id ?? ''} onChange={(e) => set('environment_id', e.target.value)} style={inputStyle}>
                <option value="">Seleccionar…</option>
                {(environments ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ''}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Número de serie</label>
            <input type="text" value={form.serial_number ?? ''} onChange={(e) => set('serial_number', e.target.value)} placeholder="SN-XXXX-0000" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Descripción</label>
            <textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Descripción del activo…" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>
              Cancelar
            </button>
            <button type="submit" disabled={createMut.isPending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: createMut.isPending ? .7 : 1 }}>
              <Plus size={13} />
              {createMut.isPending ? 'Registrando…' : 'Registrar activo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Asset card ──────────────────────────────────────────────────────────── */

function AssetCard({ asset, onClick }: { asset: AssetListItem; onClick: () => void }) {
  const color = ASSET_STATUS_COLORS[asset.status];
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 12, border: `1.5px solid #E8EDF3`,
        padding: '16px 18px', cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s',
        borderTop: `3px solid ${color}`,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; (e.currentTarget as HTMLElement).style.borderColor = `${color}88`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.borderColor = '#E8EDF3'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Package size={15} style={{ color }} />
        </div>
        <StatusBadge status={asset.status} />
      </div>

      <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.name}
      </p>
      <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.category_name} · {asset.environment_name}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#CBD5E1' }}>{asset.location_name}</span>
        {asset.serial_number && (
          <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>
            {asset.serial_number.length > 14 ? asset.serial_number.slice(0, 14) + '…' : asset.serial_number}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */

export function InventoryClient() {
  useModuleNav('Inventario', INVENTORY_NAV);

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const activeModules = useMemo(() => {
    const roles = user?.module_roles?.filter((r) => r.status === 'active') ?? [];
    const seen  = new Set<string>();
    const unique: { module_id: string; module_name: string; role_name: string }[] = [];
    for (const r of roles) {
      if (!seen.has(r.module_id)) { seen.add(r.module_id); unique.push(r); }
    }
    return unique;
  }, [user]);

  const canEdit = useMemo(() => {
    if (isSuperadmin) return true;
    const roles = user?.module_roles?.filter((r) => r.status === 'active').map((r) => r.role_name) ?? [];
    return roles.some((r) => (ADMIN_ROLES as string[]).includes(r));
  }, [user, isSuperadmin]);

  const [selectedModule, setSelectedModule] = useState(activeModules[0]?.module_id ?? '');
  const [statusFilter,   setStatusFilter]   = useState<AssetStatus | ''>('');
  const [showCreate,     setShowCreate]     = useState(false);
  const [detailId,       setDetailId]       = useState<string | null>(null);

  const qk = ['inventory', selectedModule, statusFilter];
  const { data: assets = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn:  () => inventoryService.getAll(selectedModule || undefined, statusFilter || undefined),
    staleTime: 60_000,
  });

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach((a) => { counts[a.status] = (counts[a.status] ?? 0) + 1; });
    return counts;
  }, [assets]);

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Inventario</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>
            {assets.length} activo{assets.length !== 1 ? 's' : ''}
            {statusFilter ? ` · ${ASSET_STATUS_LABELS[statusFilter]}` : ''}
          </p>
        </div>
        {canEdit && selectedModule && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 15px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', background: '#6366F1', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Plus size={13} /> Nuevo activo
          </button>
        )}
      </div>

      {/* ── Module tabs ── */}
      {activeModules.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {!isSuperadmin && (
            <button type="button" onClick={() => setSelectedModule('')}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1.5px solid ${!selectedModule ? '#6366F1' : '#E2E8F0'}`, background: !selectedModule ? '#6366F115' : '#fff', color: !selectedModule ? '#6366F1' : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Todos
            </button>
          )}
          {activeModules.map((m) => (
            <button key={m.module_id} type="button" onClick={() => setSelectedModule(m.module_id)}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1.5px solid ${selectedModule === m.module_id ? '#6366F1' : '#E2E8F0'}`, background: selectedModule === m.module_id ? '#6366F115' : '#fff', color: selectedModule === m.module_id ? '#6366F1' : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              {m.module_name}
            </button>
          ))}
        </div>
      )}

      {/* ── Status filter pills ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setStatusFilter('')}
          style={{ padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, border: `1.5px solid ${!statusFilter ? '#0D1B2A' : '#E2E8F0'}`, background: !statusFilter ? '#0D1B2A' : '#fff', color: !statusFilter ? '#fff' : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
          Todos ({assets.length})
        </button>
        {(['disponible', 'asignado', 'en_reparacion', 'dado_de_baja'] as AssetStatus[]).map((s) => {
          const color  = ASSET_STATUS_COLORS[s];
          const active = statusFilter === s;
          const count  = statusCounts[s] ?? 0;
          return (
            <button key={s} type="button" onClick={() => setStatusFilter(active ? '' : s)}
              style={{ padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, border: `1.5px solid ${active ? color : '#E2E8F0'}`, background: active ? `${color}22` : '#fff', color: active ? color : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              {ASSET_STATUS_LABELS[s]} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Grid ── */}
      {isLoading && (
        <div style={{ padding: '56px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          Cargando activos…
        </div>
      )}

      {!isLoading && assets.length === 0 && (
        <div style={{ padding: '56px 0', textAlign: 'center' }}>
          <Package size={32} style={{ color: '#CBD5E1', marginBottom: 12 }} />
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            {statusFilter ? `Sin activos con estado "${ASSET_STATUS_LABELS[statusFilter]}".` : 'No hay activos registrados en este módulo.'}
          </p>
          {canEdit && selectedModule && !statusFilter && (
            <button type="button" onClick={() => setShowCreate(true)}
              style={{ marginTop: 14, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Registrar primer activo
            </button>
          )}
        </div>
      )}

      {assets.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} onClick={() => setDetailId(a.id)} />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && selectedModule && (
        <CreateModal moduleId={selectedModule} onClose={() => setShowCreate(false)} />
      )}
      {detailId && (
        <DetailModal assetId={detailId} canEdit={canEdit} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
