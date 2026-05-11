'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useModules } from '@/hooks/useModules';
import { modulesService } from '@/services/modules.service';
import { ModuleCard } from '@/components/modules/ModuleCard';
import { ModuleFormModal } from '@/components/modules/ModuleFormModal';
import { Spinner } from '@/components/ui/Spinner';
import type { SystemModule } from '@/types/module.types';
import styles from '../dashboard.module.css';

export function DashboardClient() {
  const router                                             = useRouter();
  const qc                                                 = useQueryClient();
  const { user }                                           = useCurrentUser();
  const { modules, active, inactive, isLoading, isError } = useModules();

  const firstName    = user?.first_name    ?? '';
  const isSuperadmin = user?.is_superadmin ?? false;

  const [modalOpen,   setModalOpen]   = useState(false);
  const [editModule,  setEditModule]  = useState<SystemModule | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['modules'] });

  const toggleMut = useMutation({
    mutationFn: (m: SystemModule) =>
      modulesService.updateModule(m.id, { is_active: !m.is_active }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => modulesService.deleteModule(id),
    onSuccess: invalidate,
  });

  function openCreate() {
    setEditModule(null);
    setModalOpen(true);
  }

  function openEdit(m: SystemModule) {
    setEditModule(m);
    setModalOpen(true);
  }

  function handleDelete(m: SystemModule) {
    if (window.confirm(`¿Eliminar el módulo "${m.name}"? Esta acción no se puede deshacer.`)) {
      deleteMut.mutate(m.id);
    }
  }

  return (
    <div>
      <div className={styles.welcome}>
        {firstName ? `Hola, ${firstName}` : 'Hola'}
      </div>
      <p className={styles.sub}>Selecciona el módulo al que deseas acceder</p>

      {isLoading && <Spinner />}

      {isError && (
        <p className={styles.errorMsg}>Error cargando módulos. Intenta recargar.</p>
      )}

      {modules && (
        <>
          <div className={styles.sectionTitle}>Módulos disponibles</div>
          <div className={styles.grid}>
            {!active.length && !isSuperadmin && (
              <span className={styles.emptyMsg}>No tienes módulos asignados.</span>
            )}
            {active.map((m) => (
              <ModuleCard
                key={m.id}
                module={m}
                isSuperadmin={isSuperadmin}
                onClick={() => router.push(`/modules/${m.id}`)}
                onEdit={() => openEdit(m)}
                onToggleActive={() => toggleMut.mutate(m)}
                onDelete={() => handleDelete(m)}
              />
            ))}
            {isSuperadmin && (
              <button type="button" className={styles.createCard} onClick={openCreate}>
                <Plus size={28} />
                <span>Crear módulo</span>
              </button>
            )}
          </div>

          {inactive.length > 0 && isSuperadmin && (
            <>
              <div className={styles.inactiveSectionTitle}>Módulos desactivados</div>
              <div className={styles.grid}>
                {inactive.map((m) => (
                  <ModuleCard
                    key={m.id}
                    module={m}
                    isSuperadmin={isSuperadmin}
                    onClick={() => router.push(`/modules/${m.id}`)}
                    onEdit={() => openEdit(m)}
                    onToggleActive={() => toggleMut.mutate(m)}
                    onDelete={() => handleDelete(m)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ModuleFormModal
        open={modalOpen}
        module={editModule}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setModalOpen(false)}
      />
    </div>
  );
}
