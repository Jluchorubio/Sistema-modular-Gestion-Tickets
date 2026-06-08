'use client';

import { useRef, useEffect } from 'react';
import {
  MessageSquare, ArrowRight, UserPlus, Paperclip,
  CheckCircle2, XCircle, Lock, FileText, Image, File, RefreshCw,
} from 'lucide-react';
import { fmtDate, fmtRelativeCompact as fmtRel } from '@/lib/formatters';
import type { TicketTimelineEvent } from '@/services/tickets.service';

const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

/* ─── helpers ─────────────────────────────────────────── */

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime?: string | null }) {
  if (!mime) return <File size={13} />;
  if (mime.startsWith('image/')) return <Image size={13} />;
  if (mime.includes('pdf')) return <FileText size={13} />;
  return <File size={13} />;
}

/* ─── Avatar ───────────────────────────────────────────── */
function Avatar({ name, url, size = 32 }: { name: string | null; url?: string | null; size?: number }) {
  if (url) return (
    <img src={url} alt={name ?? ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: C.navy, color: '#fff', fontSize: size * 0.34, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

/* ─── System dot (for non-comment events) ─────────────── */
function Dot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${color}14`, border: `2px solid ${color}35`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      {children}
    </div>
  );
}

/* ─── Day separator ────────────────────────────────────── */
function DaySep({ date }: { date: string }) {
  const d     = new Date(date);
  const today = new Date();
  const label = d.toDateString() === today.toDateString()
    ? 'Hoy'
    : d.toLocaleDateString('es', {
        weekday: 'long', day: 'numeric', month: 'long',
        year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
      });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

/* ─── COMMENT ───────────────────────────────────────────── */
function CommentDot({ ev }: { ev: TicketTimelineEvent }) {
  return <Avatar name={ev.user_name} url={ev.avatar_url} size={28} />;
}
function CommentContent({ ev }: { ev: TicketTimelineEvent }) {
  const isInternal = ev.subtype === 'internal';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{ev.user_name ?? 'Sistema'}</span>
        {isInternal && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 4, border: '1px solid #fde68a' }}>
            <Lock size={8} /> Nota interna
          </span>
        )}
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto', flexShrink: 0 }} title={fmtDate(ev.created_at)}>
          {fmtRel(ev.created_at)}
        </span>
      </div>
      <div style={{
        background: isInternal ? '#fffbeb' : '#fff',
        border: `1px solid ${isInternal ? '#fde68a' : C.border}`,
        borderRadius: '0 10px 10px 10px',
        padding: '10px 13px',
      }}>
        <p style={{ fontSize: 13, color: C.navy, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
          {ev.content}
        </p>
      </div>
    </div>
  );
}

/* ─── STATUS CHANGE ─────────────────────────────────────── */
function StatusChangeDot({ ev }: { ev: TicketTimelineEvent }) {
  const meta  = ev.metadata ?? {};
  const color = meta.is_final ? '#22c55e' : meta.is_pause_state ? '#f59e0b' : '#6366f1';
  return (
    <Dot color={color}>
      <ArrowRight size={12} style={{ color }} />
    </Dot>
  );
}
function StatusChangeContent({ ev }: { ev: TicketTimelineEvent }) {
  const meta    = ev.metadata ?? {};
  const isFinal = meta.is_final;
  const isPause = meta.is_pause_state;
  const toColor = isFinal ? '#22c55e' : isPause ? '#f59e0b' : '#6366f1';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.sub }}>
          <strong style={{ color: C.navy }}>{ev.user_name}</strong> cambió estado
        </span>
        {meta.from_state && (
          <>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: C.sub, border: `1px solid ${C.border}` }}>
              {meta.from_state}
            </span>
            <ArrowRight size={10} style={{ color: C.muted, flexShrink: 0 }} />
          </>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${toColor}14`, color: toColor, border: `1px solid ${toColor}35`, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {isPause && '⏸'}{meta.to_state}
        </span>
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto', flexShrink: 0 }} title={fmtDate(ev.created_at)}>
          {fmtRel(ev.created_at)}
        </span>
      </div>
      {ev.content && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: isPause ? '3px 10px' : '2px 8px', borderRadius: 6, alignSelf: 'flex-start',
          background: isPause ? '#fef3c7' : '#f8fafc',
          border: `1px solid ${isPause ? '#fde68a' : C.border}`,
          fontSize: 11, color: isPause ? '#92400e' : C.sub,
          fontWeight: isPause ? 700 : 400,
        }}>
          {isPause && '⏸'}{ev.content}
        </div>
      )}
    </div>
  );
}

/* ─── ASSIGNMENT ────────────────────────────────────────── */
const ROLE_COLORS: Record<string, string> = { owner: '#1d4ed8', collaborator: '#6366f1', observer: '#64748b' };
const ROLE_LABELS: Record<string, string> = { owner: 'responsable', collaborator: 'colaborador', observer: 'observador' };
function AssignmentDot({ ev }: { ev: TicketTimelineEvent }) {
  const role  = (ev.metadata ?? {}).role ?? ev.subtype ?? 'owner';
  const color = ROLE_COLORS[role] ?? '#64748b';
  return <Dot color={color}><UserPlus size={12} style={{ color }} /></Dot>;
}
function AssignmentContent({ ev }: { ev: TicketTimelineEvent }) {
  const meta  = ev.metadata ?? {};
  const role  = meta.role ?? ev.subtype ?? 'owner';
  const color = ROLE_COLORS[role] ?? '#64748b';
  const label = ROLE_LABELS[role] ?? role;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minHeight: 28 }}>
      <span style={{ fontSize: 11, color: C.sub }}>
        <strong style={{ color: C.navy }}>{ev.user_name}</strong> asignó a{' '}
        <strong style={{ color: C.navy }}>{meta.assignee_name}</strong> como{' '}
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: `${color}14`, color, border: `1px solid ${color}30` }}>
          {label}
        </span>
      </span>
      <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto', flexShrink: 0 }} title={fmtDate(ev.created_at)}>
        {fmtRel(ev.created_at)}
      </span>
    </div>
  );
}

/* ─── ATTACHMENT ─────────────────────────────────────────── */
function AttachmentDot() {
  return <Dot color="#1d4ed8"><Paperclip size={12} style={{ color: '#1d4ed8' }} /></Dot>;
}
function AttachmentContent({ ev }: { ev: TicketTimelineEvent }) {
  const meta    = ev.metadata ?? {};
  const isImage = (meta.mime_type ?? '').startsWith('image/');
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: isImage ? 6 : 0, minHeight: 28 }}>
        <span style={{ fontSize: 11, color: C.sub }}>
          <strong style={{ color: C.navy }}>{ev.user_name}</strong> adjuntó
        </span>
        <a
          href={meta.file_url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: '#fff', border: `1px solid ${C.border}`, fontSize: 11, color: C.navy, fontWeight: 600, textDecoration: 'none', maxWidth: 260 }}>
          <span style={{ color: '#1d4ed8', display: 'flex', flexShrink: 0 }}><FileIcon mime={meta.mime_type} /></span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.content}</span>
          {meta.file_size && <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>({fmtSize(meta.file_size)})</span>}
        </a>
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto', flexShrink: 0 }} title={fmtDate(ev.created_at)}>
          {fmtRel(ev.created_at)}
        </span>
      </div>
      {isImage && meta.file_url && (
        <a href={meta.file_url} target="_blank" rel="noopener noreferrer">
          <img src={meta.file_url} alt={ev.content ?? ''} style={{ maxWidth: 220, maxHeight: 130, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.border}`, display: 'block' }} />
        </a>
      )}
    </div>
  );
}

/* ─── APPROVAL ───────────────────────────────────────────── */
function ApprovalDot({ ev }: { ev: TicketTimelineEvent }) {
  const approved = (ev.subtype ?? ev.metadata?.status) === 'approved';
  const color    = approved ? '#22c55e' : '#ef4444';
  const Icon     = approved ? CheckCircle2 : RefreshCw;
  return <Dot color={color}><Icon size={12} style={{ color }} /></Dot>;
}
function ApprovalContent({ ev }: { ev: TicketTimelineEvent }) {
  const approved = (ev.subtype ?? ev.metadata?.status) === 'approved';
  const color    = approved ? '#22c55e' : '#ef4444';
  const label    = approved ? 'cerro el ticket' : 'solicito reapertura';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 28 }}>
      <span style={{ fontSize: 11, color: C.sub }}>
        <strong style={{ color: C.navy }}>{ev.user_name}</strong>{' '}
        <span style={{ fontWeight: 700, color }}>{label}</span>
      </span>
      <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto', flexShrink: 0 }} title={fmtDate(ev.created_at)}>
        {fmtRel(ev.created_at)}
      </span>
    </div>
  );
}

/* ─── Event registry ─────────────────────────────────────── */
type DotFn    = (props: { ev: TicketTimelineEvent }) => React.ReactElement;
type ContentFn = (props: { ev: TicketTimelineEvent }) => React.ReactElement;

const RENDERERS: Record<string, { dot: DotFn; content: ContentFn }> = {
  comment:       { dot: CommentDot,       content: CommentContent      },
  status_change: { dot: StatusChangeDot,  content: StatusChangeContent },
  assignment:    { dot: AssignmentDot,    content: AssignmentContent   },
  attachment:    { dot: AttachmentDot,    content: AttachmentContent   },
  approval:      { dot: ApprovalDot,      content: ApprovalContent     },
};

/* ─── TimelineItem ────────────────────────────────────────── */
function TimelineItem({ ev, isLast }: { ev: TicketTimelineEvent; isLast: boolean }) {
  const renderer = RENDERERS[ev.event_type];
  if (!renderer) return null;
  const { dot: DotComp, content: ContentComp } = renderer;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {/* Left: dot + vertical line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
        <DotComp ev={ev} />
        {!isLast && (
          <div style={{ flex: 1, width: 1, background: C.border, minHeight: 12, marginTop: 4 }} />
        )}
      </div>
      {/* Right: content */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 18 }}>
        <ContentComp ev={ev} />
      </div>
    </div>
  );
}

/* ─── TicketTimeline ─────────────────────────────────────── */
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
        Cargando timeline...
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

  let lastDay = '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((ev, idx) => {
        const day     = new Date(ev.created_at).toDateString();
        const showSep = day !== lastDay;
        if (showSep) lastDay = day;
        const isLast  = idx === events.length - 1;

        return (
          <div key={ev.id}>
            {showSep && (
              <div style={{ paddingLeft: 40, marginBottom: 10, marginTop: idx > 0 ? 4 : 0 }}>
                <DaySep date={ev.created_at} />
              </div>
            )}
            <TimelineItem ev={ev} isLast={isLast} />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
