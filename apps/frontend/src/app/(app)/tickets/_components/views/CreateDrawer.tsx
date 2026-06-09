'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Ticket, Search, Monitor, BookOpen, ExternalLink } from 'lucide-react';
import {
  ticketsService,
  type CreateTicketDto, type AssetSearchResult,
  TICKET_PRIORITIES,
  type TicketPriority,
} from '@/services/tickets.service';
import { getPriorityConfig } from '@/constants/status';
import { systemConfigService, type DamageType } from '@/services/system-config.service';
import { modulesService, type ModuleLocation } from '@/services/modules.service';
import { docsService, type Article } from '@/app/(app)/helpdesk/knowledge/_lib/knowledge.service';
import styles from './CreateDrawer.module.css';

const PRIORITIES = TICKET_PRIORITIES;

export function CreateDrawer({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();

  /* ── Data loaders ── */
  const { data: moduleCategories, isLoading: categoriesLoading } = useQuery({ queryKey: ['ticket-module-categories', moduleId], queryFn: () => ticketsService.getCategories(moduleId), staleTime: 5 * 60_000 });
  const { data: damageCategories } = useQuery({ queryKey: ['damage-categories'], queryFn: () => systemConfigService.getTicketCategories(), staleTime: 10 * 60_000 });
  const { data: locations = [] }   = useQuery<ModuleLocation[]>({ queryKey: ['module-locations', moduleId], queryFn: () => modulesService.getModuleLocations(moduleId), staleTime: 5 * 60_000 });

  /* ── Form state ── */
  const [form, setForm] = useState<Partial<CreateTicketDto>>({ module_id: moduleId, priority: 'media', urgency: 'media', impact: 'medio' });
  const [selectedLocationId,     setSelectedLocationId]     = useState('');
  const [selectedDamageCategory, setSelectedDamageCategory] = useState('');
  const [selectedDamageType,     setSelectedDamageType]     = useState<DamageType | null>(null);
  const [assetSearch,            setAssetSearch]            = useState('');
  const [assetResults,           setAssetResults]           = useState<AssetSearchResult[]>([]);
  const [selectedAsset,          setSelectedAsset]          = useState<AssetSearchResult | null>(null);
  const [assetSearching,         setAssetSearching]         = useState(false);
  const [error,                  setError]                  = useState('');
  const [kbQuery,                setKbQuery]               = useState('');

  /* ── Damage types cascade ── */
  const { data: damageTypes } = useQuery({
    queryKey: ['damage-types', selectedDamageCategory],
    queryFn:  () => systemConfigService.getDamageTypes(selectedDamageCategory || undefined),
    enabled:  !!selectedDamageCategory,
    staleTime: 5 * 60_000,
  });

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

  /* ── KB title debounce ── */
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

  const activeLocations  = locations.filter(l => l.is_active !== false);
  const selectedLocation = activeLocations.find(l => l.id === selectedLocationId);
  const activeEnvs       = (selectedLocation?.environments ?? []).filter(e => e.is_active !== false);

  function handleLocationChange(locId: string) {
    setSelectedLocationId(locId);
    setForm(f => ({ ...f, environment_id: undefined }));
  }

  function selectDamageType(dt: DamageType | null) {
    setSelectedDamageType(dt);
    setForm(f => ({ ...f, damage_type_id: dt?.id ?? undefined, custom_damage_description: undefined, priority: (dt?.default_priority as TicketPriority) ?? f.priority }));
  }
  function handleDamageCategoryChange(catId: string) { setSelectedDamageCategory(catId); selectDamageType(null); }
  function selectAsset(a: AssetSearchResult) { setSelectedAsset(a); setForm(f => ({ ...f, asset_id: a.id })); setAssetSearch(''); setAssetResults([]); }
  function clearAsset() { setSelectedAsset(null); setForm(f => ({ ...f, asset_id: undefined })); }
  function set(key: keyof CreateTicketDto, val: string) { setForm(f => ({ ...f, [key]: val })); }

  const createMut = useMutation({
    mutationFn: () => ticketsService.create(form as CreateTicketDto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); qc.invalidateQueries({ queryKey: ['my-assigned-tickets'] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear el ticket.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim()) { setError('Título requerido.'); return; }
    if (!form.category_id)   { setError('Categoría requerida.'); return; }
    if (selectedDamageType?.is_other && !form.custom_damage_description?.trim()) { setError('Describe el tipo de daño personalizado.'); return; }
    setError('');
    createMut.mutate();
  }

  const activeTypes = (damageTypes ?? []).filter(d => d.is_active);
  const canSubmit = !!(form.title?.trim() && form.category_id);

  return (
    <>
      {/* Overlay */}
      <div className={styles.overlay} onClick={onClose} />

      {/* Drawer */}
      <div className={styles.drawer}>
        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Ticket size={16} />
          </div>
          <div className={styles.headerMeta}>
            <p className={styles.headerTitle}>Nuevo ticket</p>
            <p className={styles.headerSubtitle}>La prioridad y SLA se calcularán automáticamente</p>
          </div>
          <button type="button" onClick={onClose} className={styles.closeBtn}>
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className={styles.body}>
          <form id="create-ticket-form" onSubmit={handleSubmit} className={styles.form}>

            {/* Título */}
            <div>
              <label className={styles.lbl}>Título <span className={styles.required}>*</span></label>
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
                      <a key={a.id} href={`/helpdesk/knowledge/${a.id}`} target="_blank" rel="noreferrer"
                        className={styles.kbItem}>
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
              <label className={styles.lbl}>Descripción</label>
              <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)}
                placeholder="Detalles adicionales, pasos para reproducir…"
                rows={4} className={`${styles.inp} ${styles.inpResize}`} />
            </div>

            {/* Categoría */}
            <div>
              <label className={styles.lbl}>Categoría <span className={styles.required}>*</span></label>
              {categoriesLoading
                ? <div className={styles.skeletonBlock} />
                : <select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value)} className={styles.inp}>
                    <option value="">Seleccionar…</option>
                    {(moduleCategories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
              }
            </div>

            {/* Ubicación */}
            {activeLocations.length > 0 && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>Ubicación</p>
                <div className={styles.grid2}>
                  <div>
                    <label className={styles.lbl}>Sede</label>
                    <select value={selectedLocationId} onChange={e => handleLocationChange(e.target.value)} className={styles.inp}>
                      <option value="">Sin especificar</option>
                      {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
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
                      {activeEnvs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Tipo de incidencia */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Tipo de incidencia</p>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.lbl}>Categoría de daño</label>
                  <select value={selectedDamageCategory} onChange={e => handleDamageCategoryChange(e.target.value)} className={styles.inp}>
                    <option value="">Sin especificar</option>
                    {(damageCategories ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={styles.lbl}>Tipo de daño</label>
                  <select value={selectedDamageType?.id ?? ''} onChange={e => selectDamageType(activeTypes.find(d => d.id === e.target.value) ?? null)}
                    disabled={!selectedDamageCategory || activeTypes.length === 0}
                    className={`${styles.inp}${!selectedDamageCategory ? ` ${styles.inpDimmed}` : ''}`}>
                    <option value="">Sin especificar</option>
                    {activeTypes.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              {selectedDamageType?.is_other && (
                <div className={styles.sectionInner}>
                  <label className={styles.lbl}>Descripción del daño <span className={styles.required}>*</span></label>
                  <textarea value={form.custom_damage_description ?? ''} onChange={e => setForm(f => ({ ...f, custom_damage_description: e.target.value }))}
                    placeholder="Describe el problema con más detalle…" rows={2} className={`${styles.inp} ${styles.inpResize}`} />
                </div>
              )}

              {selectedDamageType && !selectedDamageType.is_other && (
                <div className={styles.priorityHint}>
                  <span>Prioridad sugerida: <strong>{selectedDamageType.default_priority}</strong> — ajustable abajo</span>
                </div>
              )}
            </div>

            {/* Activo afectado */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>
                Activo afectado <span className={styles.sectionLabelSub}>(opcional)</span>
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
                  <button type="button" onClick={clearAsset} className={styles.assetClearBtn}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className={styles.assetSearchWrap}>
                  <div className={styles.assetSearchInner}>
                    <Search size={12} className={styles.assetSearchIcon} />
                    <input type="text" value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                      placeholder="Buscar por nombre, serie o QR…"
                      className={styles.assetSearchInput} />
                    {assetSearching && <span className={styles.assetSearchLoading}>…</span>}
                  </div>
                  {assetResults.length > 0 && (
                    <div className={styles.assetDropdown}>
                      {assetResults.map(a => (
                        <div key={a.id} onClick={() => selectAsset(a)}
                          className={styles.assetDropdownItem}>
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
              )}
            </div>

            {/* Clasificación */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Clasificación</p>
              <div className={styles.grid3}>
                <div>
                  <label className={styles.lbl}>Prioridad</label>
                  <select value={form.priority ?? 'media'} onChange={e => set('priority', e.target.value)} className={styles.inp}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{getPriorityConfig(p).label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={styles.lbl}>Urgencia</label>
                  <select value={form.urgency ?? 'media'} onChange={e => set('urgency', e.target.value)} className={styles.inp}>
                    <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
                  </select>
                </div>
                <div>
                  <label className={styles.lbl}>Impacto</label>
                  <select value={form.impact ?? 'medio'} onChange={e => set('impact', e.target.value)} className={styles.inp}>
                    <option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option>
                  </select>
                </div>
              </div>
            </div>

          </form>
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.footerActions}>
            <button type="button" onClick={onClose} className={styles.btnCancel}>
              Cancelar
            </button>
            <button type="submit" form="create-ticket-form" disabled={createMut.isPending || !canSubmit}
              className={styles.btnSubmit}>
              <Plus size={14} /> {createMut.isPending ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
