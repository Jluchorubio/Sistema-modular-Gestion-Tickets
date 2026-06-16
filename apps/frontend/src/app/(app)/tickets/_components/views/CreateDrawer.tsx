'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Ticket, Search, Monitor, BookOpen, ExternalLink, Zap, Paperclip } from 'lucide-react';
import {
  ticketsService,
  type CreateTicketDto, type AssetSearchResult,
  type TicketUrgency, type TicketImpact, type TicketPriority,
  TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
} from '@/services/tickets.service';
import { usersService } from '@/services/users.service';
import { PRIORITY_CONFIG } from '@/constants/status';
import { systemConfigService, type DamageType, type UrgencyLevel, type ImpactLevel } from '@/services/system-config.service';
import { modulesService } from '@/services/modules.service';
import { docsService, type Article } from '@/app/(app)/helpdesk/knowledge/_lib/knowledge.service';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import styles from './CreateDrawer.module.css';

/* ── Urgency / Impact label maps for human-friendly display ── */
const URGENCY_LABELS: Record<string, string> = {
  baja:    'Baja — puede esperar',
  media:   'Normal — afecta mi trabajo',
  alta:    'Alta — no puedo continuar',
  urgente: 'Urgente — impacto inmediato',
};
const IMPACT_LABELS: Record<string, string> = {
  bajo:    'Solo a mí',
  medio:   'Mi área / equipo',
  alto:    'Varios departamentos',
  critico: 'Toda la organización',
};

export function CreateDrawer({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();

  /* ── Data loaders ── */
  const { data: moduleCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['ticket-module-categories', moduleId],
    queryFn:  () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
  });
  const { data: damageCategories = [] } = useQuery({
    queryKey: ['damage-categories'],
    queryFn:  () => systemConfigService.getTicketCategories(),
    staleTime: 10 * 60_000,
  });
  const { data: urgencyLevels = [] } = useQuery<UrgencyLevel[]>({
    queryKey: ['urgency-levels'],
    queryFn:  () => systemConfigService.getUrgencyLevels(),
    staleTime: 10 * 60_000,
  });
  const { data: impactLevels = [] } = useQuery<ImpactLevel[]>({
    queryKey: ['impact-levels'],
    queryFn:  () => systemConfigService.getImpactLevels(),
    staleTime: 10 * 60_000,
  });
  const { data: myAssets = [] } = useQuery({
    queryKey: ['my-assets'],
    queryFn:  () => usersService.getMyAssets(),
    staleTime: 5 * 60_000,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ['module-locations', moduleId],
    queryFn:  () => modulesService.getModuleLocations(moduleId),
    staleTime: 5 * 60_000,
  });

  /* ── Derived active lists ── */
  const activeUrgencies   = urgencyLevels.filter(l => l.is_active);
  const activeImpacts     = impactLevels.filter(l => l.is_active);
  const activeLocations   = locations.filter((l: any) => l.is_active !== false);

  /* ── Form state ── */
  const [form, setForm]         = useState<Partial<CreateTicketDto>>({ module_id: moduleId });
  const [selectedLocationId,    setSelectedLocationId]    = useState('');
  const [selectedDamageCategory, setSelectedDamageCategory] = useState('');
  const [selectedDamageType,    setSelectedDamageType]    = useState<DamageType | null>(null);
  const [assetSearch,           setAssetSearch]           = useState('');
  const [assetResults,          setAssetResults]          = useState<AssetSearchResult[]>([]);
  const [selectedAsset,         setSelectedAsset]         = useState<AssetSearchResult | null>(null);
  const [assetSearching,        setAssetSearching]        = useState(false);
  const [error,                 setError]                 = useState('');
  const [warning,               setWarning]               = useState('');
  const [kbQuery,               setKbQuery]               = useState('');
  const [calcPriority,          setCalcPriority]          = useState<string | null>(null);
  const [calcScore,             setCalcScore]             = useState<number | null>(null);
  const [calcLoading,           setCalcLoading]           = useState(false);
  const [priorityOverride,      setPriorityOverride]      = useState(false);
  const [attachments,           setAttachments]           = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canOverridePriority = !!user?.is_superadmin ||
    (user?.module_roles ?? []).some(
      r => r.module_id === moduleId && r.status === 'active' &&
           ['tecnico', 'jefe_tecnico', 'admin_modulo'].includes(r.role_name),
    );

  /* ── Init urgency/impact defaults once levels load ── */
  useEffect(() => {
    if (!activeUrgencies.length || !activeImpacts.length) return;
    setForm(f => ({
      ...f,
      urgency: f.urgency ?? (activeUrgencies[1]?.slug ?? activeUrgencies[0]?.slug) as TicketUrgency,
      impact:  f.impact  ?? (activeImpacts[1]?.slug  ?? activeImpacts[0]?.slug)  as TicketImpact,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrgencies.length, activeImpacts.length]);

  /* ── Damage types cascade ── */
  const { data: damageTypes = [] } = useQuery({
    queryKey: ['damage-types', selectedDamageCategory, moduleId],
    queryFn:  () => systemConfigService.getDamageTypes(selectedDamageCategory || undefined, moduleId),
    enabled:  !!selectedDamageCategory,
    staleTime: 5 * 60_000,
  });
  const activeTypes = damageTypes.filter((d: DamageType) => d.is_active);

  /* ── Real-time priority preview ── */
  const refreshPriority = useCallback(async (urgency?: string, impact?: string, damageTypeId?: string) => {
    if (!urgency && !impact && !damageTypeId) return;
    setCalcLoading(true);
    try {
      const res = await ticketsService.previewPriority({
        damage_type_id: damageTypeId,
        urgency,
        impact,
      });
      setCalcPriority(res.priority);
      setCalcScore(res.score);
    } catch { /* silencioso */ }
    finally { setCalcLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      refreshPriority(form.urgency, form.impact, form.damage_type_id);
    }, 300);
    return () => clearTimeout(t);
  }, [form.urgency, form.impact, form.damage_type_id, refreshPriority]);

  /* ── Asset search debounce ── */
  useEffect(() => {
    if (assetSearch.length < 2) { setAssetResults([]); return; }
    const t = setTimeout(async () => {
      setAssetSearching(true);
      try { setAssetResults(await ticketsService.searchAssets(assetSearch)); }
      finally { setAssetSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [assetSearch]);

  /* ── KB title suggestion debounce ── */
  useEffect(() => {
    const title = form.title ?? '';
    if (title.length < 3) { setKbQuery(''); return; }
    const t = setTimeout(() => setKbQuery(title), 500);
    return () => clearTimeout(t);
  }, [form.title]);

  const { data: kbArticles = [] } = useQuery<Article[]>({
    queryKey: ['kb-suggest', moduleId, kbQuery],
    queryFn:  () => docsService.getArticles(moduleId, kbQuery),
    enabled:  !!moduleId && kbQuery.length >= 3,
    staleTime: 60_000,
    select: (data) => data.slice(0, 4),
  });

  /* ── Derived location state ── */
  const selectedLocation = activeLocations.find((l: any) => l.id === selectedLocationId);
  const activeEnvs       = (selectedLocation?.environments ?? []).filter((e: any) => e.is_active !== false);

  /* ── Handlers ── */
  function set(key: keyof CreateTicketDto, val: string) { setForm(f => ({ ...f, [key]: val })); }

  function togglePriorityOverride(on: boolean) {
    setPriorityOverride(on);
    if (!on) setForm(f => ({ ...f, priority: undefined }));
  }

  function handleLocationChange(locId: string) {
    setSelectedLocationId(locId);
    setForm(f => ({ ...f, environment_id: undefined }));
  }

  function selectDamageType(dt: DamageType | null) {
    setSelectedDamageType(dt);
    setForm(f => ({ ...f, damage_type_id: dt?.id ?? undefined, custom_damage_description: undefined }));
  }
  function handleDamageCategoryChange(catId: string) { setSelectedDamageCategory(catId); selectDamageType(null); }
  function selectAsset(a: AssetSearchResult) {
    setSelectedAsset(a); setForm(f => ({ ...f, asset_id: a.id }));
    setAssetSearch(''); setAssetResults([]);
  }
  function clearAsset() { setSelectedAsset(null); setForm(f => ({ ...f, asset_id: undefined })); }

  const createMut = useMutation({
    mutationFn: async () => {
      const ticket = await ticketsService.create(form as CreateTicketDto);
      if (attachments.length > 0) {
        await Promise.allSettled(attachments.map(f => ticketsService.uploadAttachment(ticket.id, f)));
      }
      return ticket;
    },
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['my-assigned-tickets'] });
      if (!ticket.assignee_name) {
        setWarning('Ticket creado. No hay técnicos disponibles — quedará sin asignar hasta asignación manual.');
        setTimeout(onClose, 3500);
      } else {
        onClose();
      }
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear el ticket.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim()) { setError('Título requerido.'); return; }
    if (!form.category_id)   { setError('Categoría requerida.'); return; }
    if (selectedDamageType?.is_other && !form.custom_damage_description?.trim()) {
      setError('Describe el tipo de daño personalizado.'); return;
    }
    setError('');
    createMut.mutate();
  }

  const canSubmit  = !!(form.title?.trim() && form.category_id && (!priorityOverride || form.priority));
  const priorityCfg = calcPriority ? (PRIORITY_CONFIG[calcPriority] ?? null) : null;

  /* ── org node display name ── */
  const orgNodeName = (user as any)?.org_node_name ?? (user as any)?.department ?? null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.drawer}>
        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerIcon}><Ticket size={16} /></div>
          <div className={styles.headerMeta}>
            <p className={styles.headerTitle}>Nuevo ticket</p>
            <p className={styles.headerSubtitle}>{canOverridePriority ? 'Prioridad automática — puedes sobreescribirla' : 'La prioridad se calcula automáticamente'}</p>
          </div>
          <button type="button" onClick={onClose} className={styles.closeBtn}><X size={16} /></button>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>
          <form id="create-ticket-form" onSubmit={handleSubmit} className={styles.form}>

            {/* Título */}
            <div>
              <label className={styles.lbl}>¿Qué ocurre? <span className={styles.required}>*</span></label>
              <input type="text" value={form.title ?? ''} onChange={e => set('title', e.target.value)}
                placeholder="Describe el problema o solicitud…" maxLength={255} className={styles.inp} autoFocus />
              {kbArticles.length > 0 && (
                <div className={styles.kbBox}>
                  <div className={styles.kbBoxHeader}>
                    <BookOpen size={11} />
                    <span className={styles.kbBoxLabel}>Artículos relacionados en la KB</span>
                  </div>
                  <div className={styles.kbList}>
                    {kbArticles.map(a => (
                      <a key={a.id} href={`/helpdesk/knowledge/${a.id}`} target="_blank" rel="noreferrer" className={styles.kbItem}>
                        <span className={styles.kbItemTitle}>{a.title}</span>
                        <ExternalLink size={9} className={styles.kbItemIcon} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Descripción */}
            <div>
              <label className={styles.lbl}>Detalles adicionales</label>
              <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)}
                placeholder="Pasos para reproducir, mensajes de error, contexto…"
                rows={3} className={`${styles.inp} ${styles.inpResize}`} />
            </div>

            {/* ─ Archivos adjuntos ─ */}
            <div>
              <label className={styles.lbl}>
                Archivos adjuntos <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>(opcional — máx. 5 archivos, 10 MB c/u)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  setAttachments(prev => {
                    const merged = [...prev, ...files].slice(0, 5);
                    return merged;
                  });
                  e.target.value = '';
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attachments.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7 }}>
                    <Paperclip size={12} style={{ color: '#0e2235', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {attachments.length < 5 && (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: 'none', border: '1px dashed #cbd5e1', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 500, color: '#64748b' }}>
                    <Paperclip size={12} />
                    {attachments.length === 0 ? 'Adjuntar archivo…' : 'Añadir otro…'}
                  </button>
                )}
              </div>
            </div>

            {/* ─ Tipo de problema ─ */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>¿Qué tipo de problema es?</p>

              {/* Área de servicio (categoría del módulo) */}
              <div>
                <label className={styles.lbl}>Área de servicio <span className={styles.required}>*</span></label>
                {categoriesLoading
                  ? <div className={styles.skeletonBlock} />
                  : <select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value)} className={styles.inp}>
                      <option value="">Seleccionar…</option>
                      {(moduleCategories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                }
              </div>

              {/* Categoría de incidencia + tipo */}
              <div className={styles.grid2} style={{ marginTop: 10 }}>
                <div>
                  <label className={styles.lbl}>Categoría de incidencia</label>
                  <select value={selectedDamageCategory} onChange={e => handleDamageCategoryChange(e.target.value)} className={styles.inp}>
                    <option value="">Sin especificar</option>
                    {damageCategories.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={styles.lbl}>Tipo específico</label>
                  <select
                    value={selectedDamageType?.id ?? ''}
                    onChange={e => selectDamageType(activeTypes.find((d: DamageType) => d.id === e.target.value) ?? null)}
                    disabled={!selectedDamageCategory || activeTypes.length === 0}
                    className={`${styles.inp}${!selectedDamageCategory ? ` ${styles.inpDimmed}` : ''}`}
                  >
                    <option value="">Sin especificar</option>
                    {activeTypes.map((d: DamageType) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              {selectedDamageType?.is_other && (
                <div className={styles.sectionInner}>
                  <label className={styles.lbl}>Describe el problema <span className={styles.required}>*</span></label>
                  <textarea value={form.custom_damage_description ?? ''} onChange={e => setForm(f => ({ ...f, custom_damage_description: e.target.value }))}
                    placeholder="Describe el problema con más detalle…" rows={2} className={`${styles.inp} ${styles.inpResize}`} />
                </div>
              )}
            </div>

            {/* ─ Equipo afectado ─ */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>
                Equipo afectado <span className={styles.sectionLabelSub}>(opcional)</span>
              </p>

              {selectedAsset ? (
                <div className={styles.assetSelected}>
                  <Monitor size={15} className={styles.assetSelectedIcon} />
                  <div className={styles.assetSelectedMeta}>
                    <p className={styles.assetSelectedName}>{selectedAsset.name}</p>
                    <p className={styles.assetSelectedSub}>
                      {selectedAsset.serial_number ? `S/N: ${selectedAsset.serial_number} · ` : ''}{selectedAsset.category_name ?? ''}
                    </p>
                  </div>
                  <button type="button" onClick={clearAsset} className={styles.assetClearBtn}><X size={13} /></button>
                </div>
              ) : (
                <>
                  {/* Activos del usuario — acceso rápido */}
                  {myAssets.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Tus equipos
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {myAssets.slice(0, 4).map(a => (
                          <button key={a.id} type="button" onClick={() => selectAsset(a as AssetSearchResult)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                            <Monitor size={13} style={{ color: '#0e2235', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: '#0e2235', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                              <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{a.category_name ?? a.serial_number ?? ''}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Búsqueda libre */}
                  <div className={styles.assetSearchWrap}>
                    <div className={styles.assetSearchInner}>
                      <Search size={12} className={styles.assetSearchIcon} />
                      <input type="text" value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                        placeholder={myAssets.length > 0 ? 'Buscar otro equipo…' : 'Buscar por nombre, serie o QR…'}
                        className={styles.assetSearchInput} />
                      {assetSearching && <span className={styles.assetSearchLoading}>…</span>}
                    </div>
                    {assetResults.length > 0 && (
                      <div className={styles.assetDropdown}>
                        {assetResults.map(a => (
                          <div key={a.id} onClick={() => selectAsset(a)} className={styles.assetDropdownItem}>
                            <Monitor size={13} className={styles.assetDropdownItemIcon} />
                            <div className={styles.assetDropdownItemMeta}>
                              <p className={styles.assetDropdownItemName}>{a.name}</p>
                              <p className={styles.assetDropdownItemSub}>{a.serial_number ? `S/N: ${a.serial_number}` : a.qr_code}</p>
                            </div>
                            <span className={styles.assetStatusBadge}>{a.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {assetSearch.length >= 2 && assetResults.length === 0 && !assetSearching && (
                      <p className={styles.assetNoResults}>Sin resultados para &ldquo;{assetSearch}&rdquo;</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ─ Ubicación ─ */}
            {activeLocations.length > 0 && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>
                  ¿Desde dónde reportas?
                  {orgNodeName && (
                    <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>
                      ({orgNodeName})
                    </span>
                  )}
                </p>
                <div className={styles.grid2}>
                  <div>
                    <label className={styles.lbl}>Área / Sede</label>
                    <select value={selectedLocationId} onChange={e => handleLocationChange(e.target.value)} className={styles.inp}>
                      <option value="">Sin especificar</option>
                      {activeLocations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={styles.lbl}>Ambiente</label>
                    <select
                      value={form.environment_id ?? ''}
                      onChange={e => setForm(f => ({ ...f, environment_id: e.target.value || undefined }))}
                      disabled={!selectedLocationId || activeEnvs.length === 0}
                      className={`${styles.inp}${!selectedLocationId ? ` ${styles.inpDimmed}` : ''}`}
                    >
                      <option value="">Sin especificar</option>
                      {activeEnvs.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ─ Urgencia e impacto ─ */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>¿Cómo lo describes?</p>

              <div>
                <label className={styles.lbl}>¿Qué tan urgente es?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {activeUrgencies.map(u => (
                    <label key={u.slug}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: `1px solid ${form.urgency === u.slug ? '#0e2235' : '#e2e8f0'}`, background: form.urgency === u.slug ? '#f0f4f8' : '#fafafa', cursor: 'pointer', fontSize: 12, color: '#334155', fontWeight: form.urgency === u.slug ? 600 : 400 }}>
                      <input type="radio" name="urgency" value={u.slug} checked={form.urgency === u.slug}
                        onChange={() => setForm(f => ({ ...f, urgency: u.slug as TicketUrgency }))}
                        style={{ accentColor: '#0e2235' }} />
                      {URGENCY_LABELS[u.slug] ?? u.label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label className={styles.lbl}>¿A cuántos afecta?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {activeImpacts.map(i => (
                    <label key={i.slug}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: `1px solid ${form.impact === i.slug ? '#0e2235' : '#e2e8f0'}`, background: form.impact === i.slug ? '#f0f4f8' : '#fafafa', cursor: 'pointer', fontSize: 12, color: '#334155', fontWeight: form.impact === i.slug ? 600 : 400 }}>
                      <input type="radio" name="impact" value={i.slug} checked={form.impact === i.slug}
                        onChange={() => setForm(f => ({ ...f, impact: i.slug as TicketImpact }))}
                        style={{ accentColor: '#0e2235' }} />
                      {IMPACT_LABELS[i.slug] ?? i.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Prioridad calculada — readonly (dimmed when override active) */}
              {!priorityOverride && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 9, background: priorityCfg ? `${priorityCfg.color}0d` : '#f8fafc', border: `1px solid ${priorityCfg ? `${priorityCfg.color}33` : '#e2e8f0'}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Zap size={14} style={{ color: priorityCfg?.color ?? '#94a3b8', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Prioridad calculada
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: priorityCfg?.color ?? '#94a3b8', margin: 0 }}>
                      {calcLoading ? 'Calculando…' : (priorityCfg ? priorityCfg.label : 'Completar formulario')}
                      {calcScore !== null && !calcLoading && (
                        <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>
                          (score: {calcScore})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Manual priority override — privileged roles only */}
              {canOverridePriority && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={priorityOverride}
                      onChange={e => togglePriorityOverride(e.target.checked)}
                      style={{ accentColor: '#ff5e3a', width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>
                      Establecer prioridad manualmente
                    </span>
                  </label>

                  {priorityOverride && (
                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {TICKET_PRIORITIES.map(p => {
                        const color = TICKET_PRIORITY_COLORS[p];
                        const selected = form.priority === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, priority: p as TicketPriority }))}
                            style={{
                              padding: '7px 4px',
                              borderRadius: 7,
                              border: `2px solid ${selected ? color : '#e2e8f0'}`,
                              background: selected ? `${color}15` : '#fafafa',
                              cursor: 'pointer',
                              textAlign: 'center',
                              fontSize: 11,
                              fontWeight: selected ? 700 : 500,
                              color: selected ? color : '#64748b',
                              transition: 'all .15s',
                            }}
                          >
                            {TICKET_PRIORITY_LABELS[p]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

          </form>
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          {warning && <p className={styles.warningMsg}>{warning}</p>}
          {error   && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.footerActions}>
            <button type="button" onClick={onClose} className={styles.btnCancel}>Cancelar</button>
            <button type="submit" form="create-ticket-form" disabled={createMut.isPending || !canSubmit} className={styles.btnSubmit}>
              <Plus size={14} /> {createMut.isPending ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
