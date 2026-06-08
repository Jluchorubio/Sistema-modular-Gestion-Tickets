"use client";

import { useRef, useState, useEffect } from "react";
import { X, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { type AssetImage } from "@/services/inventory.service";
import { C } from "../_shared";

export function ImageLightbox({
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
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const current = images[idx];

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [idx]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setIdx((i) => { setZoom(1); setPan({ x: 0, y: 0 }); return (i - 1 + images.length) % images.length; });
      if (e.key === "ArrowRight") setIdx((i) => { setZoom(1); setPan({ x: 0, y: 0 }); return (i + 1) % images.length; });
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
    setPan({ x: panRef.current.px + (e.clientX - panRef.current.mx) / zoom, y: panRef.current.py + (e.clientY - panRef.current.my) / zoom });
  }
  function endPan() { panRef.current = null; }

  function clickImg() {
    if (zoom > 1.2) { setZoom(1); setPan({ x: 0, y: 0 }); } else setZoom(2.5);
  }

  function toggleFs() {
    if (!document.fullscreenElement) { containerRef.current?.requestFullscreen?.().catch(() => {}); setIsFs(true); }
    else { document.exitFullscreen?.().catch(() => {}); setIsFs(false); }
  }

  if (!current) return null;

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.95)", zIndex: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", zIndex: 1, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.65)", margin: 0, fontWeight: 600 }}>{idx + 1} / {images.length}</p>
          {zoom !== 1 && <p style={{ fontSize: 11, color: C.coral, margin: 0, fontWeight: 700 }}>{Math.round(zoom * 100)}%</p>}
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <button type="button" onClick={(e) => { e.stopPropagation(); toggleFs(); }} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "#fff" }}>
            <Maximize2 size={16} />
          </button>
          <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "#fff" }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", overflow: "hidden", paddingTop: 52, paddingBottom: images.length > 1 ? 80 : 0 }} onClick={onClose}>
        <img
          src={current.storage_url}
          alt={current.file_name}
          style={{ maxWidth: zoom === 1 ? "90vw" : undefined, maxHeight: zoom === 1 ? "78vh" : undefined, objectFit: "contain", transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transition: panRef.current ? "none" : "transform .18s", cursor: zoom > 1 ? (panRef.current ? "grabbing" : "grab") : "zoom-in", userSelect: "none", borderRadius: zoom === 1 ? 8 : 0 }}
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

      {zoom === 1 && (
        <p style={{ position: "fixed", top: 58, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: "rgba(255,255,255,.3)", margin: 0, pointerEvents: "none", whiteSpace: "nowrap" }}>
          clic para zoom · rueda para zoom · doble clic para ajustar
        </p>
      )}

      {/* Prev / Next */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }); setIdx((i) => (i - 1 + images.length) % images.length); }}
            style={{ position: "fixed", left: 14, top: "50%", transform: "translateY(-50%)", width: 46, height: 46, borderRadius: 11, background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "#fff", zIndex: 2 }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }); setIdx((i) => (i + 1) % images.length); }}
            style={{ position: "fixed", right: 14, top: "50%", transform: "translateY(-50%)", width: 46, height: 46, borderRadius: 11, background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "#fff", zIndex: 2 }}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div
          style={{ position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6, padding: "12px 24px 16px", background: "rgba(0,0,0,.6)", backdropFilter: "blur(6px)", overflowX: "auto", zIndex: 1, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setIdx(i); }}
              style={{ width: 58, height: 58, borderRadius: 8, overflow: "hidden", border: `2px solid ${i === idx ? C.coral : "rgba(255,255,255,.25)"}`, flexShrink: 0, background: "rgba(0,0,0,.4)", cursor: "pointer", padding: 0, transition: "border-color .15s" }}
            >
              <img src={img.storage_url} alt={img.file_name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
