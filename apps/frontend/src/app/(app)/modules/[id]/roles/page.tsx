'use client';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { GestionRolesClient } from '@/app/(app)/requests/_components/GestionRolesClient';
import { buildDynamicModuleNav } from '../_nav';

export default function DynamicModuleRolesPage() {
  const { id } = useParams<{ id: string }>();
  const { data: mod, isLoading } = useQuery({
    queryKey: ['module', id],
    queryFn:  () => modulesService.getModule(id),
    enabled:  !!id,
  });
  const navItems = useMemo(
    () => buildDynamicModuleNav(mod?.slug ?? id),
    [mod?.slug, id],
  );
  useModuleNav(mod?.name ?? '', navItems, id);

  if (isLoading || !id) return <Spinner />;
  return <GestionRolesClient moduleId={id} />;
}
