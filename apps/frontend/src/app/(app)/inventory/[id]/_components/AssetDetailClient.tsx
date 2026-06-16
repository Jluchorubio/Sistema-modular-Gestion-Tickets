"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, QrCode, Pencil, Package, CheckCircle2, X, Clock,
  Save, ImagePlus, Trash2, ChevronRight, Camera, UserPlus,
} from "lucide-react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { useAuthStore } from "@/stores/auth.store";
import { useModules } from "@/hooks/useModules";
import { useModuleNav } from "@/hooks/useModuleNav";
import {
  INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule,
} from "../../_nav";
import {
  inventoryService,
  type AssetStatus,
  type FieldDef,
  ASSET_ACTION_LABELS, ASSET_ACTION_COLORS,
} from "@/services/inventory.service";
import { getAssetStatusConfig } from "@/constants/status";
import { usePermission } from "@/hooks/usePermission";
import { fmtDate } from "@/lib/formatters";

import { C, PRIORITY_COLORS, INPUT, relativeTime, StatusBadge, SectionHeader, EmptyState } from "./_shared";
import { QrModal }            from "./modals/QrModal";
import { CropModal }          from "./modals/CropModal";
import { ImageLightbox }      from "./modals/ImageLightbox";
import { AssignModal }        from "./modals/AssignModal";
import { DecommissionModal }  from "./modals/DecommissionModal";
import { RelateAssetModal }   from "./modals/RelateAssetModal";
import { ReportProblemModal } from "./modals/ReportProblemModal";
import { CameraModal }        from "./modals/CameraModal";
import { useAssetData }       from "./hooks/useAssetData";

export function AssetDetailClient({ assetId }: { assetId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { modules } = useModules();
  const inventoryId = modules?.find(isInventoryModule)?.id;
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;
  const canEdit = usePermission("inventario:items:edit");
  const moduleId = inventoryId ?? "";

  /* ── UI state ── */
  const [detailTab,        setDetailTab]        = useState<'detalles' | 'historial' | 'tickets'>('detalles');
  const [showQr,           setShowQr]           = useState(false);
  const [editing,          setEditing]          = useState(false);
  const [actionErr,        setActionErr]        = useState("");
  const [lightboxIdx,      setLightboxIdx]      = useState<number | null>(null);
  const [showAssign,       setShowAssign]       = useState(false);
  const [showDecommission, setShowDecommission] = useState(false);
  const [showReport,       setShowReport]       = useState(false);
  const [showRelate,       setShowRelate]       = useState(false);
  const [selectedImg,      setSelectedImg]      = useState(0);
  const [cropPending,      setCropPending]      = useState<{ file: File; source: "file" | "camera" } | null>(null);
  const [showCamera,       setShowCamera]       = useState(false);
  const [confirmDeleteImgId, setConfirmDeleteImgId] = useState<string | null>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  /* ── Data ── */
  const {
    asset, isLoading,
    assignments, assignment,
    assetTickets, history, images, children,
    categories, environments,
  } = useAssetData(assetId, moduleId, editing);

  /* ── Edit form ── */
  const [editForm, setEditForm] = useState({
    name: "", description: "", serial_number: "",
    category_id: "", environment_id: "",
    specifications: {} as Record<string, string>,
  });

  function startEditing() {
    if (!asset) return;
    const specs: Record<string, string> = {};
    if (asset.specifications)
      Object.entries(asset.specifications).forEach(([k, v]) => { specs[k] = String(v); });
    setEditForm({ name: asset.name, description: asset.description ?? "", serial_number: asset.serial_number ?? "", category_id: asset.category_id, environment_id: asset.environment_id, specifications: specs });
    setEditing(true);
    setActionErr("");
  }

  /* ── Invalidations ── */
  const inv = () => {
    qc.invalidateQueries({ queryKey: ["asset-detail", assetId] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  /* ── Mutations ── */
  const updateMut = useMutation({
    mutationFn: () => {
      const specs: Record<string, unknown> = {};
      Object.entries(editForm.specifications).forEach(([k, v]) => { if (v.trim()) specs[k] = v; });
      return inventoryService.update(assetId, {
        name:           editForm.name.trim() || undefined,
        description:    editForm.description.trim() || undefined,
        serial_number:  editForm.serial_number.trim() || undefined,
        category_id:    editForm.category_id || undefined,
        environment_id: editForm.environment_id || undefined,
        specifications: Object.keys(specs).length ? specs : undefined,
      });
    },
    onSuccess: () => { setEditing(false); setActionErr(""); inv(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error al guardar"),
  });

  const transMut = useMutation({
    mutationFn: ({ status, reason }: { status: AssetStatus; reason?: string }) =>
      inventoryService.transition(assetId, { status, reason: reason || undefined }),
    onSuccess: () => {
      setShowDecommission(false); setActionErr(""); inv();
      qc.invalidateQueries({ queryKey: ["asset-assignment", assetId] });
      qc.invalidateQueries({ queryKey: ["asset-children", assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error"),
  });

  const assignMut = useMutation({
    mutationFn: (rows: { user_id: string; shift?: string; hours_start?: string; hours_end?: string; notes?: string }[]) =>
      Promise.all(rows.map(r => inventoryService.assign(assetId, r))),
    onSuccess: () => {
      setShowAssign(false); inv();
      qc.invalidateQueries({ queryKey: ["asset-assignments", assetId] });
      qc.invalidateQueries({ queryKey: ["asset-history", assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error al asignar"),
  });

  const relateMut = useMutation({
    mutationFn: (dto: { target_id: string; relation: "set-child" | "set-parent" | "remove-parent" }) =>
      inventoryService.relate(assetId, dto),
    onSuccess: () => {
      setShowRelate(false); setActionErr(""); inv();
      qc.invalidateQueries({ queryKey: ["asset-children", assetId] });
      qc.invalidateQueries({ queryKey: ["asset-history", assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error al asociar activo"),
  });

  const unassignMut = useMutation({
    mutationFn: (userId?: string) => inventoryService.unassign(assetId, userId),
    onSuccess: () => {
      inv();
      qc.invalidateQueries({ queryKey: ["asset-assignments", assetId] });
      qc.invalidateQueries({ queryKey: ["asset-history", assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error"),
  });

  const uploadImgMut = useMutation({
    mutationFn: (file: File) => inventoryService.uploadAssetImage(assetId, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset-images", assetId] }); inv(); },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error al subir imagen"),
  });

  const deleteImgMut = useMutation({
    mutationFn: (imageId: string) => inventoryService.deleteAssetImage(assetId, imageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-images", assetId] }); inv();
      setLightboxIdx(null);
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error al eliminar imagen"),
  });

  /* ── Image helpers ── */
  function pickFile(source: "file" | "camera") {
    if (source === "camera") {
      if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") {
        setShowCamera(true);
      } else {
        cameraInputRef.current?.click();
      }
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleRawFile(file: File | undefined | null, source: "file" | "camera") {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setActionErr("La imagen no puede superar 10 MB."); return; }
    setCropPending({ file, source });
  }

  function handleCropConfirm(blob: Blob) {
    const ext = blob.type === "image/png" ? "png" : "jpg";
    uploadImgMut.mutate(new File([blob], `asset-${Date.now()}.${ext}`, { type: blob.type }));
    setCropPending(null);
  }

  /* ── Derived ── */
  const fieldSchema: FieldDef[] = useMemo(() => asset?.field_schema ?? [], [asset]);
  const safeIdx = images.length > 0 ? Math.min(selectedImg, images.length - 1) : 0;

  useEffect(() => {
    if (images.length > 0 && selectedImg >= images.length) setSelectedImg(images.length - 1);
  }, [images.length, selectedImg]);

  useEffect(() => {
    if (images.length <= 1 || editing || lightboxIdx !== null) return;
    const id = setInterval(() => setSelectedImg(i => (i + 1) % images.length), 4000);
    return () => clearInterval(id);
  }, [images.length, editing, lightboxIdx]);

  useEffect(() => {
    if (!confirmDeleteImgId) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setConfirmDeleteImgId(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDeleteImgId]);

  /* ── Loading / not found ── */
  if (isLoading) return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin} hideInfo alwaysOpen>
      <div style={{ padding: "80px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Cargando ficha…</div>
    </ModuleLayout>
  );
  if (!asset) return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin} hideInfo alwaysOpen>
      <div style={{ padding: "80px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Activo no encontrado.</div>
    </ModuleLayout>
  );

  return (
    <ModuleLayout moduleId={inventoryId} title="Inventario" description="" isSuperadmin={isSuperadmin} hideInfo alwaysOpen>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <button type="button" onClick={() => router.push("/inventory")} style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, display: "grid", placeItems: "center", cursor: "pointer", color: C.navy }}>
          <ArrowLeft size={14} />
        </button>
        <span style={{ fontSize: 11, color: C.muted }}>Inventario</span>
        <ChevronRight size={12} style={{ color: C.muted }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{asset.name}</span>
      </div>

      {actionErr && (
        <div style={{ padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>{actionErr}</p>
        </div>
      )}

      {/* ══ HEADER CARD ══ */}
      <div style={{ background: 'var(--app-card)', borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 2px 18px rgba(14,34,53,.08)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "40% 60%" }}>
          {/* Gallery */}
          <div style={{ background: "#f0f4f8", display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}` }}>
            <div style={{ flex: 1, minHeight: 320, position: "relative", cursor: images.length > 0 ? "zoom-in" : "default", overflow: "hidden", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => images.length > 0 && setLightboxIdx(safeIdx)}>
              {images.length > 0 ? (
                <>
                  <img key={images[safeIdx].id} src={images[safeIdx].storage_url} alt={images[safeIdx].file_name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", position: "absolute", inset: 0, transition: "opacity .3s ease" }} />
                  {images.length > 1 && (
                    <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(14,34,53,.55)", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: "#fff", pointerEvents: "none" }}>
                      {safeIdx + 1} / {images.length}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, opacity: 0.4, padding: 32 }}>
                  <Package size={52} style={{ color: C.muted }} />
                  <p style={{ fontSize: 11, color: C.muted, margin: 0, textAlign: "center", lineHeight: 1.5 }}>{asset.category_name}<br />Sin imágenes</p>
                </div>
              )}
            </div>

            {images.length > 1 && (
              <div style={{ display: "flex", gap: 4, padding: "8px 10px", background: C.bg, borderTop: `1px solid ${C.border}`, overflowX: "auto", flexShrink: 0 }}>
                {images.map((img, idx) => (
                  <div key={img.id} style={{ position: "relative", flexShrink: 0 }}>
                    <button type="button" onClick={() => setSelectedImg(idx)}
                      style={{ width: 56, height: 56, borderRadius: 7, overflow: "hidden", border: `2px solid ${idx === safeIdx ? C.coral : C.border}`, background: 'var(--app-card)', cursor: "pointer", padding: 2, display: "block", transition: "border-color .15s" }}>
                      <img src={img.storage_url} alt={img.file_name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {images.length === 1 && editing && canEdit && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: C.bg, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                <p style={{ fontSize: 10, color: C.muted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{images[0].file_name}</p>
                <button type="button" onClick={() => setConfirmDeleteImgId(images[0].id)}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca", cursor: "pointer", color: "#ef4444", fontSize: 10, fontWeight: 700, fontFamily: "inherit" }}>
                  <Trash2 size={11} /> Eliminar
                </button>
              </div>
            )}

            {editing && canEdit && (
              <div style={{ padding: "10px 12px", background: C.bg, borderTop: `1px solid ${C.border}`, flexShrink: 0, display: "flex", gap: 7 }}>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => { handleRawFile(e.target.files?.[0], "file"); e.target.value = ""; }} />
                <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: "none" }} onChange={(e) => { handleRawFile(e.target.files?.[0], "camera"); e.target.value = ""; }} />
                <button type="button" disabled={uploadImgMut.isPending} onClick={() => pickFile("file")}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", borderRadius: 8, border: `1.5px dashed ${C.coral}55`, background: `${C.coral}08`, fontSize: 11, fontWeight: 700, color: C.coral, cursor: "pointer", fontFamily: "inherit" }}>
                  <ImagePlus size={13} /> {uploadImgMut.isPending ? "Subiendo…" : "Agregar imagen"}
                </button>
                <button type="button" disabled={uploadImgMut.isPending} onClick={() => pickFile("camera")}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: 'var(--app-card)', fontSize: 11, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit" }}>
                  <Camera size={13} /> Cámara
                </button>
              </div>
            )}
          </div>

          {/* Info side */}
          <div style={{ padding: "32px 38px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 320 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.coral, textTransform: "uppercase", letterSpacing: ".1em", margin: "0 0 12px" }}>{asset.module_name} · {asset.category_name}</p>

                {editing ? (
                  <input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ ...INPUT, fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 16, borderRadius: 9 }} />
                ) : (
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: "0 0 14px", lineHeight: 1.2 }}>{asset.name}</h1>
                )}

                <div style={{ marginBottom: 16 }}><StatusBadge status={asset.status} /></div>

                {editing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: C.coral, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 5px" }}>Descripción</p>
                      <textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...INPUT, resize: "vertical", lineHeight: 1.5 }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: C.coral, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 5px" }}>N° de Serie</p>
                        <input value={editForm.serial_number} onChange={(e) => setEditForm(f => ({ ...f, serial_number: e.target.value }))} style={INPUT} placeholder="SN-XXXX" />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: C.coral, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 5px" }}>Categoría</p>
                        <select value={editForm.category_id} onChange={(e) => setEditForm(f => ({ ...f, category_id: e.target.value }))} style={INPUT}>
                          {(categories as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: C.coral, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 5px" }}>Ambiente / Sede</p>
                        <select value={editForm.environment_id} onChange={(e) => setEditForm(f => ({ ...f, environment_id: e.target.value }))} style={INPUT}>
                          {(environments as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ""}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {asset.description && <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.7, margin: "0 0 6px" }}>{asset.description}</p>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {(asset.environment_name || asset.location_name) && (
                        <p style={{ fontSize: 12, color: C.sub, margin: 0, display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0, paddingTop: 1 }}>Ubicación</span>
                          {[asset.environment_name, asset.location_name].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p style={{ fontSize: 12, color: C.sub, margin: 0, display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0, paddingTop: 1 }}>Registro</span>
                        {fmtDate(asset.created_at)}
                      </p>
                      {asset.serial_number && (
                        <p style={{ fontSize: 12, color: C.sub, margin: 0, display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0, paddingTop: 1 }}>N° Serie</span>
                          <span style={{ fontFamily: "monospace" }}>{asset.serial_number}</span>
                        </p>
                      )}
                      {assignment && (
                        <p style={{ fontSize: 12, color: C.sub, margin: 0, display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0, paddingTop: 1 }}>Custodio</span>
                          {assignment.user_name}
                        </p>
                      )}
                      <p style={{ fontSize: 10, color: C.muted, margin: 0, fontFamily: "monospace", letterSpacing: ".04em" }}>{asset.qr_code}</p>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {asset.children_count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: C.navy, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px" }}>{asset.children_count} {asset.children_count === 1 ? "componente" : "componentes"}</span>}
                      {asset.tickets_count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px" }}>{asset.tickets_count} {asset.tickets_count === 1 ? "ticket" : "tickets"}</span>}
                      {asset.files_count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: C.sub, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px" }}>{asset.files_count} {asset.files_count === 1 ? "archivo" : "archivos"}</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px" }}>v{asset.version}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, minWidth: 116 }}>
                <button type="button" onClick={() => setShowQr(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, fontWeight: 700, color: C.coral, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                  <QrCode size={13} /> Ver QR
                </button>
                {canEdit && asset.status !== "dado_de_baja" && !editing && (
                  <button type="button" onClick={startEditing} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                    <Pencil size={13} /> Editar
                  </button>
                )}
                {canEdit && editing && (
                  <>
                    <button type="button" disabled={updateMut.isPending} onClick={() => updateMut.mutate()} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: "none", background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%", opacity: updateMut.isPending ? 0.6 : 1 }}>
                      <Save size={13} /> {updateMut.isPending ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" onClick={() => { setEditing(false); setActionErr(""); }} style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.sub, width: "100%" }}>
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>

            {!editing && (
              <div style={{ display: "flex", gap: 8, marginTop: 22, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={() => setShowReport(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit" }}>
                  Reportar problema
                </button>
                {canEdit && asset.status !== "dado_de_baja" && (
                  <button type="button" onClick={() => setShowAssign(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit" }}>
                    <UserPlus size={13} /> Asignar custodia
                  </button>
                )}
                {canEdit && (
                  <button type="button" onClick={() => setShowRelate(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit" }}>
                    Asociar dispositivo
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {canEdit && asset.status !== "dado_de_baja" && (
                  <button type="button" onClick={() => setShowDecommission(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "1.5px solid #ef444440", background: "#ef444408", fontSize: 12, fontWeight: 700, color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }}>
                    Dar de baja
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        {!editing && (
          <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${C.border}`, background: '#f8fafc' }}>
            {(['detalles', 'historial', 'tickets'] as const).map(t => {
              const labels: Record<string, string> = {
                detalles:  'Detalles',
                historial: `Historial${history.length > 0 ? ` (${history.length})` : ''}`,
                tickets:   `Tickets${asset.tickets_count > 0 ? ` (${asset.tickets_count})` : ''}`,
              };
              const active = detailTab === t;
              return (
                <button key={t} type="button" onClick={() => setDetailTab(t)} style={{
                  padding: '11px 22px', border: 'none', background: active ? '#fff' : 'transparent',
                  borderBottom: active ? '2px solid #ff5e3a' : '2px solid transparent',
                  fontSize: 12, fontWeight: 700, color: active ? '#ff5e3a' : '#94a3b8',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s, border-color .15s',
                }}>
                  {labels[t]}
                </button>
              );
            })}
          </div>
        )}

        {/* Specs — Detalles tab */}
        {detailTab === 'detalles' && fieldSchema.length > 0 && (
          <div style={{ padding: "26px 36px", borderTop: `1px solid ${C.border}` }}>
            <SectionHeader label="Ficha técnica" />
            {editing ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {fieldSchema.map((f: FieldDef) => (
                  <div key={f.key}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: C.coral, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 5px" }}>{f.label}{f.required ? " *" : ""}</p>
                    {f.type === "select" && f.options ? (
                      <select value={editForm.specifications[f.key] ?? ""} onChange={(e) => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [f.key]: e.target.value } }))} style={INPUT}>
                        <option value="">—</option>
                        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === "boolean" ? (
                      <select value={editForm.specifications[f.key] ?? ""} onChange={(e) => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [f.key]: e.target.value } }))} style={INPUT}>
                        <option value="">—</option>
                        <option value="Sí">Sí</option>
                        <option value="No">No</option>
                      </select>
                    ) : (
                      <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={editForm.specifications[f.key] ?? ""} onChange={(e) => setEditForm(frm => ({ ...frm, specifications: { ...frm.specifications, [f.key]: e.target.value } }))} style={INPUT} />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
                {fieldSchema.map((f, idx) => {
                  const rawVal = asset.specifications?.[f.key];
                  const hasValue = rawVal !== undefined && rawVal !== null && rawVal !== "";
                  const isEven = idx % 2 === 0;
                  return (
                    <div key={f.key} style={{ display: "grid", gridTemplateColumns: "130px 1fr", alignItems: "baseline", gap: 8, padding: "9px 10px", borderBottom: `1px solid ${C.border}`, borderRadius: 4, background: isEven ? "transparent" : `${C.bg}` }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, lineHeight: 1.5, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>{f.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: hasValue ? C.navy : C.muted, fontStyle: hasValue ? "normal" : "italic", fontFamily: hasValue ? "monospace" : "inherit", letterSpacing: hasValue ? ".02em" : "normal" }}>{hasValue ? String(rawVal) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Responsable | Relaciones — Detalles tab */}
        {detailTab === 'detalles' && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${C.border}` }}>
          <div style={{ padding: "26px 36px", borderRight: `1px solid ${C.border}` }}>
            <SectionHeader label="Responsable / Custodia" />
            {assignments.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <UserPlus size={24} style={{ color: C.border, display: "block", margin: "0 auto 10px" }} />
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Sin custodio asignado</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {assignments.map((asgn) => {
                  const initials = asgn.user_name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();
                  const scheduleLabel = asgn.shift ? `Turno ${asgn.shift}` : asgn.hours_start && asgn.hours_end ? `${asgn.hours_start} – ${asgn.hours_end}` : null;
                  return (
                    <div key={asgn.id} style={{ display: "flex", gap: 13, padding: "14px 16px", background: 'var(--app-card)', border: `1.5px solid ${C.border}`, borderRadius: 13 }}>
                      <button type="button" onClick={() => router.push(`/inventory/users/${asgn.user_id}/profile`)} style={{ position: "relative", flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                        {asgn.avatar_url ? (
                          <img src={asgn.avatar_url} alt={asgn.user_name} style={{ width: 44, height: 44, borderRadius: 11, objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 11, background: `${C.navy}0d`, border: `1.5px solid ${C.navy}18`, display: "grid", placeItems: "center" }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: C.navy }}>{initials}</span>
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: "50%", background: "#22c55e", border: "2.5px solid #fff" }} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <button type="button" onClick={() => router.push(`/inventory/users/${asgn.user_id}/profile`)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" as const }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: "0 0 2px" }}>{asgn.user_name}</p>
                            </button>
                            <p style={{ fontSize: 11, color: C.muted, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{asgn.user_email}</p>
                            {scheduleLabel && <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: "#3b82f6", background: "#eff6ff", padding: "2px 7px", borderRadius: 4, letterSpacing: ".05em", textTransform: "uppercase" as const }}>{scheduleLabel}</span>}
                          </div>
                          {canEdit && (
                            <button type="button" disabled={unassignMut.isPending} onClick={() => unassignMut.mutate(asgn.user_id)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", color: "#ef4444", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" as const }}>
                              Devolver
                            </button>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: C.sub, margin: "6px 0 0" }}>Asociado {relativeTime(asgn.assigned_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ padding: "26px 36px" }}>
            <SectionHeader label={children.length > 0 ? `Relaciones · ${children.length} componente${children.length !== 1 ? "s" : ""}` : "Relaciones"} />
            {asset.parent_asset_id && (
              <div style={{ marginBottom: 22 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: ".08em", margin: "0 0 9px" }}>↑ Pertenece a</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" onClick={() => router.push(`/inventory/${asset.parent_asset_id}`)}
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: 'var(--app-card)', border: `1.5px solid ${C.border}`, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.coral + "80")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: `${C.coral}10`, border: `1.5px solid ${C.coral}28`, display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <Package size={16} style={{ color: C.coral }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{asset.parent_asset_name || "—"}</p>
                      {asset.parent_asset_status && <StatusBadge status={asset.parent_asset_status} />}
                    </div>
                    <ChevronRight size={14} style={{ color: C.muted, flexShrink: 0 }} />
                  </button>
                  {canEdit && (
                    <button type="button" disabled={relateMut.isPending} onClick={() => relateMut.mutate({ target_id: asset.parent_asset_id!, relation: "remove-parent" })}
                      style={{ padding: "9px", borderRadius: 9, border: "1.5px solid #ef444430", background: "#ef444408", color: "#ef4444", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {children.length > 0 ? (
              <div>
                {asset.parent_asset_id && <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: ".08em", margin: "0 0 10px" }}>Componentes</p>}
                <div style={{ position: "relative", paddingLeft: 22 }}>
                  <div style={{ position: "absolute", left: 6, top: 10, bottom: 10, width: 2, background: C.border, borderRadius: 2 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {children.map((child) => (
                      <div key={child.id} style={{ position: "relative" }}>
                        <div style={{ position: "absolute", left: -16, top: 18, width: 14, height: 2, background: C.border }} />
                        <button type="button" onClick={() => router.push(`/inventory/${child.id}`)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = C.coral + "80"; e.currentTarget.style.background = "#fff"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: getAssetStatusConfig(child.status).text, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: "0 0 1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{child.name}</p>
                            <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{child.category_name}</p>
                          </div>
                          <StatusBadge status={child.status} />
                          <ChevronRight size={12} style={{ color: C.muted, flexShrink: 0 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : !asset.parent_asset_id ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Activo raíz. Sin componentes asociados.</p>
            ) : (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Sin componentes asociados.</p>
            )}
          </div>
        </div>}

        {/* Tickets tab — full list */}
        {detailTab === 'tickets' && (
          <div style={{ padding: "26px 36px", borderTop: `1px solid ${C.border}` }}>
            <SectionHeader label={`Tickets asociados${asset.tickets_count > 0 ? ` (${asset.tickets_count})` : ""}`} action={null} />
            {assetTickets.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={24} />} text="Sin tickets asociados a este activo." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {assetTickets.map((ticket) => {
                  const pColor = PRIORITY_COLORS[ticket.priority] ?? C.muted;
                  return (
                    <div key={ticket.id} style={{ display: "flex", alignItems: "stretch", gap: 0, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                      <div style={{ width: 4, background: pColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, padding: "10px 13px", minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.coral, fontFamily: "monospace" }}>#{ticket.id.slice(0, 8)}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, color: ticket.is_final ? "#16a34a" : "#c2410c", background: ticket.is_final ? "#f0fdf4" : "#fff7ed", padding: "2px 7px", borderRadius: 4 }}>{ticket.state_label}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: pColor, textTransform: "uppercase" as const, marginLeft: "auto" }}>● {ticket.priority}</span>
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{ticket.title}</p>
                        <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{ticket.creator_name} · {fmtDate(ticket.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Historial tab — full timeline */}
        {detailTab === 'historial' && (
          <div style={{ padding: "26px 36px", borderTop: `1px solid ${C.border}` }}>
            <SectionHeader label={`Auditoría del activo${history.length > 0 ? ` (${history.length})` : ""}`} action={null} />
            {history.length === 0 ? (
              <EmptyState icon={<Clock size={24} />} text="Sin eventos registrados." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {history.map((h, i) => {
                  const color  = ASSET_ACTION_COLORS[h.action] ?? C.muted;
                  const label  = ASSET_ACTION_LABELS[h.action] ?? h.action;
                  const isLast = i === history.length - 1;
                  return (
                    <div key={h.id} style={{ display: "flex", gap: 14, paddingBottom: isLast ? 0 : 16, position: "relative" }}>
                      {!isLast && <div style={{ position: "absolute", left: 12, top: 24, width: 2, height: "calc(100% - 6px)", background: C.border }} />}
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${color}14`, border: `2px solid ${color}35`, display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                      </div>
                      <div style={{ flex: 1, paddingTop: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: "0 0 2px" }}>
                          {label}{h.user_name && h.user_name !== h.actor_name ? <span style={{ fontWeight: 500, color: C.sub }}> {h.user_name}</span> : null}
                        </p>
                        <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>por {h.actor_name} · {fmtDate(h.created_at)}</p>
                        {h.reason && <p style={{ fontSize: 11, color: C.sub, margin: "1px 0 0", fontStyle: "italic" }}>{h.reason}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Modals ── */}
      {showAssign && (
        <AssignModal onAssign={(rows) => assignMut.mutate(rows)} onClose={() => setShowAssign(false)} pending={assignMut.isPending} />
      )}
      {showDecommission && (
        <DecommissionModal onDecommission={(reason) => transMut.mutate({ status: "dado_de_baja", reason })} onClose={() => setShowDecommission(false)} pending={transMut.isPending} />
      )}
      {showRelate && (
        <RelateAssetModal currentAssetId={assetId} currentAssetName={asset.name} moduleId={moduleId}
          onRelate={(targetId, type) => relateMut.mutate({ target_id: targetId, relation: type === "child" ? "set-child" : "set-parent" })}
          onClose={() => setShowRelate(false)} pending={relateMut.isPending} />
      )}
      {showReport && (
        <ReportProblemModal assetName={asset.name} assetId={assetId} moduleId={asset.module_id} categoryId={asset.category_id} environmentId={asset.environment_id} onClose={() => setShowReport(false)} />
      )}
      {showCamera && (
        <CameraModal onCapture={(file) => { setShowCamera(false); handleRawFile(file, "camera"); }} onCancel={() => setShowCamera(false)} />
      )}
      {cropPending && (
        <CropModal file={cropPending.file} source={cropPending.source} onConfirm={handleCropConfirm} onCancel={() => setCropPending(null)} />
      )}
      {lightboxIdx !== null && images.length > 0 && (
        <ImageLightbox images={images} initialIdx={lightboxIdx} onClose={() => setLightboxIdx(null)} canEdit={canEdit && editing} onDelete={(id) => setConfirmDeleteImgId(id)} deletePending={deleteImgMut.isPending} />
      )}
      {showQr && (
        <QrModal assetId={assetId} assetName={asset.name} onClose={() => setShowQr(false)} />
      )}
      {confirmDeleteImgId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setConfirmDeleteImgId(null)}>
          <div style={{ background: 'var(--app-card)', borderRadius: 14, padding: "28px 28px 24px", width: 340, boxShadow: "0 8px 40px rgba(0,0,0,.22)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fef2f2", border: "1.5px solid #fecaca", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Trash2 size={17} style={{ color: "#ef4444" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#0e2235", margin: "0 0 2px" }}>¿Eliminar imagen?</p>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirmDeleteImgId(null)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e2e8f0", background: 'var(--app-card)', fontSize: 12, fontWeight: 700, color: "#0e2235", cursor: "pointer", fontFamily: "inherit" }}>
                Cancelar
              </button>
              <button type="button" disabled={deleteImgMut.isPending} onClick={() => { deleteImgMut.mutate(confirmDeleteImgId); setConfirmDeleteImgId(null); }}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#ef4444", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit", opacity: deleteImgMut.isPending ? 0.6 : 1 }}>
                {deleteImgMut.isPending ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
