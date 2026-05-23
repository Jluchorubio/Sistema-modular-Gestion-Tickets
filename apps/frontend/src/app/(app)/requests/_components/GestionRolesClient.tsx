'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Shield, Check, X, ChevronDown, ChevronUp, AlertCircle,
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

interface Permission {
  id:          string;
  name:        string;
  description: string | null;
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

function PermRow({ perm, checked, onChange }: {
  perm:     Permission;
  checked:  boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`${styles.permRow} ${checked ? styles.permRowChecked : ''}`}>
      <input
        type="checkbox"
        className={styles.permCheck}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <div className={styles.permInfo}>
        <span className={styles.permName}>{perm.name}</span>
        {perm.description && <span className={styles.permDesc}>{perm.description}</span>}
      </div>
    </label>
  );
}

export function GestionRolesClient({ moduleId }: Props) {
  const qc = useQueryClient();

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['module-roles-mgmt', moduleId],
    queryFn:  () => modulesService.getModuleRoles(moduleId),
  });

  const { data: allPerms = [], isLoading: loadingPerms } = useQuery({
    queryKey: ['module-perms', moduleId],
    queryFn:  () => modulesService.getModulePermissions(moduleId),
  });

  const invalidateRoles = () => qc.invalidateQueries({ queryKey: ['module-roles-mgmt', moduleId] });
  const invalidatePerms = () => qc.invalidateQueries({ queryKey: ['module-perms', moduleId] });

  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRole,    setEditingRole]    = useState<Role | null>(null);
  const [expandedRole,   setExpandedRole]   = useState<string | null>(null);

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

  const [showCreatePerm, setShowCreatePerm] = useState(false);
  const [newPermName,    setNewPermName]    = useState('');
  const [newPermDesc,    setNewPermDesc]    = useState('');

  const createPermMut = useMutation({
    mutationFn: () =>
      modulesService.createPermission(moduleId, newPermName.trim(), newPermDesc.trim() || undefined),
    onSuccess: () => {
      invalidatePerms();
      setShowCreatePerm(false);
      setNewPermName('');
      setNewPermDesc('');
    },
  });

  const deletePermMut = useMutation({
    mutationFn: (id: string) => modulesService.deletePermission(id),
    onSuccess:  invalidatePerms,
  });

  const { data: rolePerms = [] } = useQuery({
    queryKey: ['role-perms', expandedRole],
    queryFn:  () => modulesService.getRolePermissions(expandedRole!),
    enabled:  !!expandedRole,
    staleTime: 10_000,
  });

  const setRolePermsMut = useMutation({
    mutationFn: ({ roleId, ids }: { roleId: string; ids: string[] }) =>
      modulesService.setRolePermissions(roleId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-perms', expandedRole] }),
  });

  const togglePerm = (roleId: string, permId: string, granted: boolean) => {
    const current = rolePerms.map(p => p.id);
    const next = granted
      ? [...current, permId]
      : current.filter(id => id !== permId);
    setRolePermsMut.mutate({ roleId, ids: next });
  };

  if (loadingRoles || loadingPerms) return <Spinner />;

  const rolePermsSet = new Set(rolePerms.map(p => p.id));

  return (
    <div className={styles.wrap}>

      {/* ── Roles section ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}><Shield size={14} /> Roles del módulo</div>
            <div className={styles.sectionSub}>Define qué roles existen y qué pueden hacer</div>
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
              <div
                key={role.id}
                className={`${styles.roleCard} ${expandedRole === role.id ? styles.roleCardExpanded : ''}`}
              >
                {editingRole?.id === role.id ? (
                  <RoleForm
                    initial={{ name: role.name, description: role.description ?? '' }}
                    onSave={(name, desc) => updateRoleMut.mutate({ id: role.id, name, desc })}
                    onCancel={() => setEditingRole(null)}
                    isPending={updateRoleMut.isPending}
                  />
                ) : (
                  <div className={styles.roleHeader}>
                    <button
                      type="button"
                      className={styles.roleExpand}
                      onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
                    >
                      <div>
                        <div className={styles.roleName}>{role.name}</div>
                        {role.description && <div className={styles.roleDesc}>{role.description}</div>}
                      </div>
                      <span className={styles.permCount}>
                        {expandedRole === role.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        Permisos
                      </span>
                    </button>
                    <div className={styles.roleActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Editar"
                        onClick={() => { setEditingRole(role); setExpandedRole(null); }}
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

                {expandedRole === role.id && (
                  <div className={styles.permsPanel}>
                    {allPerms.length === 0 ? (
                      <div className={styles.permEmpty}>
                        <AlertCircle size={13} /> No hay permisos definidos en este módulo.
                      </div>
                    ) : (
                      <div className={styles.permGrid}>
                        {(allPerms as Permission[]).map(perm => (
                          <PermRow
                            key={perm.id}
                            perm={perm}
                            checked={rolePermsSet.has(perm.id)}
                            onChange={checked => togglePerm(role.id, perm.id, checked)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Permissions catalog ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}><Check size={14} /> Catálogo de permisos</div>
            <div className={styles.sectionSub}>Permisos disponibles para asignar a roles</div>
          </div>
          {!showCreatePerm && (
            <button className={styles.btnSecondary} onClick={() => setShowCreatePerm(true)}>
              <Plus size={13} /> Agregar permiso
            </button>
          )}
        </div>

        {showCreatePerm && (
          <div className={styles.inlineForm}>
            <input
              className={styles.inlineInput}
              placeholder="Nombre (ej: requests.approve)…"
              value={newPermName}
              onChange={e => setNewPermName(e.target.value)}
              autoFocus
            />
            <input
              className={styles.inlineInput}
              placeholder="Descripción (opcional)…"
              value={newPermDesc}
              onChange={e => setNewPermDesc(e.target.value)}
            />
            <div className={styles.inlineActions}>
              <button
                type="button"
                className={styles.btnSave}
                disabled={!newPermName.trim() || createPermMut.isPending}
                onClick={() => createPermMut.mutate()}
              >
                <Check size={13} /> {createPermMut.isPending ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => { setShowCreatePerm(false); setNewPermName(''); setNewPermDesc(''); }}
              >
                <X size={13} /> Cancelar
              </button>
            </div>
          </div>
        )}

        {allPerms.length === 0 ? (
          <div className={styles.empty}>No hay permisos definidos.</div>
        ) : (
          <div className={styles.permCatalog}>
            {(allPerms as Permission[]).map(perm => (
              <div key={perm.id} className={styles.permCatalogRow}>
                <div>
                  <span className={styles.permCatalogName}>{perm.name}</span>
                  {perm.description && <span className={styles.permCatalogDesc}> — {perm.description}</span>}
                </div>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  title="Eliminar"
                  disabled={deletePermMut.isPending}
                  onClick={() => deletePermMut.mutate(perm.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
