"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Search, X, Plus, Minus } from "lucide-react";
import { inventoryService } from "@/services/inventory.service";
import { C } from "../_shared";

/* ── Types ── */
export type CustodioRow = {
  id: string;
  userId: string;
  scheduleType: "turno" | "horas" | "ninguno";
  shift: string;
  hoursStart: string;
  hoursEnd: string;
  notas: string;
};

export function newRow(): CustodioRow {
  return { id: Math.random().toString(36).slice(2), userId: "", scheduleType: "ninguno", shift: "", hoursStart: "", hoursEnd: "", notas: "" };
}

/* ── UserPicker ── */
function UserPicker({
  allUsers,
  selectedId,
  onChange,
  style,
}: {
  allUsers: any[];
  selectedId: string;
  onChange: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const [query,      setQuery]    = useState("");
  const [deptFilter, setDept]     = useState("");
  const [open,       setOpen]     = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const departments = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    allUsers.forEach((u: any) => { if (u.department && !seen.has(u.department)) { seen.add(u.department); out.push(u.department); } });
    return out.sort();
  }, [allUsers]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let list = deptFilter ? allUsers.filter((u: any) => u.department === deptFilter) : allUsers;
    if (q) list = list.filter((u: any) => `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.job_title?.toLowerCase() ?? "").includes(q));
    return list.slice(0, 20);
  }, [allUsers, query, deptFilter]);

  const selected = allUsers.find((u: any) => u.id === selectedId);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const BASE: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", outline: "none", background: 'var(--app-card)', color: selected ? C.text : C.muted, boxSizing: "border-box" as const, cursor: "pointer", textAlign: "left" as const, ...style };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={BASE}>
        {selected
          ? <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: C.navy }}>{selected.first_name} {selected.last_name}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{selected.job_title || selected.department || selected.email}</span>
            </span>
          : <span>Buscar y seleccionar usuario…</span>
        }
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: 'var(--app-card)', border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: "0 8px 32px rgba(14,34,53,.12)", zIndex: 300, overflow: "hidden" }}>
          <div style={{ padding: "10px 10px 8px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, email o cargo…" style={{ width: "100%", padding: "6px 8px 6px 26px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
            </div>
            {departments.length > 0 && (
              <select value={deptFilter} onChange={(e) => setDept(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", outline: "none", background: 'var(--app-card)', color: deptFilter ? C.navy : C.muted, maxWidth: 130 }}>
                <option value="">Depto…</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0
              ? <p style={{ padding: "12px 14px", fontSize: 12, color: C.muted, margin: 0 }}>Sin resultados.</p>
              : filtered.map((u: any) => (
                <button key={u.id} type="button" onClick={() => { onChange(u.id); setOpen(false); setQuery(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", background: u.id === selectedId ? `${C.navy}09` : "#fff", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.navy, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>{u.first_name?.[0]}{u.last_name?.[0]}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: 0 }}>{u.first_name} {u.last_name}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{u.job_title || u.department || u.email}</p>
                  </div>
                  {u.id === selectedId && <CheckCircle2 size={14} style={{ color: C.navy, flexShrink: 0 }} />}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

/* ── AssignModal ── */
export function AssignModal({
  onAssign,
  onClose,
  pending,
}: {
  onAssign: (rows: { user_id: string; shift?: string; hours_start?: string; hours_end?: string; notes?: string }[]) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [rows, setRows] = useState<CustodioRow[]>([newRow()]);
  const { data: allUsers = [] } = useQuery({
    queryKey: ["assignable-users"],
    queryFn:  () => inventoryService.getAssignableUsers(),
    staleTime: 5 * 60_000,
  });

  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: ".08em", margin: "0 0 5px", display: "block" };
  const SEL: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", outline: "none", background: 'var(--app-card)', color: C.text, boxSizing: "border-box" as const };

  function updateRow(id: string, patch: Partial<CustodioRow>) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function handleSubmit() {
    const valid = rows.filter(r => r.userId);
    if (!valid.length) return;
    onAssign(valid.map(r => ({
      user_id:     r.userId,
      shift:       r.scheduleType === "turno" && r.shift ? r.shift : undefined,
      hours_start: r.scheduleType === "horas" && r.hoursStart ? r.hoursStart : undefined,
      hours_end:   r.scheduleType === "horas" && r.hoursEnd   ? r.hoursEnd   : undefined,
      notes:       r.notas.trim() || undefined,
    })));
  }

  const canSubmit = rows.some(r => r.userId) && !pending;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: 'var(--app-card)', borderRadius: 14, padding: "28px 32px", maxWidth: 520, width: "100%", boxShadow: "0 24px 60px rgba(14,34,53,.2)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 3px" }}>Responsable / Custodia</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>Asignar custodio{rows.length > 1 ? "s" : ""}</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "grid", placeItems: "center", color: C.muted }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {rows.map((row, i) => (
            <div key={row.id} style={{ padding: "16px 18px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, position: "relative" }}>
              {rows.length > 1 && <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".1em", margin: "0 0 10px" }}>Custodio {i + 1}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={LBL}>Usuario *</label>
                  <UserPicker allUsers={allUsers} selectedId={row.userId} onChange={(id) => updateRow(row.id, { userId: id })} />
                </div>
                <div>
                  <label style={LBL}>Horario</label>
                  <div style={{ display: "flex", gap: 7 }}>
                    {(["ninguno", "turno", "horas"] as const).map(t => (
                      <button key={t} type="button" onClick={() => updateRow(row.id, { scheduleType: t })} style={{ padding: "6px 12px", borderRadius: 7, border: `1.5px solid ${row.scheduleType === t ? C.navy : C.border}`, background: row.scheduleType === t ? C.navy : "#fff", color: row.scheduleType === t ? "#fff" : C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        {t === "ninguno" ? "Sin horario" : t === "turno" ? "Por turno" : "Por horas"}
                      </button>
                    ))}
                  </div>
                </div>
                {row.scheduleType === "turno" && (
                  <div>
                    <label style={LBL}>Turno</label>
                    <select value={row.shift} onChange={(e) => updateRow(row.id, { shift: e.target.value })} style={SEL}>
                      <option value="">Seleccionar…</option>
                      {["Mañana", "Tarde", "Noche"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {row.scheduleType === "horas" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={LBL}>Hora inicio</label><input type="time" value={row.hoursStart} onChange={(e) => updateRow(row.id, { hoursStart: e.target.value })} style={SEL} /></div>
                    <div><label style={LBL}>Hora fin</label><input type="time" value={row.hoursEnd} onChange={(e) => updateRow(row.id, { hoursEnd: e.target.value })} style={SEL} /></div>
                  </div>
                )}
                <div>
                  <label style={LBL}>Observaciones (opcional)</label>
                  <input type="text" value={row.notas} onChange={(e) => updateRow(row.id, { notas: e.target.value })} placeholder="Notas adicionales…" style={SEL} />
                </div>
              </div>
              {rows.length > 1 && (
                <button type="button" onClick={() => setRows(rs => rs.filter(r => r.id !== row.id))} style={{ position: "absolute", top: 12, right: 12, width: 24, height: 24, borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer", display: "grid", placeItems: "center", color: "#ef4444" }}>
                  <Minus size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setRows(rs => [...rs, newRow()])} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "10px", marginTop: 12, borderRadius: 9, border: `1.5px dashed ${C.border}`, background: 'var(--app-card)', fontSize: 12, fontWeight: 700, color: C.muted, cursor: "pointer", fontFamily: "inherit", justifyContent: "center" }}>
          <Plus size={13} /> Agregar otro custodio
        </button>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!canSubmit} onClick={handleSubmit} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: canSubmit ? C.navy : C.muted, color: "#fff", fontSize: 12, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {pending ? "Asignando…" : `Asignar ${rows.filter(r => r.userId).length > 1 ? rows.filter(r => r.userId).length + " custodios" : "custodia"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
