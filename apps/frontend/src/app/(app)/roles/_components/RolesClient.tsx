'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/hooks/usePermission';
import { usePermissionsStore } from '@/stores/permissions.store';
import {
  permissionsService,
  type PermissionDef,
  type RoleInfo,
} from '@/services/permissions.service';
import { Spinner } from '@/components/ui/Spinner';
import styles from '../roles.module.css';

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
  const loaded  = usePermissionsStore(s => s.loaded);
  const canView = usePermission('global:sidebar:roles');
  const qc      = useQueryClient();

  const [contextVal,      setContextVal]      = useState<string>('global');
  const [activeRoleId,    setActiveRoleId]    = useState<string | null>(null);
  const [localGrants,     setLocalGrants]     = useState<Set<string>>(new Set());
  const [savedGrants,     setSavedGrants]     = useState<Set<string>>(new Set());
  const [selectedPermKey, setSelectedPermKey] = useState<string | null>(null);
  const [saveStatus,      setSaveStatus]      = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

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

  /* ── Permission guard ── */
  if (loaded && !canView) return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>
        <p className={styles.errorMsg}>No tienes permiso para ver esta sección.</p>
      </div>
    </div>
  );

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Roles y Privilegios</h1>
            <p className={styles.sub}>Control de perfiles de seguridad, niveles de acceso y matrices de permisos por módulo.</p>
          </div>
        </div>

        {/* ── 3-col workspace ── */}
        <div className={styles.workspace}>

          {/* ──── LEFT: role list ──── */}
          <div className={styles.panel}>
            <div className={styles.panelTop}>

              <div className={styles.panelHeader}>
                <p className={styles.panelTitle}>Roles del Sistema</p>
                <p className={styles.panelSub}>Selecciona el ámbito del rol para ver y configurar sus permisos.</p>
              </div>

              {/* Context selector */}
              <div>
                <label className={styles.contextLabel}>Contexto o Módulo</label>
                <select
                  className={styles.contextSelect}
                  value={contextVal}
                  onChange={e => handleContextChange(e.target.value)}
                >
                  <option value="global">Sistema Global (General)</option>
                  {modules.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Role cards */}
              <div className={styles.rolesList}>
                {rolesLoading && <Spinner />}
                {!rolesLoading && roles.length === 0 && (
                  <p className={styles.emptyMsg}>No hay roles configurados para este contexto.</p>
                )}
                {roles.map(role => {
                  const isActive   = activeRoleId === role.id;
                  const permCount  = isActive ? localGrants.size : null;
                  return (
                    <div
                      key={role.id}
                      className={`${styles.roleCard}${isActive ? ` ${styles.roleCardActive}` : ''}`}
                    >
                      <div className={styles.roleCardTop}>
                        <span className={styles.roleCardName}>{role.name}</span>
                        <span className={`${styles.roleCardStatus} ${role.is_active ? styles.roleCardStatusActive : styles.roleCardStatusInactive}`}>
                          {role.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      {role.description && (
                        <p className={styles.roleCardDesc}>{role.description}</p>
                      )}
                      <div className={styles.roleCardFooter}>
                        <span className={styles.roleCardPermCount}>
                          {permCount !== null ? `${permCount} permisos` : '— permisos'}
                        </span>
                        <button
                          type="button"
                          className={styles.btnEditRole}
                          onClick={() => selectRole(role)}
                        >
                          ⚙ Editar Permisos
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ──── CENTER: permission tree ──── */}
          <div className={styles.panel}>
            <div className={styles.panelTop}>

              <div className={styles.panelHeader}>
                <div className={styles.panelHeaderRow}>
                  <div>
                    <p className={styles.panelTitle}>Árbol de Permisos</p>
                    <p className={styles.panelSub}>Estructura jerárquica modular de accesos.</p>
                  </div>
                  <span className={styles.roleBadge}>
                    {activeRole ? activeRole.name.toUpperCase() : '—'}
                  </span>
                </div>
              </div>

              <div className={styles.criticalRule}>
                <strong>Regla Crítica:</strong> Activar un permiso padre (ej. <em>Tickets</em>) no activa sus hijos automáticamente. Solo los habilita/desbloquea para su activación granular. Desactivar un padre desactiva e inhabilita sus hijos.
              </div>

              <div className={styles.tree}>
                {!activeRoleId && (
                  <p className={styles.treeEmpty}>
                    Selecciona un rol de la columna izquierda para editar sus permisos.
                  </p>
                )}
                {activeRoleId && grantsFetching && <Spinner />}
                {activeRoleId && !grantsFetching && parents.map(parent => {
                  const isParentChecked = localGrants.has(parent.key);
                  const children = childrenOf(parent.key);

                  return (
                    <div key={parent.key} className={styles.treeGroup}>
                      {/* Parent node */}
                      <div className={styles.treeParent}>
                        <div className={styles.treeParentLeft}>
                          <input
                            type="checkbox"
                            className={styles.treeCb}
                            checked={isParentChecked}
                            onChange={e => toggleParent(parent.key, e.target.checked)}
                          />
                          <span
                            className={styles.treeParentName}
                            onClick={() => setSelectedPermKey(parent.key)}
                          >
                            {parent.label}
                          </span>
                        </div>
                        <span className={styles.treeSlug}>{parent.key}</span>
                      </div>

                      {/* Child nodes */}
                      {children.length > 0 && (
                        <div className={styles.treeChildren}>
                          {children.map(child => {
                            const isDisabled = !isParentChecked;
                            const isChecked  = !isDisabled && localGrants.has(child.key);
                            return (
                              <div key={child.key} className={styles.treeChild}>
                                <div className={styles.treeChildLeft}>
                                  <span className={styles.treeLine}>├──</span>
                                  <input
                                    type="checkbox"
                                    className={styles.treeCb}
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={e => toggleChild(child.key, e.target.checked)}
                                  />
                                  <span
                                    className={`${styles.treeChildName}${isDisabled ? ` ${styles.treeChildNameDisabled}` : ''}`}
                                    onClick={() => { if (!isDisabled) setSelectedPermKey(child.key); }}
                                  >
                                    {child.label}
                                  </span>
                                </div>
                                <span className={styles.treeChildSlug}>{child.key}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Save button */}
            <div className={styles.saveWrap}>
              <button
                type="button"
                className={styles.btnSave}
                onClick={handleSave}
                disabled={!activeRoleId || !isDirty || saveStatus === 'saving' || grantsFetching}
              >
                {saveStatus === 'saving' ? 'Guardando...' : 'Guardar Permisos del Rol'}
              </button>
              {saveStatus === 'ok'  && <p className={styles.saveOk}>✓ Permisos actualizados correctamente</p>}
              {saveStatus === 'err' && <p className={styles.saveErr}>✗ Error al guardar. Intenta de nuevo.</p>}
            </div>
          </div>

          {/* ──── RIGHT: permission inspector ──── */}
          <div className={styles.panel}>
            <div className={styles.panelTop}>

              <div className={styles.panelHeader}>
                <p className={styles.panelTitle}>Inspección de Permiso</p>
                <p className={styles.panelSub}>Haz clic sobre un permiso para auditarlo.</p>
              </div>

              {!selectedPerm ? (
                <p className={styles.inspectorEmpty}>
                  Selecciona un permiso granular del árbol central para analizar su impacto operacional, riesgos e implicaciones de seguridad.
                </p>
              ) : (
                <PermissionInspector perm={selectedPerm} />
              )}
            </div>

            <div className={styles.auditNote}>
              <p className={styles.auditTitle}>☉ Registro de Auditoría</p>
              <p className={styles.auditText}>
                Todos los cambios de permisos son auditados dinámicamente por el sistema global para prevenir fallos de seguridad.
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
      <div className={styles.inspectorHead}>
        <span className={styles.inspectorTag}>Inspección de Permiso</span>
        <h2 className={styles.inspectorName}>{perm.label}</h2>
        <span className={styles.inspectorSlug}>{perm.key}</span>
      </div>

      <div className={styles.inspectorSections}>
        <div>
          <span className={styles.inspectorSectionLabel}>Descripción Operacional</span>
          <p className={styles.inspectorSectionText}>{perm.description ?? '—'}</p>
        </div>

        <div>
          <span className={styles.inspectorSectionLabel}>Impacto en el Sistema</span>
          <p className={styles.inspectorSectionText}>
            Concede accesibilidad técnica directa al subsistema ITSM en el alcance operacional de{' '}
            <code style={{ fontFamily: 'monospace', fontSize: 10 }}>{perm.key}</code>.
          </p>
        </div>

        <div>
          <span className={styles.inspectorSectionLabel}>Nivel de Riesgo</span>
          <div>
            <span className={`${styles.riskBadge} ${RISK_CLS[risk]}`}>
              ⚠ {RISK_LABEL[risk]}
            </span>
            <p className={styles.riskDesc}>{RISK_DESC[risk]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
