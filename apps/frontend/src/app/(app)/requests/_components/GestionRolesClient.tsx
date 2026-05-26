'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Shield, Check, X,
} from 'lucide-react';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import styles from './gestionRoles.module.css';

interface Props { moduleId: string }

interface Role {
  id:          string;
  name:        string;
  description: string | null;
  is_active:   boolean;
}

function RoleForm({
  initial, onSave, onCancel, isPending,
}: {
  initial?:  { name: string; description: string };
  onSave:    (name: string, description: string) => void;
  onCancel:  () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');

  return (
    <div className={styles.inlineForm}>
      <input
        className={styles.inlineInput}
        placeholder="Nombre del rol…"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <input
        className={styles.inlineInput}
        placeholder="Descripción (opcional)…"
        value={desc}
        onChange={e => setDesc(e.target.value)}
      />
      <div className={styles.inlineActions}>
        <button
          type="button"
          className={styles.btnSave}
          disabled={!name.trim() || isPending}
          onClick={() => onSave(name.trim(), desc.trim())}
        >
          <Check size={13} /> {isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className={styles.btnCancel} onClick={onCancel}>
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  );
}

export function GestionRolesClient({ moduleId }: Props) {
  const qc = useQueryClient();

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['module-roles-mgmt', moduleId],
    queryFn:  () => modulesService.getModuleRoles(moduleId),
  });

  const invalidateRoles = () => qc.invalidateQueries({ queryKey: ['module-roles-mgmt', moduleId] });

  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRole,    setEditingRole]    = useState<Role | null>(null);

  const createRoleMut = useMutation({
    mutationFn: ({ name, desc }: { name: string; desc: string }) =>
      modulesService.createRole(moduleId, name, desc || undefined),
    onSuccess: () => { invalidateRoles(); setShowCreateRole(false); },
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ id, name, desc }: { id: string; name: string; desc: string }) =>
      modulesService.updateRole(id, { name, description: desc || undefined }),
    onSuccess: () => { invalidateRoles(); setEditingRole(null); },
  });

  const deleteRoleMut = useMutation({
    mutationFn: (id: string) => modulesService.deleteRole(id),
    onSuccess:  invalidateRoles,
  });

  if (loadingRoles) return <Spinner />;

  return (
    <div className={styles.wrap}>

      {/* ── Roles section ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}><Shield size={14} /> Roles del módulo</div>
            <div className={styles.sectionSub}>Define qué roles existen en este módulo</div>
          </div>
          {!showCreateRole && (
            <button className={styles.btnPrimary} onClick={() => setShowCreateRole(true)}>
              <Plus size={13} /> Crear rol
            </button>
          )}
        </div>

        {showCreateRole && (
          <RoleForm
            onSave={(name, desc) => createRoleMut.mutate({ name, desc })}
            onCancel={() => setShowCreateRole(false)}
            isPending={createRoleMut.isPending}
          />
        )}

        {roles.length === 0 ? (
          <div className={styles.empty}>No hay roles. Crea el primero.</div>
        ) : (
          <div className={styles.roleList}>
            {(roles as Role[]).map(role => (
              <div key={role.id} className={styles.roleCard}>
                {editingRole?.id === role.id ? (
                  <RoleForm
                    initial={{ name: role.name, description: role.description ?? '' }}
                    onSave={(name, desc) => updateRoleMut.mutate({ id: role.id, name, desc })}
                    onCancel={() => setEditingRole(null)}
                    isPending={updateRoleMut.isPending}
                  />
                ) : (
                  <div className={styles.roleHeader}>
                    <div>
                      <div className={styles.roleName}>{role.name}</div>
                      {role.description && <div className={styles.roleDesc}>{role.description}</div>}
                    </div>
                    <div className={styles.roleActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Editar"
                        onClick={() => setEditingRole(role)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        title="Desactivar"
                        disabled={deleteRoleMut.isPending}
                        onClick={() => deleteRoleMut.mutate(role.id)}
                      >
                        <Trash2 size={13} />
                      </button>
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
