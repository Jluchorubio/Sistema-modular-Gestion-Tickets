'use client';

import { useState } from 'react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/usePermission';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from './_nav';
import { AdminView } from './_components/AdminView';
import { UserView } from './_components/UserView';
import styles from './requests.module.css';

type GestionTab = 'operacional' | 'supervision';

export default function RequestsPage() {
  const { modules } = useModules();
  const gestionId = modules?.find(isGestionModule)?.id;
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);

  const { user }        = useAuthStore();
  const isSuperadmin    = user?.is_superadmin ?? false;
  const canViewAll      = usePermission('gestion:requests:view_all');
  const hasAdminAccess  = isSuperadmin || canViewAll;

  const [gestionTab, setGestionTab] = useState<GestionTab>('operacional');

  if (!hasAdminAccess) {
    return (
      <ModuleLayout
        moduleId={gestionId}
        title="Gestión Administrativa"
        description="Consola centralizada de solicitudes organizacionales: autorizaciones, traslados, cambios de rol y escalamientos administrativos."
        isSuperadmin={false}
        alwaysOpen
      >
        <UserView isSuperadmin={false} />
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout
      moduleId={gestionId}
      title="Gestión Administrativa"
      description="Consola centralizada de solicitudes organizacionales: autorizaciones, traslados, cambios de rol y escalamientos administrativos."
      isSuperadmin={isSuperadmin}
      alwaysOpen
    >
      {/* Oversight tabs — only for superadmin */}
      {isSuperadmin && (
        <div className={styles.oversightTabBar}>
          {([
            { key: 'operacional' as GestionTab, label: 'Operacional', desc: 'Cola de trabajo del día' },
            { key: 'supervision' as GestionTab, label: 'Supervisión', desc: 'Escaladas · Cross-module · Excepciones' },
          ]).map(t => {
            const active = gestionTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setGestionTab(t.key)}
                className={`${styles.oversightTab} ${active ? styles.oversightTabActive : ''}`}
              >
                <span className={`${styles.oversightTabLabel} ${active ? styles.oversightTabLabelActive : ''}`}>
                  {t.label}
                  {t.key === 'supervision' && (
                    <span className={styles.oversightTabBadge}>Gestión Gov.</span>
                  )}
                </span>
                <span className={styles.oversightTabDesc}>{t.desc}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Operational — all requests scoped to this admin's modules */}
      {gestionTab === 'operacional' && (
        <AdminView isSuperadmin={isSuperadmin} />
      )}

      {/* Supervision — escalated + cross-module requests only */}
      {gestionTab === 'supervision' && (
        <>
          <div className={styles.supervisionBanner}>
            <span className={styles.supervisionBannerTitle}>Modo Supervisión Organizacional</span>
            {' — '}Vista filtrada: solicitudes escaladas, fuera de módulo y excepciones que requieren intervención de Gestión Administrativa.
            Los admins modulares manejan el resto en sus propias colas.
          </div>
          <AdminView isSuperadmin={isSuperadmin} escalatedOnly />
        </>
      )}
    </ModuleLayout>
  );
}
