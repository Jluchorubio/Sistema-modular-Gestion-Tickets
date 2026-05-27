'use client';

import { useEffect } from 'react';
import { useQuery }  from '@tanstack/react-query';
import { useSystemConfigStore } from '@/stores/systemConfig.store';
import { systemConfigService }  from '@/services/system-config.service';
import { useAuthStore }         from '@/stores/auth.store';

/**
 * Keeps the Zustand systemConfig store in sync with the company-public RQ query.
 * Whenever company data changes (config save, socket invalidation, refetch),
 * the store is updated and CSS custom properties are applied globally.
 *
 * No extra network call: deduplicates with AppSidebar's ['company-public'] query.
 */
export function SystemConfigProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setBranding     = useSystemConfigStore((s) => s.setBranding);

  const { data } = useQuery({
    queryKey: ['company-public'],
    queryFn:  systemConfigService.getPublicCompanyInfo,
    staleTime: 10 * 60 * 1_000,
    enabled:  isAuthenticated,
  });

  useEffect(() => {
    if (data) setBranding(data);
  }, [data, setBranding]);

  return <>{children}</>;
}
