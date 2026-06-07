'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokens } from '@/lib/tokens';
import { ROUTES } from '@/constants/routes';

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
    const needsProfile    = !profileComplete && !isSuperadmin;

    tokens.set(at, rt, forcePw, needsProfile);
    window.history.replaceState(null, '', window.location.pathname);
    if (needsProfile)  return router.push(ROUTES.AUTH.COMPLETE_PROFILE);
    if (forcePw)       return router.push(ROUTES.AUTH.CHANGE_PASSWORD);
    router.push(ROUTES.APP.DASHBOARD);
  }, [router]);

  return null;
}
