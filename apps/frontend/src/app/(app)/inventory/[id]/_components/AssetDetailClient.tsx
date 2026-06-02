"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  QrCode,
  Pencil,
  Package,
  CheckCircle2,
  X,
  Clock,
  Save,
  Link2,
  ImagePlus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Camera,
} from "lucide-react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { useAuthStore } from "@/stores/auth.store";
import { useModules } from "@/hooks/useModules";
import { useModuleNav } from "@/hooks/useModuleNav";
import { usersService } from "@/services/users.service";
import { ticketsService } from "@/services/tickets.service";
import {
  INVENTORY_NAV,
  INVENTORY_MODULE_NAME,
  isInventoryModule,
} from "../../_nav";
import {
  inventoryService,
  type AssetDetail,
  type AssetStatus,
  type AssetAssignment,
  type AssetHistoryEntry,
  type AssetTicket,
  type AssetChild,
  type FieldDef,
  type AssetImage,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_COLORS,
  ASSET_ACTION_LABELS,
  ASSET_ACTION_COLORS,
} from "@/services/inventory.service";
import { ADMIN_ROLES } from "@/constants/roles";
import { fmtDate } from "@/lib/formatters";

/* ── Tokens ── */
const C = {
  navy: "#0e2235",
  coral: "#ff5e3a",
  border: "#e2e8f0",
  muted: "#94a3b8",
  sub: "#64748b",
  text: "#1e293b",
  bg: "#f8fafc",
};

const FSM_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  disponible: ["en_reparacion", "dado_de_baja"],
  asignado: ["en_reparacion", "dado_de_baja"],
  en_reparacion: ["disponible", "dado_de_baja"],
  dado_de_baja: [],
};
const FSM_LABELS: Partial<Record<AssetStatus, string>> = {
  en_reparacion: "Enviar a reparación",
  dado_de_baja: "Dar de baja",
  disponible: "Marcar disponible",
};
const FSM_COLORS: Partial<Record<AssetStatus, string>> = {
  en_reparacion: "#f59e0b",
  dado_de_baja: "#ef4444",
  disponible: "#22c55e",
};
const PRIORITY_COLORS: Record<string, string> = {
  critica: "#ef4444",
  alta: "#f97316",
  media: "#f59e0b",
  baja: "#22c55e",
};

const INPUT: React.CSSProperties = {
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

/* ── StatusBadge ── */
function StatusBadge({ status }: { status: AssetStatus }) {
  const color = ASSET_STATUS_COLORS[status];
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
        background: `${color}18`,
        color,
        border: `1px solid ${color}35`,
      }}
    >
      <span
        style={{ width: 7, height: 7, borderRadius: "50%", background: color }}
      />
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

/* ── InfoRow ── */
function InfoRow({
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
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".09em",
          textTransform: "uppercase",
          color: C.muted,
          margin: "0 0 4px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: C.navy,
          margin: 0,
          fontFamily: mono ? "monospace" : "inherit",
          letterSpacing: mono ? ".04em" : "normal",
          wordBreak: "break-all",
          lineHeight: 1.3,
        }}
      >
        {value || "—"}
      </p>
    </div>
  );
}

/* ── SectionHeader ── */
function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
        paddingBottom: 12,
        borderBottom: `2px solid ${C.coral}`,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: C.navy,
          margin: 0,
        }}
      >
        {label}
      </p>
      {action}
    </div>
  );
}

/* ── EmptyState ── */
function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: "32px 0", textAlign: "center" }}>
      <div
        style={{
          color: C.border,
          display: "flex",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        {icon}
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{text}</p>
    </div>
  );
}

/* ── QrModal ── */
function QrModal({
  assetId,
  assetName,
  onClose,
}: {
  assetId: string;
  assetName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["asset-qr", assetId],
    queryFn: () => inventoryService.getQr(assetId),
    staleTime: 10 * 60_000,
  });
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,34,53,.6)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        backdropFilter: "blur(3px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "28px 32px",
          textAlign: "center",
          maxWidth: 280,
          width: "100%",
          position: "relative",
          boxShadow: "0 32px 72px rgba(14,34,53,.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.bg,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: C.muted,
          }}
        >
          <X size={13} />
        </button>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `${C.coral}12`,
            display: "grid",
            placeItems: "center",
            margin: "0 auto 12px",
          }}
        >
          <QrCode size={20} style={{ color: C.coral }} />
        </div>
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.navy,
            margin: "0 0 4px",
          }}
        >
          {assetName}
        </p>
        <p
          style={{
            fontSize: 10,
            color: C.muted,
            margin: "0 0 18px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: ".06em",
          }}
        >
          Código QR
        </p>
        {isLoading && (
          <div
            style={{
              height: 180,
              display: "grid",
              placeItems: "center",
              color: C.muted,
              fontSize: 12,
            }}
          >
            Generando…
          </div>
        )}
        {data?.qr_image && (
          <>
            <img
              src={data.qr_image}
              alt="QR"
              style={{
                width: 180,
                height: 180,
                margin: "0 auto",
                display: "block",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
              }}
            />
            <p
              style={{
                fontSize: 10,
                color: C.muted,
                marginTop: 12,
                fontFamily: "monospace",
                letterSpacing: ".06em",
              }}
            >
              {data.qr_code}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── CropModal ── */
const CROP_SIZE = 360;

function CropModal({
  file,
  source,
  onConfirm,
  onCancel,
}: {
  file: File;
  source: "file" | "camera";
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{
    mx: number;
    my: number;
    ox: number;
    oy: number;
  } | null>(null);

  /* Load image */
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      /* Start with cover (fill frame) */
      const z = Math.max(CROP_SIZE / image.width, CROP_SIZE / image.height);
      setZoom(z);
      setOffset({
        x: (CROP_SIZE - image.width * z) / 2,
        y: (CROP_SIZE - image.height * z) / 2,
      });
      setImg(image);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /* Draw */
  useEffect(() => {
    if (!canvasRef.current || !img) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.drawImage(img, offset.x, offset.y, img.width * zoom, img.height * zoom);
  }, [img, offset, zoom]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = {
      mx: e.clientX,
      my: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }
  function moveDrag(e: React.MouseEvent) {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.mx),
      y: dragRef.current.oy + (e.clientY - dragRef.current.my),
    });
  }
  function endDrag() {
    dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.05), 20);
    /* Zoom centered on canvas center */
    const cx = CROP_SIZE / 2;
    const cy = CROP_SIZE / 2;
    if (!img) {
      setZoom(newZoom);
      return;
    }
    const ix = (cx - offset.x) / zoom;
    const iy = (cy - offset.y) / zoom;
    setOffset({ x: cx - ix * newZoom, y: cy - iy * newZoom });
    setZoom(newZoom);
  }

  function confirm() {
    canvasRef.current?.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,34,53,.88)",
        zIndex: 95,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "26px 28px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 32px 80px rgba(0,0,0,.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: C.coral,
            textTransform: "uppercase",
            letterSpacing: ".12em",
            margin: "0 0 5px",
          }}
        >
          {source === "camera" ? "Fotografía capturada" : "Imagen cargada"}
        </p>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: C.navy,
            margin: "0 0 6px",
          }}
        >
          Ajustar recorte
        </h3>
        <p style={{ fontSize: 12, color: C.muted, margin: "0 0 16px" }}>
          Arrastra para encuadrar · Rueda del ratón para zoom
        </p>

        <div
          style={{
            position: "relative",
            width: CROP_SIZE,
            height: CROP_SIZE,
            margin: "0 auto 18px",
            borderRadius: 10,
            overflow: "hidden",
            border: `2px solid ${C.coral}`,
            cursor: dragRef.current ? "grabbing" : "grab",
            boxShadow: `0 0 0 4px ${C.coral}20`,
          }}
        >
          {!img && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: C.bg,
              }}
            >
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                Cargando imagen…
              </p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={CROP_SIZE}
            height={CROP_SIZE}
            onMouseDown={startDrag}
            onMouseMove={moveDrag}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onWheel={onWheel}
            style={{ display: "block", userSelect: "none" }}
          />
          {/* Corner guides */}
          {["top-left", "top-right", "bottom-left", "bottom-right"].map(
            (pos) => {
              const [v, h] = pos.split("-");
              return (
                <div
                  key={pos}
                  style={{
                    position: "absolute",
                    [v]: 0,
                    [h]: 0,
                    width: 22,
                    height: 22,
                    borderTop: v === "top" ? `3px solid ${C.coral}` : "none",
                    borderBottom:
                      v === "bottom" ? `3px solid ${C.coral}` : "none",
                    borderLeft: h === "left" ? `3px solid ${C.coral}` : "none",
                    borderRight:
                      h === "right" ? `3px solid ${C.coral}` : "none",
                    pointerEvents: "none",
                  }}
                />
              );
            },
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "#fff",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
              color: C.sub,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!img}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: C.navy,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: img ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              opacity: img ? 1 : 0.5,
            }}
          >
            Confirmar recorte
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ImageLightbox (zoom + pan + fullscreen) ── */
function ImageLightbox({
  images,
  initialIdx,
  onClose,
  canEdit,
  onDelete,
  deletePending,
}: {
  images: AssetImage[];
  initialIdx: number;
  onClose: () => void;
  canEdit: boolean;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  const [idx, setIdx] = useState(Math.min(initialIdx, images.length - 1));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFs, setIsFs] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    mx: number;
    my: number;
    px: number;
    py: number;
  } | null>(null);
  const current = images[idx];

  /* Reset zoom on slide change */
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [idx]);

  /* Keyboard */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")
        setIdx((i) => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          return (i - 1 + images.length) % images.length;
        });
      if (e.key === "ArrowRight")
        setIdx((i) => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          return (i + 1) % images.length;
        });
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  function onImgWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom((z) => Math.min(Math.max(z * factor, 0.5), 12));
  }
  function startPan(e: React.MouseEvent) {
    if (zoom <= 1) return;
    panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }
  function movePan(e: React.MouseEvent) {
    if (!panRef.current) return;
    setPan({
      x: panRef.current.px + (e.clientX - panRef.current.mx) / zoom,
      y: panRef.current.py + (e.clientY - panRef.current.my) / zoom,
    });
  }
  function endPan() {
    panRef.current = null;
  }

  function clickImg() {
    if (zoom > 1.2) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else setZoom(2.5);
  }

  function toggleFs() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFs(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFs(false);
    }
  }

  if (!current) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.95)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 20px",
          background: "rgba(0,0,0,.5)",
          backdropFilter: "blur(4px)",
          zIndex: 10000,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,.65)",
              margin: 0,
              fontWeight: 600,
            }}
          >
            {idx + 1} / {images.length}
          </p>
          {zoom !== 1 && (
            <p
              style={{
                fontSize: 11,
                color: C.coral,
                margin: 0,
                fontWeight: 700,
              }}
            >
              {Math.round(zoom * 100)}%
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFs();
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(255,255,255,.12)",
              border: "none",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              color: "#fff",
            }}
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(255,255,255,.12)",
              border: "none",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              color: "#fff",
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Image area — click outside image closes lightbox */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          overflow: "hidden",
          paddingTop: 52,
          paddingBottom: images.length > 1 ? 80 : 0,
        }}
        onClick={onClose}
      >
        <img
          src={current.storage_url}
          alt={current.file_name}
          style={{
            maxWidth: zoom === 1 ? "90vw" : undefined,
            maxHeight: zoom === 1 ? "78vh" : undefined,
            objectFit: "contain",
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transition: panRef.current ? "none" : "transform .18s",
            cursor:
              zoom > 1 ? (panRef.current ? "grabbing" : "grab") : "zoom-in",
            userSelect: "none",
            borderRadius: zoom === 1 ? 8 : 0,
          }}
          draggable={false}
          onWheel={onImgWheel}
          onMouseDown={(e) => { e.stopPropagation(); startPan(e); }}
          onMouseMove={movePan}
          onMouseUp={endPan}
          onMouseLeave={endPan}
          onClick={(e) => { e.stopPropagation(); clickImg(); }}
          onDoubleClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }); }}
        />
      </div>

      {/* Hint */}
      {zoom === 1 && (
        <p
          style={{
            position: "fixed",
            top: 58,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            color: "rgba(255,255,255,.3)",
            margin: 0,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          clic para zoom · rueda para zoom · doble clic para ajustar
        </p>
      )}

      {/* Prev / Next */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setIdx((i) => (i - 1 + images.length) % images.length);
            }}
            style={{
              position: "fixed",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              width: 46,
              height: 46,
              borderRadius: 11,
              background: "rgba(255,255,255,.12)",
              border: "none",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              zIndex: 10001,
            }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setIdx((i) => (i + 1) % images.length);
            }}
            style={{
              position: "fixed",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              width: 46,
              height: 46,
              borderRadius: 11,
              background: "rgba(255,255,255,.12)",
              border: "none",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              zIndex: 92,
            }}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 6,
            padding: "12px 24px 16px",
            background: "rgba(0,0,0,.6)",
            backdropFilter: "blur(6px)",
            overflowX: "auto",
            zIndex: 10000,
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setIdx(i);
              }}
              style={{
                width: 58,
                height: 58,
                borderRadius: 8,
                overflow: "hidden",
                border: `2px solid ${i === idx ? C.coral : "rgba(255,255,255,.25)"}`,
                flexShrink: 0,
                background: "rgba(0,0,0,.4)",
                cursor: "pointer",
                padding: 0,
                transition: "border-color .15s",
              }}
            >
              <img
                src={img.storage_url}
                alt={img.file_name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── AssignModal ── */
function AssignModal({
  moduleUsers,
  onAssign,
  onClose,
  pending,
}: {
  moduleUsers: any[];
  onAssign: (userId: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [userId, setUserId] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", maxWidth: 400, width: "100%", boxShadow: "0 24px 60px rgba(14,34,53,.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 3px" }}>Responsable / Custodia</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>Asignar custodio</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "grid", placeItems: "center", color: C.muted }}>
            <X size={14} />
          </button>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Usuario</p>
        <select value={userId} onChange={(e) => setUserId(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: C.text, marginBottom: 22, boxSizing: "border-box" as const }}>
          <option value="">Seleccionar usuario…</option>
          {moduleUsers.map((u: any) => (
            <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.role_name}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!userId || pending} onClick={() => { if (userId) onAssign(userId); }}
            style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: userId && !pending ? C.navy : C.muted, color: "#fff", fontSize: 12, fontWeight: 700, cursor: userId && !pending ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {pending ? "Asignando…" : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── StatusModal ── */
function StatusModal({
  currentStatus,
  transitions,
  onTransition,
  onClose,
  pending,
}: {
  currentStatus: AssetStatus;
  transitions: AssetStatus[];
  onTransition: (status: AssetStatus, reason: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [newStatus, setNewStatus] = useState<AssetStatus | "">("");
  const [reason, setReason] = useState("");
  const isDanger = newStatus === "dado_de_baja";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", maxWidth: 420, width: "100%", boxShadow: "0 24px 60px rgba(14,34,53,.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 3px" }}>Activo</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>Cambiar estado</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "grid", placeItems: "center", color: C.muted }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: C.bg, borderRadius: 9, marginBottom: 18 }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, fontWeight: 600 }}>Estado actual:</p>
          <StatusBadge status={currentStatus} />
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Nuevo estado</p>
        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as AssetStatus)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: C.text, marginBottom: 14, boxSizing: "border-box" as const }}>
          <option value="">Seleccionar…</option>
          {transitions.map((s) => <option key={s} value={s}>{FSM_LABELS[s] ?? s}</option>)}
        </select>
        {isDanger && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: "#ef4444", margin: 0, fontWeight: 600 }}>Esta acción no puede revertirse. El activo quedará registrado como dado de baja permanentemente.</p>
          </div>
        )}
        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Motivo (opcional)</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Describe el motivo del cambio…"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", marginBottom: 22, boxSizing: "border-box" as const }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!newStatus || pending} onClick={() => { if (newStatus) onTransition(newStatus as AssetStatus, reason); }}
            style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: !newStatus || pending ? C.muted : isDanger ? "#ef4444" : C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: !newStatus || pending ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {pending ? "Guardando…" : isDanger ? "Dar de baja" : "Guardar cambio"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── RelateAssetModal ── */
function RelateAssetModal({
  currentAssetId,
  currentAssetName,
  onRelate,
  onClose,
  pending,
}: {
  currentAssetId: string;
  currentAssetName: string;
  onRelate: (targetId: string, type: "child" | "parent") => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [assetCode, setAssetCode] = useState("");
  const [relType, setRelType] = useState<"child" | "parent">("child");

  const BTN: React.CSSProperties = { padding: "9px 22px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const SEL: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: C.text, marginBottom: 14, boxSizing: "border-box" as const };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", maxWidth: 420, width: "100%", boxShadow: "0 24px 60px rgba(14,34,53,.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 3px" }}>Relaciones</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>Asociar dispositivo</h3>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "grid", placeItems: "center", color: C.muted }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: "10px 14px", background: C.bg, borderRadius: 9, marginBottom: 18, display: "flex", gap: 8, alignItems: "center" }}>
          <Link2 size={13} style={{ color: C.muted, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{currentAssetName}</span>
        </div>

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Tipo de relación</p>
        <select value={relType} onChange={(e) => setRelType(e.target.value as "child" | "parent")} style={SEL}>
          <option value="child">Este activo contiene al otro (componente hijo)</option>
          <option value="parent">El otro activo contiene a este (activo padre)</option>
        </select>

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>ID o Código QR del dispositivo</p>
        <input value={assetCode} onChange={(e) => setAssetCode(e.target.value)} placeholder="Ej: QR-PENDING-abc123 o UUID…"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 22, boxSizing: "border-box" as const }} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ ...BTN, border: `1px solid ${C.border}`, background: "#fff", color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!assetCode.trim() || pending} onClick={() => { if (assetCode.trim()) onRelate(assetCode.trim(), relType); }}
            style={{ ...BTN, background: assetCode.trim() && !pending ? C.navy : C.muted, color: "#fff", cursor: assetCode.trim() && !pending ? "pointer" : "not-allowed" }}>
            {pending ? "Asociando…" : "Asociar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ReportProblemModal ── */
function ReportProblemModal({
  assetName,
  assetId,
  moduleName,
  onClose,
}: {
  assetName: string;
  assetId: string;
  moduleName: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(`Problema con: ${assetName}`);
  const [description, setDescription] = useState("");
  const [sent, setSent] = useState(false);

  const BTN: React.CSSProperties = {
    padding: "9px 22px", borderRadius: 8, border: "none", fontSize: 12,
    fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  };

  if (sent) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "32px", maxWidth: 380, width: "100%", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f0fdf4", border: "2px solid #22c55e", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <CheckCircle2 size={24} style={{ color: "#22c55e" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: "0 0 8px" }}>Reporte enviado</h3>
          <p style={{ fontSize: 13, color: C.sub, margin: "0 0 24px", lineHeight: 1.6 }}>
            El problema fue reportado al módulo <strong>{moduleName}</strong>. Un técnico lo revisará pronto.
          </p>
          <button type="button" onClick={onClose} style={{ ...BTN, background: C.navy, color: "#fff" }}>Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", maxWidth: 460, width: "100%", boxShadow: "0 24px 60px rgba(14,34,53,.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 3px" }}>
              {moduleName}
            </p>
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

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Título</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 14, boxSizing: "border-box" as const }} />

        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px" }}>Descripción</p>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe el problema con el mayor detalle posible…"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", marginBottom: 22, boxSizing: "border-box" as const }} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ ...BTN, border: `1px solid ${C.border}`, background: "#fff", color: C.sub }}>Cancelar</button>
          <button type="button" disabled={!title.trim()}
            onClick={() => {
              /* TODO: wire to ticketsService.create(moduleId, { title, description, asset_id: assetId }) */
              setSent(true);
            }}
            style={{ ...BTN, background: title.trim() ? C.coral : C.muted, color: "#fff", cursor: title.trim() ? "pointer" : "not-allowed" }}>
            Enviar reporte
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── CameraModal — captura via getUserMedia ── */
function CameraModal({
  onCapture,
  onCancel,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => {
        if (!mounted) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); setReady(true); };
        }
      })
      .catch(() => {
        if (mounted) setError("No se pudo acceder a la cámara. Verifica los permisos del navegador.");
      });
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function close() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,34,53,.92)",
        zIndex: 95,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(4px)",
      }}
      onClick={close}
    >
      <div
        style={{
          background: "#000",
          borderRadius: 16,
          overflow: "hidden",
          maxWidth: 640,
          width: "100%",
          boxShadow: "0 32px 80px rgba(0,0,0,.7)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "rgba(0,0,0,.6)",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1,
          }}
        >
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: 0 }}>
              Fotografía capturada
            </p>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#fff", margin: 0 }}>
              Cámara
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.15)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "#fff" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Video */}
        {error ? (
          <div style={{ padding: "80px 32px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#ef4444", margin: "0 0 16px" }}>{error}</p>
            <button
              type="button"
              onClick={close}
              style={{ padding: "8px 20px", borderRadius: 8, background: C.navy, border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", display: "block", minHeight: 320, background: "#111", marginTop: 52 }}
            />
            {/* Controls */}
            <div style={{ padding: "16px", background: "rgba(0,0,0,.7)", display: "flex", justifyContent: "center", gap: 12 }}>
              <button
                type="button"
                onClick={close}
                style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(255,255,255,.12)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={capture}
                disabled={!ready}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "10px 28px",
                  borderRadius: 10,
                  background: ready ? C.coral : "rgba(255,255,255,.2)",
                  border: "none",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: ready ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                }}
              >
                <Camera size={15} />
                {ready ? "Capturar" : "Iniciando…"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── AssetDetailClient ── */
export function AssetDetailClient({ assetId }: { assetId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { modules } = useModules();
  const inventoryId = modules?.find(isInventoryModule)?.id;
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;
  const canEdit =
    isSuperadmin ||
    (user?.module_roles
      ?.filter((r) => r.status === "active")
      .some((r) => (ADMIN_ROLES as string[]).includes(r.role_name)) ??
      false);
  const moduleId = inventoryId ?? "";

  /* ── UI state ── */
  const [showQr, setShowQr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showRelate, setShowRelate] = useState(false);
  const [selectedImg, setSelectedImg] = useState(0);
  const [cropPending, setCropPending] = useState<{
    file: File;
    source: "file" | "camera";
  } | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  /* ── Queries ── */
  const { data: asset, isLoading } = useQuery<AssetDetail>({
    queryKey: ["asset-detail", assetId],
    queryFn: () => inventoryService.getOne(assetId),
    staleTime: 30_000,
  });

  const { data: assignment } = useQuery<AssetAssignment | null>({
    queryKey: ["asset-assignment", assetId],
    queryFn: () => inventoryService.getCurrentAssignment(assetId),
    staleTime: 30_000,
  });

  const { data: assetTickets = [] } = useQuery<AssetTicket[]>({
    queryKey: ["asset-tickets", assetId],
    queryFn: () => inventoryService.getAssetTickets(assetId),
    staleTime: 60_000,
  });

  const { data: history = [] } = useQuery<AssetHistoryEntry[]>({
    queryKey: ["asset-history", assetId],
    queryFn: () => inventoryService.getHistory(assetId),
    staleTime: 30_000,
  });

  const { data: images = [] } = useQuery<AssetImage[]>({
    queryKey: ["asset-images", assetId],
    queryFn: () => inventoryService.getAssetImages(assetId),
    staleTime: 60_000,
  });

  const { data: children = [] } = useQuery<AssetChild[]>({
    queryKey: ["asset-children", assetId],
    queryFn: () => inventoryService.getChildAssets(assetId),
    staleTime: 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["ticket-categories", moduleId],
    queryFn: () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
    enabled: editing && !!moduleId,
  });

  const { data: environments = [] } = useQuery({
    queryKey: ["ticket-environments", moduleId],
    queryFn: () => ticketsService.getEnvironments(moduleId),
    staleTime: 5 * 60_000,
    enabled: editing && !!moduleId,
  });

  const { data: moduleUsers = [] } = useQuery({
    queryKey: ["module-members", moduleId],
    queryFn: () => usersService.getModuleUsers(moduleId),
    staleTime: 5 * 60_000,
    enabled: !!moduleId,
  });

  /* Clamp selectedImg */
  useEffect(() => {
    if (images.length > 0 && selectedImg >= images.length)
      setSelectedImg(images.length - 1);
  }, [images.length, selectedImg]);

  /* ── Edit form ── */
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    serial_number: string;
    category_id: string;
    environment_id: string;
    specifications: Record<string, string>;
  }>({
    name: "",
    description: "",
    serial_number: "",
    category_id: "",
    environment_id: "",
    specifications: {},
  });

  function startEditing() {
    if (!asset) return;
    const specs: Record<string, string> = {};
    if (asset.specifications)
      Object.entries(asset.specifications).forEach(([k, v]) => {
        specs[k] = String(v);
      });
    setEditForm({
      name: asset.name,
      description: asset.description ?? "",
      serial_number: asset.serial_number ?? "",
      category_id: asset.category_id,
      environment_id: asset.environment_id,
      specifications: specs,
    });
    setEditing(true);
    setActionErr("");
  }

  /* ── Mutations ── */
  const inv = () => {
    qc.invalidateQueries({ queryKey: ["asset-detail", assetId] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  const updateMut = useMutation({
    mutationFn: () => {
      const specs: Record<string, unknown> = {};
      Object.entries(editForm.specifications).forEach(([k, v]) => {
        if (v.trim()) specs[k] = v;
      });
      return inventoryService.update(assetId, {
        name: editForm.name.trim() || undefined,
        description: editForm.description.trim() || undefined,
        serial_number: editForm.serial_number.trim() || undefined,
        category_id: editForm.category_id || undefined,
        environment_id: editForm.environment_id || undefined,
        specifications: Object.keys(specs).length ? specs : undefined,
      });
    },
    onSuccess: () => {
      setEditing(false);
      setActionErr("");
      inv();
    },
    onError: (e: any) =>
      setActionErr(e?.response?.data?.message ?? "Error al guardar"),
  });

  const transMut = useMutation({
    mutationFn: ({ status, reason }: { status: AssetStatus; reason?: string }) =>
      inventoryService.transition(assetId, { status, reason: reason || undefined }),
    onSuccess: () => {
      setShowStatusModal(false);
      setActionErr("");
      inv();
      qc.invalidateQueries({ queryKey: ["asset-assignment", assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error"),
  });

  const assignMut = useMutation({
    mutationFn: (userId: string) =>
      inventoryService.assign(assetId, { user_id: userId }),
    onSuccess: () => {
      setShowAssign(false);
      inv();
      qc.invalidateQueries({ queryKey: ["asset-assignment", assetId] });
      qc.invalidateQueries({ queryKey: ["asset-history", assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error"),
  });

  const unassignMut = useMutation({
    mutationFn: () => inventoryService.unassign(assetId),
    onSuccess: () => {
      inv();
      qc.invalidateQueries({ queryKey: ["asset-assignment", assetId] });
      qc.invalidateQueries({ queryKey: ["asset-history", assetId] });
    },
    onError: (e: any) => setActionErr(e?.response?.data?.message ?? "Error"),
  });

  const uploadImgMut = useMutation({
    mutationFn: (file: File) =>
      inventoryService.uploadAssetImage(assetId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-images", assetId] });
      inv();
    },
    onError: (e: any) =>
      setActionErr(e?.response?.data?.message ?? "Error al subir imagen"),
  });

  const deleteImgMut = useMutation({
    mutationFn: (imageId: string) =>
      inventoryService.deleteAssetImage(assetId, imageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-images", assetId] });
      inv();
      if (images.length <= 1) setLightboxIdx(null);
    },
    onError: (e: any) =>
      setActionErr(e?.response?.data?.message ?? "Error al eliminar imagen"),
  });

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

  function handleRawFile(
    file: File | undefined | null,
    source: "file" | "camera",
  ) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setActionErr("La imagen no puede superar 10 MB.");
      return;
    }
    setCropPending({ file, source });
  }

  function handleCropConfirm(blob: Blob) {
    const ext = blob.type === "image/png" ? "png" : "jpg";
    const file = new File([blob], `asset-${Date.now()}.${ext}`, {
      type: blob.type,
    });
    uploadImgMut.mutate(file);
    setCropPending(null);
  }

  /* ── Derived ── */
  const fieldSchema: FieldDef[] = useMemo(
    () => asset?.field_schema ?? [],
    [asset],
  );
  const custodianHistory = useMemo(
    () => history.filter((h) => ["asignado", "devuelto"].includes(h.action)),
    [history],
  );
  const safeIdx =
    images.length > 0 ? Math.min(selectedImg, images.length - 1) : 0;

  /* ── Loading / not found ── */
  if (isLoading)
    return (
      <ModuleLayout
        moduleId={inventoryId}
        title="Inventario"
        description=""
        isSuperadmin={isSuperadmin}
        hideInfo
      >
        <div
          style={{
            padding: "80px 0",
            textAlign: "center",
            color: C.muted,
            fontSize: 13,
          }}
        >
          Cargando ficha…
        </div>
      </ModuleLayout>
    );
  if (!asset)
    return (
      <ModuleLayout
        moduleId={inventoryId}
        title="Inventario"
        description=""
        isSuperadmin={isSuperadmin}
        hideInfo
      >
        <div
          style={{
            padding: "80px 0",
            textAlign: "center",
            color: C.muted,
            fontSize: 13,
          }}
        >
          Activo no encontrado.
        </div>
      </ModuleLayout>
    );

  return (
    <ModuleLayout
      moduleId={inventoryId}
      title="Inventario"
      description=""
      isSuperadmin={isSuperadmin}
      hideInfo
    >
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 18,
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/inventory")}
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            background: C.bg,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            color: C.navy,
          }}
        >
          <ArrowLeft size={14} />
        </button>
        <span style={{ fontSize: 11, color: C.muted }}>Inventario</span>
        <ChevronRight size={12} style={{ color: C.muted }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>
          {asset.name}
        </span>
      </div>

      {/* Error bar */}
      {actionErr && (
        <div
          style={{
            padding: "10px 16px",
            background: "#FEF2F2",
            border: `1px solid #FECACA`,
            borderRadius: 8,
            marginBottom: 14,
          }}
        >
          <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>
            {actionErr}
          </p>
        </div>
      )}

      {/* ══ HEADER CARD ══ */}
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${C.border}`,
          overflow: "hidden",
          boxShadow: "0 2px 18px rgba(14,34,53,.08)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "42% 58%" }}>
          {/* Gallery — light background */}
          <div
            style={{
              background: C.bg,
              display: "flex",
              flexDirection: "column",
              borderRight: `1px solid ${C.border}`,
            }}
          >
            {/* Main image */}
            <div
              style={{
                flex: 1,
                minHeight: 280,
                position: "relative",
                cursor: images.length > 0 ? "zoom-in" : "default",
                overflow: "hidden",
                background: C.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => images.length > 0 && setLightboxIdx(safeIdx)}
            >
              {images.length > 0 ? (
                <>
                  <img
                    key={images[safeIdx].id}
                    src={images[safeIdx].storage_url}
                    alt={images[safeIdx].file_name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      position: "absolute",
                      inset: 0,
                    }}
                  />
                  {images.length > 1 && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        right: 8,
                        background: "rgba(14,34,53,.55)",
                        borderRadius: 6,
                        padding: "3px 9px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fff",
                        pointerEvents: "none",
                      }}
                    >
                      {safeIdx + 1} / {images.length}
                    </div>
                  )}
                </>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    opacity: 0.4,
                    padding: 32,
                  }}
                >
                  <Package size={52} style={{ color: C.muted }} />
                  <p
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      margin: 0,
                      textAlign: "center",
                      lineHeight: 1.5,
                    }}
                  >
                    {asset.category_name}
                    <br />
                    Sin imágenes
                  </p>
                </div>
              )}
            </div>

            {/* Thumbnails strip */}
            {images.length > 1 && (
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: "8px 10px",
                  background: C.bg,
                  borderTop: `1px solid ${C.border}`,
                  overflowX: "auto",
                  flexShrink: 0,
                }}
              >
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    style={{ position: "relative", flexShrink: 0 }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedImg(idx)}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 7,
                        overflow: "hidden",
                        border: `2px solid ${idx === safeIdx ? C.coral : C.border}`,
                        background: "#fff",
                        cursor: "pointer",
                        padding: 2,
                        display: "block",
                        transition: "border-color .15s",
                      }}
                    >
                      <img
                        src={img.storage_url}
                        alt={img.file_name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    </button>
                    {editing && canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteImgMut.mutate(img.id);
                        }}
                        disabled={
                          deleteImgMut.isPending &&
                          deleteImgMut.variables === img.id
                        }
                        style={{
                          position: "absolute",
                          top: -5,
                          right: -5,
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          background: "#ef4444",
                          border: "1.5px solid #fff",
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                          color: "#fff",
                          zIndex: 1,
                          padding: 0,
                        }}
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Single image delete */}
            {images.length === 1 && editing && canEdit && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 12px",
                  background: C.bg,
                  borderTop: `1px solid ${C.border}`,
                  flexShrink: 0,
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    color: C.muted,
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "60%",
                  }}
                >
                  {images[0].file_name}
                </p>
                <button
                  type="button"
                  onClick={() => deleteImgMut.mutate(images[0].id)}
                  disabled={deleteImgMut.isPending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 9px",
                    borderRadius: 6,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    cursor: "pointer",
                    color: "#ef4444",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "inherit",
                    opacity: deleteImgMut.isPending ? 0.5 : 1,
                  }}
                >
                  <Trash2 size={11} />
                  {deleteImgMut.isPending ? "…" : "Eliminar"}
                </button>
              </div>
            )}

            {/* Upload controls — edit mode only */}
            {editing && canEdit && (
              <div
                style={{
                  padding: "10px 12px",
                  background: C.bg,
                  borderTop: `1px solid ${C.border}`,
                  flexShrink: 0,
                  display: "flex",
                  gap: 7,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    handleRawFile(e.target.files?.[0], "file");
                    e.target.value = "";
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    handleRawFile(e.target.files?.[0], "camera");
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={uploadImgMut.isPending}
                  onClick={() => pickFile("file")}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    padding: "8px",
                    borderRadius: 8,
                    border: `1.5px dashed ${C.coral}55`,
                    background: `${C.coral}08`,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.coral,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <ImagePlus size={13} />{" "}
                  {uploadImgMut.isPending ? "Subiendo…" : "Agregar imagen"}
                </button>
                <button
                  type="button"
                  disabled={uploadImgMut.isPending}
                  onClick={() => pickFile("camera")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1.5px solid ${C.border}`,
                    background: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.navy,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <Camera size={13} /> Cámara
                </button>
              </div>
            )}
          </div>

          {/* Info side */}
          <div
            style={{
              padding: "32px 38px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              minHeight: 320,
            }}
          >
            {/* TOP ROW: info left + quick buttons right */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.coral,
                  textTransform: "uppercase",
                  letterSpacing: ".1em",
                  margin: "0 0 12px",
                }}
              >
                {asset.module_name} · {asset.category_name}
              </p>

              {editing ? (
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  style={{
                    ...INPUT,
                    fontSize: 20,
                    fontWeight: 800,
                    color: C.navy,
                    marginBottom: 16,
                    borderRadius: 9,
                  }}
                />
              ) : (
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: C.navy,
                    margin: "0 0 14px",
                    lineHeight: 1.2,
                  }}
                >
                  {asset.name}
                </h1>
              )}

              <div style={{ marginBottom: 16 }}>
                <StatusBadge status={asset.status} />
              </div>

              {editing ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 14 }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: C.coral,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                        margin: "0 0 5px",
                      }}
                    >
                      Descripción
                    </p>
                    <textarea
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      rows={3}
                      style={{ ...INPUT, resize: "vertical", lineHeight: 1.5 }}
                    />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.coral,
                          textTransform: "uppercase",
                          letterSpacing: ".08em",
                          margin: "0 0 5px",
                        }}
                      >
                        N° de Serie
                      </p>
                      <input
                        value={editForm.serial_number}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            serial_number: e.target.value,
                          }))
                        }
                        style={INPUT}
                        placeholder="SN-XXXX"
                      />
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.coral,
                          textTransform: "uppercase",
                          letterSpacing: ".08em",
                          margin: "0 0 5px",
                        }}
                      >
                        Categoría
                      </p>
                      <select
                        value={editForm.category_id}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            category_id: e.target.value,
                          }))
                        }
                        style={INPUT}
                      >
                        {(categories as any[]).map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.coral,
                          textTransform: "uppercase",
                          letterSpacing: ".08em",
                          margin: "0 0 5px",
                        }}
                      >
                        Ambiente / Sede
                      </p>
                      <select
                        value={editForm.environment_id}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            environment_id: e.target.value,
                          }))
                        }
                        style={INPUT}
                      >
                        {(environments as any[]).map((e: any) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                            {e.location_name ? ` — ${e.location_name}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {asset.description && (
                    <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.7, margin: "0 0 6px" }}>
                      {asset.description}
                    </p>
                  )}
                  {/* Meta — flat inline lines */}
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
                    <p style={{ fontSize: 10, color: C.muted, margin: 0, fontFamily: "monospace", letterSpacing: ".04em" }}>
                      {asset.qr_code}
                    </p>
                  </div>
                  {/* Metrics badges */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {asset.children_count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.navy, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px" }}>
                        {asset.children_count} {asset.children_count === 1 ? "componente" : "componentes"}
                      </span>
                    )}
                    {asset.tickets_count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px" }}>
                        {asset.tickets_count} {asset.tickets_count === 1 ? "ticket" : "tickets"}
                      </span>
                    )}
                    {asset.files_count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.sub, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px" }}>
                        {asset.files_count} {asset.files_count === 1 ? "archivo" : "archivos"}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px" }}>
                      v{asset.version}
                    </span>
                  </div>
                </div>
              )}
              </div>{/* /info left */}

              {/* Quick actions — apilados top-right */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, minWidth: 116 }}>
                <button type="button" onClick={() => setShowQr(true)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, color: C.coral, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                  <QrCode size={13} /> Ver QR
                </button>
                {canEdit && asset.status !== "dado_de_baja" && !editing && (
                  <button type="button" onClick={startEditing}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                    <Pencil size={13} /> Editar
                  </button>
                )}
                {canEdit && editing && (
                  <>
                    <button type="button" disabled={updateMut.isPending} onClick={() => updateMut.mutate()}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: "none", background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%", opacity: updateMut.isPending ? 0.6 : 1 }}>
                      <Save size={13} /> {updateMut.isPending ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" onClick={() => { setEditing(false); setActionErr(""); }}
                      style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.sub, width: "100%" }}>
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>{/* /top flex row */}

            {/* Fila inferior — acciones secundarias */}
            {!editing && (
              <div style={{ display: "flex", gap: 8, marginTop: 22, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={() => setShowReport(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit" }}>
                  Reportar problema
                </button>
                {canEdit && asset.status === "disponible" && (
                  <button type="button" onClick={() => setShowAssign(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit" }}>
                    Asignar custodia
                  </button>
                )}
                {canEdit && asset.status === "asignado" && assignment && (
                  <button type="button" disabled={unassignMut.isPending} onClick={() => unassignMut.mutate()}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "1.5px solid #ef444455", background: "#ef444408", fontSize: 12, fontWeight: 700, color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }}>
                    {unassignMut.isPending ? "Devolviendo…" : "Devolver custodia"}
                  </button>
                )}
                {canEdit && (
                  <button type="button" onClick={() => setShowRelate(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit" }}>
                    Asociar dispositivo
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {canEdit && asset.status !== "dado_de_baja" && (
                  <button type="button" onClick={() => setShowStatusModal(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "1.5px solid #ef444440", background: "#ef444408", fontSize: 12, fontWeight: 700, color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }}>
                    Dar de baja
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
          {/* ── Especificaciones ── */}
          {fieldSchema.length > 0 && (
            <div style={{ padding: "26px 36px", borderTop: `1px solid ${C.border}` }}>
              <SectionHeader label="Especificaciones" />
              {editing ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 14,
                  }}
                >
                  {fieldSchema.map((f: FieldDef) => (
                    <div key={f.key}>
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.coral,
                          textTransform: "uppercase",
                          letterSpacing: ".08em",
                          margin: "0 0 5px",
                        }}
                      >
                        {f.label}
                        {f.required ? " *" : ""}
                      </p>
                      {f.type === "select" && f.options ? (
                        <select
                          value={editForm.specifications[f.key] ?? ""}
                          onChange={(e) =>
                            setEditForm((frm) => ({
                              ...frm,
                              specifications: {
                                ...frm.specifications,
                                [f.key]: e.target.value,
                              },
                            }))
                          }
                          style={INPUT}
                        >
                          <option value="">—</option>
                          {f.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : f.type === "boolean" ? (
                        <select
                          value={editForm.specifications[f.key] ?? ""}
                          onChange={(e) =>
                            setEditForm((frm) => ({
                              ...frm,
                              specifications: {
                                ...frm.specifications,
                                [f.key]: e.target.value,
                              },
                            }))
                          }
                          style={INPUT}
                        >
                          <option value="">—</option>
                          <option value="Sí">Sí</option>
                          <option value="No">No</option>
                        </select>
                      ) : (
                        <input
                          type={
                            f.type === "number"
                              ? "number"
                              : f.type === "date"
                                ? "date"
                                : "text"
                          }
                          value={editForm.specifications[f.key] ?? ""}
                          onChange={(e) =>
                            setEditForm((frm) => ({
                              ...frm,
                              specifications: {
                                ...frm.specifications,
                                [f.key]: e.target.value,
                              },
                            }))
                          }
                          style={INPUT}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 48px" }}>
                  {fieldSchema.map((f) => {
                    const rawVal = asset.specifications?.[f.key];
                    const hasValue =
                      rawVal !== undefined && rawVal !== null && rawVal !== "";
                    return (
                      <div key={f.key} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, flexShrink: 0, minWidth: 130, textTransform: "uppercase", letterSpacing: ".05em", lineHeight: 1.5 }}>
                          {f.label}
                        </span>
                        <span style={{ fontSize: 13, color: hasValue ? C.navy : C.muted, fontWeight: hasValue ? 600 : 400, fontStyle: hasValue ? "normal" : "italic" }}>
                          {hasValue ? String(rawVal) : "Sin respuesta"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Responsable | Relaciones 50/50 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${C.border}` }}>
            <div style={{ padding: "26px 36px", borderRight: `1px solid ${C.border}` }}>
            <SectionHeader label="Responsable / Custodia" />

            {/* Custodian actual */}
            {assignment ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "#EFF6FF",
                  borderRadius: 12,
                  padding: "14px 16px",
                  marginBottom: 14,
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 10, background: C.navy, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                    {assignment.user_name.split(" ").slice(0, 2).map((w: string) => w[0]).join("")}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f", margin: "0 0 2px" }}>{assignment.user_name}</p>
                  <p style={{ fontSize: 11, color: "#3b82f6", margin: "0 0 2px" }}>{assignment.user_email}</p>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Desde {fmtDate(assignment.assigned_at)}</p>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Sin custodio asignado</p>
            )}

            {/* Historial custodios */}
            {custodianHistory.length > 0 && (
              <>
                <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "14px 0 10px" }}>
                  Historial de custodios
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {custodianHistory.slice(0, 8).map((h) => (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", background: C.bg, borderRadius: 9, border: `1px solid ${C.border}` }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: h.action === "asignado" ? "#3b82f6" : "#22c55e", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: "0 0 1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.user_name || h.actor_name}
                        </p>
                        <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                          {ASSET_ACTION_LABELS[h.action] ?? h.action} · {fmtDate(h.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>{/* /responsable cell */}
            <div style={{ padding: "26px 36px" }}>
            <SectionHeader
              label={`Relaciones${children.length > 0 ? ` · ${children.length} componente${children.length !== 1 ? "s" : ""}` : ""}`}
            />
            {asset.parent_asset_id && (
              <div style={{ marginBottom: 18 }}>
                <p
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                    margin: "0 0 9px",
                  }}
                >
                  Activo padre
                </p>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 16px",
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 9,
                  }}
                >
                  <Link2 size={14} style={{ color: C.coral }} />
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: C.navy }}
                  >
                    {asset.parent_asset_name || "—"}
                  </span>
                  {asset.parent_asset_status && (
                    <StatusBadge status={asset.parent_asset_status} />
                  )}
                </div>
              </div>
            )}
            {children.length > 0 ? (
              <div>
                {asset.parent_asset_id && (
                  <p
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.muted,
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      margin: "0 0 10px",
                    }}
                  >
                    Componentes
                  </p>
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 9,
                  }}
                >
                  {children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => router.push(`/inventory/${child.id}`)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 14px",
                        background: C.bg,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.borderColor = C.coral + "80")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.borderColor = C.border)
                      }
                    >
                      <div
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: ASSET_STATUS_COLORS[child.status],
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.navy,
                            margin: "0 0 2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {child.name}
                        </p>
                        <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                          {child.category_name}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : !asset.parent_asset_id ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                Activo raíz. Sin componentes hijos registrados.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                Sin componentes hijos registrados.
              </p>
            )}
          </div>{/* /relaciones cell */}
          </div>{/* /responsable-relaciones grid */}

          {/* ── Tickets + Historial 50/50 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${C.border}` }}>
            <div style={{ padding: "26px 36px", borderRight: `1px solid ${C.border}` }}>
            <SectionHeader
              label={`Tickets asociados${asset.tickets_count > 0 ? ` (${asset.tickets_count})` : ""}`}
            />
            {assetTickets.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={24} />}
                text="Sin tickets asociados a este activo."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {assetTickets.map((ticket) => {
                  const pColor = PRIORITY_COLORS[ticket.priority] ?? C.muted;
                  return (
                    <div
                      key={ticket.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "4px 1fr auto",
                        gap: "0 14px",
                        alignItems: "center",
                        padding: "12px 14px",
                        background: C.bg,
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          height: "100%",
                          background: pColor,
                          borderRadius: 2,
                          alignSelf: "stretch",
                        }}
                      />
                      <div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: C.coral,
                              fontFamily: "monospace",
                            }}
                          >
                            #{ticket.id.slice(0, 8)}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              textTransform: "uppercase",
                              color: ticket.is_final ? "#16a34a" : "#c2410c",
                              background: ticket.is_final
                                ? "#f0fdf4"
                                : "#fff7ed",
                              padding: "2px 7px",
                              borderRadius: 4,
                            }}
                          >
                            {ticket.state_label}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.navy,
                            margin: "0 0 3px",
                          }}
                        >
                          {ticket.title}
                        </p>
                        <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                          {ticket.creator_name} · {fmtDate(ticket.created_at)}
                        </p>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: pColor,
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ● {ticket.priority}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            <div style={{ padding: "26px 36px" }}>
            <SectionHeader label="Historial y auditoría" />
            {history.length === 0 ? (
              <EmptyState
                icon={<Clock size={24} />}
                text="Sin eventos registrados."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {history.map((h, i) => {
                  const color = ASSET_ACTION_COLORS[h.action] ?? C.muted;
                  const label = ASSET_ACTION_LABELS[h.action] ?? h.action;
                  return (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        gap: 14,
                        paddingBottom: 16,
                        position: "relative",
                      }}
                    >
                      {i < history.length - 1 && (
                        <div
                          style={{
                            position: "absolute",
                            left: 12,
                            top: 24,
                            width: 2,
                            height: "calc(100% - 6px)",
                            background: C.border,
                          }}
                        />
                      )}
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: `${color}14`,
                          border: `2px solid ${color}35`,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          zIndex: 1,
                        }}
                      >
                        <div
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: color,
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, paddingTop: 1 }}>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.navy,
                            margin: "0 0 2px",
                          }}
                        >
                          {label}
                          {h.user_name && h.user_name !== h.actor_name ? (
                            <span style={{ fontWeight: 500, color: C.sub }}>
                              {" "}
                              {h.user_name}
                            </span>
                          ) : null}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: C.muted,
                            margin: "0 0 1px",
                          }}
                        >
                          por {h.actor_name} · {fmtDate(h.created_at)}
                        </p>
                        {h.reason && (
                          <p
                            style={{
                              fontSize: 11,
                              color: C.sub,
                              margin: 0,
                              fontStyle: "italic",
                            }}
                          >
                            {h.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>{/* /historial cell */}
          </div>{/* /50-50 grid */}
        </div>{/* /surface única */}

      {/* ── Modals ── */}
      {showAssign && (
        <AssignModal
          moduleUsers={moduleUsers as any[]}
          onAssign={(userId) => assignMut.mutate(userId)}
          onClose={() => setShowAssign(false)}
          pending={assignMut.isPending}
        />
      )}

      {showStatusModal && asset && (
        <StatusModal
          currentStatus={asset.status}
          transitions={["dado_de_baja"]}
          onTransition={(status, reason) => transMut.mutate({ status, reason })}
          onClose={() => setShowStatusModal(false)}
          pending={transMut.isPending}
        />
      )}

      {showRelate && asset && (
        <RelateAssetModal
          currentAssetId={assetId}
          currentAssetName={asset.name}
          onRelate={(targetId, type) => {
            /* TODO: wire to inventoryService.setRelation(assetId, targetId, type) */
            console.log("Relate:", assetId, "→", targetId, type);
            setShowRelate(false);
          }}
          onClose={() => setShowRelate(false)}
          pending={false}
        />
      )}

      {showReport && asset && (
        <ReportProblemModal
          assetName={asset.name}
          assetId={assetId}
          moduleName={asset.module_name}
          onClose={() => setShowReport(false)}
        />
      )}

      {showCamera && (
        <CameraModal
          onCapture={(file) => {
            setShowCamera(false);
            handleRawFile(file, "camera");
          }}
          onCancel={() => setShowCamera(false)}
        />
      )}

      {cropPending && (
        <CropModal
          file={cropPending.file}
          source={cropPending.source}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropPending(null)}
        />
      )}

      {lightboxIdx !== null && images.length > 0 && (
        <ImageLightbox
          images={images}
          initialIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          canEdit={canEdit}
          onDelete={(id) => deleteImgMut.mutate(id)}
          deletePending={deleteImgMut.isPending}
        />
      )}

      {showQr && (
        <QrModal
          assetId={assetId}
          assetName={asset.name}
          onClose={() => setShowQr(false)}
        />
      )}
    </ModuleLayout>
  );
}
