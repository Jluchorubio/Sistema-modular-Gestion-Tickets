'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Lock } from 'lucide-react';
import {
  permissionsService,
  type PermissionDef,
  type RoleInfo,
} from '@/services/permissions.service';
import { Spinner } from '@/components/ui/Spinner';
import styles from '@/app/(app)/roles/roles.module.css';
import mgmt  from '@/styles/mgmt.module.css';

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
  root:   'Permiso de nodo padre. Habilitarlo permite el acceso general a la sección.',
  high:   'Alerta de Seguridad: faculta la eliminación o edición de datos críticos.',
  medium: 'Faculta la inserción de registros y operaciones ejecutivas.',
  low:    'Concede acceso de consulta y lectura ordinaria.',
};

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
        <span className={styles.inspectorSectionLabel}>Nivel de Riesgo</span>
        <span className={`${styles.riskBadge} ${RISK_CLS[risk]}`}>⚠ {RISK_LABEL[risk]}</span>
        <p className={styles.riskDesc}>{RISK_DESC[risk]}</p>
      </div>
    </div>
  );
}

interface Props {
  moduleId:   string;
  moduleName: string;
}

export function ModuleScopedRolesClient({ moduleId, moduleName }: Props) {
  const qc = useQueryClient();

  const [activeRoleId,    setActiveRoleId]    = useState<string | null>(null);
  const [localGrants,     setLocalGrants]     = useState<Set<string>>(new Set());
  const [savedGrants,     setSavedGrants]     = useState<Set<string>>(new Set());
  const [selectedPermKey, setSelectedPermKey] = useState<string | null>(null);
  const [saveStatus,      setSaveStatus]      = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

  const { data: tree = [] } = useQuery({
    queryKey: ['perm-tree'],
    queryFn:  permissionsService.getPermissionTree,
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles-module-scoped', moduleId],
    queryFn:  () => permissionsService.getModuleRoles(moduleId),
  });

  const { data: grantsData, isFetching: grantsFetching } = useQuery({
    queryKey: ['role-grants', activeRoleId, 'module'],
    queryFn:  () => permissionsService.getModuleRoleGrants(activeRoleId!),
    enabled:  !!activeRoleId,
  });

  useEffect(() => {
    if (grantsData) {
      setLocalGrants(new Set(grantsData));
      setSavedGrants(new Set(grantsData));
    }
  }, [grantsData]);

  const parents    = tree.filter(p => !p.parent_key);
  const childrenOf = useCallback(
    (parentKey: string) => tree.filter(p => p.parent_key === parentKey),
    [tree],
  );

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
      if (checked) { next.add(parentKey); }
      else { next.delete(parentKey); childrenOf(parentKey).forEach(c => next.delete(c.key)); }
      return next;
    });
  }

  function toggleChild(childKey: string, checked: boolean) {
    setLocalGrants(prev => {
      const next = new Set(prev);
      if (checked) next.add(childKey); else next.delete(childKey);
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
        ...toGrant.map(k  => permissionsService.toggleGrant(activeRoleId, k, true,  'module')),
        ...toRevoke.map(k => permissionsService.toggleGrant(activeRoleId, k, false, 'module')),
      ]);
      setSavedGrants(new Set(localGrants));
      qc.invalidateQueries({ queryKey: ['role-grants', activeRoleId, 'module'] });
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('err');
    }
  }

  const activeRole   = roles.find(r => r.id === activeRoleId);
  const selectedPerm = selectedPermKey ? tree.find(p => p.key === selectedPermKey) : null;
  const isDirty      = Array.from(localGrants).some(k => !savedGrants.has(k)) ||
                       Array.from(savedGrants).some(k => !localGrants.has(k));

  return (
    <div className={mgmt.pageWrap}>
      <div className={mgmt.pageContent}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Roles y Privilegios</h1>
            <p className={styles.sub}>Módulo: <strong>{moduleName}</strong> — Perfiles de seguridad y matriz de permisos.</p>
          </div>
        </div>

        {/* ══ 3-panel workspace ══ */}
        <div className={styles.workspace}>

          {/* ─── LEFT: Roles panel ─── */}
          <div className={styles.rolesPanel}>
            <div className={styles.rolesPanelHead}>
              <p className={styles.panelLabel}>Roles del módulo</p>
            </div>

            <div className={styles.rolesList}>
              {rolesLoading && <p className={styles.emptyMsg}>Cargando…</p>}
              {!rolesLoading && roles.length === 0 && (
                <p className={styles.emptyMsg}>Sin roles configurados para este módulo.</p>
              )}
              {roles.map(role => {
                const isSelected = activeRoleId === role.id;
                const permCount  = isSelected ? localGrants.size : null;

                return (
                  <div
                    key={role.id}
                    className={[
                      styles.roleRow,
                      isSelected        ? styles.roleRowActive   : '',
                      !role.is_active   ? styles.roleRowInactive : '',
                    ].join(' ')}
                    onClick={() => selectRole(role)}
                  >
                    <div className={`${styles.roleRowDot} ${role.is_active ? styles.roleRowDotActive : styles.roleRowDotInactive}`} />
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
                  <div className={styles.treeEmptyIcon}><Lock size={20} /></div>
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
                <div className={styles.treeEmptyIcon}><ShieldCheck size={18} /></div>
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
                Todos los cambios se registran en el log de auditoría en tiempo real.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
