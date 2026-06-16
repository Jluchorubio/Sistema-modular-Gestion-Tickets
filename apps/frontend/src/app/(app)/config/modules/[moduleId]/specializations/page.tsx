'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, X, Users, AlertCircle } from 'lucide-react';
import { modulesService, type TechnicianSpecialization } from '@/services/modules.service';
import { systemConfigService } from '@/services/system-config.service';
import { useSuperadminGuard } from '@/hooks/useSuperadminGuard';
import mgmt from '@/styles/mgmt.module.css';

const C = { navy: 'var(--app-text-main)', coral: '#ff5e3a', border: 'var(--app-border)', muted: 'var(--app-text-muted)', bg: 'var(--app-page)' };

export default function SpecializationsPage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { status } = useSuperadminGuard();

  const [addOpen,    setAddOpen]    = useState(false);
  const [selUser,    setSelUser]    = useState('');
  const [selDamage,  setSelDamage]  = useState('');
  const [selCategory,setSelCategory]= useState('');
  const [error,      setError]      = useState('');

  const { data: module } = useQuery({
    queryKey: ['module', moduleId],
    queryFn:  () => modulesService.getModule(moduleId),
    enabled:  !!moduleId,
  });

  const { data: specs = [], isLoading } = useQuery<TechnicianSpecialization[]>({
    queryKey: ['specializations', moduleId],
    queryFn:  () => modulesService.getSpecializations(moduleId),
    enabled:  !!moduleId,
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['module-technicians', moduleId],
    queryFn:  () => modulesService.getModuleTechnicians(moduleId),
    enabled:  !!moduleId && addOpen,
  });

  const { data: damageTypes = [] } = useQuery({
    queryKey: ['damage-types-all'],
    queryFn:  () => systemConfigService.getDamageTypes(),
    enabled:  addOpen,
    staleTime: 10 * 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['module-categories', moduleId],
    queryFn:  () => modulesService.getCategories(moduleId),
    enabled:  !!moduleId && addOpen,
    staleTime: 5 * 60_000,
  });

  const addMut = useMutation({
    mutationFn: () => modulesService.addSpecialization(moduleId, {
      user_id:        selUser,
      damage_type_id: selDamage   || null,
      category_id:    selCategory || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['specializations', moduleId] });
      setSelUser(''); setSelDamage(''); setSelCategory(''); setAddOpen(false); setError('');
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al agregar especialización'),
  });

  const removeMut = useMutation({
    mutationFn: ({ specId }: { specId: string }) => modulesService.removeSpecialization(moduleId, specId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specializations', moduleId] }),
  });

  function handleAdd() {
    if (!selUser) { setError('Selecciona un técnico'); return; }
    if (!selDamage && !selCategory) { setError('Selecciona tipo de daño o categoría'); return; }
    setError('');
    addMut.mutate();
  }

  if (status === 'loading') return null;

  return (
    <div className={mgmt.pageWrap}>
    <div className={mgmt.pageContent}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}
          >
            <ArrowLeft size={14} /> Volver
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: '0 0 4px' }}>
            Especializaciones de técnicos
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            {module?.name ?? moduleId} — vincula técnicos a tipos de daño o categorías específicas
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setAddOpen(true); setError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: C.coral, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          <Plus size={14} /> Agregar
        </button>
      </div>

      {/* Add form */}
      {addOpen && (
        <div style={{ background: 'var(--app-card)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '0 0 14px' }}>Nueva especialización</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Técnico *</label>
              <select value={selUser} onChange={e => setSelUser(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: '#334155' }}>
                <option value="">Seleccionar…</option>
                {technicians.map((t: any) => (
                  <option key={t.user_id} value={t.user_id}>{t.name ?? t.user_id}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Tipo de daño</label>
              <select value={selDamage} onChange={e => { setSelDamage(e.target.value); if (e.target.value) setSelCategory(''); }}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: '#334155' }}>
                <option value="">Sin especificar</option>
                {(damageTypes as any[]).filter(d => d.is_active).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Categoría</label>
              <select value={selCategory} onChange={e => { setSelCategory(e.target.value); if (e.target.value) setSelDamage(''); }}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: '#334155' }}>
                <option value="">Sin especificar</option>
                {(categories as any[]).filter(c => c.is_active).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7 }}>
              <AlertCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={handleAdd} disabled={addMut.isPending}
              style={{ padding: '8px 18px', background: C.coral, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {addMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={() => { setAddOpen(false); setError(''); setSelUser(''); setSelDamage(''); setSelCategory(''); }}
              style={{ padding: '8px 14px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando…</div>
      ) : specs.length === 0 ? (
        <div style={{ background: 'var(--app-card)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '60px 0', textAlign: 'center' }}>
          <Users size={28} style={{ display: 'block', margin: '0 auto 12px', color: C.border }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>Sin especializaciones</p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Agrega una para enrutar tickets al técnico más adecuado.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {specs.map(tech => (
            <div key={tech.user_id} style={{ background: 'var(--app-card)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--app-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    {tech.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{tech.name}</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{tech.email} · {tech.role_name}</p>
                </div>
              </div>

              {tech.damage_types.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 6px' }}>Tipos de daño</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tech.damage_types.map(d => (
                      <span key={d.spec_id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: '#f0f4f8', border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 11, fontWeight: 600, color: C.navy }}>
                        {d.label}
                        <button type="button" onClick={() => removeMut.mutate({ specId: d.spec_id })}
                          disabled={removeMut.isPending}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', lineHeight: 1 }}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {tech.categories.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 6px' }}>Categorías</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tech.categories.map(c => (
                      <span key={c.spec_id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#16a34a' }}>
                        {c.name}
                        <button type="button" onClick={() => removeMut.mutate({ specId: c.spec_id })}
                          disabled={removeMut.isPending}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', lineHeight: 1 }}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
    </div>
  );
}
