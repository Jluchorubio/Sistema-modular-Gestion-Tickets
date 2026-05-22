'use client';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { modulesService } from '@/services/modules.service';
import { ModuleTrashClient } from '@/app/(app)/requests/_components/ModuleTrashClient';
import { buildDynamicModuleNav } from '../_nav';

export default function DynamicModuleTrashPage() {
  const { id } = useParams<{ id: string }>();
  const { data: mod } = useQuery({
    queryKey: ['module', id],
    queryFn:  () => modulesService.getModule(id),
    enabled:  !!id,
  });
  const navItems = useMemo(
    () => buildDynamicModuleNav(mod?.slug ?? id),
    [mod?.slug, id],
  );
  useModuleNav(mod?.name ?? '', navItems, id);
  return <ModuleTrashClient itemType="request" />;
}
