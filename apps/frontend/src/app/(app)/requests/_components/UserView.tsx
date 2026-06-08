'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Clock, CheckCircle2, Loader2, FileText } from 'lucide-react';
import { requestsService, type AdmRequest } from '@/services/requests.service';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/usePermission';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui';
import { RequestCard } from './RequestCard';
import { CreateRequestModal } from './CreateRequestModal';
import { CancelRequestModal } from './CancelRequestModal';
import { RequestDetailModal } from './RequestDetailModal';
import styles from './userView.module.css';

interface UserViewProps {
  isSuperadmin: boolean;
}

function MyStatPill({ label, value, color, icon }: {
  label: string; value: number; color: string; icon: React.ReactNode;
}) {
  return (
    <div className={styles.myStatPill}>
      <span className={styles.myStatIcon} style={{ color }}>{icon}</span>
      <span className={styles.myStatValue} style={{ color }}>{value}</span>
      <span className={styles.myStatLabel}>{label}</span>
    </div>
  );
}

export function UserView({ isSuperadmin }: UserViewProps) {
  const qc           = useQueryClient();
  const { user }     = useAuthStore();
  const firstName    = user?.first_name ?? 'Usuario';
  const canViewOwn   = usePermission('gestion:requests:view_own');
  const canCreate    = usePermission('gestion:requests:create');

  const [createOpen,   setCreateOpen]   = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdmRequest | null>(null);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  const { data: myStats } = useQuery({
    queryKey: ['requests-stats-mine'],
    queryFn:  () => requestsService.getMyStats(),
    staleTime: 30_000,
    enabled:  canViewOwn,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['requests', 'mine'],
    queryFn:  () => requestsService.getMine(100),
    enabled:  canViewOwn,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['requests'] });
    qc.invalidateQueries({ queryKey: ['requests-stats-mine'] });
  }, [qc]);

  const cancelMut = useMutation({
    mutationFn: (id: string) => requestsService.cancel(id),
    onSuccess: () => { setCancelTarget(null); invalidate(); },
  });

  const rows = data?.data ?? [];

  const noop = useCallback(() => {}, []);

  return (
    <div className={styles.wrap}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <h2 className={styles.greetTitle}>Hola, {firstName}</h2>
        <p className={styles.greetSub}>Aquí puedes seguir el estado de tus solicitudes administrativas.</p>
      </div>

      {/* My stats + CTA */}
      <div className={styles.statsRow}>
        {myStats && (
          <div className={styles.myStats}>
            <MyStatPill label="Pendientes"  value={myStats.pending}     color="#b45309" icon={<Clock size={14} />} />
            <MyStatPill label="En proceso"  value={myStats.in_progress} color="#7c3aed" icon={<Loader2 size={14} />} />
            <MyStatPill label="Completadas" value={myStats.completed}   color="#15803d" icon={<CheckCircle2 size={14} />} />
          </div>
        )}

        {canCreate && (
          <button className={styles.ctaBtn} onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Nueva solicitud
          </button>
        )}
      </div>

      {/* List */}
      {isLoading && <div className={styles.loadingState}><Spinner /></div>}
      {error && <div className={styles.errorState}>Error cargando solicitudes.</div>}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          icon={<FileText size={40} strokeWidth={1.5} />}
          title="Sin solicitudes todavía"
          description="Crea tu primera solicitud usando el botón de arriba."
          action={canCreate ? { label: 'Nueva solicitud', onClick: () => setCreateOpen(true) } : undefined}
        />
      )}

      <div className={styles.list}>
        {rows.map(req => (
          <RequestCard
            key={req.id}
            req={req}
            isExpanded={expandedId === req.id}
            showAdminActions={false}
            isSuperadmin={isSuperadmin}
            activeTab="mine"
            onToggleExpand={() => setExpandedId(expandedId === req.id ? null : req.id)}
            onCancel={() => setCancelTarget(req.id)}
            onTake={noop}
            onProgress={noop}
            onReject={noop}
            onEscalate={noop}
            onDeescalate={noop}
            onDetail={() => setDetailTarget(req)}
            isTakePending={false}
            isProgressPending={false}
            isReviewPending={false}
            isDeescalatePending={false}
          />
        ))}
      </div>

      {/* Modals */}
      <CreateRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={invalidate} />
      <CancelRequestModal
        open={!!cancelTarget}
        isPending={cancelMut.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMut.mutate(cancelTarget)}
      />
      {detailTarget && (
        <RequestDetailModal
          request={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={() => { setDetailTarget(null); invalidate(); }}
          showAdminActions={false}
          isSuperadmin={false}
        />
      )}
    </div>
  );
}
