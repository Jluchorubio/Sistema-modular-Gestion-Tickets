"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { ArrowLeft, Clock, Search } from "lucide-react";
import { useModules } from "@/hooks/useModules";
import { useModuleNav } from "@/hooks/useModuleNav";
import { useAuthStore } from "@/stores/auth.store";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import {
  inventoryService,
  type AssetHistoryEntry,
  type AssetDetail,
  ASSET_ACTION_LABELS,
  ASSET_ACTION_COLORS,
} from "@/services/inventory.service";
import { fmtDate } from "@/lib/formatters";
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from "../../_nav";

const C = {
  navy: "#0e2235", coral: "#ff5e3a", border: "#e2e8f0",
  muted: "#94a3b8", sub: "#64748b", text: "#1e293b", bg: "#f8fafc",
};

const ACTION_FILTERS = [
  { value: "",            label: "Todos" },
  { value: "asignado",    label: "Asignaciones" },
  { value: "devuelto",    label: "Devoluciones" },
  { value: "reparacion",  label: "Reparaciones" },
  { value: "asociado",    label: "Relaciones" },
  { value: "dado_de_baja", label: "Bajas" },
];

export default function AssetHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin === true;

  const { modules } = useModules();
  const inventoryRef = modules?.find(isInventoryModule);
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryRef?.id);

  const [search,      setSearch]      = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const { data: asset } = useQuery<AssetDetail>({
    queryKey: ["asset-detail", id],
    queryFn:  () => inventoryService.getOne(id),
    staleTime: 30_000,
    enabled: !!id,
  });

  const { data: history = [], isLoading } = useQuery<AssetHistoryEntry[]>({
    queryKey: ["asset-history", id],
    queryFn:  () => inventoryService.getHistory(id),
    staleTime: 30_000,
    enabled: !!id,
  });

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (d > 30) return "";
    if (d > 1)  return `hace ${d}d`;
    if (h > 0)  return `hace ${h}h`;
    return `hace ${Math.max(m, 1)}min`;
  }

  function dayLabel(dateStr: string): string {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    if (d.getTime() === today.getTime()) return "Hoy";
    if (d.getTime() === yesterday.getTime()) return "Ayer";
    if (d.getTime() >= weekAgo.getTime()) return d.toLocaleDateString("es-ES", { weekday: "long" });
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }

  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    history.forEach(h => {
      counts[h.action] = (counts[h.action] ?? 0) + 1;
      if (h.action === "desasociado") counts["asociado"] = (counts["asociado"] ?? 0) + 1;
    });
    return counts;
  }, [history]);

  const filtered = history.filter((h) => {
    const matchSearch = !search.trim() ||
      (ASSET_ACTION_LABELS[h.action] ?? h.action).toLowerCase().includes(search.toLowerCase()) ||
      (h.user_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (h.actor_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (h.reason ?? "").toLowerCase().includes(search.toLowerCase());
    const matchAction = !actionFilter ||
      h.action === actionFilter ||
      (actionFilter === "asociado" && (h.action === "asociado" || h.action === "desasociado"));
    return matchSearch && matchAction;
  });

  return (
    <ModuleLayout
      moduleId={inventoryRef?.id ?? ""}
      title="Inventario"
      description=""
      isSuperadmin={isSuperadmin}
      hideInfo
      alwaysOpen
    >
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 0 60px" }}>

        {/* Back */}
        <button type="button" onClick={() => router.push(`/inventory/${id}`)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: 13, fontWeight: 600, padding: "0 0 20px", fontFamily: "inherit" }}>
          <ArrowLeft size={14} /> Volver al activo
        </button>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 4px" }}>
            {asset?.name ?? "Activo"}
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: "0 0 4px" }}>
            Historial y auditoría
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            {history.length} evento{history.length !== 1 ? "s" : ""} registrado{history.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexDirection: "column" as const }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por acción, usuario o razón…"
              style={{ width: "100%", padding: "9px 12px 9px 30px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, background: 'var(--app-card)' }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {ACTION_FILTERS.map(f => {
              const count = f.value === ""
                ? history.length
                : f.value === "asociado"
                  ? ((actionCounts["asociado"] ?? 0))
                  : (actionCounts[f.value] ?? 0);
              return (
                <button key={f.value} type="button" onClick={() => setActionFilter(f.value)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 8, border: `1.5px solid ${actionFilter === f.value ? C.coral : C.border}`, background: actionFilter === f.value ? `${C.coral}08` : "#fff", color: actionFilter === f.value ? C.coral : C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {f.label}
                  {count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 5, background: actionFilter === f.value ? C.coral : C.border, color: actionFilter === f.value ? "#fff" : C.sub, minWidth: 18, textAlign: "center" }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Cargando historial…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <Clock size={32} style={{ color: C.border, display: "block", margin: "0 auto 14px" }} />
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              {history.length === 0 ? "Sin eventos registrados para este activo." : "Sin resultados para el filtro aplicado."}
            </p>
          </div>
        ) : (
          <div style={{ background: 'var(--app-card)', border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {(() => {
              const groups: { label: string; events: typeof filtered }[] = [];
              filtered.forEach(h => {
                const lbl = dayLabel(h.created_at);
                const last = groups[groups.length - 1];
                if (!last || last.label !== lbl) groups.push({ label: lbl, events: [h] });
                else last.events.push(h);
              });
              return groups.map((g, gi) => (
                <div key={g.label}>
                  {/* Date group header */}
                  <div style={{ padding: "10px 28px", background: C.bg, borderBottom: `1px solid ${C.border}`, borderTop: gi > 0 ? `1px solid ${C.border}` : undefined, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: C.navy, textTransform: "uppercase" as const, letterSpacing: ".1em" }}>{g.label}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>{g.events.length} evento{g.events.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column" }}>
                    {g.events.map((h, i) => {
                      const color = ASSET_ACTION_COLORS[h.action] ?? C.muted;
                      const label = ASSET_ACTION_LABELS[h.action] ?? h.action;
                      const isLast = i === g.events.length - 1;
                      const rel = relativeTime(h.created_at);
                      return (
                        <div key={h.id} style={{ display: "flex", gap: 16, paddingBottom: isLast ? 0 : 20, position: "relative" }}>
                          {!isLast && (
                            <div style={{ position: "absolute", left: 13, top: 26, width: 2, height: "calc(100% - 8px)", background: C.border }} />
                          )}
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${color}14`, border: `2px solid ${color}40`, display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                          </div>
                          <div style={{ flex: 1, paddingTop: 3, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: "0 0 3px" }}>
                                {label}
                                {h.user_name && h.user_name !== h.actor_name ? (
                                  <span style={{ fontWeight: 500, color: C.sub }}> {h.user_name}</span>
                                ) : null}
                              </p>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                {rel && <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" as const }}>{rel}</span>}
                                <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" as const, fontFamily: "monospace" }}>
                                  {new Date(h.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            </div>
                            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px" }}>
                              por {h.actor_name || "Sistema"}
                            </p>
                            {h.reason && (
                              <p style={{ fontSize: 11, color: C.muted, margin: 0, fontStyle: "italic" }}>{h.reason}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
