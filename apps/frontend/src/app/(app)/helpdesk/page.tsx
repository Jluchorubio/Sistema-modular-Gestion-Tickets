'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHelpdeskRole } from '@/hooks/useHelpdeskRole';
import { TicketsClient } from '@/app/(app)/tickets/_components/TicketsClient';

const REDIRECT_TO_WORKSPACE = ['jefe_tecnico', 'tecnico'];

export default function HelpdeskPage() {
  const router = useRouter();
  const { moduleRole, isSuperadmin, helpdeskId, user } = useHelpdeskRole();

  const ready   = !!user && !!helpdeskId;
  const shouldRedirect = ready && !isSuperadmin && moduleRole !== null &&
    REDIRECT_TO_WORKSPACE.includes(moduleRole);

  useEffect(() => {
    if (shouldRedirect) router.replace('/helpdesk/workspace');
  }, [shouldRedirect, router]);

  if (!ready || shouldRedirect) return null;

  return <TicketsClient visualVariant="helpdeskMockup" />;
}
