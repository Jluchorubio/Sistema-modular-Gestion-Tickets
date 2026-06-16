"use client";

import { useRef, useState, useEffect } from "react";
import { C } from "../_shared";

const CROP_SIZE = 360;

export function CropModal({
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
  const dragRef = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const z = Math.max(CROP_SIZE / image.width, CROP_SIZE / image.height);
      setZoom(z);
      setOffset({ x: (CROP_SIZE - image.width * z) / 2, y: (CROP_SIZE - image.height * z) / 2 });
      setImg(image);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!canvasRef.current || !img) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.drawImage(img, offset.x, offset.y, img.width * zoom, img.height * zoom);
  }, [img, offset, zoom]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  }
  function moveDrag(e: React.MouseEvent) {
    if (!dragRef.current) return;
    setOffset({ x: dragRef.current.ox + (e.clientX - dragRef.current.mx), y: dragRef.current.oy + (e.clientY - dragRef.current.my) });
  }
  function endDrag() { dragRef.current = null; }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.05), 20);
    const cx = CROP_SIZE / 2; const cy = CROP_SIZE / 2;
    if (!img) { setZoom(newZoom); return; }
    const ix = (cx - offset.x) / zoom;
    const iy = (cy - offset.y) / zoom;
    setOffset({ x: cx - ix * newZoom, y: cy - iy * newZoom });
    setZoom(newZoom);
  }

  function confirm() {
    canvasRef.current?.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.88)", zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}
    >
      <div
        style={{ background: 'var(--app-card)', borderRadius: 16, padding: "26px 28px", maxWidth: 440, width: "100%", boxShadow: "0 32px 80px rgba(0,0,0,.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 5px" }}>
          {source === "camera" ? "Fotografía capturada" : "Imagen cargada"}
        </p>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: "0 0 6px" }}>Ajustar recorte</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: "0 0 16px" }}>Arrastra para encuadrar · Rueda del ratón para zoom</p>

        <div style={{ position: "relative", width: CROP_SIZE, height: CROP_SIZE, margin: "0 auto 18px", borderRadius: 10, overflow: "hidden", border: `2px solid ${C.coral}`, cursor: dragRef.current ? "grabbing" : "grab", boxShadow: `0 0 0 4px ${C.coral}20` }}>
          {!img && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: C.bg }}>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Cargando imagen…</p>
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
          {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => {
            const [v, h] = pos.split("-");
            return (
              <div key={pos} style={{ position: "absolute", [v]: 0, [h]: 0, width: 22, height: 22, borderTop: v === "top" ? `3px solid ${C.coral}` : "none", borderBottom: v === "bottom" ? `3px solid ${C.coral}` : "none", borderLeft: h === "left" ? `3px solid ${C.coral}` : "none", borderRight: h === "right" ? `3px solid ${C.coral}` : "none", pointerEvents: "none" }} />
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.sub }}>Cancelar</button>
          <button type="button" onClick={confirm} disabled={!img} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: img ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: img ? 1 : 0.5 }}>Confirmar recorte</button>
        </div>
      </div>
    </div>
  );
}
