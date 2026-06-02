'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, QrCode, Pencil, Package, CheckCircle2,
  X, User, Clock, Save, Boxes, FileText, Link2, ImagePlus, Trash2,
  ChevronRight, ChevronLeft, Plus,
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
  type AssetImage,
  ASSET_STATUS_LABELS, ASSET_STATUS_COLORS,
  ASSET_ACTION_LABELS, ASSET_ACTION_COLORS,
} from '@/services/inventory.service';
import { ADMIN_ROLES } from '@/constants/roles';
import { fmtDate } from '@/lib/formatters';

/* ── Tokens ── */
const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
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

/* ── StatusBadge ── */
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

/* ── QrModal ── */
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

/* ── SectionHeader ── */
function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${C.coral}` }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.navy, margin: 0 }}>{label}</p>
      {action}
    </div>
  );
}

/* ── DataCell ── */
function DataCell({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div style={{ paddingBottom: 12 }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: 0, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all', lineHeight: 1.4 }}>{value || '—'}</p>
    </div>
  );
}

/* ── EmptyState ── */
function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: '28px 0', textAlign: 'center' }}>
      <div style={{ color: C.border, display: 'flex', justifyContent: 'center', marginBottom: 10 }}>{icon}</div>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{text}</p>
    </div>
  );
}

/* ── AssetDetailClient ── */
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
  const [showQr,      setShowQr]      = useState(false);
  const [editing,     setEditing]     = useState(false);
  const [actionErr,   setActionErr]   = useState('');
  const [transReason, setTransReason] = useState('');
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [newSpecKey,  setNewSpecKey]  = useState('');
  const [newSpecVal,  setNewSpecVal]  = useState('');
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const carouselTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* startCarousel — declared early, images.length passed as arg */
  const startCarousel = useCallback((total: number) => {
    if (total <= 1) return;
    if (carouselTimer.current) clearInterval(carouselTimer.current);
    carouselTimer.current = setInterval(() => {
      setCarouselIdx(i => (i + 1) % total);
    }, 4000);
  }, []);

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
  });

  const { data: assetTickets = [] } = useQuery<AssetTicket[]>({
    queryKey: ['asset-tickets', assetId],
    queryFn:  () => inventoryService.getAssetTickets(assetId),
    staleTime: 60_000,
  });

  const { data: history = [] } = useQuery<AssetHistoryEntry[]>({
    queryKey: ['asset-history', assetId],
    queryFn:  () => inventoryService.getHistory(assetId),
    staleTime: 30_000,
  });

  const { data: images = [] } = useQuery<AssetImage[]>({
    queryKey: ['asset-images', assetId],
    queryFn:  () => inventoryService.getAssetImages(assetId),
    staleTime: 60_000,
  });

  /* Carousel auto-advance — placed after images query */
  useEffect(() => {
    if (images.length > 1) startCarousel(images.length);
    return () => { if (carouselTimer.current) clearInterval(carouselTimer.current); };
  }, [images.length, startCarousel]);

  function prevSlide() {
    if (carouselTimer.current) clearInterval(carouselTimer.current);
    setCarouselIdx(i => (i - 1 + images.length) % images.length);
    startCarousel(images.length);
  }
  function nextSlide() {
    if (carouselTimer.current) clearInterval(carouselTimer.current);
    setCarouselIdx(i => (i + 1) % images.length);
    startCarousel(images.length);
  }

  const { data: children = [] } = useQuery<AssetChild[]>({
    queryKey: ['asset-children', assetId],
    queryFn:  () => inventoryService.getChildAssets(assetId),
    staleTime: 60_000,
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
    enabled: !!moduleId && asset?.status === 'disponible',
  });

  /* ── Edit form ── */
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
      name: asset.name, description: asset.description ?? '',
      serial_number: asset.serial_number ?? '',
      category_id: asset.category_id, environment_id: asset.environment_id,
      specifications: specs,
    });
    setNewSpecKey(''); setNewSpecVal('');
    setEditing(true); setActionErr('');
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
    onSuccess: () => {
      setTransReason(''); setActionErr(''); inv();
      qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error'),
  });

  const assignMut = useMutation({
    mutationFn: (userId: string) => inventoryService.assign(assetId, { user_id: userId }),
    onSuccess: () => {
      inv();
      qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] });
      qc.invalidateQueries({ queryKey: ['asset-history', assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error'),
  });

  const unassignMut = useMutation({
    mutationFn: () => inventoryService.unassign(assetId),
    onSuccess: () => {
      inv();
      qc.invalidateQueries({ queryKey: ['asset-assignment', assetId] });
      qc.invalidateQueries({ queryKey: ['asset-history', assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error'),
  });

  const uploadImgMut = useMutation({
    mutationFn: (file: File) => inventoryService.uploadAssetImage(assetId, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asset-images', assetId] }); inv(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error al subir imagen'),
  });

  const deleteImgMut = useMutation({
    mutationFn: (imageId: string) => inventoryService.deleteAssetImage(assetId, imageId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asset-images', assetId] }); inv(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? 'Error al eliminar imagen'),
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setActionErr('La imagen no puede superar 5 MB.'); return; }
    uploadImgMut.mutate(file);
    e.target.value = '';
  }

  function addFreeSpec() {
    if (!newSpecKey.trim()) return;
    setEditForm(f => ({ ...f, specifications: { ...f.specifications, [newSpecKey.trim()]: newSpecVal.trim() } }));
    setNewSpecKey(''); setNewSpecVal('');
  }

  /* ── Field schema ── */
  const fieldSchema: FieldDef[] = useMemo(() => asset?.field_schema ?? [], [asset]);

  /* ── Custodian history (asignado / devuelto actions) ── */
  const custodianHistory = useMemo(
    () => history.filter(h => ['asignado', 'devuelto'].includes(h.action)),
    [history],
  );

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

  return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin} hideInfo>

      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => router.push('/inventory')}
          style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.navy }}>
          <ArrowLeft size={14} />
        </button>
        <span style={{ fontSize: 11, color: C.muted }}>Inventario</span>
        <ChevronRight size={12} style={{ color: C.muted }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{asset.name}</span>
      </div>

      {/* ── Error bar ── */}
      {actionErr && (
        <div style={{ padding: '8px 16px', background: '#FEF2F2', border: `1px solid #FECACA`, borderRadius: 8, marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: '#EF4444', margin: 0 }}>{actionErr}</p>
        </div>
      )}

      {/* ── Header card ── */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 14, overflow: 'hidden', boxShadow: '0 2px 14px rgba(14,34,53,.07)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr' }}>

          {/* Left: image carousel */}
          <div style={{ background: C.bg, borderRight: `1px solid ${C.border}`, position: 'relative', height: 190, overflow: 'hidden', flexShrink: 0 }}>
            {images.length > 0 ? (
              <>
                {/* Slide */}
                <img
                  src={images[Math.min(carouselIdx, images.length - 1)].storage_url}
                  alt={images[Math.min(carouselIdx, images.length - 1)].file_name}
                  style={{ width: '100%', height: 190, objectFit: 'cover', display: 'block', cursor: 'pointer', transition: 'opacity .25s' }}
                  onClick={() => setLightboxImg(images[Math.min(carouselIdx, images.length - 1)].storage_url)}
                />
                {/* Prev / Next */}
                {images.length > 1 && (
                  <>
                    <button type="button" onClick={prevSlide}
                      style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 7, background: 'rgba(14,34,53,.6)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff' }}>
                      <ChevronLeft size={14} />
                    </button>
                    <button type="button" onClick={nextSlide}
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 7, background: 'rgba(14,34,53,.6)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff' }}>
                      <ChevronRight size={14} />
                    </button>
                    {/* Dots */}
                    <div style={{ position: 'absolute', bottom: 7, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
                      {images.map((_, idx) => (
                        <button key={idx} type="button"
                          onClick={() => { if (carouselTimer.current) clearInterval(carouselTimer.current); setCarouselIdx(idx); startCarousel(images.length); }}
                          style={{ width: idx === Math.min(carouselIdx, images.length - 1) ? 18 : 7, height: 7, borderRadius: 99, background: idx === Math.min(carouselIdx, images.length - 1) ? '#fff' : 'rgba(255,255,255,.5)', border: 'none', cursor: 'pointer', padding: 0, transition: 'width .2s, background .2s' }} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                <div style={{ width: 66, height: 66, borderRadius: 14, background: `${statusColor}14`, border: `1px solid ${statusColor}25`, display: 'grid', placeItems: 'center' }}>
                  <Package size={30} style={{ color: statusColor }} />
                </div>
                <p style={{ fontSize: 10, color: C.muted, margin: 0, textAlign: 'center', padding: '0 12px', lineHeight: 1.4 }}>{asset.category_name}</p>
              </div>
            )}
          </div>

          {/* Right: info + action buttons */}
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.coral, textTransform: 'uppercase', letterSpacing: '.1em', margin: '0 0 3px' }}>
                {asset.module_name} · {asset.category_name}
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: 0, lineHeight: 1.2, flex: 1 }}>{asset.name}</h1>
                <StatusBadge status={asset.status} />
              </div>
              <p style={{ fontSize: 10, color: C.muted, margin: '0 0 14px', fontFamily: 'monospace', letterSpacing: '.06em' }}>{asset.qr_code}</p>

              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {asset.environment_name && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 2px' }}>Ubicación</p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, margin: 0 }}>
                      {asset.environment_name}{asset.location_name ? ` · ${asset.location_name}` : ''}
                    </p>
                  </div>
                )}
                {assignment && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 2px' }}>Responsable</p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, margin: 0 }}>{assignment.user_name}</p>
                  </div>
                )}
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 2px' }}>Registrado</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, margin: 0 }}>{fmtDate(asset.created_at)}</p>
                </div>
                {asset.serial_number && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 2px' }}>N° Serie</p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, margin: 0, fontFamily: 'monospace' }}>{asset.serial_number}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {canEdit && asset.status !== 'dado_de_baja' && (
                editing ? (
                  <>
                    <button type="button" disabled={updateMut.isPending} onClick={() => updateMut.mutate()}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: 'none', background: C.navy, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: updateMut.isPending ? .6 : 1 }}>
                      <Save size={12} />{updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button type="button" onClick={() => { setEditing(false); setActionErr(''); }}
                      style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: C.sub }}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={startEditing}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Pencil size={12} /> Editar
                  </button>
                )
              )}
              <button type="button" onClick={() => setShowQr(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.coral, cursor: 'pointer', fontFamily: 'inherit' }}>
                <QrCode size={12} /> Ver QR
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body: left sections + right sidebar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 14, alignItems: 'start' }}>

        {/* ── LEFT: sections ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 1. Información general */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '18px 20px', boxShadow: '0 1px 8px rgba(14,34,53,.05)' }}>
            <SectionHeader label="Información general" />
            {editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 4px' }}>Nombre *</p>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ ...INPUT, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 4px' }}>N° de Serie</p>
                  <input value={editForm.serial_number} onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))} style={INPUT} placeholder="SN-XXXX" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 4px' }}>Descripción</p>
                  <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...INPUT, resize: 'vertical' }} />
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 4px' }}>Categoría</p>
                  <select value={editForm.category_id} onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))} style={INPUT}>
                    {(categories as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 4px' }}>Ambiente</p>
                  <select value={editForm.environment_id} onChange={e => setEditForm(f => ({ ...f, environment_id: e.target.value }))} style={INPUT}>
                    {(environments as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ''}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
                {asset.description && (
                  <div style={{ gridColumn: '1 / -1', paddingBottom: 14 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 4px' }}>Descripción</p>
                    <p style={{ fontSize: 12, color: C.sub, margin: 0, lineHeight: 1.65 }}>{asset.description}</p>
                  </div>
                )}
                <DataCell label="Estado"      value={ASSET_STATUS_LABELS[asset.status]} />
                <DataCell label="QR Code"     value={asset.qr_code} mono />
                {asset.serial_number
                  ? <DataCell label="N° de Serie" value={asset.serial_number} mono />
                  : <DataCell label="Versión"     value={`v${asset.version}`} />
                }
                <DataCell label="Módulo"      value={asset.module_name} />
                <DataCell label="Categoría"   value={asset.category_name} />
                <DataCell label="Ambiente"    value={asset.environment_name} />
                <DataCell label="Sede"        value={asset.location_name} />
                <DataCell label="Registrado"  value={fmtDate(asset.created_at)} />
                <DataCell label="Actualizado" value={fmtDate(asset.updated_at)} />
              </div>
            )}
          </div>

          {/* 2. Especificaciones */}
          {((asset.specifications && Object.keys(asset.specifications).length > 0) || fieldSchema.length > 0 || editing) && (
            <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '18px 20px', boxShadow: '0 1px 8px rgba(14,34,53,.05)' }}>
              <SectionHeader label="Especificaciones" />
              {editing ? (
                fieldSchema.length > 0 ? (
                  /* Schema-driven fields */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {fieldSchema.map((f: FieldDef) => (
                      <div key={f.key}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: C.coral, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 4px' }}>{f.label}{f.required ? ' *' : ''}</p>
                        {f.type === 'select' && f.options ? (
                          <select value={editForm.specifications[f.key] ?? ''} onChange={e => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [f.key]: e.target.value } }))} style={INPUT}>
                            <option value="">—</option>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : f.type === 'boolean' ? (
                          <select value={editForm.specifications[f.key] ?? ''} onChange={e => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [f.key]: e.target.value } }))} style={INPUT}>
                            <option value="">—</option>
                            <option value="Sí">Sí</option>
                            <option value="No">No</option>
                          </select>
                        ) : (
                          <input
                            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                            value={editForm.specifications[f.key] ?? ''}
                            onChange={e => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [f.key]: e.target.value } }))}
                            style={INPUT}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Free-form key-value */
                  <div>
                    {Object.entries(editForm.specifications).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, margin: 0, minWidth: 140, flexShrink: 0 }}>{k}</p>
                        <input value={v} onChange={e => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [k]: e.target.value } }))} style={{ ...INPUT, flex: 1 }} />
                        <button type="button"
                          onClick={() => setEditForm(frm => { const s = { ...frm.specifications }; delete s[k]; return { ...frm, specifications: s }; })}
                          style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid #FECACA`, background: '#FEF2F2', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#EF4444', flexShrink: 0 }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                    {/* Add new spec field */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
                      <input
                        value={newSpecKey}
                        onChange={e => setNewSpecKey(e.target.value)}
                        placeholder="Nombre del campo"
                        style={{ ...INPUT, flex: '0 0 150px' }}
                        onKeyDown={e => { if (e.key === 'Enter') addFreeSpec(); }}
                      />
                      <input
                        value={newSpecVal}
                        onChange={e => setNewSpecVal(e.target.value)}
                        placeholder="Valor"
                        style={{ ...INPUT, flex: 1 }}
                        onKeyDown={e => { if (e.key === 'Enter') addFreeSpec(); }}
                      />
                      <button type="button" onClick={addFreeSpec} disabled={!newSpecKey.trim()}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 6, border: 'none', background: C.navy, color: '#fff', fontSize: 11, fontWeight: 700, cursor: newSpecKey.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: newSpecKey.trim() ? 1 : .5, flexShrink: 0 }}>
                        <Plus size={12} /> Agregar
                      </button>
                    </div>
                  </div>
                )
              ) : (
                /* Read mode */
                asset.specifications && Object.keys(asset.specifications).length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {Object.entries(asset.specifications).map(([k, v]) => {
                      const label = fieldSchema.find(f => f.key === k)?.label ?? k;
                      return (
                        <div key={k} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 14px' }}>
                          <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 3px' }}>{label}</p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: 0 }}>{String(v)}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Sin especificaciones registradas. Editar para completar.</p>
                )
              )}
            </div>
          )}

          {/* 3. Relaciones */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '18px 20px', boxShadow: '0 1px 8px rgba(14,34,53,.05)' }}>
            <SectionHeader label={`Relaciones${children.length > 0 ? ` · ${children.length} componente${children.length !== 1 ? 's' : ''}` : ''}`} />

            {/* Parent */}
            {asset.parent_asset_id ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Activo padre</p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <Link2 size={14} style={{ color: C.coral }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{asset.parent_asset_name || '—'}</span>
                  {asset.parent_asset_status && <StatusBadge status={asset.parent_asset_status} />}
                </div>
              </div>
            ) : null}

            {/* Children */}
            {children.length > 0 ? (
              <div>
                {asset.parent_asset_id && (
                  <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Componentes hijos</p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                  {children.map(child => (
                    <button key={child.id} type="button" onClick={() => router.push(`/inventory/${child.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: ASSET_STATUS_COLORS[child.status], flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{child.name}</p>
                        <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{child.category_name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : !asset.parent_asset_id ? (
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Activo raíz, sin componentes hijos registrados.</p>
            ) : (
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Sin componentes hijos registrados.</p>
            )}
          </div>

          {/* 4. Responsable */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '18px 20px', boxShadow: '0 1px 8px rgba(14,34,53,.05)' }}>
            <SectionHeader label="Responsable" />

            {/* Current custodian */}
            {assignment ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#EFF6FF', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: C.navy, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                    {assignment.user_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', margin: '0 0 2px' }}>{assignment.user_name}</p>
                  <p style={{ fontSize: 10, color: '#3b82f6', margin: '0 0 2px' }}>{assignment.user_email}</p>
                  <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>Desde {fmtDate(assignment.assigned_at)}</p>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '.07em', background: '#DBEAFE', padding: '3px 8px', borderRadius: 6 }}>Activo</span>
              </div>
            ) : (
              <div style={{ padding: '12px', background: C.bg, borderRadius: 8, textAlign: 'center', marginBottom: custodianHistory.length > 0 ? 16 : 0 }}>
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Sin custodio asignado actualmente</p>
              </div>
            )}

            {/* Custodian history */}
            {custodianHistory.length > 0 && (
              <>
                <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 10px' }}>Historial de custodios</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {custodianHistory.slice(0, 10).map(h => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.bg, borderRadius: 7, border: `1px solid ${C.border}` }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: h.action === 'asignado' ? '#3b82f6' : '#22c55e', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.user_name || h.actor_name}</p>
                        <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{ASSET_ACTION_LABELS[h.action] ?? h.action} · {fmtDate(h.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 5. Tickets */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '18px 20px', boxShadow: '0 1px 8px rgba(14,34,53,.05)' }}>
            <SectionHeader label={`Tickets asociados${asset.tickets_count > 0 ? ` (${asset.tickets_count})` : ''}`} />
            {assetTickets.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={22} />} text="Sin tickets asociados a este activo." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {assetTickets.map(ticket => {
                  const pColor = PRIORITY_COLORS[ticket.priority] ?? C.muted;
                  return (
                    <div key={ticket.id} style={{ display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: '0 12px', alignItems: 'center', padding: '10px 12px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ width: 4, height: '100%', background: pColor, borderRadius: 2, alignSelf: 'stretch' }} />
                      <div>
                        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.coral, fontFamily: 'monospace' }}>#{ticket.id.slice(0, 8)}</span>
                          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: ticket.is_final ? '#16a34a' : '#c2410c', background: ticket.is_final ? '#f0fdf4' : '#fff7ed', padding: '2px 6px', borderRadius: 4 }}>{ticket.state_label}</span>
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 2px' }}>{ticket.title}</p>
                        <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{ticket.creator_name} · {fmtDate(ticket.created_at)}</p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: pColor, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>● {ticket.priority}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. Historial completo */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '18px 20px', boxShadow: '0 1px 8px rgba(14,34,53,.05)' }}>
            <SectionHeader label="Historial" />
            {history.length === 0 ? (
              <EmptyState icon={<Clock size={22} />} text="Sin eventos registrados." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {history.map((h, i) => {
                  const color = ASSET_ACTION_COLORS[h.action] ?? C.muted;
                  const label = ASSET_ACTION_LABELS[h.action] ?? h.action;
                  return (
                    <div key={h.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
                      {i < history.length - 1 && <div style={{ position: 'absolute', left: 11, top: 22, width: 2, height: 'calc(100% - 4px)', background: C.border }} />}
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${color}14`, border: `2px solid ${color}35`, display: 'grid', placeItems: 'center', flexShrink: 0, zIndex: 1 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                      </div>
                      <div style={{ flex: 1, paddingTop: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 2px' }}>
                          {label}{h.user_name && h.user_name !== h.actor_name
                            ? <span style={{ fontWeight: 500, color: C.sub }}> {h.user_name}</span>
                            : null}
                        </p>
                        <p style={{ fontSize: 10, color: C.muted, margin: '0 0 1px' }}>por {h.actor_name} · {fmtDate(h.created_at)}</p>
                        {h.reason && <p style={{ fontSize: 10, color: C.sub, margin: 0, fontStyle: 'italic' }}>{h.reason}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* FSM transitions */}
          {canEdit && asset.status !== 'dado_de_baja' && FSM_TRANSITIONS[asset.status].length > 0 && (
            <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px' }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.coral, margin: '0 0 10px' }}>Cambiar estado</p>
              <input style={{ ...INPUT, marginBottom: 8 }} placeholder="Motivo (opcional)…" value={transReason} onChange={e => setTransReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FSM_TRANSITIONS[asset.status].map(s => {
                  const c = FSM_COLORS[s] ?? C.muted;
                  return (
                    <button key={s} type="button" disabled={transMut.isPending} onClick={() => transMut.mutate(s)}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, fontSize: 10, fontWeight: 700, border: `1.5px solid ${c}55`, background: `${c}12`, color: c, cursor: 'pointer', fontFamily: 'inherit', opacity: transMut.isPending ? .5 : 1, whiteSpace: 'nowrap' }}>
                      {FSM_LABELS[s] ?? s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Asignación */}
          {canEdit && (
            <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px' }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.coral, margin: '0 0 10px' }}>Asignación</p>
              {asset.status === 'disponible' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select style={INPUT} defaultValue="" onChange={e => { if (e.target.value) assignMut.mutate(e.target.value); }}>
                    <option value="">Seleccionar usuario…</option>
                    {(moduleUsers as any[]).map((u: any) => (
                      <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.role_name}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>Selecciona un usuario para asignar este activo.</p>
                </div>
              ) : asset.status === 'asignado' && assignment ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>
                    Asignado a <strong style={{ color: C.navy }}>{assignment.user_name}</strong>
                  </p>
                  <button type="button" disabled={unassignMut.isPending} onClick={() => unassignMut.mutate()}
                    style={{ padding: '7px 12px', borderRadius: 7, border: '1.5px solid #ef444455', background: '#ef444410', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {unassignMut.isPending ? 'Devolviendo…' : 'Registrar devolución'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                  Estado {ASSET_STATUS_LABELS[asset.status]} — sin asignación disponible.
                </p>
              )}
            </div>
          )}

          {/* QR compact */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.coral, margin: '0 0 10px' }}>Código QR</p>
            <p style={{ fontSize: 11, fontFamily: 'monospace', color: C.navy, fontWeight: 700, margin: '0 0 10px', wordBreak: 'break-all', letterSpacing: '.04em' }}>{asset.qr_code}</p>
            <button type="button" onClick={() => setShowQr(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
              <QrCode size={13} /> Ver / Imprimir QR
            </button>
          </div>

          {/* Imágenes */}
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.coral, margin: '0 0 10px' }}>
              Imágenes
              {images.length > 0 && <span style={{ color: C.muted, fontWeight: 600, marginLeft: 4 }}>({images.length})</span>}
            </p>
            {images.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
                {images.map(img => {
                  const isDeleting = deleteImgMut.isPending && deleteImgMut.variables === img.id;
                  return (
                    <div key={img.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                      <img
                        src={img.storage_url}
                        alt={img.file_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block', opacity: isDeleting ? .4 : 1, transition: 'opacity .2s' }}
                        onClick={() => !isDeleting && setLightboxImg(img.storage_url)}
                      />
                      {canEdit && (
                        isDeleting ? (
                          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(14,34,53,.45)' }}>
                            <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                          </div>
                        ) : (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); deleteImgMut.mutate(img.id); }}
                            title="Eliminar imagen"
                            style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 5, background: 'rgba(239,68,68,.85)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff' }}>
                            <X size={11} />
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Sin imágenes cargadas.</p>
            )}
            {canEdit && (
              <>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFileSelect} />
                <button type="button"
                  disabled={uploadImgMut.isPending}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 7, border: `1px dashed ${C.coral}55`, background: `${C.coral}08`, fontSize: 10, fontWeight: 700, color: C.coral, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <ImagePlus size={13} />
                  {uploadImgMut.isPending ? 'Subiendo…' : 'Subir imagen'}
                </button>
              </>
            )}
          </div>

        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Lightbox ── */}
      {lightboxImg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.88)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
          onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain', boxShadow: '0 32px 80px rgba(0,0,0,.5)' }} />
          <button type="button" onClick={() => setLightboxImg(null)}
            style={{ position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,.12)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff' }}>
            <X size={18} />
          </button>
        </div>
      )}

      {showQr && <QrModal assetId={assetId} assetName={asset.name} onClose={() => setShowQr(false)} />}
    </ModuleLayout>
  );
}
