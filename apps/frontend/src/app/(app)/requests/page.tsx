'use client';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingUp } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import {
  requestsService,
  type AdmRequest, type RequestType, type RequestStatus,
} from '@/services/requests.service';
import { REQUEST_TYPE_LABELS, REQUEST_TYPES } from '@/constants/requests';
import { useAuthStore } from '@/stores/auth.store';
import { MODULE_ROLES } from '@/constants/roles';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { usePermission } from '@/hooks/usePermission';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from './_nav';
import { Spinner } from '@/components/ui/Spinner';
import { RequestCard } from './_components/RequestCard';
import { CreateRequestModal } from './_components/CreateRequestModal';
import { RejectRequestModal } from './_components/RejectRequestModal';
import { CancelRequestModal } from './_components/CancelRequestModal';
import { EscalateRequestModal } from './_components/EscalateRequestModal';
import { ExecuteRequestModal } from './_components/ExecuteRequestModal';
import { RequestDetailModal } from './_components/RequestDetailModal';
import styles from './requests.module.css';

export default function RequestsPage() {
  const { modules } = useModules();
  const gestionId = modules?.find(isGestionModule)?.id;
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);

  const qc            = useQueryClient();
  const { user }      = useAuthStore();
  const isSuperadmin  = user?.is_superadmin ?? false;
  const isAdminModulo = user?.module_roles?.some(
    (r) => r.status === 'active' && r.role_name === MODULE_ROLES.ADMIN_MODULO
  ) ?? false;
  const hasAdminAccess  = isSuperadmin || isAdminModulo;
  const canViewOwn      = usePermission('gestion:requests:view_own');
  const canCreate       = usePermission('gestion:requests:create');
  const canViewAll      = usePermission('gestion:requests:view_all');
  const canTake         = usePermission('gestion:requests:take');
  const canProgress     = usePermission('gestion:requests:progress');
  const canApprove      = usePermission('gestion:requests:approve');
  const canEscalatePerm = usePermission('gestion:requests:escalate');

  /* ── Tabs + filters ── */
  const [activeTab,     setActiveTab]     = useState<'mine' | 'inbox'>(hasAdminAccess ? 'inbox' : 'mine');
  const [statusFilter,  setStatusFilter]  = useState<RequestStatus | ''>('');
  const [typeFilter,    setTypeFilter]    = useState<RequestType   | ''>('');
  const [onlyEscalated, setOnlyEscalated] = useState(false);

  /* ── Modal state ── */
  const [createOpen,     setCreateOpen]     = useState(false);
  const [rejectOpen,     setRejectOpen]     = useState(false);
  const [rejectTarget,   setRejectTarget]   = useState<string | null>(null);
  const [rejectNotes,    setRejectNotes]    = useState('');
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [cancelTarget,   setCancelTarget]   = useState<string | null>(null);
  const [escalateOpen,   setEscalateOpen]   = useState(false);
  const [escalateTarget, setEscalateTarget] = useState<string | null>(null);
  const [escalateNote,   setEscalateNote]   = useState('');
  const [executeTarget,  setExecuteTarget]  = useState<AdmRequest | null>(null);
  const [detailTarget,   setDetailTarget]   = useState<AdmRequest | null>(null);

  /* ── Data ── */
  const { data, isLoading, error } = useQuery({
    queryKey: activeTab === 'inbox'
      ? ['requests', 'inbox', statusFilter, typeFilter, onlyEscalated]
      : ['requests', 'mine'],
    queryFn: () => activeTab === 'inbox'
      ? requestsService.getAll({ status: statusFilter, type: typeFilter, escalated: onlyEscalated || undefined })
      : requestsService.getMine(),
    enabled: activeTab === 'inbox' ? canViewAll : canViewOwn,
  });

  /* ── Mutations ── */
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['requests'] }), [qc]);

  const reviewMut = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: RequestStatus; notes?: string }) =>
      requestsService.review(id, status, notes),
    onSuccess: invalidate,
  });

  const takeMut = useMutation({
    mutationFn: (id: string) => requestsService.take(id),
    onSuccess: invalidate,
  });

  const progressMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'in_progress' | 'completed' }) =>
      requestsService.updateProgress(id, status),
    onSuccess: invalidate,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => requestsService.cancel(id),
    onSuccess: () => { setCancelTarget(null); invalidate(); },
  });

  const escalateMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => requestsService.escalate(id, note),
    onSuccess: () => {
      setEscalateOpen(false);
      setEscalateTarget(null);
      setEscalateNote('');
      invalidate();
    },
  });

  const deescalateMut = useMutation({
    mutationFn: (id: string) => requestsService.deescalate(id),
    onSuccess: invalidate,
  });

  /* ── Handlers ── */
  const handleReject = useCallback((req: AdmRequest) => {
    setRejectTarget(req.id);
    setRejectNotes('');
    setRejectOpen(true);
  }, []);

  const confirmReject = useCallback(() => {
    if (!rejectTarget) return;
    reviewMut.mutate({ id: rejectTarget, status: 'rejected', notes: rejectNotes || undefined });
    setRejectOpen(false);
    setRejectTarget(null);
  }, [rejectTarget, rejectNotes, reviewMut]);

  const rows             = data?.data ?? [];
  const total            = data?.meta.total ?? rows.length;
  const showAdminActions = hasAdminAccess && activeTab === 'inbox';

  return (
    <ModuleLayout
      moduleId={gestionId}
      title="Gestión Administrativa"
      description="Consola centralizada de solicitudes organizacionales: autorizaciones, traslados, cambios de rol y escalamientos administrativos."
      isSuperadmin={isSuperadmin}
      alwaysOpen
    >
      {/* ── Count + create btn row ── */}
      <div className={styles.header}>
        <div>
          {data && <div className={styles.count}>{total} solicitud{total !== 1 ? 'es' : ''}</div>}
        </div>
        {canCreate && (
          <button className={styles.btnPrimary} onClick={() => setCreateOpen(true)}>
            <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Nueva solicitud
          </button>
        )}
      </div>

      {/* ── Tab bar (admin only) ── */}
      {(hasAdminAccess && canViewAll) && (
        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tab}${activeTab === 'mine' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setActiveTab('mine')}
          >
            Mis Solicitudes
          </button>
          <button
            type="button"
            className={`${styles.tab}${activeTab === 'inbox' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setActiveTab('inbox')}
          >
            Bandeja de Entrada
          </button>
        </div>
      )}

      {/* ── Filter bar (inbox tab only) ── */}
      {hasAdminAccess && activeTab === 'inbox' && (
        <div className={styles.filterBar}>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as RequestStatus | '')}
          >
            <option value="">Estado: Todos</option>
            <option value="pending">Pendiente</option>
            <option value="taken">Tomado</option>
            <option value="in_progress">En proceso</option>
            <option value="completed">Finalizado</option>
            <option value="rejected">Rechazado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as RequestType | '')}
          >
            <option value="">Tipo: Todos</option>
            {REQUEST_TYPES.map(t => (
              <option key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <label className={styles.onlyMine} style={{ color: '#F97316' }}>
            <input
              type="checkbox"
              className={styles.onlyMineCb}
              checked={onlyEscalated}
              onChange={e => setOnlyEscalated(e.target.checked)}
            />
            <TrendingUp size={12} style={{ verticalAlign: 'middle' }} /> Solo escaladas
          </label>
        </div>
      )}

      {/* ── List ── */}
      {isLoading && <Spinner />}
      {error     && <div className={styles.errorMsg}>Error cargando solicitudes</div>}

      {!isLoading && !error && rows.length === 0 && (
        <div className={styles.emptyMsg}>
          {activeTab === 'mine'
            ? 'No has creado ninguna solicitud todavía.'
            : 'No hay solicitudes en la bandeja.'}
        </div>
      )}

      {rows.map(req => (
        <RequestCard
          key={req.id}
          req={req}
          isExpanded={expandedId === req.id}
          showAdminActions={showAdminActions}
          isSuperadmin={isSuperadmin}
          activeTab={activeTab}
          onToggleExpand={() => setExpandedId(expandedId === req.id ? null : req.id)}
          onCancel={() => setCancelTarget(req.id)}
          onTake={() => takeMut.mutate(req.id)}
          onProgress={status => progressMut.mutate({ id: req.id, status })}
          onReject={() => handleReject(req)}
          onEscalate={() => { setEscalateTarget(req.id); setEscalateNote(''); setEscalateOpen(true); }}
          onDeescalate={() => deescalateMut.mutate(req.id)}
          onExecute={showAdminActions ? () => setExecuteTarget(req) : undefined}
          onDetail={() => setDetailTarget(req)}
          isTakePending={takeMut.isPending}
          isProgressPending={progressMut.isPending}
          isReviewPending={reviewMut.isPending}
          isDeescalatePending={deescalateMut.isPending}
          permTake={canTake}
          permProgress={canProgress}
          permApprove={canApprove}
          permEscalate={canEscalatePerm}
        />
      ))}

      {/* ── Modals ── */}
      <CreateRequestModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={invalidate}
      />
      <RejectRequestModal
        open={rejectOpen}
        notes={rejectNotes}
        isPending={reviewMut.isPending}
        onChangeNotes={setRejectNotes}
        onClose={() => setRejectOpen(false)}
        onConfirm={confirmReject}
      />
      <CancelRequestModal
        open={!!cancelTarget}
        isPending={cancelMut.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMut.mutate(cancelTarget)}
      />
      <EscalateRequestModal
        open={escalateOpen}
        note={escalateNote}
        isPending={escalateMut.isPending}
        onChangeNote={setEscalateNote}
        onClose={() => { setEscalateOpen(false); setEscalateTarget(null); setEscalateNote(''); }}
        onConfirm={() => escalateTarget && escalateMut.mutate({ id: escalateTarget, note: escalateNote || undefined })}
      />
      {executeTarget && (
        <ExecuteRequestModal
          request={executeTarget}
          onClose={() => setExecuteTarget(null)}
        />
      )}
      {detailTarget && (
        <RequestDetailModal
          request={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={() => { setDetailTarget(null); invalidate(); }}
          showAdminActions={showAdminActions}
          isSuperadmin={isSuperadmin}
        />
      )}
    </ModuleLayout>
  );
}
