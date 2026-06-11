'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Search, ExternalLink, Unlink } from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import {
  ticketsService,
  ASSET_STATUS_COLORS, ASSET_STATUS_LABELS,
} from '@/services/tickets.service';
import { inventoryService } from '@/services/inventory.service';
import type { useTicketData } from '../hooks/useTicketData';

export function AssetCmdbTab({
  ticketId,
  linkedAssets,
}: {
  ticketId: string;
  linkedAssets: ReturnType<typeof useTicketData>['linkedAssets'];
}) {
  const router = useRouter();
  const [linkingAssetId, setLinkingAssetId] = useState('');
  const [linkSearchQ,    setLinkSearchQ]    = useState('');
  const [linkResults,    setLinkResults]    = useState<{ id: string; name: string; status: string }[]>([]);
  const [linkSearching,  setLinkSearching]  = useState(false);
  const [linkPending,    setLinkPending]    = useState(false);
  const [unlinkPending,  setUnlinkPending]  = useState<string | null>(null);

  const asset = linkedAssets[0];

  const { data: assetDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['asset-detail', asset?.id],
    queryFn:  () => inventoryService.getOne(asset!.id),
    enabled:  !!asset?.id,
    staleTime: 5 * 60_000,
  });

  const { data: custodio } = useQuery({
    queryKey: ['asset-assignment', asset?.id],
    queryFn:  () => inventoryService.getCurrentAssignment(asset!.id),
    enabled:  !!asset?.id,
    staleTime: 5 * 60_000,
  });

  const { data: prevTickets = [] } = useQuery({
    queryKey: ['asset-prev-tickets', ticketId, asset?.id],
    queryFn:  () => ticketsService.getAssetPrevTickets(ticketId, asset!.id),
    enabled:  !!asset?.id,
    staleTime: 5 * 60_000,
  });

  async function handleSearch(q: string) {
    setLinkSearchQ(q);
    setLinkingAssetId('');
    if (q.trim().length < 2) { setLinkResults([]); return; }
    setLinkSearching(true);
    try {
      const items = await inventoryService.getAll(undefined, undefined, q.trim());
      setLinkResults(items.slice(0, 8).map(i => ({ id: i.id, name: i.name, status: i.status })));
    } finally { setLinkSearching(false); }
  }

  async function handleLink() {
    if (!linkingAssetId) return;
    setLinkPending(true);
    try { await ticketsService.linkAsset(ticketId, linkingAssetId); setLinkSearchQ(''); setLinkingAssetId(''); setLinkResults([]); }
    finally { setLinkPending(false); }
  }

  async function handleUnlink(assetId: string) {
    setUnlinkPending(assetId);
    try { await ticketsService.unlinkAsset(ticketId, assetId); }
    finally { setUnlinkPending(null); }
  }

  if (!asset) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ padding: '20px', borderRadius: 10, border: '2px dashed #e2e8f0', textAlign: 'center', marginBottom: 20 }}>
          <Monitor size={28} style={{ color: '#cbd5e1', marginBottom: 8 }} />
          <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '0 0 4px' }}>Sin activo vinculado</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Asocia un activo del inventario para ver su contexto CMDB.</p>
        </div>
        <PermissionGate perm="helpdesk:tickets:edit">
          <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#0e2235', margin: '0 0 10px' }}>Vincular activo</p>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="text" placeholder="Buscar por nombre…" value={linkSearchQ}
                onChange={e => handleSearch(e.target.value)}
                style={{ width: '100%', padding: '7px 9px 7px 26px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              {linkSearching && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#94a3b8' }}>…</span>}
            </div>
            {linkResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                {linkResults.map(r => (
                  <button key={r.id} type="button" onClick={() => setLinkingAssetId(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 6, border: `1px solid ${linkingAssetId === r.id ? '#ff5e3a' : '#e2e8f0'}`, background: linkingAssetId === r.id ? '#fff5f3' : '#f8fafc', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    <Monitor size={11} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, color: '#334155' }}>{r.name}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{r.status}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" disabled={!linkingAssetId || linkPending} onClick={handleLink}
              style={{ width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: linkingAssetId && !linkPending ? '#ff5e3a' : '#e2e8f0', color: linkingAssetId ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: linkingAssetId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              {linkPending ? 'Vinculando…' : 'Vincular activo'}
            </button>
          </div>
        </PermissionGate>
      </div>
    );
  }

  const sc = ASSET_STATUS_COLORS[asset.status as keyof typeof ASSET_STATUS_COLORS] ?? '#94a3b8';

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Monitor size={18} style={{ color: '#64748b' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#0e2235' }}>{asset.name}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${sc}18`, color: sc, border: `1px solid ${sc}30` }}>
              {ASSET_STATUS_LABELS[asset.status as keyof typeof ASSET_STATUS_LABELS] ?? asset.status}
            </span>
            {assetDetail?.category_name && <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{assetDetail.category_name}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => router.push('/inventory/' + asset.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
            <ExternalLink size={10} /> Ver ficha
          </button>
          <PermissionGate perm="helpdesk:tickets:edit">
            <button type="button" disabled={unlinkPending === asset.id} onClick={() => handleUnlink(asset.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Unlink size={10} /> {unlinkPending === asset.id ? '…' : 'Desvincular'}
            </button>
          </PermissionGate>
        </div>
      </div>

      {detailLoading ? (
        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Cargando datos CMDB…</p>
      ) : assetDetail && (
        <>
          <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            {([
              ['N° de serie',     assetDetail.serial_number],
              ['Ubicación',       assetDetail.location_name],
              ['Ambiente',        assetDetail.environment_name],
              ['Custodio actual', custodio?.user_name ?? asset.assigned_to_name ?? null],
              ['Tickets totales', String(assetDetail.tickets_count)],
            ] as [string, string | null][]).map(([lbl, val]) => val ? (
              <div key={lbl}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 1px' }}>{lbl}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0 }}>{val}</p>
              </div>
            ) : null)}
          </div>

          {assetDetail.field_schema?.length > 0 && assetDetail.specifications && (
            <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>Especificaciones</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                {assetDetail.field_schema.map(f => {
                  const val = assetDetail.specifications![f.key];
                  if (val === undefined || val === null || val === '') return null;
                  return (
                    <div key={f.key}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 1px' }}>{f.label}</p>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0 }}>{String(val)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 10px' }}>
          Incidentes en este activo{prevTickets.length > 0 ? ` (${prevTickets.length})` : ''}
        </p>
        {prevTickets.length === 0 ? (
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Sin incidentes previos en este activo.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {prevTickets.slice(0, 8).map((pt: any) => (
              <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: pt.is_final ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.title}</span>
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{pt.state_label}</span>
              </div>
            ))}
            {prevTickets.length > 8 && <p style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 0', textAlign: 'center' }}>+{prevTickets.length - 8} más</p>}
          </div>
        )}
      </div>
    </div>
  );
}
