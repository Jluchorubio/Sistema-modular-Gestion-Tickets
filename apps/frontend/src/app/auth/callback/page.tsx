'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/tokens';
import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/types/user.types';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const at = params.get('access_token');
    const rt = params.get('refresh_token');

    if (!at || !rt) {
      router.replace(ROUTES.AUTH.LOGIN);
      return;
    }

    const profileComplete = params.get('profile_complete') === '1';
    const isSuperadmin    = params.get('is_superadmin') === '1';
    const forcePw         = params.get('force_pw') === '1';
    const name            = decodeURIComponent(params.get('name') ?? '');
    const email           = decodeURIComponent(params.get('email') ?? '');
    const [firstName, ...rest] = name.split(' ');
    const needsProfile    = !profileComplete && !isSuperadmin;

    const partialUser: CurrentUser = {
      id:                    '',
      email,
      first_name:            firstName ?? '',
      last_name:             rest.join(' '),
      phone:                 null,
      username:              null,
      job_title:             null,
      department:            null,
      address:                 null,
      primary_sede:            null,
      avatar_url:              null,
      phone_prefix:            null,
      country:                 null,
      state_province:          null,
      city:                    null,
      birth_date:              null,
      national_id:             null,
      gender:                  null,
      emergency_contact_name:  null,
      emergency_contact_phone: null,
      is_superadmin:           isSuperadmin,
      is_active:               true,
      profile_complete:        profileComplete,
      force_password_change:   forcePw,
      created_at:              new Date().toISOString(),
      updated_at:              new Date().toISOString(),
      deleted_at:              null,
      module_roles:            [],
      preferences:             null,
    };

    tokens.set(at, rt, forcePw, needsProfile);
    useAuthStore.getState().setUser(partialUser);
    window.history.replaceState(null, '', window.location.pathname);
    router.push(needsProfile ? ROUTES.AUTH.COMPLETE_PROFILE : ROUTES.APP.DASHBOARD);
  }, [router]);

  return null;
}
