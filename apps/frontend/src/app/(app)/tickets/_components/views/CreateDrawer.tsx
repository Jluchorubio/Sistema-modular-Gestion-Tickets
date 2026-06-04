'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Ticket, Search, Monitor } from 'lucide-react';
import {
  ticketsService,
  type CreateTicketDto, type AssetSearchResult,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITIES,
  type TicketPriority,
} from '@/services/tickets.service';
import { systemConfigService, type DamageType } from '@/services/system-config.service';

const PRIORITIES = TICKET_PRIORITIES;

export function CreateDrawer({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();

  /* ── Data loaders ── */
  const { data: moduleCategories } = useQuery({ queryKey: ['ticket-module-categories', moduleId], queryFn: () => ticketsService.getCategories(moduleId), staleTime: 5 * 60_000 });
  const { data: damageCategories } = useQuery({ queryKey: ['damage-categories'], queryFn: () => systemConfigService.getTicketCategories(), staleTime: 10 * 60_000 });

  /* ── Form state ── */
  const [form, setForm] = useState<Partial<CreateTicketDto>>({ module_id: moduleId, priority: 'media', urgency: 'media', impact: 'medio' });
  const [selectedDamageCategory, setSelectedDamageCategory] = useState('');
  const [selectedDamageType,     setSelectedDamageType]     = useState<DamageType | null>(null);
  const [assetSearch,            setAssetSearch]            = useState('');
  const [assetResults,           setAssetResults]           = useState<AssetSearchResult[]>([]);
  const [selectedAsset,          setSelectedAsset]          = useState<AssetSearchResult | null>(null);
  const [assetSearching,         setAssetSearching]         = useState(false);
  const [error,                  setError]                  = useState('');

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

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 };
  const activeTypes = (damageTypes ?? []).filter(d => d.is_active);
  const canSubmit = !!(form.title?.trim() && form.category_id);

  return (
    <>
      {/* Overlay */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', zIndex: 50 }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '100vw',
        background: '#fff', zIndex: 51,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,.14)',
      }}>
        {/* ── Drawer header ── */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#fff7f5', border: '1px solid #ffd0c4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ticket size={16} style={{ color: '#ff5e3a' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0e2235' }}>Nuevo ticket</p>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>La prioridad y SLA se calcularán automáticamente</p>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <form id="create-ticket-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Título */}
            <div>
              <label style={lbl}>Título <span style={{ color: '#ff5e3a' }}>*</span></label>
              <input type="text" value={form.title ?? ''} onChange={e => set('title', e.target.value)}
                placeholder="Describe el problema o solicitud…" maxLength={255} style={inp} autoFocus />
            </div>

            {/* Descripción */}
            <div>
              <label style={lbl}>Descripción</label>
              <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)}
                placeholder="Detalles adicionales, pasos para reproducir…"
                rows={4} style={{ ...inp, resize: 'vertical' as const }} />
            </div>

            {/* Categoría */}
            <div>
              <label style={lbl}>Categoría <span style={{ color: '#ff5e3a' }}>*</span></label>
              <select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value)} style={inp}>
                <option value="">Seleccionar…</option>
                {(moduleCategories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
              <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>Tipo de incidencia</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Categoría de daño</label>
                  <select value={selectedDamageCategory} onChange={e => handleDamageCategoryChange(e.target.value)} style={inp}>
                    <option value="">Sin especificar</option>
                    {(damageCategories ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Tipo de daño</label>
                  <select value={selectedDamageType?.id ?? ''} onChange={e => selectDamageType(activeTypes.find(d => d.id === e.target.value) ?? null)}
                    disabled={!selectedDamageCategory || activeTypes.length === 0}
                    style={{ ...inp, opacity: selectedDamageCategory ? 1 : 0.5 }}>
                    <option value="">Sin especificar</option>
                    {activeTypes.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              {selectedDamageType?.is_other && (
                <div style={{ marginTop: 12 }}>
                  <label style={lbl}>Descripción del daño <span style={{ color: '#ff5e3a' }}>*</span></label>
                  <textarea value={form.custom_damage_description ?? ''} onChange={e => setForm(f => ({ ...f, custom_damage_description: e.target.value }))}
                    placeholder="Describe el problema con más detalle…" rows={2} style={{ ...inp, resize: 'vertical' as const }} />
                </div>
              )}

              {selectedDamageType && !selectedDamageType.is_other && (
                <div style={{ marginTop: 8, padding: '8px 11px', borderRadius: 7, background: '#f0f9ff', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#0369a1' }}>
                    Prioridad sugerida: <strong>{selectedDamageType.default_priority}</strong> — ajustable abajo
                  </span>
                </div>
              )}
            </div>

            {/* Activo afectado */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
              <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>
                Activo afectado <span style={{ fontWeight: 400, textTransform: 'none' as const }}>(opcional)</span>
              </p>

              {selectedAsset ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #0e2235', background: '#f8fafc' }}>
                  <Monitor size={15} style={{ color: '#0e2235', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0e2235', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedAsset.name}</p>
                    <p style={{ margin: 0, fontSize: 10, color: '#64748b' }}>
                      {selectedAsset.serial_number ? `S/N: ${selectedAsset.serial_number} · ` : ''}{selectedAsset.category_name ?? ''}
                    </p>
                  </div>
                  <button type="button" onClick={clearAsset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', background: '#fff' }}>
                    <Search size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input type="text" value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                      placeholder="Buscar por nombre, serie o QR…"
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent' }} />
                    {assetSearching && <span style={{ fontSize: 10, color: '#94a3b8' }}>…</span>}
                  </div>
                  {assetResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,.1)', overflow: 'hidden' }}>
                      {assetResults.map(a => (
                        <div key={a.id} onClick={() => selectAsset(a)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <Monitor size={13} style={{ color: '#64748b', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                            <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>{a.serial_number ? `S/N: ${a.serial_number}` : a.qr_code}</p>
                          </div>
                          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 6, background: '#f1f5f9', color: '#64748b', fontWeight: 700 }}>{a.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {assetSearch.length >= 2 && assetResults.length === 0 && !assetSearching && (
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: '#94a3b8' }}>Sin resultados para "{assetSearch}"</p>
                  )}
                </div>
              )}
            </div>

            {/* Clasificación */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
              <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>Clasificación</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Prioridad</label>
                  <select value={form.priority ?? 'media'} onChange={e => set('priority', e.target.value)} style={inp}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Urgencia</label>
                  <select value={form.urgency ?? 'media'} onChange={e => set('urgency', e.target.value)} style={inp}>
                    <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Impacto</label>
                  <select value={form.impact ?? 'medio'} onChange={e => set('impact', e.target.value)} style={inp}>
                    <option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option>
                  </select>
                </div>
              </div>
            </div>

          </form>
        </div>

        {/* ── Drawer footer ── */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', flexShrink: 0, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && (
            <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b', fontWeight: 600 }}>
              Cancelar
            </button>
            <button type="submit" form="create-ticket-form" disabled={createMut.isPending || !canSubmit}
              style={{ flex: 2, padding: '9px 18px', borderRadius: 9, border: 'none', background: canSubmit && !createMut.isPending ? '#ff5e3a' : '#e2e8f0', color: canSubmit ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: canSubmit && !createMut.isPending ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Plus size={14} /> {createMut.isPending ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
