'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings, Shield, Wrench, CalendarClock, GitBranch, type LucideIcon } from 'lucide-react';
import { useModules }    from '@/hooks/useModules';
import { useModuleNav }  from '@/hooks/useModuleNav';
import { useAuthStore }  from '@/stores/auth.store';
import { useHelpdeskRoleGuard } from '@/hooks/useHelpdeskRole';
import { modulesService } from '@/services/modules.service';
import { ModuleConfigClient }   from '@/components/modules/ModuleConfigClient';
import { SlaTicketsTab }        from '@/components/config/SlaTicketsTab';
import { DamageTypesTab }       from '@/components/config/DamageTypesTab';
import { ModuleCalendarioTab }  from '@/components/config/ModuleCalendarioTab';
import { WorkflowTab }          from '@/components/config/WorkflowTab';

import { Spinner }              from '@/components/ui/Spinner';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import styles from '@/app/(app)/requests/config/config.module.css';

type Tab = 'general' | 'sla-tickets' | 'daños' | 'calendario' | 'flujo';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'general',     label: 'General',        Icon: Settings     },
  { key: 'sla-tickets', label: 'SLA Tickets',    Icon: Shield       },
  { key: 'daños',       label: 'Tipos de Daño',  Icon: Wrench       },
  { key: 'calendario',  label: 'Calendario',     Icon: CalendarClock },
  { key: 'flujo',       label: 'Flujo',          Icon: GitBranch    },
];

export default function HelpdeskConfigPage() {
  const [tab, setTab] = useState<Tab>('general');

  const { allowed } = useHelpdeskRoleGuard(['admin_modulo']);

  const { modules, isLoading: modsLoading } = useModules();
  const helpdeskRef = modules?.find(isHelpdeskModule);
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskRef?.id);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: mod, isLoading: modLoading } = useQuery({
    queryKey: ['module', helpdeskRef?.id],
    queryFn:  () => modulesService.getModule(helpdeskRef!.id),
    enabled:  !!helpdeskRef?.id,
  });

  if (!allowed || modsLoading || modLoading || !helpdeskRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    r => r.module_id === helpdeskRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        <div className={styles.header}>
          <h1 className={styles.title}>Configuración — Helpdesk</h1>
          <p className={styles.subtitle}>Comportamiento operativo, SLA y tipos de daño del módulo Helpdesk.</p>
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
          {tab === 'general'     && (
            <ModuleConfigClient
              module={mod}
              moduleId={helpdeskRef.id}
              isSuperadmin={isSuperadmin}
              isAdminModulo={isAdminModulo}
            />
          )}
          {tab === 'sla-tickets' && <SlaTicketsTab moduleId={helpdeskRef.id} />}
          {tab === 'daños'       && <DamageTypesTab />}
          {tab === 'calendario'  && <ModuleCalendarioTab moduleId={helpdeskRef.id} />}
          {tab === 'flujo'       && <WorkflowTab moduleId={helpdeskRef.id} />}
        </div>

      </div>
    </div>
  );
}
