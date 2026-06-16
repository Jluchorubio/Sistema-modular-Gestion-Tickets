'use client';

import { useEffect } from 'react';
import { useRouter }          from 'next/navigation';
import { useHelpdeskRole }    from '@/hooks/useHelpdeskRole';
import { TicketsClient }      from '@/app/(app)/tickets/_components/TicketsClient';
import { HelpdeskKpiBar }     from './_components/HelpdeskKpiBar';
import { TECH_ROLES }         from '@/constants/roles';

const REDIRECT_TO_WORKSPACE = TECH_ROLES;

export default function HelpdeskPage() {
  const router = useRouter();
  const { moduleRole, isSuperadmin, helpdeskId, user } = useHelpdeskRole();

  const ready          = !!user && !!helpdeskId;
  const shouldRedirect = ready && !isSuperadmin && moduleRole !== null &&
    REDIRECT_TO_WORKSPACE.includes(moduleRole);

  const showKpiBar = ready && !shouldRedirect &&
    (isSuperadmin || moduleRole === 'admin_modulo');

  useEffect(() => {
    if (shouldRedirect) router.replace('/helpdesk/workspace');
  }, [shouldRedirect, router]);

  if (!ready || shouldRedirect) return null;

  return (
    <>
      {showKpiBar && helpdeskId && <HelpdeskKpiBar moduleId={helpdeskId} />}
      <TicketsClient visualVariant="helpdeskMockup" />
    </>
  );
}
