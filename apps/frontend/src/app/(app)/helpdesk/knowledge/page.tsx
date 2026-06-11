'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

export default function KnowledgePage() {
  const router = useRouter();
  const { modules } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  useEffect(() => {
    router.replace('/helpdesk/knowledge/docs');
  }, [router]);

  return null;
}
