'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, MapPin, Building2, ToggleLeft, ToggleRight } from 'lucide-react';
import { modulesService, type ModuleLocation, type ModuleEnvironment } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';

interface Props { moduleId: string }

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit', color: '#0e2235', background: '#fff',
  boxSizing: 'border-box', outline: 'none',
};
const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
};

/* ── Inline form ── */
function InlineForm({
  fields, onSave, onCancel, pending,
}: {
  fields: { key: string; label: string; placeholder?: string; required?: boolean }[];
  onSave: (vals: Record<string, string>) => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.key, ''])),
  );
  const canSave = fields.filter(f => f.required).every(f => vals[f.key]?.trim());

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(fields.length, 2)}, 1fr)`, gap: 10, marginBottom: 10 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={fieldLabel}>{f.label}{f.required ? ' *' : ''}</label>
            <input style={inp} value={vals[f.key]} placeholder={f.placeholder}
              onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} autoFocus={f === fields[0]} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!canSave || pending}
          onClick={() => onSave(vals)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#0e2235', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: canSave && !pending ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: canSave && !pending ? 1 : 0.5 }}>
          <Check size={13} /> {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  );
}

/* ── Environment row ── */
function EnvironmentRow({
  env, moduleId, locId, onError,
}: {
  env: ModuleEnvironment;
  moduleId: string;
  locId: string;
  onError: (msg: string) => void;
}) {
  const qc         = useQueryClient();
  const [editing,  setEditing] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['module-locations', moduleId] });

  const updateMut = useMutation({
    mutationFn: (dto: { name?: string; description?: string; is_active?: boolean }) =>
      modulesService.updateEnvironment(env.id, dto),
    onSuccess: () => { invalidate(); setEditing(false); },
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: () => modulesService.deleteEnvironment(env.id),
    onSuccess:  invalidate,
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Error al eliminar'),
  });

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px 8px 36px',
        background: '#f8fafc', border: '1px solid #f1f5f9',
        borderRadius: 5, marginBottom: 3,
        opacity: env.is_active ? 1 : 0.5,
      }}>
        <MapPin size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{env.name}</span>
          {env.description && (
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{env.description}</span>
          )}
        </div>
        <button type="button"
          title={env.is_active ? 'Desactivar' : 'Activar'}
          disabled={updateMut.isPending}
          onClick={() => updateMut.mutate({ is_active: !env.is_active })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: env.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}>
          {env.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>
        <button type="button" onClick={() => setEditing(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', background: 'transparent', color: '#4f46e5', border: '1px solid #e0e7ff', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Pencil size={10} />
        </button>
        <button type="button" disabled={deleteMut.isPending}
          onClick={() => { if (confirm(`¿Eliminar ambiente "${env.name}"?`)) deleteMut.mutate(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Trash2 size={10} />
        </button>
      </div>
      {editing && (
        <div style={{ paddingLeft: 36 }}>
          <InlineForm
            fields={[
              { key: 'name',        label: 'Nombre',      required: true, placeholder: env.name },
              { key: 'description', label: 'Descripción', placeholder: env.description ?? '' },
            ]}
            pending={updateMut.isPending}
            onSave={vals => updateMut.mutate({ name: vals.name || undefined, description: vals.description || undefined })}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

/* ── Location card ── */
function LocationCard({
  loc, moduleId, onError,
}: {
  loc: ModuleLocation;
  moduleId: string;
  onError: (msg: string) => void;
}) {
  const qc             = useQueryClient();
  const [open,         setOpen]        = useState(true);
  const [editingLoc,   setEditingLoc]  = useState(false);
  const [addingEnv,    setAddingEnv]   = useState(false);
  const invalidate     = () => qc.invalidateQueries({ queryKey: ['module-locations', moduleId] });

  const updateLocMut = useMutation({
    mutationFn: (dto: { name?: string; address?: string; is_active?: boolean }) =>
      modulesService.updateLocation(loc.id, dto),
    onSuccess: () => { invalidate(); setEditingLoc(false); },
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Error'),
  });

  const deleteLocMut = useMutation({
    mutationFn: () => modulesService.deleteLocation(loc.id),
    onSuccess:  invalidate,
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Error al eliminar sede'),
  });

  const addEnvMut = useMutation({
    mutationFn: (dto: { name: string; description?: string }) =>
      modulesService.createEnvironment(moduleId, loc.id, dto),
    onSuccess: () => { invalidate(); setAddingEnv(false); },
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Error al crear ambiente'),
  });

  const envs: ModuleEnvironment[] = loc.environments ?? [];

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 12, opacity: loc.is_active ? 1 : 0.6 }}>
      {/* Location header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fff' }}>
        <button type="button" onClick={() => setOpen(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748b', flexShrink: 0 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={14} style={{ color: '#3b82f6' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0e2235' }}>{loc.name}</div>
          {loc.address && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{loc.address}</div>}
        </div>

        <span style={{
          fontSize: 10, color: '#64748b', background: '#f1f5f9',
          padding: '2px 8px', borderRadius: 99, fontWeight: 600, flexShrink: 0,
        }}>
          {envs.length} ambiente{envs.length !== 1 ? 's' : ''}
        </span>

        <button type="button"
          title={loc.is_active ? 'Desactivar sede' : 'Activar sede'}
          disabled={updateLocMut.isPending}
          onClick={() => updateLocMut.mutate({ is_active: !loc.is_active })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: loc.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}>
          {loc.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        </button>

        <button type="button" onClick={() => setEditingLoc(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', color: '#4f46e5', border: '1px solid #e0e7ff', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          <Pencil size={11} />
        </button>
        <button type="button" disabled={deleteLocMut.isPending}
          onClick={() => { if (confirm(`¿Eliminar sede "${loc.name}"? Elimina también sus ambientes.`)) deleteLocMut.mutate(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          <Trash2 size={11} />
        </button>
      </div>

      {editingLoc && (
        <div style={{ padding: '0 12px 12px' }}>
          <InlineForm
            fields={[
              { key: 'name',    label: 'Nombre sede',  required: true, placeholder: loc.name },
              { key: 'address', label: 'Dirección',    placeholder: loc.address ?? '' },
            ]}
            pending={updateLocMut.isPending}
            onSave={vals => updateLocMut.mutate({ name: vals.name || undefined, address: vals.address || undefined })}
            onCancel={() => setEditingLoc(false)}
          />
        </div>
      )}

      {open && (
        <div style={{ padding: '8px 12px 12px', background: '#fafbfc', borderTop: '1px solid #f1f5f9' }}>
          {/* Environments */}
          {envs.length > 0 && (
            <div style={{ marginBottom: addingEnv ? 8 : 0 }}>
              {envs.map(env => (
                <EnvironmentRow key={env.id} env={env} moduleId={moduleId} locId={loc.id} onError={onError} />
              ))}
            </div>
          )}

          {envs.length === 0 && !addingEnv && (
            <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
              Sin ambientes. Añade al menos uno para poder crear activos aquí.
            </div>
          )}

          {addingEnv ? (
            <div style={{ paddingLeft: 24 }}>
              <InlineForm
                fields={[
                  { key: 'name',        label: 'Nombre ambiente', required: true, placeholder: 'Ej: Laboratorio A' },
                  { key: 'description', label: 'Descripción',     placeholder: 'Opcional…' },
                ]}
                pending={addEnvMut.isPending}
                onSave={vals => addEnvMut.mutate({ name: vals.name, description: vals.description || undefined })}
                onCancel={() => setAddingEnv(false)}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAddingEnv(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#fff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={11} /> Nuevo ambiente
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main tab ── */
export function LocationsTab({ moduleId }: Props) {
  const qc = useQueryClient();

  const { data: locations = [], isLoading } = useQuery<ModuleLocation[]>({
    queryKey: ['module-locations', moduleId],
    queryFn:  () => modulesService.getModuleLocations(moduleId),
    staleTime: 60_000,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [error,      setError]      = useState('');

  const createLocMut = useMutation({
    mutationFn: (dto: { name: string; address?: string }) =>
      modulesService.createLocation(moduleId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-locations', moduleId] });
      setShowCreate(false);
      setError('');
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear sede'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Sedes y Ambientes
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
        Las <strong>sedes</strong> son ubicaciones físicas (ej: Sede Norte). Los <strong>ambientes</strong> son
        espacios dentro de una sede (ej: Laboratorio A, Piso 2). Cada activo debe pertenecer a un ambiente.
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
          {error}
          <button type="button" onClick={() => setError('')} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Create location form */}
      {showCreate && (
        <InlineForm
          fields={[
            { key: 'name',    label: 'Nombre de la sede', required: true, placeholder: 'Ej: Sede Principal' },
            { key: 'address', label: 'Dirección',         placeholder: 'Ej: Calle 10 #5-20' },
          ]}
          pending={createLocMut.isPending}
          onSave={vals => createLocMut.mutate({ name: vals.name, address: vals.address || undefined })}
          onCancel={() => { setShowCreate(false); setError(''); }}
        />
      )}

      {/* Location cards */}
      {locations.length === 0 && !showCreate ? (
        <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
            Sin sedes configuradas. Sin sedes no puedes crear activos.
          </div>
          <button type="button" onClick={() => setShowCreate(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#0e2235', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={13} /> Crear primera sede
          </button>
        </div>
      ) : (
        <>
          {locations.map(loc => (
            <LocationCard key={loc.id} loc={loc} moduleId={moduleId} onError={setError} />
          ))}
          {!showCreate && (
            <button type="button" onClick={() => setShowCreate(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', color: '#0e2235', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={13} /> Nueva sede
            </button>
          )}
        </>
      )}
    </div>
  );
}
