'use client';

import { useState, useEffect } from 'react';
import { useQuery }             from '@tanstack/react-query';
import { systemConfigService }  from '@/services/system-config.service';
import { usePermission }        from '@/hooks/usePermission';
import { usePermissionsStore }  from '@/stores/permissions.store';
import { useSuperadminGuard }   from '@/hooks/useSuperadminGuard';
import { PendingChangesBar }    from '@/components/config/PendingChangesBar';
import { OrgFlowTab }           from '@/components/config/OrgFlowTab';
import type { OrgNode }         from '@/services/system-config.service';

import { type Tab, TABS, GUARDED_TABS }  from './_components/_types';
import { OverflowTabBar }                from '@/components/ui/OverflowTabBar';
import { QuickLinks }                    from './_components/QuickLinks';
import { SetupChecklist }                from './_components/SetupChecklist';
import { OrgRequiredScreen }             from './_components/OrgRequiredScreen';
import { CompanyTab }                    from './_components/tabs/CompanyTab';
import { PrioridadTab }                  from './_components/tabs/PrioridadTab';
import { CalendarioTab }                 from './_components/tabs/CalendarioTab';
import { AuditoriaTab }                  from './_components/tabs/AuditoriaTab';
import { SeguridadTab }                  from './_components/tabs/SeguridadTab';
import styles from './config.module.css';

export default function GlobalConfigPage() {
  const { status } = useSuperadminGuard();
  const loaded     = usePermissionsStore(s => s.loaded);
  const canView    = usePermission('global:sidebar:config');
  const [tab, setTab] = useState<Tab>('empresa');

  const { data: orgTree = [] } = useQuery<OrgNode[]>({
    queryKey: ['org-node-tree'],
    queryFn:  systemConfigService.getOrgNodeTree,
    staleTime: 60_000,
  });
  const hasOrg = (orgTree as OrgNode[]).length > 0;

  useEffect(() => {
    if (!hasOrg && GUARDED_TABS.includes(tab)) setTab('organigrama');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOrg]);

  if (status === 'loading')    return null;
  if (status === 'unauthorized') return null;
  if (loaded && !canView)      return null;

  const isBlocked = (t: Tab) => !hasOrg && GUARDED_TABS.includes(t);

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Configuración del Sistema</h1>
            <p className={styles.subtitle}>Solo superadmin · Cambios aplicados inmediatamente</p>
          </div>
        </div>

        <QuickLinks />
        <SetupChecklist setTab={setTab} />

        <OverflowTabBar
          tabs={TABS.map(({ key, label, Icon }) => ({
            key,
            label,
            Icon,
            blocked: isBlocked(key),
            title:   isBlocked(key) ? 'Requiere estructura organizacional configurada' : undefined,
          }))}
          active={tab}
          onChange={k => isBlocked(k as Tab) ? setTab('organigrama') : setTab(k as Tab)}
          cls={{ bar: styles.tabBar, btn: styles.tabBtn, active: styles.tabBtnActive }}
        />

        <div className={styles.content}>
          {tab === 'empresa'     && <CompanyTab />}
          {tab === 'organigrama' && <OrgFlowTab />}
          {tab === 'prioridad'   && (hasOrg ? <PrioridadTab />  : <OrgRequiredScreen onConfigure={() => setTab('organigrama')} />)}
          {tab === 'calendario'  && (hasOrg ? <CalendarioTab /> : <OrgRequiredScreen onConfigure={() => setTab('organigrama')} />)}
          {tab === 'auditoria'   && (hasOrg ? <AuditoriaTab />  : <OrgRequiredScreen onConfigure={() => setTab('organigrama')} />)}
          {tab === 'seguridad'   && <SeguridadTab />}
        </div>

      </div>

      <PendingChangesBar />
    </div>
  );
}
