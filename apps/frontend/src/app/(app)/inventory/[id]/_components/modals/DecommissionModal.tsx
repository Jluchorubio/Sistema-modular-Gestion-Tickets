"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { C } from "../_shared";

const MOTIVOS = ["Obsolescencia", "Daño irreparable", "Robo", "Pérdida", "Otro"] as const;

export function DecommissionModal({
  onDecommission,
  onClose,
  pending,
}: {
  onDecommission: (reason: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [motivo,        setMotivo]        = useState("");
  const [observaciones, setObservaciones] = useState("");

  function handleConfirm() {
    if (!motivo) return;
    const reason = observaciones.trim() ? `${motivo} — ${observaciones.trim()}` : motivo;
    onDecommission(reason);
  }

  const SEL: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: C.text, boxSizing: "border-box" as const };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", maxWidth: 420, width: "100%", boxShadow: "0 24px 60px rgba(14,34,53,.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 3px" }}>Cambio de estado definitivo</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>Dar de baja</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "grid", placeItems: "center", color: C.muted }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: "12px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: C.sub, margin: "0 0 4px", fontWeight: 600 }}>El activo cambiará al estado <strong>"Dado de baja"</strong>.</p>
          <p style={{ fontSize: 12, color: C.sub, margin: "0 0 4px" }}>No aparecerá como disponible para asignaciones, custodias ni nuevas operaciones.</p>
          <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>Se desvinculan custodios y relaciones de componentes. Toda la trazabilidad histórica queda conservada.</p>
        </div>

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Motivo *</p>
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...SEL, border: `1px solid ${motivo ? C.border : "#fecaca"}`, marginBottom: 14 }}>
          <option value="">Seleccionar motivo…</option>
          {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Observaciones (opcional)</p>
        <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Detalles adicionales sobre la baja…" style={{ ...SEL, resize: "vertical", marginBottom: 22 }} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!motivo || pending} onClick={handleConfirm} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: motivo && !pending ? "#ef4444" : C.muted, color: "#fff", fontSize: 12, fontWeight: 700, cursor: motivo && !pending ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {pending ? "Procesando…" : "Confirmar baja"}
          </button>
        </div>
      </div>
    </div>
  );
}
