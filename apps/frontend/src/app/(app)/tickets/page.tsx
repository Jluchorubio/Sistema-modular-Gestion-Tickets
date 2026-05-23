'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { modulesService } from '@/services/modules.service';
import { isHelpdeskModule } from './_nav';
import { Spinner } from '@/components/ui/Spinner';

export default function TicketsRedirectPage() {
  const router = useRouter();
  const { data: modules } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!modules) return;
    const helpdesk = modules.find(isHelpdeskModule);
    router.replace(helpdesk ? `/${helpdesk.slug}` : '/dashboard');
  }, [modules, router]);

  return <Spinner />;
}
