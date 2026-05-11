'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { usersService } from '@/services/users.service';
import type { CurrentUser } from '@/types/user.types';

export function useCurrentUser(): {
  user:      CurrentUser | null;
  isLoading: boolean;
  error:     Error | null;
} {
  const user            = useAuthStore((s) => s.user);
  const setUser         = useAuthStore((s) => s.setUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data, isLoading, error } = useQuery({
    queryKey:  ['me'],
    queryFn:   usersService.getMe,
    enabled:   isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry:     1,
  });

  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);

  return {
    user:      user ?? data ?? null,
    isLoading: isLoading && !user,
    error:     error && !user ? (error as Error) : null,
  };
}
