"use client";

import { useQuery } from "@tanstack/react-query";
import { QrCode, X } from "lucide-react";
import { inventoryService } from "@/services/inventory.service";
import { C } from "../_shared";

export function QrModal({
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
    queryFn:  () => inventoryService.getQr(assetId),
    staleTime: 10 * 60_000,
  });

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(14,34,53,.6)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--app-card)', borderRadius: 16, padding: "28px 32px", textAlign: "center", maxWidth: 280, width: "100%", position: "relative", boxShadow: "0 32px 72px rgba(14,34,53,.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "grid", placeItems: "center", color: C.muted }}>
          <X size={13} />
        </button>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: `${C.coral}12`, display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
          <QrCode size={20} style={{ color: C.coral }} />
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: "0 0 4px" }}>{assetName}</p>
        <p style={{ fontSize: 10, color: C.muted, margin: "0 0 18px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Código QR</p>

        {isLoading && (
          <div style={{ height: 180, display: "grid", placeItems: "center", color: C.muted, fontSize: 12 }}>Generando…</div>
        )}

        {data?.qr_image && (
          <>
            <img src={data.qr_image} alt="QR" style={{ width: 180, height: 180, margin: "0 auto", display: "block", borderRadius: 8, border: `1px solid ${C.border}` }} />
            <p style={{ fontSize: 10, color: C.muted, marginTop: 12, fontFamily: "monospace", letterSpacing: ".06em" }}>{data.qr_code}</p>
            <div style={{ display: "flex", gap: 7, marginTop: 16, justifyContent: "center" }}>
              <a
                href={data.qr_image}
                download={`QR-${assetName.replace(/\s+/g, "-")}.png`}
                onClick={(e) => e.stopPropagation()}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 11, fontWeight: 700, color: C.navy, textDecoration: "none", cursor: "pointer" }}
              >
                Descargar
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const win = window.open("", "_blank");
                  if (!win) return;
                  win.document.write(`<!DOCTYPE html><html><head><title>QR ${assetName}</title><style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:12px}img{width:240px;height:240px}p{font-size:11px;color:#64748b;font-family:monospace;letter-spacing:.06em}</style></head><body><img src="${data.qr_image}" alt="QR"/><p>${data.qr_code}</p><p style="font-size:13px;font-weight:700;color:#0e2235">${assetName}</p></body></html>`);
                  win.document.close();
                  win.focus();
                  win.print();
                }}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--app-card)', fontSize: 11, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: "inherit" }}
              >
                Imprimir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
