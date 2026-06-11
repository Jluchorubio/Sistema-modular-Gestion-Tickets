import type { AuditEntry, AuditResponse } from '@/services/calendar-audit.service';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABEL } from '@/services/calendar-audit.service';

// Brand palette (light PDF — dark colors only in header/accents, not backgrounds)
const BRAND = {
  navy:   [14, 34, 53]   as [number, number, number],  // #0e2235
  coral:  [255, 94, 58]  as [number, number, number],  // #ff5e3a
  green:  [32, 201, 51]  as [number, number, number],  // #20c933
  muted:  [143, 160, 175] as [number, number, number], // #8fa0af
  white:  [255, 255, 255] as [number, number, number],
  bg:     [248, 250, 252] as [number, number, number],  // alternating row
  border: [226, 232, 240] as [number, number, number],
  text:   [30, 41, 59]   as [number, number, number],  // slate-800
  sub:    [100, 116, 139] as [number, number, number],  // slate-500
};

interface PdfOptions {
  audit:       AuditResponse;
  companyName: string;
  logoUrl?:    string | null;
  filterLabel: string;
}

async function loadLogoBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { cache: 'force-cache' });
    if (!resp.ok) return null;
    const blob   = await resp.blob();
    const ext    = blob.type.includes('png') ? 'png' : 'jpeg';
    const base64 = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload  = () => res((reader.result as string).split(',')[1]);
      reader.onerror = () => res('');
      reader.readAsDataURL(blob);
    });
    return base64 ? `data:image/${ext};base64,${base64}` : null;
  } catch {
    return null;
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function getEntityLabel(entry: AuditEntry): string {
  const v = entry.new_value;
  if (!v) return AUDIT_ENTITY_LABEL[entry.entity_type] ?? entry.entity_type;
  return v.title ?? v.entity_title ?? v.reason ?? AUDIT_ENTITY_LABEL[entry.entity_type] ?? '';
}

function getDetail(entry: AuditEntry): string {
  const v = entry.new_value;
  if (!v) return '';
  const parts: string[] = [];
  if (v.event_type)  parts.push(v.event_type);
  if (v.changes)     parts.push(`Campos: ${(v.changes as string[]).join(', ')}`);
  if (v.channel)     parts.push(v.channel);
  if (v.provider)    parts.push(v.provider);
  if (v.module_id && !v.module_name) parts.push('Módulo asignado');
  return parts.join(' · ');
}

export async function exportCalendarAuditPdf(opts: PdfOptions): Promise<void> {
  // Dynamic import avoids SSR crash
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W   = 210;
  const ML  = 15;
  const MR  = 15;
  const CW  = W - ML - MR; // 180mm

  // ── Logo ──────────────────────────────────────────────────────────────────
  let logoBase64: string | null = null;
  if (opts.logoUrl) logoBase64 = await loadLogoBase64(opts.logoUrl);

  const LOGO_H = 14;
  const LOGO_W = 14;

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, W, 28, 'F');

  // Logo / company name
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, ML, 7, LOGO_W, LOGO_H);
    } catch {
      // If image fails, skip silently
    }
  }

  const textX = logoBase64 ? ML + LOGO_W + 4 : ML;
  doc.setTextColor(...BRAND.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(opts.companyName, textX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(143, 160, 175);
  doc.text('Centro de Actividad — Calendario Operacional', textX, 20);

  // Report range (right side of header)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.white);
  doc.text(opts.filterLabel, W - MR, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(143, 160, 175);
  doc.text(`${opts.audit.total} registros`, W - MR, 20, { align: 'right' });

  // ── Coral accent line ─────────────────────────────────────────────────────
  doc.setFillColor(...BRAND.coral);
  doc.rect(0, 28, W, 1.2, 'F');

  // ── Generation timestamp ──────────────────────────────────────────────────
  const genTs = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.sub);
  doc.text(`Generado: ${genTs}`, ML, 34);

  // ── Table ─────────────────────────────────────────────────────────────────
  const rows = opts.audit.entries.map((e) => [
    formatDateTime(e.created_at),
    AUDIT_ENTITY_LABEL[e.entity_type] ?? e.entity_type,
    e.actor_type === 'system' ? 'Sistema' : (e.actor_name ?? '—'),
    AUDIT_ACTION_LABELS[e.action] ?? e.action,
    getEntityLabel(e),
    getDetail(e),
  ]);

  autoTable(doc, {
    startY:  38,
    head: [['Fecha / Hora', 'Tipo', 'Usuario', 'Acción', 'Entidad', 'Detalle']],
    body:    rows,
    margin:  { left: ML, right: MR },
    styles: {
      fontSize:   8,
      cellPadding: 3,
      textColor:  BRAND.text,
      overflow:   'linebreak',
    },
    headStyles: {
      fillColor:  BRAND.navy,
      textColor:  BRAND.white,
      fontStyle:  'bold',
      fontSize:   8.5,
    },
    alternateRowStyles: {
      fillColor: BRAND.bg,
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 22 },
      2: { cellWidth: 30 },
      3: { cellWidth: 35 },
      4: { cellWidth: 35 },
      5: { cellWidth: 30 },
    },
    didDrawPage: (data) => {
      // Footer on every page
      const pageCount = (doc as any).internal.getNumberOfPages();
      const pageNum   = data.pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.sub);
      doc.text(
        `Página ${pageNum} de ${pageCount}  ·  ${opts.companyName}  ·  Auditoría de Calendario`,
        W / 2,
        297 - 8,
        { align: 'center' },
      );
      // Bottom accent line
      doc.setFillColor(...BRAND.coral);
      doc.rect(0, 297 - 5, W, 0.8, 'F');
    },
  });

  const fileName = `auditoria-calendario-${opts.filterLabel.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.pdf`;
  doc.save(fileName);
}
