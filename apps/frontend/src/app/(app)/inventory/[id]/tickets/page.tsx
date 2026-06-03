"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, Search } from "lucide-react";
import { useModules } from "@/hooks/useModules";
import { useModuleNav } from "@/hooks/useModuleNav";
import { useAuthStore } from "@/stores/auth.store";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { inventoryService, type AssetTicket, type AssetDetail } from "@/services/inventory.service";
import { fmtDate } from "@/lib/formatters";
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from "../../_nav";

const C = {
  navy: "#0e2235", coral: "#ff5e3a", border: "#e2e8f0",
  muted: "#94a3b8", sub: "#64748b", text: "#1e293b", bg: "#f8fafc",
};

const PRIORITY_COLORS: Record<string, string> = {
  critica: "#ef4444", alta: "#f97316", media: "#f59e0b", baja: "#22c55e",
};

const STATE_FILTERS = [
  { value: "", label: "Todos" },
  { value: "open",   label: "Abiertos" },
  { value: "closed", label: "Cerrados" },
];

export default function AssetTicketsPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin === true;

  const { modules } = useModules();
  const inventoryRef = modules?.find(isInventoryModule);
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryRef?.id);

  const [search,     setSearch]     = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const { data: asset } = useQuery<AssetDetail>({
    queryKey: ["asset-detail", id],
    queryFn:  () => inventoryService.getOne(id),
    staleTime: 30_000,
    enabled: !!id,
  });

  const { data: tickets = [], isLoading } = useQuery<AssetTicket[]>({
    queryKey: ["asset-tickets", id],
    queryFn:  () => inventoryService.getAssetTickets(id),
    staleTime: 60_000,
    enabled: !!id,
  });

  const filtered = tickets.filter((t) => {
    const matchSearch = !search.trim() ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.creator_name.toLowerCase().includes(search.toLowerCase());
    const matchState =
      stateFilter === ""       ? true :
      stateFilter === "open"   ? !t.is_final :
      stateFilter === "closed" ? t.is_final : true;
    return matchSearch && matchState;
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
            Tickets asociados
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""} registrado{tickets.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" as const }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, ID o creador…"
              style={{ width: "100%", padding: "9px 12px 9px 30px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, background: "#fff" }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {STATE_FILTERS.map(f => (
              <button key={f.value} type="button" onClick={() => setStateFilter(f.value)}
                style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${stateFilter === f.value ? C.coral : C.border}`, background: stateFilter === f.value ? `${C.coral}08` : "#fff", color: stateFilter === f.value ? C.coral : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Cargando tickets…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <CheckCircle2 size={32} style={{ color: C.border, display: "block", margin: "0 auto 14px" }} />
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              {tickets.length === 0 ? "Sin tickets asociados a este activo." : "Sin resultados para el filtro aplicado."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((ticket) => {
              const pColor = PRIORITY_COLORS[ticket.priority] ?? C.muted;
              return (
                <div key={ticket.id} style={{ display: "flex", alignItems: "stretch", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ width: 5, background: pColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" as const }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.coral, fontFamily: "monospace" }}>#{ticket.id.slice(0, 8)}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, color: ticket.is_final ? "#16a34a" : "#c2410c", background: ticket.is_final ? "#f0fdf4" : "#fff7ed", padding: "2px 8px", borderRadius: 4 }}>
                        {ticket.state_label}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: pColor, textTransform: "uppercase" as const, marginLeft: "auto" }}>● {ticket.priority}</span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: "0 0 4px" }}>{ticket.title}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        <Clock size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        {fmtDate(ticket.created_at)}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        Creado por {ticket.creator_name}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
