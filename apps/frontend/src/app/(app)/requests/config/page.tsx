'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings, Clock, Tags, CalendarClock, type LucideIcon } from 'lucide-react';
import { useModules }    from '@/hooks/useModules';
import { useModuleNav }  from '@/hooks/useModuleNav';
import { useAuthStore }  from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { ModuleConfigClient }  from '@/components/modules/ModuleConfigClient';
import { SlaRequestsTab }      from '@/components/config/SlaRequestsTab';
import { RequestTypesTab }     from '@/components/config/RequestTypesTab';
import { ModuleCalendarioTab } from '@/components/config/ModuleCalendarioTab';
import { Spinner }             from '@/components/ui/Spinner';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';
import styles from './config.module.css';

type Tab = 'general' | 'sla' | 'tipos' | 'calendario';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'general',    label: 'General',           Icon: Settings     },
  { key: 'sla',        label: 'SLA Solicitudes',   Icon: Clock        },
  { key: 'tipos',      label: 'Tipos Solicitud',   Icon: Tags         },
  { key: 'calendario', label: 'Calendario',        Icon: CalendarClock },
];

export default function GestionConfigPage() {
  const [tab, setTab] = useState<Tab>('general');

  const { modules, isLoading: modsLoading } = useModules();
  const gestionRef = modules?.find(isGestionModule);
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionRef?.id);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: mod, isLoading: modLoading } = useQuery({
    queryKey: ['module', gestionRef?.id],
    queryFn:  () => modulesService.getModule(gestionRef!.id),
    enabled:  !!gestionRef?.id,
  });

  if (modsLoading || modLoading || !gestionRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    r => r.module_id === gestionRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        <div className={styles.header}>
          <h1 className={styles.title}>Configuración — Gestión Administrativa</h1>
          <p className={styles.subtitle}>Comportamiento operativo, SLA y tipos de solicitud del módulo de Gestión.</p>
        </div>

        <div className={styles.tabBar}>
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`${styles.tabBtn}${tab === key ? ` ${styles.tabBtnActive}` : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {tab === 'general' && (
            <ModuleConfigClient
              module={mod}
              moduleId={gestionRef.id}
              isSuperadmin={isSuperadmin}
              isAdminModulo={isAdminModulo}
            />
          )}
          {tab === 'sla'        && <SlaRequestsTab />}
          {tab === 'tipos'      && <RequestTypesTab />}
          {tab === 'calendario' && <ModuleCalendarioTab moduleId={gestionRef.id} />}
        </div>

      </div>
    </div>
  );
}
