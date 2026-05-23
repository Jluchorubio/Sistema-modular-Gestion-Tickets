import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import type { SystemModule } from '@/types/module.types';

export function useModules(): {
  modules:   SystemModule[] | undefined;
  active:    SystemModule[];
  inactive:  SystemModule[];
  isLoading: boolean;
  isError:   boolean;
} {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['modules'],
    queryFn:  modulesService.getModules,
    enabled:  isAuthenticated,
  });

  return {
    modules:  data,
    active:   data?.filter((m) => m.is_active)  ?? [],
    inactive: data?.filter((m) => !m.is_active) ?? [],
    isLoading,
    isError,
  };
}
