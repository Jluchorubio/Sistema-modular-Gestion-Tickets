'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { MODULE_ROLES, TECH_ROLES } from '@/constants/roles';
import { modulesService, type ModuleSlaRule } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { getInitials } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { Construction } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useModuleNav } from '@/hooks/useModuleNav';
import { buildDynamicModuleNav } from './_nav';
import { AssignUsersModal } from './AssignUsersModal';
import { BulkImportModal } from './BulkImportModal';
import styles from './module-detail.module.css';

const PRIORITY_LABEL: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

const PRIORITY_COLOR: Record<string, string> = {
  baja: '#15803d', media: '#b45309', alta: '#c2410c', critica: '#991b1b',
};

function SlaSection({ moduleId }: { moduleId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, { hrs: string; hfr: string }>>({});

  const { data: rules, isLoading } = useQuery({
    queryKey: ['module-sla', moduleId],
    queryFn: () => modulesService.getModuleSlaRules(moduleId),
  });

  const saveMut = useMutation({
    mutationFn: ({ priority, dto }: { priority: string; dto: { hours_to_resolve: number; hours_to_first_response: number } }) =>
      modulesService.upsertModuleSlaRule(moduleId, priority, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-sla', moduleId] }),
  });

  const resetMut = useMutation({
    mutationFn: (priority: string) => modulesService.deleteModuleSlaRule(moduleId, priority),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-sla', moduleId] }),
  });

  if (isLoading) return <Spinner />;
  if (!rules?.length) return null;

  const getHrs = (rule: ModuleSlaRule) => editing[rule.priority]?.hrs ?? String(rule.hours_to_resolve);
  const getHfr = (rule: ModuleSlaRule) => editing[rule.priority]?.hfr ?? String(rule.hours_to_first_response);

  return (
    <div style={{ marginTop: 32 }}>
      <div className={styles.sectionTitle}>Configuración SLA</div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Prioridad</th>
              <th>Horas p/ resolver</th>
              <th>Horas p/ 1ra respuesta</th>
              <th>Fuente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const isDirty = rule.priority in editing;
              return (
                <tr key={rule.priority}>
                  <td>
                    <span style={{ fontWeight: 600, color: PRIORITY_COLOR[rule.priority] }}>
                      {PRIORITY_LABEL[rule.priority] ?? rule.priority}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={getHrs(rule)}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [rule.priority]: { hrs: e.target.value, hfr: prev[rule.priority]?.hfr ?? String(rule.hours_to_first_response) },
                        }))
                      }
                      style={{ width: 72, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={getHfr(rule)}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [rule.priority]: { hrs: prev[rule.priority]?.hrs ?? String(rule.hours_to_resolve), hfr: e.target.value },
                        }))
                      }
                      style={{ width: 72, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    />
                  </td>
                  <td>
                    {rule.is_override ? (
                      <span style={{ background: '#312e81', color: '#c7d2fe', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                        Override
                      </span>
                    ) : (
                      <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, border: '1px solid #e2e8f0' }}>
                        Global
                      </span>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {isDirty && (
                      <button
                        type="button"
                        disabled={saveMut.isPending}
                        onClick={() => {
                          const hrs = parseInt(editing[rule.priority].hrs, 10);
                          const hfr = parseInt(editing[rule.priority].hfr, 10);
                          if (!hrs || !hfr || hrs < 1 || hfr < 1) return;
                          saveMut.mutate(
                            { priority: rule.priority, dto: { hours_to_resolve: hrs, hours_to_first_response: hfr } },
                            { onSuccess: () => setEditing((prev) => { const n = { ...prev }; delete n[rule.priority]; return n; }) },
                          );
                        }}
                        style={{ padding: '4px 10px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Guardar
                      </button>
                    )}
                    {rule.is_override && (
                      <button
                        type="button"
                        disabled={resetMut.isPending}
                        onClick={() =>
                          resetMut.mutate(rule.priority, {
                            onSuccess: () => setEditing((prev) => { const n = { ...prev }; delete n[rule.priority]; return n; }),
                          })
                        }
                        style={{ padding: '4px 10px', background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                      >
                        Restablecer
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  admin_modulo:  'Admin Módulo',
  jefe_tecnico:  'Jefe Técnico',
  tecnico:       'Técnico',
  usuario:       'Usuario',
};

const ROLE_CLS: Record<string, string> = {
  admin_modulo:  styles.roleAdmin,
  jefe_tecnico:  styles.roleJefe,
  tecnico:       styles.roleTecnico,
  usuario:       styles.roleUsuario,
};

export default function ModuleDetailPage() {
  const { id }          = useParams<{ id: string }>();
  const router          = useRouter();
  const user            = useAuthStore((s) => s.user);
  const isSuperadmin    = user?.is_superadmin ?? false;
  const isAdminModulo   = user?.module_roles?.some(
    (r) => r.module_id === id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;
  const [showAssign,     setShowAssign]     = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);

  const {
    data: mod,
    isLoading: modLoading,
    isError: modError,
  } = useQuery({
    queryKey: ['module', id],
    queryFn:  () => modulesService.getModule(id),
    enabled:  !!id,
  });

  const {
    data: members,
    isLoading: membersLoading,
    isError: membersError,
  } = useQuery({
    queryKey: ['module-members', id],
    queryFn:  () => usersService.getModuleUsers(id),
    enabled:  !!id,
  });

  const techs  = members?.filter((m) =>
    (TECH_ROLES as string[]).includes((m as any).role_name),
  ) ?? [];
  const admins = members?.filter((m) =>
    (m as any).role_name === MODULE_ROLES.ADMIN_MODULO,
  ) ?? [];

  // Must be before early returns (Rules of Hooks)
  const navItems = useMemo(
    () => buildDynamicModuleNav(mod?.slug ?? id),
    [mod?.slug, id],
  );
  useModuleNav(mod?.name ?? '', navItems, id);

  if (modLoading) return <Spinner />;
  if (modError || !mod) {
    return <p className={styles.errorMsg}>Error cargando módulo.</p>;
  }

  // Gestión Administrativa is a built-in module — always lives at /requests
  if (['gestion', 'gestion-adm', 'gestion-administrativa'].includes((mod as any).slug) || ['administrative', 'gestion'].includes((mod as any).type)) {
    router.replace('/requests');
    return <Spinner />;
  }

  // Redirect to slug-based canonical URL for all custom modules
  if (mod.slug) {
    router.replace(`/${mod.slug}`);
    return <Spinner />;
  }

  // Block non-admin access during maintenance
  if ((mod as any).maintenance_mode && !isSuperadmin) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: 16,
      }}>
        <Construction size={56} color="#f59e0b" strokeWidth={1.5} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Módulo en mantenimiento
        </h2>
        <p style={{ fontSize: 15, color: '#64748b', maxWidth: 420, margin: 0 }}>
          {(mod as any).maintenance_message
            || 'Este módulo está temporalmente fuera de servicio por mantenimiento. Vuelve más tarde.'}
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          style={{
            marginTop: 8, padding: '10px 24px', background: '#6366f1', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Volver al dashboard
        </button>
      </div>
    );
  }

  return (
    <ModuleLayout
      moduleId={id}
      title={mod.name}
      description={(mod as any).description ?? null}
      isSuperadmin={isSuperadmin}
    >
      {/* Maintenance notice for superadmin */}
      {(mod as any).maintenance_mode && isSuperadmin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#451a03', border: '1px solid #78350f',
          borderRadius: 10, padding: '10px 16px', marginBottom: 20,
        }}>
          <Construction size={16} color="#fbbf24" />
          <span style={{ fontSize: 13, color: '#fde68a', fontWeight: 600 }}>
            Modo mantenimiento activo — los usuarios no pueden acceder a este módulo.
          </span>
        </div>
      )}

      {/* Action buttons for superadmin / admin_modulo */}
      {(isSuperadmin || isAdminModulo) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            style={{
              padding: '8px 14px', background: 'none', color: '#6366f1',
              border: '1px solid #6366f1', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Importar CSV
          </button>
          <button
            type="button"
            onClick={() => setShowAssign(true)}
            style={{
              padding: '8px 16px', background: '#6366f1', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            + Asignar usuarios
          </button>
        </div>
      )}

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Miembros</div>
          <div className={styles.statValue}>{members?.length ?? '—'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Técnicos</div>
          <div className={styles.statValue}>{membersLoading ? '—' : techs.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Administradores</div>
          <div className={styles.statValue}>{membersLoading ? '—' : admins.length}</div>
        </div>
      </div>

      <div className={styles.sectionTitle}>Miembros y roles</div>

      {membersLoading && <Spinner />}

      {membersError && (
        <p className={styles.errorMsg}>Error cargando miembros.</p>
      )}

      {showAssign && (
        <AssignUsersModal
          moduleId={id}
          existingUserIds={new Set(members?.map((m) => m.id) ?? [])}
          onClose={() => setShowAssign(false)}
        />
      )}

      {showBulkImport && (
        <BulkImportModal
          moduleId={id}
          moduleName={mod.name}
          onClose={() => setShowBulkImport(false)}
        />
      )}

      {members && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {!members.length && (
                <tr>
                  <td colSpan={4} className={styles.emptyMsg}>
                    Sin miembros en este módulo.
                    {isSuperadmin && ' Usa "Asignar usuarios" para agregar.'}
                  </td>
                </tr>
              )}
              {members.map((m, i) => {
                const initials = getInitials(m.first_name, m.last_name);
                const roleName = (m as any).role_name as string;
                const roleCls  = ROLE_CLS[roleName] ?? styles.roleUsuario;
                const isActive = (m as any).status === 'active';

                return (
                  <tr key={`${m.id}_${roleName}_${i}`}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className={styles.avatarImg} />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </div>
                        <div>
                          <div className={styles.userName}>
                            {m.first_name} {m.last_name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{m.email}</td>
                    <td>
                      <span className={`${styles.rolePill} ${roleCls}`}>
                        {ROLE_LABEL[roleName] ?? roleName}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${isActive ? styles.badgeActive : styles.badgeInactive}`}>
                        {isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(isSuperadmin || isAdminModulo) && <SlaSection moduleId={id} />}
    </ModuleLayout>
  );
}
