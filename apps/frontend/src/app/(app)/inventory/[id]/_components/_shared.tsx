"use client";

import React from "react";
import { getAssetStatusConfig } from "@/constants/status";
import {
  type AssetStatus,
  ASSET_STATUS_LABELS,
} from "@/services/inventory.service";

/* ── Design tokens ── */
export const C = {
  navy:   "#0e2235",
  coral:  "#ff5e3a",
  border: "#e2e8f0",
  muted:  "#94a3b8",
  sub:    "#64748b",
  text:   "#1e293b",
  bg:     "#f8fafc",
} as const;

export const PRIORITY_COLORS: Record<string, string> = {
  critica: "#ef4444",
  alta:    "#f97316",
  media:   "#f59e0b",
  baja:    "#22c55e",
};

export const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 7,
  fontSize: 13,
  border: `1px solid ${C.border}`,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#fff",
  color: C.text,
};

/* ── Utilities ── */
export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const y  = Math.floor(diff / 31536000000);
  const mo = Math.floor(diff / 2592000000);
  const d  = Math.floor(diff / 86400000);
  const h  = Math.floor(diff / 3600000);
  const m  = Math.floor(diff / 60000);
  if (y  > 0) return `hace ${y} año${y  > 1 ? "s" : ""}`;
  if (mo > 0) return `hace ${mo} mes${mo > 1 ? "es" : ""}`;
  if (d  > 0) return `hace ${d} día${d  > 1 ? "s" : ""}`;
  if (h  > 0) return `hace ${h}h`;
  return `hace ${Math.max(m, 1)}min`;
}

/* ── Primitive UI components ── */
export function StatusBadge({ status }: { status: AssetStatus }) {
  const cfg = getAssetStatusConfig(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 12px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 700,
        background: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.text }} />
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

export function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: C.muted, margin: "0 0 4px" }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: 0, fontFamily: mono ? "monospace" : "inherit", letterSpacing: mono ? ".04em" : "normal", wordBreak: "break-all", lineHeight: 1.3 }}>
        {value || "—"}
      </p>
    </div>
  );
}

export function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, paddingBottom: 12, borderBottom: `2px solid ${C.coral}` }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: C.navy, margin: 0 }}>
        {label}
      </p>
      {action}
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: "32px 0", textAlign: "center" }}>
      <div style={{ color: C.border, display: "flex", justifyContent: "center", marginBottom: 12 }}>
        {icon}
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{text}</p>
    </div>
  );
}
