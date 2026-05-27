'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, QrCode, Package, User, Clock, Pencil, Trash2, Search } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { usersService } from '@/services/users.service';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';
import {
  inventoryService,
  type AssetListItem, type AssetDetail, type AssetStatus, type CreateAssetDto,
  type AssetAssignment, type AssetHistoryEntry,
  ASSET_STATUS_LABELS, ASSET_STATUS_COLORS, ASSET_STATUSES, ASSET_ACTION_LABELS, ASSET_ACTION_COLORS,
} from '@/services/inventory.service';
import { ticketsService } from '@/services/tickets.service';
import { ADMIN_ROLES } from '@/constants/roles';
import { fmtDate } from '@/lib/formatters';


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

type DetailTab = 'info' | 'asignacion' | 'historial';

interface DetailModalProps {
  assetId:    string;
  moduleId:   string;
  canEdit:    boolean;
  onClose:    () => void;
}

function DetailModal({ assetId, moduleId, canEdit, onClose }: DetailModalProps) {
  const qc  = useQueryClient();
  const [tab,       setTab]       = useState<DetailTab>('info');
  const [showQr,    setShowQr]    = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [editForm,  setEditForm]  = useState<{ name: string; description: string; serial_number: string }>({ name: '', description: '', serial_number: '' });
  const [assignUid, setAssignUid] = useState('');
  const [assignNote, setAssignNote] = useState('');
  const [unassignReason, setUnassignReason] = useState('');
  const [transReason, setTransReason] = useState('');
  const [actionErr, setActionErr] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['asset-detail', assetId] });
    qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] });
    qc.invalidateQueries({ queryKey: ['asset-history', assetId] });
  };

  const { data: asset, isLoading } = useQuery<AssetDetail>({
    queryKey: ['asset-detail', assetId],
    queryFn:  () => inventoryService.getOne(assetId),
    staleTime: 30_000,
  });

  const { data: assignment } = useQuery<AssetAssignment | null>({
    queryKey: ['asset-assignment', assetId],
    queryFn:  () => inventoryService.getCurrentAssignment(assetId),
    staleTime: 30_000,
    enabled:  tab === 'asignacion' || asset?.status === 'asignado',
  });

  const { data: history = [] } = useQuery<AssetHistoryEntry[]>({
    queryKey: ['asset-history', assetId],
    queryFn:  () => inventoryService.getHistory(assetId),
    staleTime: 30_000,
    enabled:  tab === 'historial',
  });

  const { data: moduleUsers = [] } = useQuery({
    queryKey: ['module-members', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId),
    staleTime: 5 * 60_000,
    enabled:  tab === 'asignacion' && canEdit,
  });

  const updateMut = useMutation({
    mutationFn: () => inventoryService.update(assetId, {
      name:          editForm.name.trim()          || undefined,
      description:   editForm.description.trim()   || undefined,
      serial_number: editForm.serial_number.trim() || undefined,
    }),
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

  const FSM_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
    disponible:    ['en_reparacion', 'dado_de_baja'],
    asignado:      ['en_reparacion', 'dado_de_baja'],
    en_reparacion: ['disponible', 'dado_de_baja'],
    dado_de_baja:  [],
  };

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', fontSize: 12, fontWeight: active ? 700 : 500,
    border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
    color: active ? '#0F172A' : '#94A3B8',
    borderBottom: `2px solid ${active ? '#6366F1' : 'transparent'}`,
  });

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 12,
    border: '1px solid #E2E8F0', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
        onClick={onClose}
      >
        <div
          style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, position: 'relative' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', zIndex: 1 }}>
            <X size={16} />
          </button>

          {isLoading && <div style={{ padding: '48px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando…</div>}

          {asset && (
            <>
              {/* Header */}
              <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Package size={18} style={{ color: '#6366F1' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 6px', paddingRight: 28 }}>{asset.name}</h2>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <StatusBadge status={asset.status} />
                    {asset.serial_number && (
                      <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>S/N: {asset.serial_number}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginRight: 28 }}>
                  {canEdit && !editing && asset.status !== 'dado_de_baja' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditForm({ name: asset.name, description: asset.description ?? '', serial_number: asset.serial_number ?? '' });
                        setEditing(true);
                        setTab('info');
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <Pencil size={12} /> Editar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowQr(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <QrCode size={13} /> QR
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', padding: '0 24px' }}>
                {(['info', 'asignacion', 'historial'] as DetailTab[]).map((t) => (
                  <button key={t} type="button" style={TAB_STYLE(tab === t)} onClick={() => { setTab(t); setActionErr(''); }}>
                    {t === 'info' ? 'Información' : t === 'asignacion' ? 'Asignación' : 'Historial'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ padding: '20px 24px 24px' }}>

                {/* ── INFO ── */}
                {tab === 'info' && (
                  <>
                    {/* ── Edit form ── */}
                    {editing ? (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Nombre *</label>
                          <input style={inputStyle} value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Número de serie</label>
                          <input style={inputStyle} value={editForm.serial_number}
                            placeholder="SN-XXXX-0000"
                            onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))} />
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Descripción</label>
                          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                            value={editForm.description}
                            onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        {actionErr && <p style={{ fontSize: 11, color: '#EF4444', margin: '0 0 8px' }}>{actionErr}</p>}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" disabled={!editForm.name.trim() || updateMut.isPending}
                            onClick={() => updateMut.mutate()}
                            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#0F172A', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (!editForm.name.trim() || updateMut.isPending) ? .6 : 1 }}>
                            {updateMut.isPending ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button type="button" onClick={() => { setEditing(false); setActionErr(''); }}
                            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {asset.description && (
                          <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, fontSize: 13, color: '#334155', marginBottom: 16, lineHeight: 1.6 }}>
                            {asset.description}
                          </div>
                        )}
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
                        {asset.specifications && Object.keys(asset.specifications).length > 0 && (
                          <div>
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
                      </>
                    )}

                    {/* FSM transitions + delete */}
                    {!editing && canEdit && asset.status !== 'dado_de_baja' && (
                      <div style={{ marginTop: 20 }}>
                        {FSM_TRANSITIONS[asset.status].length > 0 && (
                          <>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', margin: '0 0 8px' }}>ACCIONES DE ESTADO</p>
                            <input style={{ ...inputStyle, marginBottom: 10 }}
                              placeholder="Motivo (opcional)…"
                              value={transReason}
                              onChange={(e) => setTransReason(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                              {FSM_TRANSITIONS[asset.status].map((s) => {
                                const color = FSM_COLORS[s] ?? '#64748B';
                                return (
                                  <button key={s} type="button"
                                    onClick={() => transMut.mutate(s)}
                                    disabled={transMut.isPending}
                                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1.5px solid ${color}66`, background: `${color}11`, color, cursor: 'pointer', fontFamily: 'inherit', opacity: transMut.isPending ? .6 : 1 }}>
                                    {FSM_LABELS[s] ?? s}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                        {asset.status !== 'asignado' && (
                          <button type="button"
                            disabled={deleteMut.isPending}
                            onClick={() => {
                              if (confirm(`¿Eliminar "${asset.name}" del inventario? Esta acción no se puede deshacer.`))
                                deleteMut.mutate();
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            <Trash2 size={12} /> {deleteMut.isPending ? 'Eliminando…' : 'Eliminar activo'}
                          </button>
                        )}
                        {actionErr && <p style={{ fontSize: 11, color: '#EF4444', marginTop: 8 }}>{actionErr}</p>}
                      </div>
                    )}
                  </>
                )}

                {/* ── ASIGNACIÓN ── */}
                {tab === 'asignacion' && (
                  <>
                    {/* Current assignment */}
                    {assignment ? (
                      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#3B82F620', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <User size={16} style={{ color: '#3B82F6' }} />
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F', margin: 0 }}>{assignment.user_name}</p>
                            <p style={{ fontSize: 11, color: '#3B82F6', margin: 0 }}>{assignment.user_email}</p>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#475569' }}>
                          <span>Asignado por <strong>{assignment.assigned_by_name}</strong></span>
                          <span style={{ margin: '0 6px' }}>·</span>
                          <span>{fmtDate(assignment.assigned_at)}</span>
                        </div>
                        {assignment.notes && (
                          <p style={{ fontSize: 11, color: '#64748B', marginTop: 6, fontStyle: 'italic' }}>{assignment.notes}</p>
                        )}
                        {canEdit && (
                          <div style={{ marginTop: 14 }}>
                            <input
                              style={{ ...inputStyle, marginBottom: 8 }}
                              placeholder="Motivo de devolución (opcional)…"
                              value={unassignReason}
                              onChange={(e) => setUnassignReason(e.target.value)}
                            />
                            <button
                              type="button"
                              disabled={unassignMut.isPending}
                              onClick={() => unassignMut.mutate()}
                              style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #EF444466', background: '#EF444411', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: unassignMut.isPending ? .6 : 1 }}
                            >
                              {unassignMut.isPending ? 'Devolviendo…' : 'Registrar devolución'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: 10, marginBottom: 20, textAlign: 'center' }}>
                        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
                          {asset.status === 'disponible' ? 'Sin asignación activa.' : `Estado actual: ${ASSET_STATUS_LABELS[asset.status]}`}
                        </p>
                      </div>
                    )}

                    {/* Assign form */}
                    {canEdit && asset.status === 'disponible' && (
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', margin: '0 0 10px' }}>ASIGNAR A USUARIO</p>
                        <select
                          style={{ ...inputStyle, marginBottom: 8 }}
                          value={assignUid}
                          onChange={(e) => setAssignUid(e.target.value)}
                        >
                          <option value="">Seleccionar usuario…</option>
                          {(moduleUsers as any[]).map((u: any) => (
                            <option key={u.id} value={u.id}>
                              {u.first_name} {u.last_name} — {u.role_name}
                            </option>
                          ))}
                        </select>
                        <input
                          style={{ ...inputStyle, marginBottom: 10 }}
                          placeholder="Notas de asignación (opcional)…"
                          value={assignNote}
                          onChange={(e) => setAssignNote(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={!assignUid || assignMut.isPending}
                          onClick={() => assignMut.mutate()}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3B82F6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (!assignUid || assignMut.isPending) ? .5 : 1 }}
                        >
                          <User size={13} />
                          {assignMut.isPending ? 'Asignando…' : 'Asignar activo'}
                        </button>
                      </div>
                    )}

                    {actionErr && <p style={{ fontSize: 11, color: '#EF4444', marginTop: 10 }}>{actionErr}</p>}
                  </>
                )}

                {/* ── HISTORIAL ── */}
                {tab === 'historial' && (
                  <div>
                    {history.length === 0 && (
                      <div style={{ padding: '32px 0', textAlign: 'center' }}>
                        <Clock size={24} style={{ color: '#CBD5E1', marginBottom: 8 }} />
                        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Sin eventos registrados.</p>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {history.map((h, i) => {
                        const color  = ASSET_ACTION_COLORS[h.action] ?? '#94A3B8';
                        const label  = ASSET_ACTION_LABELS[h.action] ?? h.action;
                        return (
                          <div key={h.id} style={{ display: 'flex', gap: 12, paddingBottom: 16, position: 'relative' }}>
                            {i < history.length - 1 && (
                              <div style={{ position: 'absolute', left: 15, top: 26, width: 2, height: 'calc(100% - 10px)', background: '#F1F5F9' }} />
                            )}
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${color}15`, border: `2px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                            </div>
                            <div style={{ flex: 1, paddingTop: 4 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', margin: '0 0 2px' }}>
                                {label} {h.user_name && h.user_name !== h.actor_name && <span style={{ fontWeight: 400, color: '#64748B' }}>{h.user_name}</span>}
                              </p>
                              <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 2px' }}>
                                por {h.actor_name} · {fmtDate(h.created_at)}
                              </p>
                              {h.reason && (
                                <p style={{ fontSize: 11, color: '#64748B', margin: 0, fontStyle: 'italic' }}>{h.reason}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
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
  const { modules } = useModules();
  const inventoryId = modules?.find(isInventoryModule)?.id;
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

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
  const [search,         setSearch]         = useState('');
  const [debouncedQ,     setDebouncedQ]     = useState('');
  const [showCreate,     setShowCreate]     = useState(false);
  const [detailId,       setDetailId]       = useState<string | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(v: string) {
    setSearch(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setDebouncedQ(v.trim()), 350);
  }

  const qk = ['inventory', selectedModule, statusFilter, debouncedQ];
  const { data: assets = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn:  () => inventoryService.getAll(selectedModule || undefined, statusFilter || undefined, debouncedQ || undefined),
    staleTime: 60_000,
  });

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach((a) => { counts[a.status] = (counts[a.status] ?? 0) + 1; });
    return counts;
  }, [assets]);

  return (
    <ModuleLayout
      moduleId={inventoryId || selectedModule || undefined}
      title="Inventario"
      description="Registro y trazabilidad de activos organizacionales. Controla equipos, hardware y recursos asignados por módulo."
      isSuperadmin={isSuperadmin}
    >
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por nombre, serie o QR…"
            style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }}
          />
        </div>
        {canEdit && selectedModule && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 15px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', background: '#6366F1', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
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
        <DetailModal
          assetId={detailId}
          moduleId={selectedModule || inventoryId || ''}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
        />
      )}
    </ModuleLayout>
  );
}
