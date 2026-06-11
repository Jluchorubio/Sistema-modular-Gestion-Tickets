'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Settings, Shield, Wrench, CalendarClock, GitBranch, type LucideIcon } from 'lucide-react';
import { OverflowTabBar } from '@/components/ui/OverflowTabBar';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleConfigClient } from '@/components/modules/ModuleConfigClient';
import { SlaTicketsTab } from '@/components/config/SlaTicketsTab';
import { DamageTypesTab } from '@/components/config/DamageTypesTab';
import { ModuleCalendarioTab } from '@/components/config/ModuleCalendarioTab';
import { WorkflowTab } from '@/components/config/WorkflowTab';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';
import styles from '@/app/(app)/requests/config/config.module.css';

const HELPDESK_TYPES = new Set(['helpdesk', 'soporte']);

type Tab = 'general' | 'sla-tickets' | 'daños' | 'calendario' | 'flujo';

const HELPDESK_TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'general',     label: 'General',       Icon: Settings      },
  { key: 'sla-tickets', label: 'SLA Tickets',   Icon: Shield        },
  { key: 'daños',       label: 'Tipos de Daño', Icon: Wrench        },
  { key: 'calendario',  label: 'Calendario',    Icon: CalendarClock },
  { key: 'flujo',       label: 'Flujo',         Icon: GitBranch     },
];

export default function ModuleSlugConfigPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const [tab, setTab] = useState<Tab>('general');
  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const navItems = useMemo(() => buildDynamicModuleNav(moduleSlug), [moduleSlug]);

  const { data: allModules, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
  });
  const moduleRef = allModules?.find((m) => m.slug === moduleSlug);

  const { data: mod } = useQuery({
    queryKey: ['module', moduleRef?.id],
    queryFn:  () => modulesService.getModule(moduleRef!.id),
    enabled:  !!moduleRef?.id,
  });

  useModuleNav(moduleRef?.name ?? '', navItems, moduleRef?.id);

  if (isLoading || !moduleRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    (r) => r.module_id === moduleRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  const modType = (mod as any).type ?? null;
  const isHelpdesk = HELPDESK_TYPES.has(modType) || modType == null;

  if (!isHelpdesk) {
    return (
      <ModuleConfigClient
        module={mod}
        moduleId={moduleRef.id}
        isSuperadmin={isSuperadmin}
        isAdminModulo={isAdminModulo}
      />
    );
  }

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>
        <div className={styles.header}>
          <h1 className={styles.title}>Configuración — {moduleRef.name}</h1>
          <p className={styles.subtitle}>Comportamiento operativo, SLA y tipos de daño del módulo.</p>
        </div>

        <OverflowTabBar
          tabs={HELPDESK_TABS}
          active={tab}
          onChange={k => setTab(k as Tab)}
          cls={{ bar: styles.tabBar, btn: styles.tabBtn, active: styles.tabBtnActive }}
        />

        <div className={styles.content}>
          {tab === 'general'     && (
            <ModuleConfigClient
              module={mod}
              moduleId={moduleRef.id}
              isSuperadmin={isSuperadmin}
              isAdminModulo={isAdminModulo}
            />
          )}
          {tab === 'sla-tickets' && <SlaTicketsTab moduleId={moduleRef.id} />}
          {tab === 'daños'       && <DamageTypesTab />}
          {tab === 'calendario'  && <ModuleCalendarioTab moduleId={moduleRef.id} />}
          {tab === 'flujo'       && <WorkflowTab moduleId={moduleRef.id} />}
        </div>
      </div>
    </div>
  );
}
