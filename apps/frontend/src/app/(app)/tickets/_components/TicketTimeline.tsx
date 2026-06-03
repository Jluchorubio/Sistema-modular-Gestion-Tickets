'use client';

import { useRef, useEffect } from 'react';
import {
  MessageSquare, ArrowRight, UserPlus, Paperclip,
  CheckCircle2, XCircle, Lock, FileText, Image, File,
} from 'lucide-react';
import { fmtDate } from '@/lib/formatters';
import type { TicketTimelineEvent } from '@/services/tickets.service';

/* ── tokens ── */
const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

/* ── helpers ── */
function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string | null) {
  if (!mime) return <File size={14} />;
  if (mime.startsWith('image/')) return <Image size={14} />;
  if (mime.includes('pdf')) return <FileText size={14} />;
  return <File size={14} />;
}

/* ── Avatar ── */
function Avatar({ name, url, size = 32 }: { name: string | null; url?: string | null; size?: number }) {
  if (url) return (
    <img src={url} alt={name ?? ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: C.navy, color: '#fff', fontSize: size * 0.35, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

/* ── Event renderers ── */

function CommentEvent({ ev }: { ev: TicketTimelineEvent }) {
  const isInternal = ev.subtype === 'internal';
  const bg    = isInternal ? '#fffbeb' : '#fff';
  const border = isInternal ? '#fde68a' : C.border;
  const label = isInternal ? 'Nota interna' : 'Comentario';
  const labelColor = isInternal ? '#b45309' : C.muted;

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Avatar name={ev.user_name} url={ev.avatar_url} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{ev.user_name ?? 'Sistema'}</span>
          {isInternal && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 5, border: '1px solid #fde68a' }}>
              <Lock size={8} /> {label}
            </span>
          )}
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>{fmtDate(ev.created_at)}</span>
        </div>
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, borderTopLeftRadius: 3, padding: '10px 14px' }}>
          <p style={{ fontSize: 13, color: C.navy, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {ev.content}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusChangeEvent({ ev }: { ev: TicketTimelineEvent }) {
  const meta = ev.metadata ?? {};
  const isFinal = meta.is_final;
  const toColor = isFinal ? '#22c55e' : '#6366f1';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${toColor}14`, border: `2px solid ${toColor}35`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <ArrowRight size={13} style={{ color: toColor }} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.sub }}>
          <strong style={{ color: C.navy }}>{ev.user_name}</strong> cambió estado
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#f1f5f9', color: C.sub, border: `1px solid ${C.border}` }}>
          {meta.from_state}
        </span>
        <ArrowRight size={11} style={{ color: C.muted }} />
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: `${toColor}14`, color: toColor, border: `1px solid ${toColor}35` }}>
          {meta.to_state}
        </span>
        {ev.content && (
          <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>— {ev.content}</span>
        )}
      </div>
      <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{fmtDate(ev.created_at)}</span>
    </div>
  );
}

function AssignmentEvent({ ev }: { ev: TicketTimelineEvent }) {
  const meta = ev.metadata ?? {};
  const roleColors: Record<string, string> = {
    owner: '#1d4ed8', collaborator: '#6366f1', observer: '#64748b',
  };
  const roleLabels: Record<string, string> = {
    owner: 'responsable', collaborator: 'colaborador', observer: 'observador',
  };
  const role  = meta.role ?? ev.subtype ?? 'owner';
  const color = roleColors[role] ?? '#64748b';
  const label = roleLabels[role] ?? role;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${color}14`, border: `2px solid ${color}35`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <UserPlus size={12} style={{ color }} />
      </div>
      <p style={{ fontSize: 11, color: C.sub, margin: 0, flex: 1 }}>
        <strong style={{ color: C.navy }}>{ev.user_name}</strong> asignó a{' '}
        <strong style={{ color: C.navy }}>{meta.assignee_name}</strong> como{' '}
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: `${color}14`, color, border: `1px solid ${color}30` }}>
          {label}
        </span>
      </p>
      <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{fmtDate(ev.created_at)}</span>
    </div>
  );
}

function AttachmentEvent({ ev }: { ev: TicketTimelineEvent }) {
  const meta = ev.metadata ?? {};
  const isImage = (meta.mime_type ?? '').startsWith('image/');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eff6ff', border: '2px solid #bfdbfe', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Paperclip size={12} style={{ color: '#1d4ed8' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: C.sub, margin: '0 0 4px' }}>
          <strong style={{ color: C.navy }}>{ev.user_name}</strong> adjuntó un archivo
        </p>
        <a
          href={meta.file_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, background: '#fff', border: `1px solid ${C.border}`, fontSize: 11, color: C.navy, fontWeight: 600, textDecoration: 'none', maxWidth: '100%' }}
        >
          <span style={{ color: '#1d4ed8' }}>{fileIcon(meta.mime_type)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.content}</span>
          {meta.file_size && (
            <span style={{ fontSize: 9, color: C.muted, flexShrink: 0 }}>({fmtSize(meta.file_size)})</span>
          )}
        </a>
        {isImage && meta.file_url && (
          <div style={{ marginTop: 6 }}>
            <a href={meta.file_url} target="_blank" rel="noopener noreferrer">
              <img src={meta.file_url} alt={ev.content ?? ''} style={{ maxWidth: 200, maxHeight: 120, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.border}` }} />
            </a>
          </div>
        )}
      </div>
      <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{fmtDate(ev.created_at)}</span>
    </div>
  );
}

function ApprovalEvent({ ev }: { ev: TicketTimelineEvent }) {
  const status = ev.subtype ?? ev.metadata?.status ?? '';
  const approved = status === 'approved';
  const color = approved ? '#22c55e' : '#ef4444';
  const Icon  = approved ? CheckCircle2 : XCircle;
  const label = approved ? 'Aprobó la solución' : 'Rechazó la solución';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${color}14`, border: `2px solid ${color}35`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={13} style={{ color }} />
      </div>
      <p style={{ fontSize: 11, color: C.sub, margin: 0, flex: 1 }}>
        <strong style={{ color: C.navy }}>{ev.user_name}</strong>{' '}
        <span style={{ fontWeight: 700, color }}>{label}</span>
      </p>
      <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{fmtDate(ev.created_at)}</span>
    </div>
  );
}

/* ── Day separator ── */
function DaySep({ date }: { date: string }) {
  const d = new Date(date);
  const today = new Date();
  const label = d.toDateString() === today.toDateString()
    ? 'Hoy'
    : d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', padding: '0 4px' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

/* ── TicketTimeline ── */
export function TicketTimeline({
  events,
  isLoading,
  autoScroll = true,
}: {
  events: TicketTimelineEvent[];
  isLoading: boolean;
  autoScroll?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events.length, autoScroll]);

  if (isLoading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
        Cargando timeline…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <MessageSquare size={28} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Sin actividad registrada.</p>
      </div>
    );
  }

  /* Group by day for separators */
  let lastDay = '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 8 }}>
      {events.map((ev) => {
        const day = new Date(ev.created_at).toDateString();
        const showSep = day !== lastDay;
        if (showSep) lastDay = day;

        return (
          <div key={ev.id}>
            {showSep && <DaySep date={ev.created_at} />}
            {ev.event_type === 'comment'       && <CommentEvent      ev={ev} />}
            {ev.event_type === 'status_change' && <StatusChangeEvent ev={ev} />}
            {ev.event_type === 'assignment'    && <AssignmentEvent   ev={ev} />}
            {ev.event_type === 'attachment'    && <AttachmentEvent   ev={ev} />}
            {ev.event_type === 'approval'      && <ApprovalEvent     ev={ev} />}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
