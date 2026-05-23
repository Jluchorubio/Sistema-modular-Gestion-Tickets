/** Full date: "12 may. 2024". Returns '—' for null/undefined. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Day + month only: "12 may." — for chart axes. */
export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

/**
 * Verbose relative: "Hace un momento", "Hace 3 min", "Hace 2h", "Hace 5 días".
 * Falls back to fmtDate when older than 7 days. Returns '—' for null/undefined.
 */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return 'Hace un momento';
  if (diff < 3_600_000)  return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Hace ${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `Hace ${Math.floor(diff / 86_400_000)} días`;
  return fmtDate(iso);
}

/**
 * Compact relative: "ahora", "3m", "2h", "5d".
 * For dense UIs like notification lists, ticket cards, timelines.
 */
export function fmtRelativeCompact(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
