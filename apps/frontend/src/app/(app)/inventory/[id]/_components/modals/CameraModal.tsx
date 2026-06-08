"use client";

import { useRef, useState, useEffect } from "react";
import { Camera, X } from "lucide-react";
import { C } from "../_shared";

export function CameraModal({
  onCapture,
  onCancel,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

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
      .catch(() => { if (mounted) setError("No se pudo acceder a la cámara. Verifica los permisos del navegador."); });
    return () => { mounted = false; streamRef.current?.getTracks().forEach((t) => t.stop()); };
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
      style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.92)", zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}
      onClick={close}
    >
      <div
        style={{ background: "#000", borderRadius: 16, overflow: "hidden", maxWidth: 640, width: "100%", boxShadow: "0 32px 80px rgba(0,0,0,.7)", position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(0,0,0,.6)", position: "absolute", top: 0, left: 0, right: 0, zIndex: 1 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: "uppercase", letterSpacing: ".12em", margin: 0 }}>Fotografía capturada</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#fff", margin: 0 }}>Cámara</p>
          </div>
          <button type="button" onClick={close} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.15)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "#fff" }}>
            <X size={16} />
          </button>
        </div>

        {error ? (
          <div style={{ padding: "80px 32px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#ef4444", margin: "0 0 16px" }}>{error}</p>
            <button type="button" onClick={close} style={{ padding: "8px 20px", borderRadius: 8, background: C.navy, border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block", minHeight: 320, background: "#111", marginTop: 52 }} />
            <div style={{ padding: "16px", background: "rgba(0,0,0,.7)", display: "flex", justifyContent: "center", gap: 12 }}>
              <button type="button" onClick={close} style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(255,255,255,.12)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Cancelar
              </button>
              <button type="button" onClick={capture} disabled={!ready}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 28px", borderRadius: 10, background: ready ? C.coral : "rgba(255,255,255,.2)", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
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
