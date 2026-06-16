'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery }               from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { systemConfigService }   from '@/services/system-config.service';
import { Spinner }               from '@/components/ui/Spinner';
import type { AuditLog }         from '@/services/system-config.service';

const PAGE_SIZE = 50;

const ACTION_STYLE: Record<string, React.CSSProperties> = {
  CREATE: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
  UPDATE: { background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' },
  DELETE: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
};

function JsonDiff({ prev, next }: { prev: Record<string, unknown> | null; next: Record<string, unknown> | null }) {
  const allKeys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  const changes: { key: string; from: unknown; to: unknown; type: 'added' | 'removed' | 'changed' }[] = [];

  allKeys.forEach(key => {
    const fromVal = prev?.[key];
    const toVal   = next?.[key];
    if (fromVal === undefined) {
      changes.push({ key, from: undefined, to: toVal, type: 'added' });
    } else if (toVal === undefined) {
      changes.push({ key, from: fromVal, to: undefined, type: 'removed' });
    } else if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
      changes.push({ key, from: fromVal, to: toVal, type: 'changed' });
    }
  });

  if (!changes.length) return <div style={{ padding: '8px 12px', fontSize: 11, color: '#94a3b8' }}>Sin cambios detectados en los valores.</div>;

  const DIFF_ROW = (type: string): React.CSSProperties => ({
    padding: '5px 8px',
    background: type === 'added' ? '#f0fdf4' : type === 'removed' ? '#fef2f2' : '#fffbeb',
    wordBreak: 'break-all',
    fontFamily: 'monospace',
    fontSize: 11,
  });

  return (
    <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', background: 'var(--app-page)', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Campo</div>
        <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Anterior</div>
        <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '.04em' }}>Nuevo</div>
      </div>
      {changes.map(c => (
        <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ padding: '5px 8px', background: 'var(--app-page)', fontWeight: 700, fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center' }}>{c.key}</div>
          <div style={DIFF_ROW(c.type === 'added' ? 'same' : c.type)}>
            {c.type === 'added' ? '—' : <span style={{ color: '#991b1b' }}>{String(c.from)}</span>}
          </div>
          <div style={DIFF_ROW(c.type === 'removed' ? 'same' : 'added')}>
            {c.type === 'removed' ? '—' : <span style={{ color: '#166534' }}>{String(c.to)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AuditoriaTab() {
  const [page,         setPage]         = useState(1);
  const [accumulated,  setAccumulated]  = useState<AuditLog[]>([]);
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [expandedDiff, setExpandedDiff] = useState<Set<string>>(new Set());
  const prevEntityFilter = useRef(entityFilter);

  const { data, isLoading, isFetching, refetch } = useQuery<AuditLog[]>({
    queryKey: ['sys-config-audit', page, entityFilter],
    queryFn: () => systemConfigService.getAuditLogs({
      limit:       PAGE_SIZE,
      offset:      (page - 1) * PAGE_SIZE,
      entity_type: entityFilter !== 'all' ? entityFilter : undefined,
    }),
    staleTime:       30_000,
    refetchInterval: page === 1 ? 60_000 : false,
  });

  useEffect(() => {
    if (!data) return;
    if (page === 1 || prevEntityFilter.current !== entityFilter) {
      setAccumulated(data);
      prevEntityFilter.current = entityFilter;
    } else {
      setAccumulated(prev => {
        const ids = new Set(prev.map(l => l.id));
        return [...prev, ...data.filter(l => !ids.has(l.id))];
      });
    }
  }, [data, page, entityFilter]);

  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [entityFilter]);

  const entityTypes = useMemo(() => {
    const types = new Set(accumulated.map(l => l.entity_type));
    return Array.from(types).sort();
  }, [accumulated]);

  const filtered = useMemo(() =>
    actionFilter === 'all' ? accumulated : accumulated.filter(l => l.action === actionFilter),
    [accumulated, actionFilter],
  );

  const hasMore = (data?.length ?? 0) === PAGE_SIZE;

  const toggleDiff = (id: string) => setExpandedDiff(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  if (isLoading && accumulated.length === 0) return <Spinner />;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--app-text-main)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Historial de cambios críticos
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'var(--app-card)', color: '#64748b', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: isFetching ? 0.5 : 1 }}>
          <RefreshCw size={11} />
          Actualizar
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
        Cambios en SLA, tipos de daño y solicitudes — motivo y verificación. Auto-actualiza cada 60 s.
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, background: 'var(--app-card)', color: 'var(--app-text)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
          <option value="all">Todas las acciones</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>

        <select
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, background: 'var(--app-card)', color: 'var(--app-text)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
          <option value="all">Todos los tipos</option>
          {entityTypes.map(et => (
            <option key={et} value={et}>{et.replace(/_/g, ' ')}</option>
          ))}
        </select>

        {(actionFilter !== 'all' || entityFilter !== 'all') && (
          <button
            onClick={() => { setActionFilter('all'); setEntityFilter('all'); }}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'var(--app-card)', color: '#94a3b8', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Limpiar
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8' }}>
          {filtered.length} de {accumulated.length} registros
        </span>
      </div>

      {/* Log list */}
      {filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13, background: 'var(--app-page)', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
          Sin registros para los filtros seleccionados.
        </div>
      ) : (
        <>
          <div>
            {filtered.map(log => {
              const aStyle    = ACTION_STYLE[log.action] ?? ACTION_STYLE.UPDATE;
              const date      = new Date(log.created_at);
              const hasDiff   = !!(log.previous_value || log.new_value);
              const isDiffOpen = expandedDiff.has(log.id);

              return (
                <div key={log.id} style={{ padding: '12px 16px', background: 'var(--app-card)', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, ...aStyle }}>
                      {log.action}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--app-text-main)' }}>
                      {log.entity_type.replace(/_/g, ' ')}
                    </span>
                    <span style={{ flex: 1 }} />
                    {log.verified_2fa
                      ? <span title="Verificado con 2FA"><ShieldCheck size={13} style={{ color: '#22c55e' }} /></span>
                      : <span title="Sin 2FA"><ShieldAlert size={13} style={{ color: '#f59e0b' }} /></span>}
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                      {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: '#475569', marginBottom: log.reason ? 6 : 0 }}>
                    <strong style={{ color: 'var(--app-text-main)' }}>{log.user_name}</strong>
                    {log.username   && <span style={{ color: '#94a3b8' }}> (@{log.username})</span>}
                    {log.ip_address && <span style={{ color: '#94a3b8' }}> · {log.ip_address}</span>}
                  </div>

                  {log.reason && (
                    <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', background: 'var(--app-page)', padding: '6px 10px', borderRadius: 4, borderLeft: '3px solid #e2e8f0' }}>
                      "{log.reason}"
                    </div>
                  )}

                  {hasDiff && (
                    <button
                      onClick={() => toggleDiff(log.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '3px 8px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'var(--app-page)', color: '#64748b', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {isDiffOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      {isDiffOpen ? 'Ocultar cambios' : 'Ver cambios'}
                    </button>
                  )}

                  {isDiffOpen && hasDiff && (
                    <JsonDiff prev={log.previous_value} next={log.new_value} />
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isFetching}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: 6, background: 'var(--app-card)', color: 'var(--app-text-main)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: isFetching ? 0.5 : 1 }}>
                <RefreshCw size={12} /> Cargar más · {accumulated.length} cargados
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
