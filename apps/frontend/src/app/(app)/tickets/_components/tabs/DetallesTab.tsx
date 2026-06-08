'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Link2, Search, Unlink, BookOpen, ExternalLink, ChevronRight } from 'lucide-react';
import { ticketsService } from '@/services/tickets.service';
import { docsService } from '@/app/(app)/helpdesk/knowledge/_lib/knowledge.service';
import { fmtDate, fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import type { useTicketData } from '../hooks/useTicketData';

function KbSuggestions({ moduleId, query }: { moduleId: string; query: string }) {
  const router = useRouter();
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['kb-suggest', moduleId, query],
    queryFn:  () => docsService.getArticles(moduleId, query),
    enabled:  !!moduleId && !!query,
    staleTime: 5 * 60_000,
    select: (data: any[]) => data.filter(a => a.is_published).slice(0, 4),
  });
  if (isLoading) return <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Buscando…</p>;
  if (articles.length === 0) return <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Sin artículos relacionados.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {articles.map((a: any) => (
        <button key={a.id} type="button" onClick={() => router.push(`/helpdesk/knowledge/docs/${a.id}`)}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '7px 9px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; }}>
          <BookOpen size={11} style={{ color: '#6366f1', marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
          <ExternalLink size={9} style={{ color: '#94a3b8', flexShrink: 0 }} />
        </button>
      ))}
    </div>
  );
}

export function DetallesTab({
  ticketId, ticket, relations, linkedAssets,
  onAddRelation, onRemoveRelation, onSearchTickets,
  mutPending,
}: {
  ticketId:         string;
  ticket: {
    module_id: string; module_name: string; category_name: string | null;
    environment_name?: string | null;
    damage_type_label?: string | null; priority: string; urgency: string; impact: string;
    created_at: string; reprocess_count: number; is_final: boolean;
    creator_name: string;
    assignments: { id: string; user_name: string; role: string; is_active: boolean; assigned_at: string }[];
    id: string;
    escalated?:       boolean;
    escalation_note?: string | null;
    history?:         { id: string; transitioned_at: string; from_label: string; to_label: string; actor_name: string; transition_reason: string | null }[];
  };
  linkedAssets:     { id: string; name: string }[];
  relations:        ReturnType<typeof useTicketData>['relations'];
  onAddRelation:    (targetId: string, relationType: string, notes?: string) => Promise<void>;
  onRemoveRelation: (relId: string) => void;
  onSearchTickets:  (q: string, exclude: string) => Promise<{ id: string; title: string; priority: string; state_label: string; is_final: boolean }[]>;
  mutPending:       { addRel: boolean; removeRel: boolean };
}) {
  const router = useRouter();
  const [showRelForm,  setShowRelForm]  = useState(false);
  const [relSearch,    setRelSearch]    = useState('');
  const [relType,      setRelType]      = useState('related');
  const [relNotes,     setRelNotes]     = useState('');
  const [relTarget,    setRelTarget]    = useState<{ id: string; title: string } | null>(null);
  const [relResults,   setRelResults]   = useState<{ id: string; title: string; priority: string; state_label: string; is_final: boolean }[]>([]);
  const [relSearching, setRelSearching] = useState(false);

  async function handleRelSearch(q: string) {
    setRelSearch(q);
    setRelTarget(null);
    if (q.trim().length < 2) { setRelResults([]); return; }
    setRelSearching(true);
    try { setRelResults(await onSearchTickets(q.trim(), ticketId)); }
    finally { setRelSearching(false); }
  }

  async function handleAddRelation() {
    if (!relTarget) return;
    await onAddRelation(relTarget.id, relType, relNotes.trim() || undefined);
    setShowRelForm(false); setRelSearch(''); setRelTarget(null); setRelResults([]); setRelNotes('');
  }

  const firstAsset = linkedAssets[0] ?? null;

  const { data: prevTickets } = useQuery({
    queryKey: ['prev-tickets', ticketId, firstAsset?.id],
    queryFn:  () => ticketsService.getAssetPrevTickets(ticketId, firstAsset!.id),
    enabled:  !!firstAsset,
    staleTime: 60_000,
  });

  const techHistory = ticket.assignments.filter(a => a.role === 'owner');

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Solicitante */}
      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Solicitante</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{ticket.creator_name?.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: 0 }}>{ticket.creator_name}</p>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>Creó el ticket</p>
          </div>
        </div>
      </div>

      {/* Historial de asignaciones */}
      {techHistory.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Historial de asignaciones</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {techHistory.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: a.is_active ? '#ff5e3a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: a.is_active ? '#fff' : '#94a3b8' }}>{a.user_name?.charAt(0).toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: a.is_active ? '#0e2235' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_name}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>{fmtRelative(a.assigned_at)}</p>
                </div>
                {a.is_active && (
                  <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#fff5f3', color: '#ff5e3a', border: '1px solid #ffd0c4', flexShrink: 0 }}>ACTUAL</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detalles del ticket */}
      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Detalles del ticket</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {([
            ['Módulo',       ticket.module_name],
            ['Categoría',    ticket.category_name],
            ['Ambiente',     ticket.environment_name],
            ['Tipo de daño', ticket.damage_type_label],
            ['Prioridad',    ticket.priority],
            ['Urgencia',     ticket.urgency],
            ['Impacto',      ticket.impact],
            ['Creado',       fmtDate(ticket.created_at)],
            ['ID',           '#' + ticket.id.slice(0, 8).toUpperCase()],
            ...(ticket.reprocess_count > 0 ? [['Reaperturas', String(ticket.reprocess_count)]] : []),
          ] as [string, string | null | undefined][]).map(([lbl, val]) => val ? (
            <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>{lbl}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{val}</span>
            </div>
          ) : null)}
        </div>
      </div>

      {/* Relacionados */}
      {(relations.length > 0 || !ticket.is_final) && (
        <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>
            Tickets relacionados{relations.length > 0 ? ` (${relations.length})` : ''}
          </p>
          {relations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
              {relations.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#0e2235', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.related_title ?? r.id.slice(0, 8)}</p>
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>{r.relation_type}</p>
                  </div>
                  <button type="button" onClick={() => router.push('/helpdesk/ticket/' + r.related_id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, lineHeight: 0 }}>
                    <ChevronRight size={11} />
                  </button>
                  {!ticket.is_final && (
                    <button type="button" disabled={mutPending.removeRel} onClick={() => onRemoveRelation(r.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 0, lineHeight: 0 }}>
                      <Unlink size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!ticket.is_final && !showRelForm && (
            <button type="button" onClick={() => setShowRelForm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#64748b', background: 'none', border: '1px dashed #e2e8f0', borderRadius: 7, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
              <Link2 size={11} /> Vincular ticket
            </button>
          )}
          {!ticket.is_final && showRelForm && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '11px 12px' }}>
              <div style={{ position: 'relative', marginBottom: 6 }}>
                <Search size={10} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input type="text" placeholder="Buscar ticket…" value={relSearch}
                  onChange={e => handleRelSearch(e.target.value)}
                  style={{ width: '100%', padding: '6px 7px 6px 22px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                {relSearching && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>…</span>}
              </div>
              {relResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                  {relResults.map(r => (
                    <button key={r.id} type="button" onClick={() => setRelTarget(r)}
                      style={{ fontSize: 11, padding: '5px 8px', borderRadius: 5, border: `1px solid ${relTarget?.id === r.id ? '#6366f1' : '#e2e8f0'}`, background: relTarget?.id === r.id ? '#eef2ff' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      #{r.id.slice(0, 6)} — {r.title}
                    </button>
                  ))}
                </div>
              )}
              <select value={relType} onChange={e => setRelType(e.target.value)}
                style={{ width: '100%', padding: '5px 7px', borderRadius: 5, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', background: '#fff', marginBottom: 5, boxSizing: 'border-box' }}>
                <option value="related">Relacionado</option>
                <option value="duplicado">Duplicado</option>
                <option value="bloquea">Bloquea</option>
                <option value="bloqueado_por">Bloqueado por</option>
              </select>
              <div style={{ display: 'flex', gap: 5 }}>
                <button type="button" onClick={() => { setShowRelForm(false); setRelSearch(''); setRelTarget(null); setRelResults([]); }}
                  style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                  Cancelar
                </button>
                <button type="button" disabled={!relTarget || mutPending.addRel} onClick={handleAddRelation}
                  style={{ flex: 1, padding: '6px', borderRadius: 5, border: 'none', background: relTarget ? '#6366f1' : '#e2e8f0', color: '#fff', fontSize: 11, fontWeight: 700, cursor: relTarget ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  {mutPending.addRel ? '…' : 'Vincular'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Escalation history */}
      {ticket.escalated && (() => {
        const escalEvents = (ticket.history ?? []).filter(h =>
          h.to_label.toLowerCase().includes('escal') ||
          (h.transition_reason ?? '').toLowerCase().includes('escal') ||
          (h.transition_reason ?? '').toLowerCase().includes('auto-escal')
        );
        return (
          <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #fed7aa', padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Historial de escalaciones</p>
            {escalEvents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {escalEvents.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', marginTop: 4, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 1px', fontSize: 11, fontWeight: 700, color: '#9a3412' }}>
                        {ev.from_label} → {ev.to_label}
                      </p>
                      {ev.transition_reason && (
                        <p style={{ margin: '0 0 1px', fontSize: 10, color: '#c2410c' }}>"{ev.transition_reason}"</p>
                      )}
                      <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>
                        {ev.actor_name} · {fmtDate(ev.transitioned_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <AlertTriangle size={12} style={{ color: '#f97316', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: '#9a3412' }}>Ticket escalado</p>
                  {ticket.escalation_note && <p style={{ margin: 0, fontSize: 10, color: '#c2410c' }}>"{ticket.escalation_note}"</p>}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Recurrence context */}
      {(() => {
        const reprocess = ticket.reprocess_count ?? 0;
        const prevCount = prevTickets?.length ?? 0;
        if (reprocess === 0 && prevCount === 0) return null;
        return (
          <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e0e7ff', padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Contexto de recurrencia</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reprocess > 0 && (
                <div style={{ display: 'flex', gap: 8, padding: '7px 9px', background: '#eef2ff', borderRadius: 7 }}>
                  <span style={{ fontSize: 16 }}>🔁</span>
                  <div>
                    <p style={{ margin: '0 0 1px', fontSize: 11, fontWeight: 700, color: '#4338ca' }}>
                      Reabierto {reprocess} {reprocess === 1 ? 'vez' : 'veces'}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: '#6366f1' }}>Este ticket fue reabierto después de marcar como resuelto</p>
                  </div>
                </div>
              )}
              {firstAsset && prevCount > 0 && (
                <div style={{ display: 'flex', gap: 8, padding: '7px 9px', background: '#fdf4ff', borderRadius: 7 }}>
                  <span style={{ fontSize: 16 }}>📌</span>
                  <div>
                    <p style={{ margin: '0 0 1px', fontSize: 11, fontWeight: 700, color: '#7e22ce' }}>
                      {prevCount} ticket{prevCount !== 1 ? 's' : ''} anterior{prevCount !== 1 ? 'es' : ''} en {firstAsset.name}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: '#9333ea' }}>
                      {prevCount >= 3 ? '⚠ Activo con incidencias repetidas' : 'Historial de incidencias en este activo'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Base de conocimiento */}
      {(ticket.category_name || ticket.damage_type_label) && (
        <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 8px' }}>Base de conocimiento</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 10px' }}>
            Artículos relacionados con <strong style={{ color: '#475569' }}>{ticket.damage_type_label ?? ticket.category_name}</strong>
          </p>
          <KbSuggestions moduleId={ticket.module_id} query={ticket.damage_type_label ?? ticket.category_name ?? ''} />
        </div>
      )}

    </div>
  );
}
