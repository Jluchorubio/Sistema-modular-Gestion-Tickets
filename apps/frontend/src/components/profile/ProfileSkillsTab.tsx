'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService, type TechnicianProfile } from '@/services/users.service';
import { modulesService } from '@/services/modules.service';
import type { ProfileUser } from './profile.types';
import { Spinner } from '@/components/ui/Spinner';

interface Props {
  user:         ProfileUser;
  targetUserId: string;
  canEdit:      boolean;
}

const TYPE_LABEL: Record<string, string> = {
  generalist: 'Generalista',
  specialist: 'Especialista',
};

function CategoryChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
    }}>
      {name}
      {onRemove && (
        <button
          type="button" onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#0369a1', fontWeight: 700, fontSize: 13 }}
          aria-label={`Quitar ${name}`}
        >×</button>
      )}
    </span>
  );
}

function ProfileCard({
  profile,
  targetUserId,
  canEdit,
}: {
  profile:      TechnicianProfile;
  targetUserId: string;
  canEdit:      boolean;
}) {
  const qc = useQueryClient();
  const [addingCat,  setAddingCat]  = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [techType,   setTechType]   = useState<'generalist' | 'specialist'>(profile.technician_type);
  const [maxTickets, setMaxTickets] = useState<string>(profile.max_daily_tickets != null ? String(profile.max_daily_tickets) : '');

  const { data: categories = [] } = useQuery({
    queryKey:  ['module-categories', profile.module_id],
    queryFn:   () => modulesService.getCategories(profile.module_id),
    enabled:   addingCat,
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['user-skills', targetUserId] });

  const updateMut = useMutation({
    mutationFn: (dto: Parameters<typeof usersService.updateSkill>[2]) =>
      usersService.updateSkill(targetUserId, profile.id, dto),
    onSuccess: invalidate,
  });

  const removeMut = useMutation({
    mutationFn: () => usersService.removeSkill(targetUserId, profile.id),
    onSuccess:  invalidate,
  });

  const existingCatIds = new Set(profile.category_skills.map(c => c.category_id));
  const availableCats  = categories.filter(c => c.is_active && !existingCatIds.has(c.id));

  return (
    <div style={{
      border: '1px solid #e9eef4', borderRadius: 2, padding: '16px 20px',
      background: '#fff', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0e2235' }}>{profile.module_name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              background: profile.technician_type === 'specialist' ? 'rgba(124,58,237,0.08)' : 'rgba(14,34,53,0.06)',
              color: profile.technician_type === 'specialist' ? '#7c3aed' : '#475569',
              padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              border: `1px solid ${profile.technician_type === 'specialist' ? 'rgba(124,58,237,0.2)' : '#e2e8f0'}`,
            }}>
              {TYPE_LABEL[profile.technician_type] ?? profile.technician_type}
            </span>
            {profile.max_daily_tickets != null && (
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Máx {profile.max_daily_tickets} tickets/día
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button" onClick={() => setEditingType(v => !v)}
              style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#f8fafc', color: '#475569', fontFamily: 'inherit' }}
            >
              {editingType ? 'Cancelar' : 'Editar'}
            </button>
            <button
              type="button" onClick={() => removeMut.mutate()} disabled={removeMut.isPending}
              style={{ padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 2, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: '#ef4444', fontFamily: 'inherit' }}
            >
              Quitar
            </button>
          </div>
        )}
      </div>

      {editingType && canEdit && (
        <div style={{ background: '#f8fafc', border: '1px solid #e9eef4', borderRadius: 2, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select
                value={techType}
                onChange={e => setTechType(e.target.value as 'generalist' | 'specialist')}
                style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontFamily: 'inherit', color: '#0e2235', background: '#fff' }}
              >
                <option value="generalist">Generalista</option>
                <option value="specialist">Especialista</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Máx tickets/día</label>
              <input
                type="number" min={1} max={100} placeholder="Sin límite"
                value={maxTickets}
                onChange={e => setMaxTickets(e.target.value)}
                style={{ width: 90, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontFamily: 'inherit' }}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={updateMut.isPending}
            onClick={() => {
              updateMut.mutate(
                {
                  technician_type:   techType,
                  max_daily_tickets: maxTickets ? parseInt(maxTickets, 10) : null,
                },
                { onSuccess: () => setEditingType(false) },
              );
            }}
            style={{ padding: '5px 14px', background: '#ff5e3a', color: '#fff', border: 'none', borderRadius: 2, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {updateMut.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Categorías especializadas
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: canEdit ? 10 : 0 }}>
        {profile.category_skills.length === 0 && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Sin categorías — atiende todas</span>
        )}
        {profile.category_skills.map(cs => (
          <CategoryChip
            key={cs.id}
            name={cs.category_name}
            onRemove={canEdit ? () => updateMut.mutate({ category_ids_remove: [cs.category_id] }) : undefined}
          />
        ))}
      </div>

      {canEdit && (
        <div style={{ marginTop: 8 }}>
          {!addingCat ? (
            <button
              type="button" onClick={() => setAddingCat(true)}
              style={{ fontSize: 11, fontWeight: 600, color: '#ff5e3a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              + Agregar categoría
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {availableCats.length === 0 ? (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>No hay más categorías disponibles</span>
              ) : (
                <select
                  onChange={e => {
                    if (!e.target.value) return;
                    updateMut.mutate(
                      { category_ids_add: [e.target.value] },
                      { onSuccess: () => setAddingCat(false) },
                    );
                  }}
                  defaultValue=""
                  style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontFamily: 'inherit', color: '#0e2235', background: '#fff' }}
                >
                  <option value="">Seleccionar categoría…</option>
                  {availableCats.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <button
                type="button" onClick={() => setAddingCat(false)}
                style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddProfileForm({
  targetUserId,
  existingModuleIds,
  techModules,
  onDone,
}: {
  targetUserId:      string;
  existingModuleIds: Set<string>;
  techModules:       { module_id: string; module_name: string }[];
  onDone:            () => void;
}) {
  const qc            = useQueryClient();
  const [moduleId, setModuleId]   = useState('');
  const [techType, setTechType]   = useState<'generalist' | 'specialist'>('generalist');
  const [maxTickets, setMaxTickets] = useState('');

  const available = techModules.filter(m => !existingModuleIds.has(m.module_id));

  const addMut = useMutation({
    mutationFn: () => usersService.addSkill(targetUserId, {
      module_id:         moduleId,
      technician_type:   techType,
      max_daily_tickets: maxTickets ? parseInt(maxTickets, 10) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-skills', targetUserId] });
      onDone();
    },
  });

  if (!available.length) return null;

  return (
    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 2, padding: '16px 20px', background: '#f8fafc', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', marginBottom: 12 }}>Nuevo perfil técnico</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Módulo</label>
          <select
            value={moduleId}
            onChange={e => setModuleId(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontFamily: 'inherit', color: '#0e2235', background: '#fff' }}
          >
            <option value="">Seleccionar…</option>
            {available.map(m => (
              <option key={m.module_id} value={m.module_id}>{m.module_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo</label>
          <select
            value={techType}
            onChange={e => setTechType(e.target.value as 'generalist' | 'specialist')}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontFamily: 'inherit', color: '#0e2235', background: '#fff' }}
          >
            <option value="generalist">Generalista</option>
            <option value="specialist">Especialista</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Máx tickets/día</label>
          <input
            type="number" min={1} max={100} placeholder="Sin límite"
            value={maxTickets}
            onChange={e => setMaxTickets(e.target.value)}
            style={{ width: 90, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontFamily: 'inherit' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!moduleId || addMut.isPending}
          onClick={() => addMut.mutate()}
          style={{ padding: '6px 16px', background: '#ff5e3a', color: '#fff', border: 'none', borderRadius: 2, fontSize: 12, fontWeight: 700, cursor: moduleId ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: moduleId ? 1 : 0.5 }}
        >
          {addMut.isPending ? 'Creando…' : 'Crear perfil'}
        </button>
        <button
          type="button" onClick={onDone}
          style={{ padding: '6px 14px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ProfileSkillsTab({ user, targetUserId, canEdit }: Props) {
  const [showAdd, setShowAdd] = useState(false);

  const { data: profiles = [], isLoading } = useQuery<TechnicianProfile[]>({
    queryKey: ['user-skills', targetUserId],
    queryFn:  () => usersService.getSkills(targetUserId),
    staleTime: 30_000,
  });

  const existingModuleIds = new Set(profiles.map(p => p.module_id));

  // Tech modules from the user's module_roles (tecnico / jefe_tecnico)
  const techModules = (user.module_roles ?? [])
    .filter(r => r.status === 'active' && ['tecnico', 'jefe_tecnico'].includes(r.role_name))
    .map(r => ({ module_id: r.module_id, module_name: r.module_name }));

  const hasAvailableModules = techModules.some(m => !existingModuleIds.has(m.module_id));

  if (isLoading) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>;

  return (
    <div style={{ padding: '24px 0', maxWidth: 680 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0e2235' }}>Perfiles técnicos</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
            Módulos en que el técnico está registrado y sus categorías de especialización.
          </p>
        </div>
        {canEdit && hasAvailableModules && !showAdd && (
          <button
            type="button" onClick={() => setShowAdd(true)}
            style={{ padding: '7px 16px', background: '#ff5e3a', color: '#fff', border: 'none', borderRadius: 2, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
          >
            + Nuevo perfil
          </button>
        )}
      </div>

      {showAdd && canEdit && (
        <AddProfileForm
          targetUserId={targetUserId}
          existingModuleIds={existingModuleIds}
          techModules={techModules}
          onDone={() => setShowAdd(false)}
        />
      )}

      {profiles.length === 0 && !showAdd && (
        <div style={{ padding: '32px 20px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 2 }}>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Sin perfiles técnicos configurados.</p>
          {canEdit && !hasAvailableModules && (
            <p style={{ fontSize: 12, color: '#cbd5e1' }}>
              Asigna primero al usuario a un módulo con rol de técnico.
            </p>
          )}
        </div>
      )}

      {profiles.map(p => (
        <ProfileCard
          key={p.id}
          profile={p}
          targetUserId={targetUserId}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
