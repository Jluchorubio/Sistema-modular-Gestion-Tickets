"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, X, Package } from "lucide-react";
import { ticketsService } from "@/services/tickets.service";
import { modulesService } from "@/services/modules.service";
import { C } from "../_shared";

export function ReportProblemModal({
  assetName,
  assetId,
  moduleId,
  categoryId,
  environmentId,
  onClose,
}: {
  assetName: string;
  assetId: string;
  moduleId: string;
  categoryId: string;
  environmentId: string;
  onClose: () => void;
}) {
  const [title,              setTitle]              = useState(`Problema con: ${assetName}`);
  const [description,        setDescription]        = useState("");
  const [selectedModuleId,   setSelectedModuleId]   = useState(moduleId);
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId);
  const [selectedEnvId,      setSelectedEnvId]      = useState(environmentId);

  const BTN: React.CSSProperties = { padding: "9px 22px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const SEL: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: C.text, boxSizing: "border-box" as const, marginBottom: 14 };

  const { data: allModules = [] } = useQuery({
    queryKey: ["system-modules-for-report"],
    queryFn:  () => modulesService.getModules(),
    staleTime: 5 * 60_000,
  });

  const { data: modCategories = [] } = useQuery({
    queryKey:  ["ticket-categories-for-module", selectedModuleId],
    queryFn:   () => ticketsService.getCategories(selectedModuleId),
    staleTime: 60_000,
    enabled:   !!selectedModuleId,
  });

  const { data: modEnvironments = [] } = useQuery({
    queryKey:  ["ticket-environments-for-module", selectedModuleId],
    queryFn:   () => ticketsService.getEnvironments(selectedModuleId),
    staleTime: 60_000,
    enabled:   !!selectedModuleId,
  });

  useEffect(() => {
    if (modCategories.length > 0) setSelectedCategoryId(modCategories[0].id);
    else setSelectedCategoryId("");
  }, [modCategories]);

  useEffect(() => {
    if (modEnvironments.length > 0) setSelectedEnvId(modEnvironments[0].id);
    else setSelectedEnvId("");
  }, [modEnvironments]);

  const selectedModule = allModules.find(m => m.id === selectedModuleId);
  const canSubmit = !!title.trim() && !!selectedCategoryId && !!selectedEnvId;

  const createMut = useMutation({
    mutationFn: () => ticketsService.create({
      module_id:      selectedModuleId,
      category_id:    selectedCategoryId,
      environment_id: selectedEnvId,
      title:          title.trim(),
      description:    description.trim() || undefined,
      asset_id:       assetId,
    }),
  });

  if (createMut.isSuccess) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "32px", maxWidth: 380, width: "100%", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f0fdf4", border: "2px solid #22c55e", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <CheckCircle2 size={24} style={{ color: "#22c55e" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: "0 0 8px" }}>Ticket creado</h3>
          <p style={{ fontSize: 13, color: C.sub, margin: "0 0 6px", lineHeight: 1.6 }}>
            Problema reportado en <strong>{selectedModule?.name ?? "módulo"}</strong>.
          </p>
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 24px", fontFamily: "monospace" }}>
            #{(createMut.data as any)?.id?.slice(0, 8)}
          </p>
          <button type="button" onClick={onClose} style={{ ...BTN, background: C.navy, color: "#fff" }}>Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", maxWidth: 480, width: "100%", boxShadow: "0 24px 60px rgba(14,34,53,.2)", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 3px" }}>Soporte técnico</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>Reportar problema</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "grid", placeItems: "center", color: C.muted }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: "10px 14px", background: C.bg, borderRadius: 9, marginBottom: 18, display: "flex", gap: 8, alignItems: "center" }}>
          <Package size={14} style={{ color: C.muted, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{assetName}</span>
        </div>

        {createMut.isError && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: "#ef4444", margin: 0, fontWeight: 600 }}>
              {(createMut.error as any)?.response?.data?.message ?? "Error al crear el ticket. Inténtalo de nuevo."}
            </p>
          </div>
        )}

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Módulo de soporte *</p>
        <select value={selectedModuleId}
          onChange={(e) => { setSelectedModuleId(e.target.value); setSelectedCategoryId(""); setSelectedEnvId(""); }}
          style={SEL}>
          {allModules.filter(m => m.is_active).map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Categoría del ticket *</p>
        <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)} style={SEL} disabled={modCategories.length === 0}>
          {modCategories.length === 0
            ? <option value="">Sin categorías disponibles</option>
            : modCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
          }
        </select>

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Sede / Ambiente *</p>
        <select value={selectedEnvId} onChange={(e) => setSelectedEnvId(e.target.value)} style={SEL} disabled={modEnvironments.length === 0}>
          {modEnvironments.length === 0
            ? <option value="">Sin ambientes disponibles</option>
            : modEnvironments.map(e => <option key={e.id} value={e.id}>{e.location_name ? `${e.location_name} — ${e.name}` : e.name}</option>)
          }
        </select>

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Asunto *</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={SEL} />

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Descripción del problema</p>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          placeholder="Describe el problema con el mayor detalle posible…"
          style={{ ...SEL, resize: "vertical", marginBottom: 22 }} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ ...BTN, border: `1px solid ${C.border}`, background: "#fff", color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!canSubmit || createMut.isPending}
            onClick={() => { if (canSubmit) createMut.mutate(); }}
            style={{ ...BTN, background: canSubmit && !createMut.isPending ? C.coral : C.muted, color: "#fff", cursor: canSubmit && !createMut.isPending ? "pointer" : "not-allowed" }}>
            {createMut.isPending ? "Creando ticket…" : "Reportar problema"}
          </button>
        </div>
      </div>
    </div>
  );
}
