'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/hooks/usePermission';
import { usePermissionsStore } from '@/stores/permissions.store';
import { useSuperadminGuard } from '@/hooks/useSuperadminGuard';
import {
  permissionsService,
  type PermissionDef,
  type RoleInfo,
} from '@/services/permissions.service';
import { usersService } from '@/services/users.service';
import { Spinner } from '@/components/ui/Spinner';
import { ContextNav } from '@/components/ui/ContextNav';
import { Plus, X, Edit2, Trash2, RotateCcw, Check, ShieldCheck, Lock } from 'lucide-react';
import styles from '../roles.module.css';
import mgmt   from '@/styles/mgmt.module.css';

/* ── Risk helpers ── */
type RiskLevel = 'root' | 'high' | 'medium' | 'low';

function computeRisk(perm: PermissionDef): RiskLevel {
  if (!perm.parent_key) return 'root';
  const k = perm.key.toLowerCase();
  if (k.includes('delete') || k.includes('edit') || k.includes('reassign')) return 'high';
  if (k.includes('create') || k.includes('take') || k.includes('deactivate')) return 'medium';
  return 'low';
}

const RISK_CLS: Record<RiskLevel, string> = {
  root: styles.riskRoot, high: styles.riskHigh, medium: styles.riskMedium, low: styles.riskLow,
};

const RISK_LABEL: Record<RiskLevel, string> = {
  root: 'Agrupador Raíz', high: 'Alto', medium: 'Medio', low: 'Bajo',
};

const RISK_DESC: Record<RiskLevel, string> = {
  root:   'Este es un permiso de nodo padre. Habilitarlo permite el acceso general a la sección pero no otorga permisos de alteración.',
  high:   'Alerta de Seguridad: Este permiso faculta la eliminación o edición de datos operacionales críticos. Su otorgamiento puede derivar en brechas de datos o alteración de auditorías.',
  medium: 'Este permiso faculta la inserción de nuevos registros y operaciones ejecutivas. Debe asignarse bajo supervisión del administrador.',
  low:    'Este permiso concede acceso a funcionalidades de consulta y lectura ordinaria, con nulo riesgo de alteración o desestabilización del sistema.',
};

/* ── Component ── */
export function RolesClient() {
  const { status } = useSuperadminGuard();
  const loaded  = usePermissionsStore(s => s.loaded);
  const canView = usePermission('global:sidebar:roles');
  const qc      = useQueryClient();

  const [contextVal,      setContextVal]      = useState<string>('global');
  const [activeRoleId,    setActiveRoleId]    = useState<string | null>(null);
  const [localGrants,     setLocalGrants]     = useState<Set<string>>(new Set());
  const [savedGrants,     setSavedGrants]     = useState<Set<string>>(new Set());
  const [selectedPermKey, setSelectedPermKey] = useState<string | null>(null);
  const [saveStatus,      setSaveStatus]      = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createErr,  setCreateErr]  = useState<string | null>(null);

  const createRoleMut = useMutation({
    mutationFn: () => usersService.createGlobalRole(createName.trim(), createDesc.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', 'global'] });
      setCreateOpen(false);
      setCreateName('');
      setCreateDesc('');
      setCreateErr(null);
    },
    onError: (e: Error) => setCreateErr(e.message ?? 'Error al crear rol'),
  });

  /* ── Edit / Delete / Reactivate state ── */
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editName,      setEditName]      = useState('');
  const [editDesc,      setEditDesc]      = useState('');
  const [editErr,       setEditErr]       = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function startEdit(role: RoleInfo) {
    setEditingRoleId(role.id);
    setEditName(role.name);
    setEditDesc(role.description ?? '');
    setEditErr(null);
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingRoleId(null);
    setEditErr(null);
  }

  const updateRoleMut = useMutation({
    mutationFn: () => usersService.updateGlobalRole(editingRoleId!, editName.trim() || undefined, editDesc.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', 'global'] });
      setEditingRoleId(null);
      setEditErr(null);
    },
    onError: (e: Error) => setEditErr(e.message ?? 'Error al actualizar'),
  });

  const deleteRoleMut = useMutation({
    mutationFn: (id: string) => usersService.deleteGlobalRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', 'global'] });
      setConfirmDeleteId(null);
      if (activeRoleId === confirmDeleteId) {
        setActiveRoleId(null);
        setLocalGrants(new Set());
        setSavedGrants(new Set());
      }
    },
  });

  const reactivateRoleMut = useMutation({
    mutationFn: (id: string) => usersService.reactivateGlobalRole(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles', 'global'] }),
  });

  const isGlobal = contextVal === 'global';
  const roleType: 'global' | 'module' = isGlobal ? 'global' : 'module';

  /* ── Queries ── */
  const { data: tree = [] } = useQuery({
    queryKey: ['perm-tree'],
    queryFn:  permissionsService.getPermissionTree,
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['perm-modules'],
    queryFn:  permissionsService.getModulesWithScopes,
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles', contextVal],
    queryFn:  () => isGlobal
      ? permissionsService.getGlobalRoles()
      : permissionsService.getModuleRoles(contextVal),
  });

  const { data: grantsData, isFetching: grantsFetching } = useQuery({
    queryKey: ['role-grants', activeRoleId, roleType],
    queryFn:  () => isGlobal
      ? permissionsService.getGlobalRoleGrants(activeRoleId!)
      : permissionsService.getModuleRoleGrants(activeRoleId!),
    enabled:  !!activeRoleId,
  });

  /* Sync grants into local state when they arrive */
  useEffect(() => {
    if (grantsData) {
      setLocalGrants(new Set(grantsData));
      setSavedGrants(new Set(grantsData));
    }
  }, [grantsData]);

  /* ── Tree helpers ── */
  const parents     = tree.filter(p => !p.parent_key);
  const childrenOf  = useCallback(
    (parentKey: string) => tree.filter(p => p.parent_key === parentKey),
    [tree],
  );

  /* ── Handlers ── */
  function handleContextChange(val: string) {
    setContextVal(val);
    setActiveRoleId(null);
    setLocalGrants(new Set());
    setSavedGrants(new Set());
    setSelectedPermKey(null);
    setSaveStatus('idle');
  }

  function selectRole(role: RoleInfo) {
    if (activeRoleId === role.id) return;
    setActiveRoleId(role.id);
    setLocalGrants(new Set());
    setSavedGrants(new Set());
    setSelectedPermKey(null);
    setSaveStatus('idle');
  }

  function toggleParent(parentKey: string, checked: boolean) {
    setLocalGrants(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(parentKey);
        // Critical rule: enabling parent does NOT auto-check children
      } else {
        next.delete(parentKey);
        childrenOf(parentKey).forEach(c => next.delete(c.key));
      }
      return next;
    });
  }

  function toggleChild(childKey: string, checked: boolean) {
    setLocalGrants(prev => {
      const next = new Set(prev);
      if (checked) next.add(childKey);
      else next.delete(childKey);
      return next;
    });
  }

  async function handleSave() {
    if (!activeRoleId) return;
    setSaveStatus('saving');

    const toGrant  = Array.from(localGrants).filter(k => !savedGrants.has(k));
    const toRevoke = Array.from(savedGrants).filter(k => !localGrants.has(k));

    try {
      await Promise.all([
        ...toGrant.map(k  => permissionsService.toggleGrant(activeRoleId, k, true,  roleType)),
        ...toRevoke.map(k => permissionsService.toggleGrant(activeRoleId, k, false, roleType)),
      ]);
      setSavedGrants(new Set(localGrants));
      qc.invalidateQueries({ queryKey: ['role-grants', activeRoleId, roleType] });
      qc.invalidateQueries({ queryKey: ['permissions-mine'] });
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('err');
    }
  }

  /* ── Derived ── */
  const activeRole    = roles.find(r => r.id === activeRoleId);
  const selectedPerm  = selectedPermKey ? tree.find(p => p.key === selectedPermKey) : null;
  const isDirty       = Array.from(localGrants).some(k => !savedGrants.has(k)) ||
                        Array.from(savedGrants).some(k => !localGrants.has(k));

  /* ── Guards ── */
  if (status === 'loading') return null;
  if (status === 'unauthorized') return null;
  if (loaded && !canView) return (
    <div className={mgmt.pageWrap}>
      <div className={mgmt.pageContent}>
        <p className={styles.errorMsg}>No tienes permiso para ver esta sección.</p>
      </div>
    </div>
  );

  return (
    <div className={mgmt.pageWrap}>
      <ContextNav
        back
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Roles y Privilegios' },
        ]}
      />
      <div className={mgmt.pageContent}>

        {/* ── Create role modal ── */}
        {createOpen && (
          <div className={styles.modalBackdrop} onClick={() => setCreateOpen(false)}>
            <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div>
                  <h2 className={styles.modalTitle}>Nuevo Rol Global</h2>
                  <p className={styles.modalSub}>El rol se creará sin permisos. Asígnalos desde el árbol.</p>
                </div>
                <button type="button" className={styles.modalCloseBtn} onClick={() => setCreateOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Nombre del rol *</label>
                <input
                  className={styles.modalInput}
                  placeholder="Ej: auditor, soporte_l1…"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Descripción (opcional)</label>
                <input
                  className={styles.modalInput}
                  placeholder="Breve descripción del rol…"
                  value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)}
                />
              </div>
              {createErr && <p className={styles.modalError}>{createErr}</p>}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnModalCancel} onClick={() => { setCreateOpen(false); setCreateErr(null); }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.btnModalCreate}
                  onClick={() => { setCreateErr(null); createRoleMut.mutate(); }}
                  disabled={!createName.trim() || createRoleMut.isPending}
                >
                  {createRoleMut.isPending ? 'Creando…' : 'Crear rol'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Roles y Privilegios</h1>
            <p className={styles.sub}>Gestión de perfiles de acceso, matrices de permisos y control de privilegios del sistema.</p>
          </div>
          {isGlobal && (
            <button
              type="button"
              className={styles.btnNewRole}
              onClick={() => { setCreateOpen(true); setCreateName(''); setCreateDesc(''); setCreateErr(null); }}
            >
              <Plus size={13} />
              Nuevo Rol
            </button>
          )}
        </div>

        {/* ══ 3-panel workspace ══ */}
        <div className={styles.workspace}>

          {/* ─── LEFT: Roles panel ─── */}
          <div className={styles.rolesPanel}>
            <div className={styles.rolesPanelHead}>
              <div>
                <p className={styles.panelLabel}>Roles del sistema</p>
              </div>
            </div>

            <div className={styles.contextWrap}>
              <select
                className={styles.contextSelect}
                value={contextVal}
                onChange={e => handleContextChange(e.target.value)}
              >
                <option value="global">Sistema Global</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.rolesList}>
              {rolesLoading && (
                <p className={styles.emptyMsg}>Cargando…</p>
              )}
              {!rolesLoading && roles.length === 0 && (
                <p className={styles.emptyMsg}>Sin roles para este contexto.</p>
              )}
              {roles.map(role => {
                const isSelected = activeRoleId === role.id;
                const isEditing  = editingRoleId === role.id;
                const isDeleting = confirmDeleteId === role.id;
                const permCount  = isSelected ? localGrants.size : null;

                return (
                  <div key={role.id}>
                    {/* Row */}
                    <div
                      className={[
                        styles.roleRow,
                        isSelected    ? styles.roleRowActive   : '',
                        !role.is_active ? styles.roleRowInactive : '',
                      ].join(' ')}
                      onClick={() => !isEditing && selectRole(role)}
                    >
                      <div className={`${styles.roleRowDot} ${role.is_active ? styles.roleRowDotActive : styles.roleRowDotInactive}`} />

                      {isEditing ? (
                        <div className={styles.roleRowEditForm} onClick={e => e.stopPropagation()}>
                          <input
                            className={styles.roleRowEditInput}
                            placeholder="Nombre *"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            autoFocus
                          />
                          <input
                            className={styles.roleRowEditInput}
                            placeholder="Descripción (opcional)"
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                          />
                          {editErr && <p style={{ fontSize: 10, color: '#ef4444', margin: 0 }}>{editErr}</p>}
                          <div className={styles.roleRowEditActions}>
                            <button type="button" className={styles.btnRowEditCancel} onClick={cancelEdit}>✕</button>
                            <button
                              type="button"
                              className={styles.btnRowEditSave}
                              onClick={() => { setEditErr(null); updateRoleMut.mutate(); }}
                              disabled={!editName.trim() || updateRoleMut.isPending}
                            >
                              <Check size={10} style={{ display: 'inline', marginRight: 3 }} />
                              {updateRoleMut.isPending ? '…' : 'Guardar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.roleRowBody}>
                          <span className={styles.roleRowName}>{role.name}</span>
                          {role.description && (
                            <span className={styles.roleRowDesc}>{role.description}</span>
                          )}
                          <div className={styles.roleRowMeta}>
                            <span className={styles.roleRowCount}>
                              {permCount !== null ? `${permCount} permisos` : '—'}
                            </span>
                          </div>
                        </div>
                      )}

                      {!isEditing && (
                        <div className={styles.roleRowActions} onClick={e => e.stopPropagation()}>
                          {role.is_active ? (
                            <>
                              <button
                                type="button"
                                title="Editar"
                                className={styles.btnRowAction}
                                onClick={() => startEdit(role)}
                              >
                                <Edit2 size={10} />
                              </button>
                              <button
                                type="button"
                                title="Desactivar"
                                className={`${styles.btnRowAction} ${styles.btnRowActionDanger}`}
                                onClick={() => { setConfirmDeleteId(role.id); setEditingRoleId(null); }}
                              >
                                <Trash2 size={10} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              title="Reactivar"
                              className={`${styles.btnRowAction} ${styles.btnRowActionSuccess}`}
                              onClick={() => reactivateRoleMut.mutate(role.id)}
                              disabled={reactivateRoleMut.isPending}
                            >
                              <RotateCcw size={10} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Delete confirm */}
                    {isDeleting && (
                      <div className={styles.roleRowDeleteConfirm}>
                        <p className={styles.roleRowDeleteText}>
                          Desactivar <strong>{role.name}</strong>. Los usuarios asignados conservarán acceso hasta reasignación.
                        </p>
                        <div className={styles.roleRowDeleteBtns}>
                          <button type="button" className={styles.btnRowEditCancel} onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                          <button
                            type="button"
                            className={styles.btnConfirmDelete}
                            onClick={() => deleteRoleMut.mutate(role.id)}
                            disabled={deleteRoleMut.isPending}
                          >
                            {deleteRoleMut.isPending ? '…' : 'Desactivar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── CENTER: Permission tree ─── */}
          <div className={styles.treePanel}>
            <div className={styles.treePanelHead}>
              <div>
                <p className={styles.treePanelTitle}>
                  <ShieldCheck size={13} />
                  {activeRole
                    ? <><span>Árbol de Permisos</span><span className={styles.treePanelTitleBadge}>{activeRole.name}</span></>
                    : 'Árbol de Permisos'
                  }
                </p>
                <p className={styles.treePanelSub}>
                  {activeRole
                    ? 'Activar padre desbloquea hijos. Desactivar padre revoca todos sus hijos.'
                    : 'Selecciona un rol para gestionar sus permisos.'}
                </p>
              </div>
            </div>

            <div className={styles.treeScroll}>
              {!activeRoleId && (
                <div className={styles.treeEmpty}>
                  <div className={styles.treeEmptyIcon}>
                    <Lock size={20} />
                  </div>
                  <p className={styles.treeEmptyTitle}>Selecciona un rol</p>
                  <p className={styles.treeEmptyDesc}>Haz clic en cualquier rol del panel izquierdo para ver y editar sus permisos.</p>
                </div>
              )}

              {activeRoleId && grantsFetching && (
                <div className={styles.treeEmpty}>
                  <Spinner />
                  <p className={styles.treeEmptyDesc}>Cargando permisos…</p>
                </div>
              )}

              {activeRoleId && !grantsFetching && parents.map(parent => {
                const isParentChecked = localGrants.has(parent.key);
                const children        = childrenOf(parent.key);

                return (
                  <div key={parent.key} className={styles.treeGroup}>
                    {/* Parent row */}
                    <div className={styles.treeParentRow}>
                      <div className={styles.treeParentLeft}>
                        <input
                          type="checkbox"
                          className={styles.treeCb}
                          checked={isParentChecked}
                          onChange={e => toggleParent(parent.key, e.target.checked)}
                        />
                        <span
                          className={styles.treeParentLabel}
                          onClick={() => setSelectedPermKey(parent.key)}
                        >
                          {parent.label}
                        </span>
                        <span className={styles.treeKeyBadge}>{parent.section}</span>
                      </div>
                    </div>

                    {/* Children */}
                    {children.length > 0 && (
                      <div className={styles.treeChildren}>
                        {children.map(child => {
                          const isDisabled = !isParentChecked;
                          const isChecked  = !isDisabled && localGrants.has(child.key);
                          return (
                            <div
                              key={child.key}
                              className={[
                                styles.treeChildRow,
                                isDisabled ? styles.treeChildRowDisabled : '',
                              ].join(' ')}
                            >
                              <input
                                type="checkbox"
                                className={styles.treeCb}
                                checked={isChecked}
                                disabled={isDisabled}
                                onChange={e => toggleChild(child.key, e.target.checked)}
                              />
                              <span
                                className={[
                                  styles.treeChildLabel,
                                  isDisabled ? styles.treeChildLabelDisabled : '',
                                ].join(' ')}
                                onClick={() => { if (!isDisabled) setSelectedPermKey(child.key); }}
                              >
                                {child.label}
                              </span>
                              <span className={styles.treeChildKeyBadge}>{child.action}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.treeFooter}>
              <button
                type="button"
                className={styles.btnSave}
                onClick={handleSave}
                disabled={!activeRoleId || !isDirty || saveStatus === 'saving' || grantsFetching}
              >
                {saveStatus === 'saving' ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {saveStatus === 'ok'  && <p className={styles.saveOk}>✓ Permisos guardados</p>}
              {saveStatus === 'err' && <p className={styles.saveErr}>✗ Error al guardar</p>}
            </div>
          </div>

          {/* ─── RIGHT: Inspector panel ─── */}
          <div className={styles.inspectorPanel}>
            <div className={styles.inspectorPanelHead}>
              <p className={styles.panelLabel}>Inspección</p>
            </div>

            {!selectedPerm ? (
              <div className={styles.inspectorEmpty}>
                <div className={styles.treeEmptyIcon}>
                  <ShieldCheck size={18} />
                </div>
                {activeRoleId ? (
                  <>
                    <span className={styles.inspectorHintArrow}>←</span>
                    <p className={styles.inspectorEmptyTitle}>Selecciona un permiso</p>
                    <p className={styles.inspectorEmptyDesc}>Haz clic sobre cualquier nombre del árbol para auditar su impacto.</p>
                  </>
                ) : (
                  <>
                    <p className={styles.inspectorEmptyTitle}>Sin contexto</p>
                    <p className={styles.inspectorEmptyDesc}>Selecciona un rol y luego un permiso del árbol.</p>
                  </>
                )}
              </div>
            ) : (
              <PermissionInspector perm={selectedPerm} />
            )}

            <div className={styles.inspectorAudit}>
              <p className={styles.inspectorAuditTitle}>Auditoría activa</p>
              <p className={styles.inspectorAuditText}>
                Todos los cambios de permisos se registran en el log de auditoría del sistema en tiempo real.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ── Permission detail panel ── */
function PermissionInspector({ perm }: { perm: PermissionDef }) {
  const risk = computeRisk(perm);
  return (
    <div className={styles.inspectorDetail}>
      <div>
        <p className={styles.inspectorPermName}>{perm.label}</p>
        <span className={styles.inspectorPermKey}>{perm.key}</span>
      </div>

      <div className={styles.inspectorSection}>
        <span className={styles.inspectorSectionLabel}>Descripción Operacional</span>
        <p className={styles.inspectorSectionText}>{perm.description ?? '—'}</p>
      </div>

      <div className={styles.inspectorSection}>
        <span className={styles.inspectorSectionLabel}>Impacto en el Sistema</span>
        <p className={styles.inspectorSectionText}>
          Concede acceso directo al subsistema ITSM en el alcance operacional de{' '}
          <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>{perm.key}</code>.
        </p>
      </div>

      <div className={styles.inspectorSection}>
        <span className={styles.inspectorSectionLabel}>Nivel de Riesgo</span>
        <span className={`${styles.riskBadge} ${RISK_CLS[risk]}`}>
          ⚠ {RISK_LABEL[risk]}
        </span>
        <p className={styles.riskDesc}>{RISK_DESC[risk]}</p>
      </div>
    </div>
  );
}
