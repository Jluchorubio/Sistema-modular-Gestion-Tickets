"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, X, Search, ScanLine, Link2 } from "lucide-react";
import { inventoryService, type AssetStatus } from "@/services/inventory.service";
import { getAssetStatusConfig } from "@/constants/status";
import { C } from "../_shared";

export function RelateAssetModal({
  currentAssetId,
  currentAssetName,
  moduleId,
  onRelate,
  onClose,
  pending,
}: {
  currentAssetId: string;
  currentAssetName: string;
  moduleId: string;
  onRelate: (targetId: string, type: "child" | "parent") => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [tab,            setTab]            = useState<"browse" | "scan">("browse");
  const [relType,        setRelType]        = useState<"child" | "parent">("child");
  const [search,         setSearch]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected,       setSelected]       = useState<{ id: string; name: string } | null>(null);
  const [scanError,      setScanError]      = useState("");
  const [scanning,       setScanning]       = useState(false);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number | null>(null);

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets-for-relate", moduleId],
    queryFn:  () => inventoryService.getAll(moduleId),
    staleTime: 60_000,
  });

  const categories = useMemo(() => {
    const seen = new Map<string, true>(); const result: string[] = [];
    allAssets.forEach(a => { if (a.id !== currentAssetId && !seen.has(a.category_name)) { seen.set(a.category_name, true); result.push(a.category_name); } });
    return result.sort();
  }, [allAssets, currentAssetId]);

  const filtered = useMemo(() => {
    let list = allAssets.filter(a => a.id !== currentAssetId && a.status !== "dado_de_baja");
    if (categoryFilter) list = list.filter(a => a.category_name === categoryFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(s) || (a.serial_number?.toLowerCase() ?? "").includes(s) || a.qr_code.toLowerCase().includes(s));
    }
    return list.slice(0, 50);
  }, [allAssets, currentAssetId, search, categoryFilter]);

  async function startScan() {
    setScanError("");
    if (!("BarcodeDetector" in window)) { setScanError("Tu navegador no soporta escáner QR nativo. Usa Chrome o Edge, o busca el activo manualmente."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setScanning(true);
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      const detect = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const raw   = barcodes[0].rawValue as string;
            // QR images encode "asset:{UUID}" — strip prefix to get bare UUID
            const code  = raw.startsWith('asset:') ? raw.slice(6) : raw;
            stopScan();
            const match = allAssets.find(a => a.id === code || a.qr_code === raw || a.qr_code === code);
            if (match) { setSelected({ id: match.id, name: match.name }); setTab("browse"); }
            else { setScanError(`QR detectado no corresponde a ningún activo en este módulo (${code}).`); setTab("browse"); }
            return;
          }
        } catch { /* ignore frame errors */ }
        rafRef.current = requestAnimationFrame(detect);
      };
      rafRef.current = requestAnimationFrame(detect);
    } catch { setScanError("No se pudo acceder a la cámara. Verifica los permisos del navegador."); }
  }

  function stopScan() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => () => stopScan(), []);
  useEffect(() => { if (tab === "scan" && !scanning) startScan(); if (tab === "browse") stopScan(); }, [tab]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: 'var(--app-card)', borderRadius: 14, maxWidth: 500, width: "100%", boxShadow: "0 24px 60px rgba(14,34,53,.2)", overflow: "hidden", maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>

        <div style={{ padding: "22px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 3px" }}>Relaciones</p>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>Asociar dispositivo</h3>
            </div>
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "grid", placeItems: "center", color: C.muted }}>
              <X size={14} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
            {(["child", "parent"] as const).map(t => (
              <button key={t} type="button" onClick={() => setRelType(t)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${relType === t ? C.navy : C.border}`, background: relType === t ? C.navy : "#fff", color: relType === t ? "#fff" : C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "center" as const }}>
                {t === "child" ? "Este contiene al otro (hijo)" : "El otro contiene a este (padre)"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: C.bg, borderRadius: 8, marginBottom: 16 }}>
            <Link2 size={12} style={{ color: C.muted, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.sub, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{currentAssetName}</span>
          </div>

          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}` }}>
            {(["browse", "scan"] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", border: "none", background: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: tab === t ? C.coral : C.muted, borderBottom: `2px solid ${tab === t ? C.coral : "transparent"}`, marginBottom: -1 }}>
                {t === "browse" ? <><Search size={13} /> Buscar</> : <><ScanLine size={13} /> Escanear QR</>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px" }}>
          {scanError && <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 12 }}><p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{scanError}</p></div>}

          {tab === "browse" && (
            <>
              {selected && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f0fdf4", border: "1.5px solid #22c55e40", borderRadius: 9, marginBottom: 14 }}>
                  <CheckCircle2 size={16} style={{ color: "#22c55e", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#166534", flex: 1 }}>{selected.name}</span>
                  <button type="button" onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#86efac", padding: 0 }}><X size={14} /></button>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, position: "relative" as const }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, serial o QR…" style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
                </div>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", outline: "none", background: 'var(--app-card)', color: C.text, flexShrink: 0 }}>
                  <option value="">Todas las categorías</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered.length === 0 && <p style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "24px 0" }}>Sin activos que coincidan</p>}
                {filtered.map(asset => (
                  <button key={asset.id} type="button" onClick={() => setSelected(selected?.id === asset.id ? null : { id: asset.id, name: asset.name })}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 9, border: `1.5px solid ${selected?.id === asset.id ? C.coral : C.border}`, background: selected?.id === asset.id ? `${C.coral}08` : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const, transition: "border-color .12s" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: getAssetStatusConfig(asset.status as AssetStatus).text, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{asset.name}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{asset.category_name}{asset.serial_number ? ` · ${asset.serial_number}` : ""}</p>
                    </div>
                    {selected?.id === asset.id && <CheckCircle2 size={15} style={{ color: C.coral, flexShrink: 0 }} />}
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "scan" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#111", aspectRatio: "4/3" }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block" }} />
                {scanning && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ width: 160, height: 160, border: `2px solid ${C.coral}`, borderRadius: 12, boxShadow: "0 0 0 9999px rgba(0,0,0,.35)" }} />
                  </div>
                )}
              </div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>Apunta la cámara al código QR del activo</p>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 28px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!selected || pending} onClick={() => { if (selected) onRelate(selected.id, relType); }}
            style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: selected && !pending ? C.navy : C.muted, color: "#fff", fontSize: 12, fontWeight: 700, cursor: selected && !pending ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {pending ? "Asociando…" : selected ? `Asociar "${selected.name.slice(0, 20)}${selected.name.length > 20 ? "…" : ""}"` : "Selecciona un activo"}
          </button>
        </div>
      </div>
    </div>
  );
}
