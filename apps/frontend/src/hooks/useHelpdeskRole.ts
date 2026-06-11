'use client';

import { useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { isHelpdeskModule } from '@/app/(app)/tickets/_nav';

/** Returns the current user's role in the helpdesk module. */
export function useHelpdeskRole() {
  const user       = useAuthStore((s) => s.user);
  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;
  const isSuperadmin = user?.is_superadmin ?? false;

  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return (
      user.module_roles.find(
        (r) => r.module_id === helpdeskId && r.status === 'active',
      )?.role_name ?? null
    );
  }, [user, helpdeskId]);

  return { moduleRole, isSuperadmin, helpdeskId, user };
}

/**
 * Guard: redirects user away from a helpdesk page if their role isn't in allowedRoles.
 * Superadmin always passes.
 * Returns { allowed, moduleRole } — render null while !allowed to avoid flash.
 */
export function useHelpdeskRoleGuard(allowedRoles: string[]): {
  allowed: boolean;
  moduleRole: string | null;
} {
  const router = useRouter();
  const { moduleRole, isSuperadmin, helpdeskId, user } = useHelpdeskRole();

  const allowed = isSuperadmin || (moduleRole !== null && allowedRoles.includes(moduleRole));
  const ready   = !!user && !!helpdeskId;

  useEffect(() => {
    if (!ready) return;
    if (allowed) return;
    // Redirect based on role
    if (!moduleRole || moduleRole === 'usuario') {
      router.replace('/helpdesk');
    } else {
      router.replace('/helpdesk/workspace');
    }
  }, [ready, allowed, moduleRole, router]);

  return { allowed: !ready ? false : allowed, moduleRole };
}
