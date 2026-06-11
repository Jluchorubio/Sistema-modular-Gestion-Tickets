'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, TrendingUp, Clock, CheckCircle2, Inbox } from 'lucide-react';
import {
  requestsService,
  type AdmRequest, type RequestStatus, type RequestType,
} from '@/services/requests.service';
import { REQUEST_TYPE_LABELS, REQUEST_TYPES } from '@/constants/requests';
import { usePermission } from '@/hooks/usePermission';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { EmptyState } from '@/components/ui';
import { MetricCard } from '@/components/ui/MetricCard';
import { RequestCard } from './RequestCard';
import { CreateRequestModal } from './CreateRequestModal';
import { RejectRequestModal } from './RejectRequestModal';
import { CancelRequestModal } from './CancelRequestModal';
import { EscalateRequestModal } from './EscalateRequestModal';
import { ExecuteRequestModal } from './ExecuteRequestModal';
import { RequestDetailModal } from './RequestDetailModal';
import styles from './adminView.module.css';

interface AdminViewProps {
  isSuperadmin:  boolean;
  moduleId?:     string;
  escalatedOnly?: boolean;
}

export function AdminView({ isSuperadmin, moduleId, escalatedOnly = false }: AdminViewProps) {
  const qc = useQueryClient();

  const canCreate       = usePermission('gestion:requests:create');
  const canViewAll      = usePermission('gestion:requests:view_all');
  const canTake         = usePermission('gestion:requests:take');
  const canProgress     = usePermission('gestion:requests:progress');
  const canApprove      = usePermission('gestion:requests:approve');
  const canEscalatePerm = usePermission('gestion:requests:escalate');

  const [statusFilter,  setStatusFilter]  = useState<RequestStatus | ''>('');
  const [typeFilter,    setTypeFilter]    = useState<RequestType | ''>('');
  const [searchQ,       setSearchQ]       = useState('');
  const [onlyEscalated, setOnlyEscalated] = useState(escalatedOnly);

  const [createOpen,     setCreateOpen]     = useState(false);
  const [rejectOpen,     setRejectOpen]     = useState(false);
  const [rejectTarget,   setRejectTarget]   = useState<string | null>(null);
  const [rejectNotes,    setRejectNotes]    = useState('');
  const [cancelTarget,   setCancelTarget]   = useState<string | null>(null);
  const [escalateOpen,   setEscalateOpen]   = useState(false);
  const [escalateTarget, setEscalateTarget] = useState<string | null>(null);
  const [escalateNote,   setEscalateNote]   = useState('');
  const [executeTarget,  setExecuteTarget]  = useState<AdmRequest | null>(null);
  const [detailTarget,   setDetailTarget]   = useState<AdmRequest | null>(null);
  const [expandedId,     setExpandedId]     = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['requests-stats', moduleId],
    queryFn:  () => requestsService.getStats(moduleId),
    staleTime: 30_000,
    enabled:  canViewAll,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['requests', 'inbox', statusFilter, typeFilter, onlyEscalated, moduleId],
    queryFn:  () => requestsService.getAll({ status: statusFilter, type: typeFilter, escalated: onlyEscalated || undefined, moduleId, limit: 100 }),
    enabled:  canViewAll,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['requests'] });
    qc.invalidateQueries({ queryKey: ['requests-stats'] });
  }, [qc]);

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
    onSuccess: () => { setEscalateOpen(false); setEscalateTarget(null); setEscalateNote(''); invalidate(); },
  });
  const deescalateMut = useMutation({
    mutationFn: (id: string) => requestsService.deescalate(id),
    onSuccess: invalidate,
  });

  const handleReject = useCallback((req: AdmRequest) => {
    setRejectTarget(req.id); setRejectNotes(''); setRejectOpen(true);
  }, []);

  const confirmReject = useCallback(() => {
    if (!rejectTarget) return;
    reviewMut.mutate({ id: rejectTarget, status: 'rejected', notes: rejectNotes || undefined });
    setRejectOpen(false); setRejectTarget(null);
  }, [rejectTarget, rejectNotes, reviewMut]);

  const rows = data?.data ?? [];
  const filtered = searchQ.trim()
    ? rows.filter(r =>
        r.title.toLowerCase().includes(searchQ.toLowerCase()) ||
        r.requester_name?.toLowerCase().includes(searchQ.toLowerCase()))
    : rows;

  const hasEscalated = (stats?.escalated ?? 0) > 0;
  const hasSlaBreached = (stats?.sla_breached ?? 0) > 0;

  return (
    <div className={styles.wrap}>

      {/* Stats bar */}
      {stats && (
        <div className={styles.statsBar}>
          <MetricCard size="sm" label="Total"      value={stats.total}         color="var(--app-navy, #0e2235)" />
          <MetricCard size="sm" label="Pendientes" value={stats.pending}       color="#b45309"   />
          <MetricCard size="sm" label="Tomadas"    value={stats.taken}         color="#1d4ed8"   />
          <MetricCard size="sm" label="En proceso" value={stats.in_progress}   color="#7c3aed"   />
          <MetricCard size="sm" label="Escaladas"  value={stats.escalated}     color="#ea580c"   />
          <MetricCard size="sm" label="SLA vencido" value={stats.sla_breached} color="#dc2626"   />
        </div>
      )}

      {/* Alert banners */}
      {hasEscalated && (
        <AlertBanner
          variant="escalated"
          icon={<TrendingUp size={14} />}
          action={{ label: 'Ver escaladas', onClick: () => setOnlyEscalated(true) }}
          style={{ marginBottom: 10 }}
        >
          {stats!.escalated} solicitud{stats!.escalated !== 1 ? 'es' : ''} escalada{stats!.escalated !== 1 ? 's' : ''} — requieren atención inmediata
        </AlertBanner>
      )}
      {hasSlaBreached && (
        <AlertBanner
          variant="breached"
          icon={<Clock size={14} />}
          action={{ label: 'Ver en proceso', onClick: () => setStatusFilter('in_progress') }}
          style={{ marginBottom: 10 }}
        >
          {stats!.sla_breached} solicitud{stats!.sla_breached !== 1 ? 'es han' : ' ha'} excedido su SLA
        </AlertBanner>
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <Search size={13} color="#94a3b8" />
          <input
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Buscar solicitudes..."
            className={styles.searchInput}
          />
        </div>

        {/* Filters */}
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

        {!escalatedOnly && (
          <label className={styles.escalatedCheck}>
            <input
              type="checkbox"
              checked={onlyEscalated}
              onChange={e => setOnlyEscalated(e.target.checked)}
            />
            <TrendingUp size={11} />
            Solo escaladas
          </label>
        )}

        {(statusFilter || typeFilter || (!escalatedOnly && onlyEscalated)) && (
          <button
            type="button"
            className={styles.clearFilters}
            onClick={() => { setStatusFilter(''); setTypeFilter(''); if (!escalatedOnly) setOnlyEscalated(false); }}
          >
            Limpiar filtros
          </button>
        )}

        <div style={{ flex: 1 }} />

        {canCreate && (
          <button className={styles.btnPrimary} onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> Nueva solicitud
          </button>
        )}
      </div>

      {/* Count */}
      {!isLoading && (
        <div className={styles.countRow}>
          <Inbox size={12} color="#94a3b8" />
          <span className={styles.countText}>
            {filtered.length} solicitud{filtered.length !== 1 ? 'es' : ''}
            {searchQ && ` · "${searchQ}"`}
          </span>
        </div>
      )}

      {/* List */}
      {isLoading && <div className={styles.loadingState}><Spinner /></div>}
      {error && <div className={styles.errorState}>Error cargando solicitudes.</div>}

      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={<CheckCircle2 size={40} strokeWidth={1.5} />}
          title={searchQ ? 'Sin resultados' : 'Bandeja vacía'}
          description={searchQ
            ? `No hay solicitudes que coincidan con "${searchQ}".`
            : 'No hay solicitudes que coincidan con los filtros actuales.'}
        />
      )}

      <div className={styles.list}>
        {filtered.map(req => (
          <RequestCard
            key={req.id}
            req={req}
            isExpanded={expandedId === req.id}
            showAdminActions
            isSuperadmin={isSuperadmin}
            activeTab="inbox"
            onToggleExpand={() => setExpandedId(expandedId === req.id ? null : req.id)}
            onCancel={() => setCancelTarget(req.id)}
            onTake={() => takeMut.mutate(req.id)}
            onProgress={status => progressMut.mutate({ id: req.id, status })}
            onReject={() => handleReject(req)}
            onEscalate={() => { setEscalateTarget(req.id); setEscalateNote(''); setEscalateOpen(true); }}
            onDeescalate={() => deescalateMut.mutate(req.id)}
            onExecute={() => setExecuteTarget(req)}
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
      </div>

      {/* Modals */}
      <CreateRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={invalidate} />
      <RejectRequestModal
        open={rejectOpen} notes={rejectNotes} isPending={reviewMut.isPending}
        onChangeNotes={setRejectNotes} onClose={() => setRejectOpen(false)} onConfirm={confirmReject}
      />
      <CancelRequestModal
        open={!!cancelTarget} isPending={cancelMut.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMut.mutate(cancelTarget)}
      />
      <EscalateRequestModal
        open={escalateOpen} note={escalateNote} isPending={escalateMut.isPending}
        onChangeNote={setEscalateNote}
        onClose={() => { setEscalateOpen(false); setEscalateTarget(null); setEscalateNote(''); }}
        onConfirm={() => escalateTarget && escalateMut.mutate({ id: escalateTarget, note: escalateNote || undefined })}
      />
      {executeTarget && (
        <ExecuteRequestModal request={executeTarget} onClose={() => setExecuteTarget(null)} />
      )}
      {detailTarget && (
        <RequestDetailModal
          request={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={() => { setDetailTarget(null); invalidate(); }}
          showAdminActions
          isSuperadmin={isSuperadmin}
        />
      )}
    </div>
  );
}
