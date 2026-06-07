'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { Construction, PackageSearch } from 'lucide-react';
import { TicketsClient } from '../tickets/_components/TicketsClient';

const HELPDESK_TYPES = new Set(['helpdesk', 'soporte', null, undefined]);

export default function ModuleSlugPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const router         = useRouter();
  const user           = useAuthStore((s) => s.user);
  const isSuperadmin   = user?.is_superadmin ?? false;

  const { data: allModules } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
  });

  const moduleRef = allModules?.find((m) => m.slug === moduleSlug);

  const { data: mod, isLoading } = useQuery({
    queryKey: ['module', moduleRef?.id],
    queryFn:  () => modulesService.getModule(moduleRef!.id),
    enabled:  !!moduleRef?.id,
  });

  if (!allModules || isLoading) return <Spinner />;

  if (!moduleRef || !mod) {
    return (
      <p style={{ padding: 24, color: '#ef4444', fontSize: 14 }}>
        Módulo no encontrado.
      </p>
    );
  }

  if ((mod as any).maintenance_mode && !isSuperadmin) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: 16,
      }}>
        <Construction size={56} color="#f59e0b" strokeWidth={1.5} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Módulo en mantenimiento
        </h2>
        <p style={{ fontSize: 15, color: '#64748b', maxWidth: 420, margin: 0 }}>
          {(mod as any).maintenance_message
            || 'Este módulo está temporalmente fuera de servicio. Vuelve más tarde.'}
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          style={{
            marginTop: 8, padding: '10px 24px', background: '#6366f1', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Volver al dashboard
        </button>
      </div>
    );
  }

  const modType = (mod as any).type ?? null;

  if (!HELPDESK_TYPES.has(modType)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: 16,
      }}>
        <PackageSearch size={56} color="#6366f1" strokeWidth={1.5} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          {mod.name}
        </h2>
        <p style={{ fontSize: 15, color: '#64748b', maxWidth: 420, margin: 0 }}>
          Este módulo es de tipo <strong>{modType}</strong> y aún no tiene una interfaz
          dedicada. Contacta al administrador del sistema.
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          style={{
            marginTop: 8, padding: '10px 24px', background: '#6366f1', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Volver al dashboard
        </button>
      </div>
    );
  }

  return (
    <TicketsClient
      forcedModuleId={moduleRef.id}
      forcedModuleSlug={moduleSlug}
      forcedModuleName={mod.name}
      forcedModuleDesc={(mod as any).description ?? null}
    />
  );
}
