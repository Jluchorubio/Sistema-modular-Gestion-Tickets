'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from './useCurrentUser';
import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/types/user.types';

export type GuardStatus = 'loading' | 'authorized' | 'unauthorized';

export function useSuperadminGuard(): { status: GuardStatus; user: CurrentUser | null } {
  const router              = useRouter();
  const { user, isLoading } = useCurrentUser();

  useEffect(() => {
    if (user && !user.is_superadmin) {
      router.replace(ROUTES.APP.DASHBOARD);
    }
  }, [user, router]);

  if (!user || isLoading) return { status: 'loading', user: null };
  if (!user.is_superadmin) return { status: 'unauthorized', user };
  return { status: 'authorized', user };
}
