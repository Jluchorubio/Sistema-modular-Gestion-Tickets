'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronRight, ChevronDown, Clock, AlertTriangle, CheckCircle2, XCircle,
  Paperclip, Star, Monitor, ChevronUp, AlertCircle, Tag,
  Link2, Search, Unlink, Phone, X, BookOpen, ExternalLink,
} from 'lucide-react';
import { TicketTimeline } from './TicketTimeline';
import { TicketSidebar } from './TicketSidebar';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { useAuthStore } from '@/stores/auth.store';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import {
  type TicketPriority,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  ASSET_STATUS_COLORS, ASSET_STATUS_LABELS,
  TECH_AVAIL_COLORS, TECH_AVAIL_LABELS,
  ticketsService,
} from '@/services/tickets.service';
import {
  PROVIDER_LABELS, PROVIDER_COLORS,
  STATUS_LABELS, STATUS_COLORS,
} from '@/services/meetings.service';
import { inventoryService } from '@/services/inventory.service';
import { docsService } from '@/app/(app)/helpdesk/knowledge/_lib/knowledge.service';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { fmtDate, fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import type { TechAvailStatus } from '@/types/module.types';
import styles from '../tickets.module.css';
import { useTicketData, type LocalGuest } from './hooks/useTicketData';
import { useTicketActions } from './hooks/useTicketActions';

/* ── Badges ──────────────────────────────────────────────────────────── */

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const color = TICKET_PRIORITY_COLORS[priority];
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}

function StateBadge({ label, isFinal }: { label: string; isFinal: boolean }) {
  const color = isFinal ? '#22C55E' : '#6366F1';
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

/* ── Approval expiry countdown ───────────────────────────────────────── */
function useApprovalCountdown(expiresAt: string | null) {
  const [label, setLabel] = useState('');
  const [urgent, setUrgent] = useState(false);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setLabel('Expirado'); setUrgent(true); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setUrgent(diff < 3600000 * 4);
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return { label, urgent };
}

/* ── Tab types ───────────────────────────────────────────────────────── */
type WorkspaceTab = 'timeline' | 'activo' | 'colaboracion' | 'detalles';

/* ══════════════════════════════════════════════════════════════════════
   SUB-TABS
   ══════════════════════════════════════════════════════════════════════ */

/* ── Activo/CMDB tab ─────────────────────────────────────────────────── */
function AssetCmdbTab({
  ticketId,
  linkedAssets,
}: {
  ticketId: string;
  linkedAssets: ReturnType<typeof useTicketData>['linkedAssets'];
}) {
  const router = useRouter();
  const [linkingAssetId, setLinkingAssetId] = useState('');
  const [linkSearchQ,    setLinkSearchQ]    = useState('');
  const [linkResults,    setLinkResults]    = useState<{ id: string; name: string; status: string }[]>([]);
  const [linkSearching,  setLinkSearching]  = useState(false);
  const [linkPending,    setLinkPending]    = useState(false);
  const [unlinkPending,  setUnlinkPending]  = useState<string | null>(null);

  const asset = linkedAssets[0];

  const { data: assetDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['asset-detail', asset?.id],
    queryFn:  () => inventoryService.getOne(asset!.id),
    enabled:  !!asset?.id,
    staleTime: 5 * 60_000,
  });

  const { data: custodio } = useQuery({
    queryKey: ['asset-assignment', asset?.id],
    queryFn:  () => inventoryService.getCurrentAssignment(asset!.id),
    enabled:  !!asset?.id,
    staleTime: 5 * 60_000,
  });

  const { data: prevTickets = [] } = useQuery({
    queryKey: ['asset-prev-tickets', ticketId, asset?.id],
    queryFn:  () => ticketsService.getAssetPrevTickets(ticketId, asset!.id),
    enabled:  !!asset?.id,
    staleTime: 5 * 60_000,
  });

  async function handleSearch(q: string) {
    setLinkSearchQ(q);
    setLinkingAssetId('');
    if (q.trim().length < 2) { setLinkResults([]); return; }
    setLinkSearching(true);
    try {
      const items = await inventoryService.getAll(undefined, undefined, q.trim());
      setLinkResults(items.slice(0, 8).map(i => ({ id: i.id, name: i.name, status: i.status })));
    } finally { setLinkSearching(false); }
  }

  async function handleLink() {
    if (!linkingAssetId) return;
    setLinkPending(true);
    try { await ticketsService.linkAsset(ticketId, linkingAssetId); setLinkSearchQ(''); setLinkingAssetId(''); setLinkResults([]); }
    finally { setLinkPending(false); }
  }

  async function handleUnlink(assetId: string) {
    setUnlinkPending(assetId);
    try { await ticketsService.unlinkAsset(ticketId, assetId); }
    finally { setUnlinkPending(null); }
  }

  if (!asset) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ padding: '20px', borderRadius: 10, border: '2px dashed #e2e8f0', textAlign: 'center', marginBottom: 20 }}>
          <Monitor size={28} style={{ color: '#cbd5e1', marginBottom: 8 }} />
          <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '0 0 4px' }}>Sin activo vinculado</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Asocia un activo del inventario para ver su contexto CMDB.</p>
        </div>
        <PermissionGate perm="helpdesk:tickets:edit">
          <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#0e2235', margin: '0 0 10px' }}>Vincular activo</p>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="text" placeholder="Buscar por nombre…" value={linkSearchQ}
                onChange={e => handleSearch(e.target.value)}
                style={{ width: '100%', padding: '7px 9px 7px 26px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              {linkSearching && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#94a3b8' }}>…</span>}
            </div>
            {linkResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                {linkResults.map(r => (
                  <button key={r.id} type="button" onClick={() => setLinkingAssetId(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 6, border: `1px solid ${linkingAssetId === r.id ? '#ff5e3a' : '#e2e8f0'}`, background: linkingAssetId === r.id ? '#fff5f3' : '#f8fafc', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    <Monitor size={11} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, color: '#334155' }}>{r.name}</span>
                    <span style={{ fontSize: 9, color: '#94a3b8' }}>{r.status}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" disabled={!linkingAssetId || linkPending} onClick={handleLink}
              style={{ width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: linkingAssetId && !linkPending ? '#ff5e3a' : '#e2e8f0', color: linkingAssetId ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: linkingAssetId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              {linkPending ? 'Vinculando…' : 'Vincular activo'}
            </button>
          </div>
        </PermissionGate>
      </div>
    );
  }

  const sc = ASSET_STATUS_COLORS[asset.status as keyof typeof ASSET_STATUS_COLORS] ?? '#94a3b8';

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Monitor size={18} style={{ color: '#64748b' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#0e2235' }}>{asset.name}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${sc}18`, color: sc, border: `1px solid ${sc}30` }}>
              {ASSET_STATUS_LABELS[asset.status as keyof typeof ASSET_STATUS_LABELS] ?? asset.status}
            </span>
            {assetDetail?.category_name && <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{assetDetail.category_name}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => router.push('/inventory/' + asset.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
            <ExternalLink size={10} /> Ver ficha
          </button>
          <PermissionGate perm="helpdesk:tickets:edit">
            <button type="button" disabled={unlinkPending === asset.id} onClick={() => handleUnlink(asset.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Unlink size={10} /> {unlinkPending === asset.id ? '…' : 'Desvincular'}
            </button>
          </PermissionGate>
        </div>
      </div>

      {detailLoading ? (
        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Cargando datos CMDB…</p>
      ) : assetDetail && (
        <>
          <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            {([
              ['N° de serie',     assetDetail.serial_number],
              ['Ubicación',       assetDetail.location_name],
              ['Ambiente',        assetDetail.environment_name],
              ['Custodio actual', custodio?.user_name ?? asset.assigned_to_name ?? null],
              ['Tickets totales', String(assetDetail.tickets_count)],
            ] as [string, string | null][]).map(([lbl, val]) => val ? (
              <div key={lbl}>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 1px' }}>{lbl}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0 }}>{val}</p>
              </div>
            ) : null)}
          </div>

          {assetDetail.field_schema?.length > 0 && assetDetail.specifications && (
            <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
              <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Especificaciones</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                {assetDetail.field_schema.map(f => {
                  const val = assetDetail.specifications![f.key];
                  if (val === undefined || val === null || val === '') return null;
                  return (
                    <div key={f.key}>
                      <p style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 1px' }}>{f.label}</p>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0 }}>{String(val)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>
          Incidentes en este activo{prevTickets.length > 0 ? ` (${prevTickets.length})` : ''}
        </p>
        {prevTickets.length === 0 ? (
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Sin incidentes previos en este activo.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {prevTickets.slice(0, 8).map((pt: any) => (
              <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: pt.is_final ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.title}</span>
                <span style={{ fontSize: 9, color: '#94a3b8', flexShrink: 0 }}>{pt.state_label}</span>
              </div>
            ))}
            {prevTickets.length > 8 && <p style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 0', textAlign: 'center' }}>+{prevTickets.length - 8} más</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Colaboración tab ────────────────────────────────────────────────── */
function ColaboracionTab({
  ticketId, ticket, allGuests, meetings, technicians,
  onInstantCall, onRemoveGuest,
  onCancelMeeting, onScheduleMeeting,
  mutPending,
}: {
  ticketId:          string;
  ticket:            { is_final: boolean };
  allGuests:         LocalGuest[];
  meetings:          ReturnType<typeof useTicketData>['meetings'];
  technicians:       ReturnType<typeof useTicketData>['technicians'];
  onInstantCall:     (userId: string, setUserId: (v: string) => void, setCalling: (v: boolean) => void) => void;
  onRemoveGuest:     (id: string) => void;
  onCancelMeeting:   (meetingId: string) => void;
  onScheduleMeeting: (data: { provider: string; reason: string; scheduledAt: string; url?: string }) => void;
  mutPending:        { schedule: boolean; cancelMeet: boolean };
}) {
  const [selectedUserId,  setSelectedUserId]  = useState('');
  const [isCalling,       setIsCalling]       = useState(false);
  const [showTechPicker,  setShowTechPicker]  = useState(false);
  const [meetingProvider, setMeetingProvider] = useState<'google_meet' | 'teams' | 'zoom' | 'internal'>('google_meet');
  const [meetingReason,   setMeetingReason]   = useState('Asesoramiento técnico');
  const [meetingUrl,      setMeetingUrl]      = useState('');
  const [scheduledDate,   setScheduledDate]   = useState('');
  const [scheduledTime,   setScheduledTime]   = useState('10:00');

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Participantes */}
      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 12px' }}>
          Participantes ({allGuests.length})
        </p>
        {allGuests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {allGuests.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{g.name.charAt(0).toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                  <p style={{ fontSize: 9, color: '#94a3b8', margin: 0 }}>{g.role}</p>
                </div>
                {g.isLocal && (
                  <button type="button" onClick={() => onRemoveGuest(g.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 2, lineHeight: 0 }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!ticket.is_final && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', margin: '0 0 6px' }}>Invitar técnico</p>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <button type="button" onClick={() => setShowTechPicker(v => !v)}
                style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: `1px solid ${showTechPicker ? '#0e2235' : '#e2e8f0'}`, background: '#fff', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxSizing: 'border-box', textAlign: 'left' }}>
                {selectedUserId ? (() => {
                  const t = technicians.find(u => u.id === selectedUserId);
                  const ac = TECH_AVAIL_COLORS[t?.avail_status ?? 'offline'];
                  return t ? (
                    <><span style={{ width: 7, height: 7, borderRadius: '50%', background: ac, flexShrink: 0 }} /><span style={{ flex: 1, color: '#334155' }}>{t.first_name} {t.last_name}</span></>
                  ) : <span style={{ color: '#94a3b8', flex: 1 }}>Seleccionar…</span>;
                })() : <span style={{ color: '#94a3b8', flex: 1 }}>Seleccionar técnico…</span>}
                <ChevronDown size={11} style={{ color: '#94a3b8', flexShrink: 0, transform: showTechPicker ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {showTechPicker && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(14,34,53,.12)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                  {[...technicians].sort((a, b) => { const o: Record<string,number> = {disponible:0,ocupado:1,en_reunion:2,ausente:3,fuera_horario:4,offline:5}; return (o[a.avail_status]??9)-(o[b.avail_status]??9); }).map(u => {
                    const ac = TECH_AVAIL_COLORS[u.avail_status ?? 'offline'];
                    const sel = selectedUserId === u.id;
                    return (
                      <button key={u.id} type="button" onClick={() => { setSelectedUserId(u.id); setShowTechPicker(false); }}
                        style={{ width: '100%', padding: '7px 10px', border: 'none', background: sel ? '#f0f4ff' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', textAlign: 'left' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ac, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 11, color: '#334155', fontWeight: sel ? 700 : 400 }}>{u.first_name} {u.last_name}</span>
                        <span style={{ fontSize: 9, color: ac, fontWeight: 600 }}>{TECH_AVAIL_LABELS[u.avail_status as TechAvailStatus]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="button" disabled={!selectedUserId || isCalling}
              onClick={() => { onInstantCall(selectedUserId, setSelectedUserId, setIsCalling); setShowTechPicker(false); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: selectedUserId && !isCalling ? '#0e2235' : '#e2e8f0', color: selectedUserId ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: selectedUserId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              <Phone size={11} /> {isCalling ? 'Invitando…' : 'Invitar al ticket'}
            </button>
          </div>
        )}
      </div>

      {/* Reuniones */}
      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 12px' }}>
          Reuniones{meetings.length > 0 ? ` (${meetings.length})` : ''}
        </p>
        {meetings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {meetings.map(m => {
              const pc  = PROVIDER_COLORS[m.provider] ?? '#64748b';
              const sc2 = STATUS_COLORS[m.status]    ?? '#64748b';
              const dt  = new Date(m.scheduled_at);
              return (
                <div key={m.id} style={{ padding: '9px 11px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', opacity: m.status === 'cancelled' ? .5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: pc, textTransform: 'uppercase' }}>{PROVIDER_LABELS[m.provider]}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: sc2 }}>{STATUS_LABELS[m.status]}</span>
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '0 0 1px' }}>{m.reason}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                    {dt.toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {m.meeting_url && m.status !== 'cancelled' && (
                    <a href={m.meeting_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: pc, textDecoration: 'none', display: 'inline-block', marginTop: 3 }}>Unirse</a>
                  )}
                  {m.status === 'scheduled' && (
                    <button type="button" disabled={mutPending.cancelMeet} onClick={() => onCancelMeeting(m.id)}
                      style={{ display: 'block', marginTop: 3, fontSize: 9, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Cancelar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!ticket.is_final && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', margin: 0 }}>Programar reunión</p>
            <select value={meetingProvider} onChange={e => setMeetingProvider(e.target.value as typeof meetingProvider)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }}>
              <option value="google_meet">Google Meet</option>
              <option value="teams">Microsoft Teams</option>
              <option value="zoom">Zoom</option>
              <option value="internal">Enlace interno</option>
            </select>
            <input value={meetingReason} onChange={e => setMeetingReason(e.target.value)} placeholder="Motivo *"
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none' }} />
              <select value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <input value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="URL de reunión (opcional)"
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
            <button type="button"
              disabled={!scheduledDate || !meetingReason.trim() || mutPending.schedule}
              onClick={() => onScheduleMeeting({ provider: meetingProvider, reason: meetingReason.trim(), scheduledAt: new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString(), url: meetingUrl.trim() || undefined })}
              style={{ width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: scheduledDate && meetingReason.trim() ? '#ff5e3a' : '#e2e8f0', color: scheduledDate && meetingReason.trim() ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {mutPending.schedule ? 'Programando…' : 'Programar reunión'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── KB suggestions ─────────────────────────────────────────────────── */
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

/* ── Detalles tab ────────────────────────────────────────────────────── */
function DetallesTab({
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
    escalated?:      boolean;
    escalation_note?: string | null;
    history?:        { id: string; transitioned_at: string; from_label: string; to_label: string; actor_name: string; transition_reason: string | null }[];
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

  const techHistory = ticket.assignments.filter(a => a.role === 'owner');

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Solicitante */}
      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Solicitante</p>
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
          <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Historial de asignaciones</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {techHistory.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: a.is_active ? '#ff5e3a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: a.is_active ? '#fff' : '#94a3b8' }}>{a.user_name?.charAt(0).toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: a.is_active ? '#0e2235' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_name}</p>
                  <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>{fmtRelative(a.assigned_at)}</p>
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
        <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Detalles del ticket</p>
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
          <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>
            Tickets relacionados{relations.length > 0 ? ` (${relations.length})` : ''}
          </p>
          {relations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
              {relations.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#0e2235', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.related_title ?? r.id.slice(0, 8)}</p>
                    <p style={{ fontSize: 9, color: '#94a3b8', margin: '1px 0 0' }}>{r.relation_type}</p>
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
                {relSearching && <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 6 }}>…</span>}
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

      {/* Fase 4B — Escalation history */}
      {ticket.escalated && (() => {
        const escalEvents = (ticket.history ?? []).filter(h =>
          h.to_label.toLowerCase().includes('escal') ||
          (h.transition_reason ?? '').toLowerCase().includes('escal') ||
          (h.transition_reason ?? '').toLowerCase().includes('auto-escal')
        );
        return (
          <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #fed7aa', padding: '14px 16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Historial de escalaciones</p>
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
                      <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>
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

      {/* Fase 4C — Recurrence context */}
      {(() => {
        const firstAsset = linkedAssets[0] ?? null;
        const { data: prevTickets } = useQuery({
          queryKey: ['prev-tickets', ticketId, firstAsset?.id],
          queryFn:  () => ticketsService.getAssetPrevTickets(ticketId, firstAsset!.id),
          enabled:  !!firstAsset,
          staleTime: 60_000,
        });
        const reprocess = ticket.reprocess_count ?? 0;
        const prevCount = prevTickets?.length ?? 0;
        if (reprocess === 0 && prevCount === 0) return null;
        return (
          <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e0e7ff', padding: '14px 16px' }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Contexto de recurrencia</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reprocess > 0 && (
                <div style={{ display: 'flex', gap: 8, padding: '7px 9px', background: '#eef2ff', borderRadius: 7 }}>
                  <span style={{ fontSize: 16 }}>🔁</span>
                  <div>
                    <p style={{ margin: '0 0 1px', fontSize: 11, fontWeight: 700, color: '#4338ca' }}>
                      Reabierto {reprocess} {reprocess === 1 ? 'vez' : 'veces'}
                    </p>
                    <p style={{ margin: 0, fontSize: 9, color: '#6366f1' }}>Este ticket fue reabierto después de marcar como resuelto</p>
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
                    <p style={{ margin: 0, fontSize: 9, color: '#9333ea' }}>
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
          <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 8px' }}>Base de conocimiento</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 10px' }}>
            Artículos relacionados con <strong style={{ color: '#475569' }}>{ticket.damage_type_label ?? ticket.category_name}</strong>
          </p>
          <KbSuggestions moduleId={ticket.module_id} query={ticket.damage_type_label ?? ticket.category_name ?? ''} />
        </div>
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */

export function TicketWorkspace({ ticketId }: { ticketId: string }) {
  const router      = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;

  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const {
    ticket, isLoading, isError, error,
    technicians,
    attachments,
    existingRating,
    comments,
    timeline, timelineLoading,
    meetings,
    relations,
    linkedAssets,
    slaColor, slaLabel, slaCountdown,
    ownerAssignment,
    computeAllGuests,
    qc,
  } = useTicketData({ ticketId, helpdeskId });

  const [activeTab,       setActiveTab]       = useState<WorkspaceTab>('timeline');
  const [replyText,       setReplyText]       = useState('');
  const [commentType,     setCommentType]     = useState<'public' | 'internal'>('public');
  const [showRejectForm,  setShowRejectForm]  = useState(false);
  const [rejectReason,    setRejectReason]    = useState('');
  const [isApproving,     setIsApproving]     = useState(false);
  const [isRejecting,     setIsRejecting]     = useState(false);
  const [validationError, setValidationError] = useState('');
  const [showReopenForm,  setShowReopenForm]  = useState(false);
  const [reopenReason,    setReopenReason]    = useState('');
  const [isReopening,     setIsReopening]     = useState(false);
  const [localGuests,     setLocalGuests]     = useState<LocalGuest[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError,   setUploadError]   = useState('');
  const [ratingScore,   setRatingScore]   = useState(0);
  const [ratingHover,   setRatingHover]   = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [descExpanded,  setDescExpanded]  = useState(false);
  const [showToArticle, setShowToArticle] = useState(false);
  const [articleTitle,  setArticleTitle]  = useState('');
  const [articleContent,setArticleContent] = useState('');
  const [articleDone,   setArticleDone]   = useState<string | null>(null);

  const myModuleRole = currentUser?.module_roles?.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  const canEditKb = (currentUser?.is_superadmin ?? false) || ['admin_modulo', 'jefe_tecnico'].includes(myModuleRole ?? '');

  const toArticleMut = useMutation({
    mutationFn: (dto: { module_id: string; title: string; content: string }) =>
      ticketsService.convertToArticle(ticket!.id, dto),
    onSuccess: (art) => {
      setArticleDone(art.id);
      setShowToArticle(false);
    },
  });

  const {
    uploadMut, deletAttMut, addCommentMut, rateMut, transMut,
    scheduleMut, cancelMeetMut, addRelMut, removeRelMut,
    handleInstantCall, removeGuest,
    handleApprove, handleAcceptAndRate, handleReject, handleFileChange,
  } = useTicketActions({
    ticketId, technicians, qc,
    replyText, commentType, setReplyText,
    ratingScore, ratingComment, rejectReason,
    setIsApproving, setIsRejecting, setValidationError,
    setShowRejectForm, setRejectReason,
    setUploadError, localGuests, setLocalGuests,
  });

  const allGuests = useMemo<LocalGuest[]>(
    () => computeAllGuests(ticket?.assignments, localGuests),
    [ticket?.assignments, localGuests],
  );

  const approvalCountdown = useApprovalCountdown(ticket?.approval_expires_at ?? null);

  const TABS: { id: WorkspaceTab; label: string; badge?: number }[] = [
    { id: 'timeline',     label: 'Timeline' },
    { id: 'activo',       label: 'Activo / CMDB',  badge: linkedAssets.length || undefined },
    { id: 'colaboracion', label: 'Colaboración',   badge: (meetings.length + allGuests.length) || undefined },
    { id: 'detalles',     label: 'Detalles' },
  ];

  return (
    <div className={styles.hwPage}>
      {isLoading && (
        <div style={{ padding: '80px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando ticket…</div>
      )}

      {isError && (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <AlertTriangle size={32} style={{ color: '#ef4444', marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>No se pudo cargar el ticket</p>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
            {(error as any)?.response?.status === 404 ? 'El ticket no existe o fue eliminado.'
            : (error as any)?.response?.status === 403 ? 'No tienes permiso para ver este ticket.'
            : 'Error de conexión. Intenta de nuevo.'}
          </p>
          <button type="button" onClick={() => router.back()}
            style={{ fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0e2235', color: '#fff', cursor: 'pointer' }}>
            Volver
          </button>
        </div>
      )}

      {ticket && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f8fafc' }}>

          {/* HEADER */}
          <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button type="button" onClick={() => router.back()}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
              <ArrowLeft size={12} /> Volver
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
              <span>Mesa de Ayuda</span>
              <ChevronRight size={10} />
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ff5e3a', letterSpacing: '.03em' }}>#{ticket.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
              <StateBadge label={ticket.state_label} isFinal={ticket.is_final} />
              <PriorityBadge priority={ticket.priority} />
              {ticket.escalated && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>ESCALADO</span>
              )}
              {(ticket.reprocess_count ?? 0) > 0 && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: '#fdf4ff', color: '#7e22ce', border: '1px solid #e9d5ff' }}>
                  REINCIDENTE ×{ticket.reprocess_count}
                </span>
              )}
              {ticket.is_pause_state && ticket.history?.[0]?.transition_reason && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 4 }}>
                  ⏸ {ticket.history[0].transition_reason}
                </span>
              )}
              {slaCountdown && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: `${slaColor}15`, color: slaColor, border: `1px solid ${slaColor}30`, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={9} /> {slaCountdown}
                </span>
              )}
            </div>
          </div>

          {/* CONTEXT STRIP */}
          <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '0 20px', height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, overflowX: 'auto' }}>
            {ownerAssignment ? (
              <span style={{ fontSize: 10, color: '#475569', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                {ownerAssignment.user_name}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Sin asignar</span>
            )}
            <span style={{ width: 1, height: 14, background: '#e2e8f0', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>
              U: <strong style={{ color: '#64748b' }}>{ticket.urgency}</strong>
              {'  '}I: <strong style={{ color: '#64748b' }}>{ticket.impact}</strong>
            </span>
            {ticket.created_at && (
              <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                {fmtRelative(ticket.created_at)}
              </span>
            )}
          </div>

          {/* 2-COLUMN BODY */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', flex: 1, overflow: 'hidden' }}>

            {/* MAIN */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e2e8f0' }}>

              {/* TICKET DETAIL */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: '#0e2235', lineHeight: 1.3 }}>{ticket.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: ticket.description ? 10 : 0 }}>
                  <PriorityBadge priority={ticket.priority} />
                  {ticket.category_name && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{ticket.category_name}</span>}
                  {ticket.damage_category_label && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Tag size={8} /> {ticket.damage_category_label}
                    </span>
                  )}
                  {ticket.damage_type_label && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>{ticket.damage_type_label}</span>}
                  {ticket.environment_name && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>{ticket.environment_name}</span>}
                  {linkedAssets[0] && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Monitor size={9} /> {linkedAssets[0].name}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                    Solicitado por <strong style={{ color: '#475569' }}>{ticket.creator_name}</strong> · #{ticket.id.slice(0,8).toUpperCase()}
                  </span>
                </div>
                {ticket.custom_damage_description && (
                  <div style={{ margin: '8px 0 2px', padding: '7px 10px', borderRadius: 7, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 11, color: '#92400e', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1, color: '#d97706' }} />
                    <span><strong>Descripción del daño:</strong> {ticket.custom_damage_description}</span>
                  </div>
                )}
                {ticket.description && (
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: descExpanded ? undefined : 3, WebkitBoxOrient: 'vertical' as any } as React.CSSProperties}>
                      {ticket.description}
                    </p>
                    {ticket.description.length > 180 && (
                      <button type="button" onClick={() => setDescExpanded(v => !v)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4, fontSize: 10, fontWeight: 700, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                        {descExpanded ? <><ChevronUp size={10} /> Mostrar menos</> : <><ChevronDown size={10} /> Ver descripción completa</>}
                      </button>
                    )}
                  </div>
                )}

                {/* Convert to KB article */}
                {canEditKb && !articleDone && !showToArticle && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    <button type="button"
                      onClick={() => { setArticleTitle(ticket.title); setArticleContent(ticket.description ?? ''); setShowToArticle(true); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      <BookOpen size={11} /> Convertir a artículo de conocimiento
                    </button>
                  </div>
                )}
                {canEditKb && articleDone && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>Artículo creado.</span>
                    <button type="button" onClick={() => router.push(`/helpdesk/knowledge/docs/${articleDone}`)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      <ExternalLink size={10} /> Ver artículo
                    </button>
                  </div>
                )}
                {canEditKb && showToArticle && (
                  <div style={{ marginTop: 10, padding: 14, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px' }}>Nuevo artículo de conocimiento</p>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 3 }}>Título</label>
                      <input value={articleTitle} onChange={e => setArticleTitle(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 3 }}>Contenido</label>
                      <textarea value={articleContent} onChange={e => setArticleContent(e.target.value)} rows={5}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button"
                        disabled={!articleTitle.trim() || !articleContent.trim() || toArticleMut.isPending}
                        onClick={() => toArticleMut.mutate({ module_id: ticket.module_id, title: articleTitle.trim(), content: articleContent.trim() })}
                        style={{ padding: '6px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!articleTitle.trim() || !articleContent.trim()) ? 0.5 : 1 }}>
                        {toArticleMut.isPending ? 'Creando…' : 'Crear artículo'}
                      </button>
                      <button type="button" onClick={() => setShowToArticle(false)}
                        style={{ padding: '6px 12px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ESCALATION BANNERS */}
              {ticket.escalated && ticket.escalation_note && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid #fed7aa', background: '#fff7ed', flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <AlertTriangle size={14} style={{ color: '#c2410c', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 2 }}>Motivo de escalamiento</span>
                    <span style={{ fontSize: 12, color: '#92400e' }}>{ticket.escalation_note}</span>
                  </div>
                </div>
              )}
              {ticket.escalated && !ticket.escalation_note && (
                <div style={{ padding: '8px 20px', borderBottom: '1px solid #fed7aa', background: '#fff7ed', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={13} style={{ color: '#c2410c' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c' }}>Este ticket fue escalado automáticamente por recurrencia.</span>
                </div>
              )}

              {/* TECH APPROVAL BANNER — visible to agents/admins, not the creator */}
              {ticket.is_approval_state && currentUser?.id !== ticket.created_by && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid #fde68a', background: '#fffbeb', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.05em' }}>Esperando aprobación del usuario</span>
                    <span style={{ fontSize: 11, color: '#a16207', marginLeft: 6 }}>
                      — {ticket.creator_name} debe aceptar o reabrir
                    </span>
                  </div>
                  {approvalCountdown.label && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, flexShrink: 0, background: approvalCountdown.urgent ? '#fef2f2' : '#f0fdf4', color: approvalCountdown.urgent ? '#dc2626' : '#16a34a', border: `1px solid ${approvalCountdown.urgent ? '#fecaca' : '#bbf7d0'}`, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={9} /> Auto-cierre en {approvalCountdown.label}
                    </span>
                  )}
                </div>
              )}

              {/* APPROVAL BANNER */}
              {ticket.is_approval_state && currentUser?.id === ticket.created_by && (
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fffbeb', flexShrink: 0 }}>
                  {!showRejectForm ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 2 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={14} style={{ color: '#22c55e' }} /> Solución aplicada — ¿quedaste satisfecho?
                        </p>
                        {approvalCountdown.label && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, flexShrink: 0, background: approvalCountdown.urgent ? '#fef2f2' : '#fef3c7', color: approvalCountdown.urgent ? '#dc2626' : '#92400e', border: `1px solid ${approvalCountdown.urgent ? '#fecaca' : '#fde68a'}`, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={9} /> Vence en {approvalCountdown.label}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: '#a16207', margin: '0 0 12px' }}>Califica la atención antes de aceptar. Puedes reabrir si la solución no es correcta.</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        {[1,2,3,4,5].map(s => (
                          <button key={s} type="button" onClick={() => setRatingScore(s)} onMouseEnter={() => setRatingHover(s)} onMouseLeave={() => setRatingHover(0)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
                            <Star size={22} fill={(ratingHover || ratingScore) >= s ? '#f59e0b' : 'none'} stroke={(ratingHover || ratingScore) >= s ? '#f59e0b' : '#d1d5db'} />
                          </button>
                        ))}
                        {ratingScore > 0 && <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, marginLeft: 4 }}>{['','Muy malo','Malo','Regular','Bueno','Excelente'][ratingScore]}</span>}
                      </div>
                      <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Comentario opcional…" rows={2}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #fde68a', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button type="button" onClick={handleAcceptAndRate} disabled={isApproving || ratingScore === 0}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 7, border: 'none', background: ratingScore > 0 && !isApproving ? '#22c55e' : '#94a3b8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: ratingScore > 0 && !isApproving ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                          <CheckCircle2 size={12} />{isApproving ? 'Procesando…' : 'Aceptar y calificar'}
                        </button>
                        <button type="button" onClick={() => setShowRejectForm(true)}
                          style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Reabrir
                        </button>
                        {ratingScore === 0 && <span style={{ fontSize: 10, color: '#a16207', fontWeight: 600 }}>↑ Selecciona estrellas para aceptar</span>}
                      </div>
                    </>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', margin: '0 0 8px' }}>Motivo de reapertura</p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Describe por qué no fue resuelto…" rows={2}
                          style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #fecaca', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <button type="button" onClick={handleReject} disabled={isRejecting || !rejectReason.trim()}
                            style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: isRejecting || !rejectReason.trim() ? '#94a3b8' : '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {isRejecting ? '…' : 'Confirmar'}
                          </button>
                          <button type="button" onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                            style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {validationError && <p style={{ fontSize: 11, color: '#dc2626', margin: '8px 0 0' }}>{validationError}</p>}
                </div>
              )}

              {/* RATING — closed without rating */}
              {ticket.is_final && currentUser?.id === ticket.created_by && !existingRating && (
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff7ed', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Star size={13} /> ¿Cómo fue la atención?
                  </p>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {[1,2,3,4,5].map(s => (
                      <button key={s} type="button" onClick={() => setRatingScore(s)} onMouseEnter={() => setRatingHover(s)} onMouseLeave={() => setRatingHover(0)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
                        <Star size={22} fill={(ratingHover || ratingScore) >= s ? '#f59e0b' : 'none'} stroke={(ratingHover || ratingScore) >= s ? '#f59e0b' : '#d1d5db'} />
                      </button>
                    ))}
                    {ratingScore > 0 && <span style={{ fontSize: 11, color: '#92400e', alignSelf: 'center', marginLeft: 4, fontWeight: 700 }}>{['','Muy malo','Malo','Regular','Bueno','Excelente'][ratingScore]}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Comentario opcional…" rows={1}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid #fde68a', fontSize: 11, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
                    <button type="button" disabled={ratingScore === 0 || rateMut.isPending}
                      onClick={() => rateMut.mutate({ score_overall: ratingScore, comment: ratingComment || undefined })}
                      style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: ratingScore > 0 ? '#f59e0b' : '#e2e8f0', color: ratingScore > 0 ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: ratingScore > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {rateMut.isPending ? '…' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}

              {/* RATING submitted */}
              {(ticket.is_final || ticket.is_approval_state) && currentUser?.id === ticket.created_by && existingRating && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#f0fdf4', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>Calificación enviada</span>
                  <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                    {[1,2,3,4,5].map(s => <Star key={s} size={12} fill={s <= existingRating.score_overall ? '#f59e0b' : 'none'} stroke={s <= existingRating.score_overall ? '#f59e0b' : '#d1d5db'} />)}
                  </div>
                  {existingRating.comment && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4, fontStyle: 'italic' }}>"{existingRating.comment}"</span>}
                </div>
              )}

              {/* FORCE-REOPEN */}
              {ticket.is_final && (
                <PermissionGate perm="helpdesk:tickets:edit">
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                    {!showReopenForm ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <XCircle size={13} style={{ color: '#64748b', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>Ticket cerrado. Puedes reabrirlo si fue resuelto incorrectamente.</span>
                        <button type="button" onClick={() => setShowReopenForm(true)}
                          style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          Reabrir
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: '0 0 8px' }}>Motivo de reapertura</p>
                        {(ticket.reprocess_count ?? 0) >= 3 && (
                          <p style={{ margin: '0 0 7px', fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                            ⚠ Reapertura #{(ticket.reprocess_count ?? 0) + 1} — la prioridad se elevará a Alta automáticamente.
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} placeholder="Describe por qué se reabre este ticket…" rows={2}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <button type="button" disabled={isReopening || !reopenReason.trim()}
                              onClick={async () => {
                                if (!reopenReason.trim()) return;
                                setIsReopening(true);
                                try {
                                  await ticketsService.forceReopen(ticketId, reopenReason);
                                  qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
                                  qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
                                  setShowReopenForm(false); setReopenReason('');
                                } finally { setIsReopening(false); }
                              }}
                              style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: isReopening || !reopenReason.trim() ? '#94a3b8' : '#0e2235', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {isReopening ? '…' : 'Confirmar'}
                            </button>
                            <button type="button" onClick={() => { setShowReopenForm(false); setReopenReason(''); }}
                              style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </PermissionGate>
              )}

              {/* TAB BAR */}
              <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 20px', display: 'flex', gap: 0, flexShrink: 0 }}>
                {TABS.map(tab => (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                    style={{ padding: '10px 14px', fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 500, color: activeTab === tab.id ? '#0e2235' : '#94a3b8', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? '#ff5e3a' : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'color .15s' }}>
                    {tab.label}
                    {tab.badge ? (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, background: activeTab === tab.id ? '#ff5e3a' : '#e2e8f0', color: activeTab === tab.id ? '#fff' : '#64748b' }}>{tab.badge}</span>
                    ) : null}
                  </button>
                ))}
              </div>

              {/* TAB CONTENT */}
              <div style={{ flex: 1, overflowY: 'auto' }}>

                {activeTab === 'timeline' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                      <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 12px' }}>Actividad</p>
                      <TicketTimeline events={timeline} isLoading={timelineLoading} autoScroll />
                    </div>
                    <PermissionGate perm="helpdesk:comments:add">
                      {!ticket.is_final && (
                        <div style={{ borderTop: '2px solid #f1f5f9', padding: '14px 20px', flexShrink: 0, background: '#fff' }}>
                          <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={handleFileChange} />
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{currentUser?.first_name?.charAt(0).toUpperCase() ?? 'T'}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                              <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                                placeholder={commentType === 'internal' ? '🔒 Nota interna — visible solo para el equipo técnico...' : 'Escribe tu respuesta al solicitante...'}
                                rows={replyText ? 3 : 2}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: `1px solid ${commentType === 'internal' ? '#fde68a' : '#e2e8f0'}`, background: commentType === 'internal' ? '#fffbeb' : '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', transition: 'border-color .15s, background .15s' }}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && replyText.trim()) { e.preventDefault(); addCommentMut.mutate(); } }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                                <select value={commentType} onChange={e => setCommentType(e.target.value as 'public' | 'internal')}
                                  style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#475569' }}>
                                  <option value="public">📢 Público</option>
                                  <option value="internal">🔒 Interno</option>
                                </select>
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  <Paperclip size={10} /> {uploadMut.isPending ? 'Subiendo...' : 'Adjuntar'}
                                </button>
                                {uploadError && <span style={{ fontSize: 10, color: '#dc2626' }}>{uploadError}</span>}
                                <div style={{ flex: 1 }} />
                                <span style={{ fontSize: 9, color: '#94a3b8' }}>Ctrl+Enter para enviar</span>
                                <button type="button" disabled={!replyText.trim() || addCommentMut.isPending} onClick={() => addCommentMut.mutate()}
                                  style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: replyText.trim() && !addCommentMut.isPending ? '#0e2235' : '#cbd5e1', color: '#fff', fontSize: 11, fontWeight: 700, cursor: replyText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                                  {addCommentMut.isPending ? 'Enviando...' : 'Enviar →'}
                                </button>
                              </div>
                              {addCommentMut.isError && <p style={{ fontSize: 10, color: '#dc2626', margin: '4px 0 0' }}>Error al enviar comentario.</p>}
                            </div>
                          </div>
                        </div>
                      )}
                    </PermissionGate>
                  </div>
                )}

                {activeTab === 'activo' && (
                  <AssetCmdbTab ticketId={ticketId} linkedAssets={linkedAssets} />
                )}

                {activeTab === 'colaboracion' && (
                  <ColaboracionTab
                    ticketId={ticketId}
                    ticket={{ is_final: ticket.is_final }}
                    allGuests={allGuests}
                    meetings={meetings}
                    technicians={technicians}
                    onInstantCall={handleInstantCall}
                    onRemoveGuest={removeGuest}
                    onCancelMeeting={(id) => cancelMeetMut.mutate(id)}
                    onScheduleMeeting={(data) => scheduleMut.mutate(data)}
                    mutPending={{ schedule: scheduleMut.isPending, cancelMeet: cancelMeetMut.isPending }}
                  />
                )}

                {activeTab === 'detalles' && (
                  <DetallesTab
                    ticketId={ticketId}
                    ticket={ticket}
                    linkedAssets={linkedAssets}
                    relations={relations}
                    onAddRelation={async (targetId, relationType, notes) => { await addRelMut.mutateAsync({ targetId, relationType, notes }); }}
                    onRemoveRelation={(relId) => removeRelMut.mutate(relId)}
                    onSearchTickets={(q, exclude) => ticketsService.searchTickets(q, exclude)}
                    mutPending={{ addRel: addRelMut.isPending, removeRel: removeRelMut.isPending }}
                  />
                )}

              </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <TicketSidebar
              ticketId={ticketId}
              ticket={ticket}
              ownerAssignment={ownerAssignment}
              technicians={technicians}
              sla={{ color: slaColor, label: slaLabel, countdown: slaCountdown }}
              onTransition={(transId, reason) => transMut.mutate({ transId, reason })}
              mutPending={{ transition: transMut.isPending }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
