import { useQuery } from '@tanstack/react-query';
import { usersService, type UserListItem } from '@/services/users.service';
import type { PaginatedMeta } from '@/types/api.types';

interface UseUsersParams {
  page:          number;
  limit:         number;
  search?:       string;
  statusFilter?: string;
  superFilter?:  string;
}

export function useUsers(params: UseUsersParams): {
  users:    UserListItem[];
  meta:     PaginatedMeta | undefined;
  isLoading: boolean;
  isError:   boolean;
} {
  const { page, limit, search, statusFilter, superFilter } = params;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', { page, limit, search, statusFilter, superFilter }],
    queryFn:  () => usersService.getUsers({
      page,
      limit,
      search:        search || undefined,
      is_active:     statusFilter === 'true' ? true : statusFilter === 'false' ? false : undefined,
      is_superadmin: superFilter  === 'true' ? true : superFilter  === 'false' ? false : undefined,
    }),
  });

  return {
    users:    data?.data ?? [],
    meta:     data?.meta,
    isLoading,
    isError,
  };
}
