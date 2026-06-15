'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient }  from '@tanstack/react-query';
import { Check, AlertTriangle, Users } from 'lucide-react';
import { systemConfigService }  from '@/services/system-config.service';
import { useConfigPending }     from '@/stores/configPending.store';
import { Spinner }              from '@/components/ui/Spinner';
import { ticketsService }       from '@/services/tickets.service';
import { usersService }         from '@/services/users.service';
import type { PriorityFormula, PriorityPreview, SlaRule, UrgencyLevel, ImpactLevel, DamageType } from '@/services/system-config.service';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';

const PRIORITY_COLOR: Record<string, string> = {
  baja: '#94a3b8', media: '#f59e0b', alta: '#f97316', critica: '#ef4444',
};

function deadlineLabel(hours: number): string {
  const d     = new Date(Date.now() + hours * 3_600_000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((new Date(d.toDateString()).getTime() - today.getTime()) / 86_400_000);
  const time  = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `hoy ${time}`;
  if (diff === 1) return `mañana ${time}`;
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${time}`;
}

const weightColor = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#f59e0b' : '#94a3b8';

const PRESETS = [
  { label: 'Balanceado',    cargo: 33, nodo: 33, daño: 34 },
  { label: 'Por daño',      cargo: 20, nodo: 20, daño: 60 },
  { label: 'Por jerarquía', cargo: 55, nodo: 25, daño: 20 },
  { label: 'Por ubicación', cargo: 20, nodo: 55, daño: 25 },
] as const;

const WEIGHT_META = [
  { key: 'cargo' as const, label: 'Jerarquía del cargo', desc: 'Rango jerárquico del solicitante en el organigrama', color: '#0e2235' },
  { key: 'nodo'  as const, label: 'Criticidad del nodo', desc: 'Importancia del nodo organizacional afectado',       color: '#0ea5e9' },
  { key: 'daño'  as const, label: 'Severidad del daño',  desc: 'Gravedad del daño o problema reportado',             color: '#f97316' },
];

const SIM_LABELS: Record<string, string> = {
  cargo: 'Rango del solicitante',
  nodo:  'Criticidad del nodo',
  daño:  'Gravedad del daño',
};

/* ── Simulador por perfil de usuario real ── */
function UserPrioritySimulator({
  uLevels, iLevels, tInput,
}: {
  uLevels: UrgencyLevel[];
  iLevels: ImpactLevel[];
  tInput: React.CSSProperties;
}) {
  const [userSearch, setUserSearch]   = useState('');
  const [selectedUser, setSelectedUser] = useState<{ id: string; label: string } | null>(null);
  const [urgency, setUrgency]         = useState('media');
  const [impact, setImpact]           = useState('medio');
  const [damageTypes, setDamageTypes] = useState<{ id: string; label: string }[]>([]);
  const [damageTypeId, setDamageTypeId] = useState('');
  const [result, setResult]           = useState<null | { priority: string; score: number; signals: any }>(null);
  const [loading, setLoading]         = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: usersPage } = useQuery({
    queryKey: ['users-for-sim', userSearch],
    queryFn:  () => usersService.getUsers({ search: userSearch, limit: 10 }),
    enabled:  userSearch.length >= 2,
    staleTime: 30_000,
  });

  // Load all damage types for the damage selector
  useEffect(() => {
    systemConfigService.getDamageTypes().then((types: DamageType[]) => {
      setDamageTypes(types.filter(t => t.is_active).map(t => ({ id: t.id, label: t.label })));
    }).catch(() => {});
  }, []);

  async function simulate() {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const r = await ticketsService.previewPriority({
        urgency,
        impact,
        damage_type_id: damageTypeId || undefined,
        test_user_id:   selectedUser.id,
      });
      setResult(r);
    } finally { setLoading(false); }
  }

  const pc: Record<string, string> = {
    baja: '#94a3b8', media: '#f59e0b', alta: '#f97316', critica: '#ef4444',
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Users size={14} style={{ color: '#0e2235' }} />
        <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Simular prioridad para un usuario real
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.5 }}>
        Selecciona un usuario del sistema para ver qué prioridad recibiría según su perfil organizacional.
        Útil para verificar la calibración antes de guardar cambios.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* User search */}
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Usuario</label>
          {selectedUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1.5px solid #0e2235', borderRadius: 8, background: '#f8fafc' }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#0e2235' }}>{selectedUser.label}</span>
              <button type="button" onClick={() => { setSelectedUser(null); setResult(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input type="text" value={userSearch}
                onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Buscar usuario por nombre o email…"
                style={{ ...tInput, width: '100%', textAlign: 'left' }} />
              {showDropdown && (usersPage?.data ?? []).length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,.1)', overflow: 'hidden' }}>
                  {(usersPage?.data ?? []).slice(0, 8).map((u: any) => (
                    <div key={u.id}
                      onClick={() => { setSelectedUser({ id: u.id, label: `${u.first_name} ${u.last_name} — ${u.email}` }); setUserSearch(''); setShowDropdown(false); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f1f5f9', color: '#334155' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <strong>{u.first_name} {u.last_name}</strong>
                      <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>{u.email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Urgencia</label>
            <select value={urgency} onChange={e => setUrgency(e.target.value)} style={{ ...tInput, width: '100%', textAlign: 'left' }}>
              {uLevels.map(l => <option key={l.slug} value={l.slug}>{l.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Impacto</label>
            <select value={impact} onChange={e => setImpact(e.target.value)} style={{ ...tInput, width: '100%', textAlign: 'left' }}>
              {iLevels.map(l => <option key={l.slug} value={l.slug}>{l.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo de daño</label>
            <select value={damageTypeId} onChange={e => setDamageTypeId(e.target.value)} style={{ ...tInput, width: '100%', textAlign: 'left' }}>
              <option value="">Sin especificar</option>
              {damageTypes.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" disabled={!selectedUser || loading} onClick={simulate}
            style={{ padding: '7px 20px', background: !selectedUser ? '#e2e8f0' : '#0e2235', color: !selectedUser ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: selectedUser ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {loading ? 'Calculando…' : 'Simular'}
          </button>
          {result && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: pc[result.priority] ?? '#94a3b8', textTransform: 'uppercase' }}>
                {result.priority}
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>score: {result.score}</span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                (cargo: {result.signals.peso_cargo} · nodo: {result.signals.peso_nodo} · daño: {result.signals.peso_daño} · bonos: +{result.signals.urgency_bonus + result.signals.impact_bonus})
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PrioridadTab() {
  const qc      = useQueryClient();
  const pending = useConfigPending();

  const { data: formula, isLoading } = useQuery<PriorityFormula | null>({
    queryKey: ['priority-formula'],
    queryFn:  systemConfigService.getPriorityFormula,
  });

  const [w,   setW]   = useState({ cargo: 25, nodo: 35, daño: 40 });
  const [t,   setT]   = useState({ critica: 9, alta: 7, media: 5 });
  const [desc, setDesc] = useState('');

  const [sim,     setSim]     = useState({ cargo: 5, nodo: 5, daño: 5, urgency: 'media', impact: 'medio' });
  const [preview, setPreview] = useState<PriorityPreview | null>(null);
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [uLevels, setULevels] = useState<UrgencyLevel[]>([]);
  const [iLevels, setILevels] = useState<ImpactLevel[]>([]);

  const { data: urgencyData } = useQuery<UrgencyLevel[]>({
    queryKey: ['urgency-levels'],
    queryFn:  systemConfigService.getUrgencyLevels,
    staleTime: 60_000,
  });
  const { data: impactData } = useQuery<ImpactLevel[]>({
    queryKey: ['impact-levels'],
    queryFn:  systemConfigService.getImpactLevels,
    staleTime: 60_000,
  });

  useEffect(() => { if (urgencyData) setULevels(urgencyData.map(l => ({ ...l }))); }, [urgencyData]);
  useEffect(() => { if (impactData)  setILevels(impactData.map(l => ({ ...l }))); }, [impactData]);

  useEffect(() => {
    if (!formula) return;
    setW({
      cargo: Math.round(formula.w_cargo * 100),
      nodo:  Math.round(formula.w_nodo  * 100),
      daño:  Math.round(formula.w_daño  * 100),
    });
    setT({
      critica: Number(formula.threshold_critica),
      alta:    Number(formula.threshold_alta),
      media:   Number(formula.threshold_media),
    });
    setDesc(formula.description ?? '');
  }, [formula]);

  const wSum        = w.cargo + w.nodo + w.daño;
  const wValid      = wSum === 100;
  const activePreset = PRESETS.find(p => p.cargo === w.cargo && p.nodo === w.nodo && p.daño === w.daño)?.label ?? null;

  const saveMut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.updatePriorityFormula({
        w_cargo: w.cargo / 100, w_nodo: w.nodo / 100, w_daño: w.daño / 100,
        threshold_critica: t.critica, threshold_alta: t.alta, threshold_media: t.media,
        description: desc || undefined,
      }, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['priority-formula'] }),
  });

  const previewMut = useMutation({
    mutationFn: () => systemConfigService.previewPriority({
      peso_cargo: sim.cargo, peso_nodo: sim.nodo, peso_daño: sim.daño,
      urgency: sim.urgency, impact: sim.impact,
    }),
    onSuccess: data => setPreview(data),
  });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { previewMut.mutate(); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.cargo, sim.nodo, sim.daño, sim.urgency, sim.impact]);

  const urgencyDirty = uLevels.some(l => {
    const orig = urgencyData?.find(u => u.id === l.id);
    return orig && (l.bonus !== orig.bonus || l.label !== orig.label);
  });
  const impactDirty = iLevels.some(l => {
    const orig = impactData?.find(u => u.id === l.id);
    return orig && (l.bonus !== orig.bonus || l.label !== orig.label);
  });
  const levelsDirty = urgencyDirty || impactDirty;

  const saveLevelsMut = useMutation({
    mutationFn: async () => {
      const up = uLevels
        .filter(l => { const o = urgencyData?.find(u => u.id === l.id); return o && (l.bonus !== o.bonus || l.label !== o.label); })
        .map(l => systemConfigService.updateUrgencyLevel(l.id, { bonus: l.bonus, label: l.label }));
      const ip = iLevels
        .filter(l => { const o = impactData?.find(u => u.id === l.id); return o && (l.bonus !== o.bonus || l.label !== o.label); })
        .map(l => systemConfigService.updateImpactLevel(l.id, { bonus: l.bonus, label: l.label }));
      await Promise.all([...up, ...ip]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['urgency-levels'] });
      qc.invalidateQueries({ queryKey: ['impact-levels'] });
    },
  });

  const { data: slaRules = [] } = useQuery<SlaRule[]>({
    queryKey: ['sys-sla-rules'],
    queryFn:  systemConfigService.getSlaRules,
    staleTime: 60_000,
  });

  const matchedSla = useMemo(() => {
    if (!preview) return null;
    return (slaRules as SlaRule[]).find(
      r => r.is_active && r.priority === preview.priority && !r.request_type,
    ) ?? null;
  }, [preview, slaRules]);

  if (isLoading) return <Spinner />;

  const tInput: React.CSSProperties = {
    width: 64, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 12, fontFamily: 'inherit', textAlign: 'center',
  };
  const num: React.CSSProperties = {
    fontSize: 12, fontWeight: 800, minWidth: 38, textAlign: 'center',
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '3px 6px',
  };

  return (
    <div>
      {/* ── Scope banner ── */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2"
          style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.55 }}>
          <strong>Alcance de esta sección:</strong> La fórmula de prioridad y sus bonos aplican globalmente a todos los módulos.
          El SLA del simulador corresponde a <strong>Gestión Administrativa</strong>.
          El SLA de <strong>tickets de Helpdesk</strong> se configura en{' '}
          <em>Módulo Helpdesk → Configuración → Políticas SLA</em>.
        </div>
      </div>

      {/* ── Formula weights ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pesos de la fórmula
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              score = Σ(peso_i × w_i) + urgency_bonus + impact_bonus
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Suma:</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: wValid ? '#22c55e' : '#ef4444' }}>{wSum}%</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {PRESETS.map(p => (
            <button key={p.label}
              onClick={() => setW({ cargo: p.cargo, nodo: p.nodo, daño: p.daño })}
              style={{
                padding: '4px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                border: activePreset === p.label ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
                background: activePreset === p.label ? 'rgba(255,94,58,.08)' : '#f8fafc',
                color: activePreset === p.label ? '#ff5e3a' : '#64748b',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {WEIGHT_META.map(({ key, label, desc: metaDesc, color }) => (
            <div key={key} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0e2235', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 12, lineHeight: 1.4 }}>{metaDesc}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color, textAlign: 'center', lineHeight: 1, marginBottom: 10 }}>
                {w[key]}%
              </div>
              <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w[key]}%`, background: color, borderRadius: 3, transition: 'width .2s' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button onClick={() => setW(p => ({ ...p, [key]: Math.max(0, p[key] - 5) }))}
                  style={{ width: 32, height: 28, border: '1px solid #e2e8f0', borderRadius: 8,
                    background: '#fff', fontSize: 18, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                    color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  −
                </button>
                <input type="number" min={0} max={100} value={w[key]}
                  onChange={e => setW(p => ({ ...p, [key]: Math.min(100, Math.max(0, +e.target.value)) }))}
                  style={{ width: 52, textAlign: 'center', border: `1px solid ${color}60`, borderRadius: 8,
                    fontSize: 13, fontWeight: 700, fontFamily: 'inherit', padding: '3px 4px', color }} />
                <button onClick={() => setW(p => ({ ...p, [key]: Math.min(100, p[key] + 5) }))}
                  style={{ width: 32, height: 28, border: '1px solid #e2e8f0', borderRadius: 8,
                    background: '#fff', fontSize: 18, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                    color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {!wValid && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={12} /> Los pesos deben sumar 100%. Faltan/sobran {Math.abs(100 - wSum)}%.
          </div>
        )}
      </div>

      {/* ── Thresholds ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Umbrales de prioridad
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {(['critica', 'alta', 'media'] as const).map(k => (
            <div key={k}>
              <div style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[k], marginBottom: 4, textTransform: 'uppercase' }}>{k} ≥</div>
              <input type="number" min={0} max={15} step={0.5} value={t[k]}
                style={tInput}
                onChange={e => setT(prev => ({ ...prev, [k]: +e.target.value }))} />
            </div>
          ))}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Descripción</div>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              style={{ ...tInput, width: '100%', textAlign: 'left' }}
              placeholder="ej. Fórmula ajustada Q2 2026" />
          </div>
        </div>
      </div>

      {/* ── Urgency & Impact bonuses ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Bonos de urgencia e impacto
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
          Valor sumado al score base. Determina cuánto peso tiene urgencia e impacto en el cálculo final.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Urgencia */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Urgencia</div>
            {uLevels.map((lvl, i) => (
              <div key={lvl.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', flex: 1, minWidth: 0 }}>{lvl.label}</span>
                <button onClick={() => setULevels(prev => prev.map((l, j) => j === i ? { ...l, bonus: Math.max(0, +(l.bonus - 0.5).toFixed(1)) } : l))}
                  style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 16, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <input type="number" min={0} max={10} step={0.5} value={lvl.bonus}
                  onChange={e => setULevels(prev => prev.map((l, j) => j === i ? { ...l, bonus: Math.min(10, Math.max(0, +e.target.value)) } : l))}
                  style={{ width: 56, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 4px', fontFamily: 'inherit' }} />
                <button onClick={() => setULevels(prev => prev.map((l, j) => j === i ? { ...l, bonus: Math.min(10, +(l.bonus + 0.5).toFixed(1)) } : l))}
                  style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 16, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
            ))}
          </div>

          {/* Impacto */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Impacto</div>
            {iLevels.map((lvl, i) => (
              <div key={lvl.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', flex: 1, minWidth: 0 }}>{lvl.label}</span>
                <button onClick={() => setILevels(prev => prev.map((l, j) => j === i ? { ...l, bonus: Math.max(0, +(l.bonus - 0.5).toFixed(1)) } : l))}
                  style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 16, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <input type="number" min={0} max={10} step={0.5} value={lvl.bonus}
                  onChange={e => setILevels(prev => prev.map((l, j) => j === i ? { ...l, bonus: Math.min(10, Math.max(0, +e.target.value)) } : l))}
                  style={{ width: 56, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 4px', fontFamily: 'inherit' }} />
                <button onClick={() => setILevels(prev => prev.map((l, j) => j === i ? { ...l, bonus: Math.min(10, +(l.bonus + 0.5).toFixed(1)) } : l))}
                  style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 16, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
            ))}
          </div>
        </div>

        {levelsDirty && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              disabled={saveLevelsMut.isPending}
              onClick={() => saveLevelsMut.mutate()}
              style={{ padding: '7px 18px', background: saveLevelsMut.isSuccess ? '#22c55e' : '#ff5e3a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: saveLevelsMut.isPending ? 0.6 : 1 }}>
              <Check size={12} /> {saveLevelsMut.isPending ? 'Guardando…' : saveLevelsMut.isSuccess ? 'Guardado ✓' : 'Guardar bonos'}
            </button>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Sin verificación 2FA — los cambios aplican inmediatamente al motor.</span>
          </div>
        )}
      </div>

      {/* ── Save ── */}
      <div style={{ marginBottom: 24 }}>
        <button
          disabled={!wValid}
          onClick={() => {
            const wSnap = { ...w }; const tSnap = { ...t }; const dSnap = desc;
            pending.stage({
              id:    'prioridad',
              label: 'Fórmula de Prioridad',
              execute: async (auth) => {
                await systemConfigService.updatePriorityFormula({
                  w_cargo: wSnap.cargo / 100, w_nodo: wSnap.nodo / 100, w_daño: wSnap.daño / 100,
                  threshold_critica: tSnap.critica, threshold_alta: tSnap.alta, threshold_media: tSnap.media,
                  description: dSnap || undefined,
                }, auth);
                qc.invalidateQueries({ queryKey: ['priority-formula'] });
              },
            });
          }}
          style={{
            padding: '8px 20px',
            background: !wValid ? '#e2e8f0' : pending.hasStaged('prioridad') ? '#20c933' : '#0e2235',
            color: wValid ? '#fff' : '#94a3b8', border: 'none', borderRadius: 8,
            fontSize: 12, fontWeight: 700, cursor: wValid ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <Check size={13} /> {pending.hasStaged('prioridad') ? 'En cola ✓' : 'Guardar fórmula'}
        </button>
        {saveMut.isSuccess && (
          <p style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>Fórmula actualizada correctamente.</p>
        )}
      </div>

      {/* ── Simulador por usuario real ── */}
      <UserPrioritySimulator uLevels={uLevels} iLevels={iLevels} tInput={tInput} />

      {/* ── Live Simulator (fórmula) ── */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Simulador de prioridad
          </div>
          <span style={{ fontSize: 10, color: previewMut.isPending ? '#ff5e3a' : '#94a3b8' }}>
            {previewMut.isPending ? 'Calculando…' : 'Actualiza automáticamente'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
          Ajusta los parámetros y el resultado se calcula en tiempo real con la fórmula guardada.
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          {(['cargo', 'nodo', 'daño'] as const).map(k => (
            <div key={k} style={{ flex: '1 1 140px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{SIM_LABELS[k]}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={1} max={10} step={1} value={sim[k]}
                  onChange={e => setSim(p => ({ ...p, [k]: +e.target.value }))}
                  style={{ flex: 1 }} />
                <span style={{ ...num, color: weightColor(sim[k]) }}>{sim[k]}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: preview ? 16 : 0 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Urgencia del caso</div>
            <select value={sim.urgency} onChange={e => setSim(p => ({ ...p, urgency: e.target.value }))}
              style={{ ...tInput, width: 150, textAlign: 'left' }}>
              {(uLevels.length ? uLevels : urgencyData ?? []).map(l => (
                <option key={l.slug} value={l.slug}>{l.label} (+{l.bonus})</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Impacto operativo</div>
            <select value={sim.impact} onChange={e => setSim(p => ({ ...p, impact: e.target.value }))}
              style={{ ...tInput, width: 150, textAlign: 'left' }}>
              {(iLevels.length ? iLevels : impactData ?? []).map(l => (
                <option key={l.slug} value={l.slug}>{l.label} (+{l.bonus})</option>
              ))}
            </select>
          </div>
        </div>

        {preview && (
          <div style={{ background: '#fff', border: `2px solid ${PRIORITY_COLOR[preview.priority]}30`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Score</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#0e2235', lineHeight: 1 }}>{preview.score}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Base</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>{preview.base}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Bonos</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>urgencia +{preview.urgency_bonus} · impacto +{preview.impact_bonus}</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <span style={{
                  fontSize: 15, fontWeight: 900, padding: '5px 16px', borderRadius: 8,
                  background: `${PRIORITY_COLOR[preview.priority]}18`,
                  color: PRIORITY_COLOR[preview.priority],
                  border: `1.5px solid ${PRIORITY_COLOR[preview.priority]}40`,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {preview.priority}
                </span>
              </div>
            </div>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                SLA estimado
              </div>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 8px', fontStyle: 'italic' }}>
                ⚠️ SLA mostrado corresponde a <strong>Gestión Administrativa</strong> (solicitudes globales),
                no al SLA de tickets de helpdesk. El SLA de helpdesk se configura en cada módulo.
              </p>
              {matchedSla ? (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>Primera respuesta</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>{matchedSla.hours_to_first_response}h</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>→ {deadlineLabel(matchedSla.hours_to_first_response)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>Resolución</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>{matchedSla.hours_to_resolve}h</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>→ {deadlineLabel(matchedSla.hours_to_resolve)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>regla Gestión · prioridad {preview.priority}</span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={12} />
                  Sin regla SLA de Gestión para prioridad <strong>{preview.priority}</strong>.
                </div>
              )}
            </div>

            <div style={{ padding: '10px 16px', background: '#f8fafc' }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Routing automático
              </div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                El ticket se asignaría al <strong>administrador del módulo destino</strong>.
                Sin admin activo → escalado automático a superadmin.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
