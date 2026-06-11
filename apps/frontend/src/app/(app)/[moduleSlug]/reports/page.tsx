'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { HelpdeskReportsClient } from '@/app/(app)/helpdesk/_components/HelpdeskReportsClient';
import { ReportsClient } from '@/app/(app)/reports/_components/ReportsClient';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';

const HELPDESK_TYPES = new Set(['helpdesk', 'soporte']);

export default function ModuleSlugReportsPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const navItems  = useMemo(() => buildDynamicModuleNav(moduleSlug), [moduleSlug]);
  const authUser  = useAuthStore((s) => s.user);
  const isSuperadmin = authUser?.is_superadmin ?? false;

  const { data: allModules, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
    staleTime: 5 * 60_000,
  });
  const moduleRef = allModules?.find((m) => m.slug === moduleSlug);

  const isAdminModulo = !!moduleRef?.id && !!authUser?.module_roles?.some(
    (r) => r.module_id === moduleRef.id && r.status === 'active' && r.role_name === 'admin_modulo',
  );

  useModuleNav(moduleRef?.name ?? '', navItems, moduleRef?.id);

  if (isLoading || !moduleRef) return <Spinner />;

  if (!isSuperadmin && !isAdminModulo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
        No tienes permiso para ver esta sección.
      </div>
    );
  }

  const modType = (moduleRef as any).type ?? null;
  if (HELPDESK_TYPES.has(modType) || modType == null) {
    return <HelpdeskReportsClient moduleId={moduleRef.id} />;
  }
  return <ReportsClient />;
}
