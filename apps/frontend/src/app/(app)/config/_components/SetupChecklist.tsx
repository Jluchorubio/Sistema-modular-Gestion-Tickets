'use client';

import { useState, useEffect } from 'react';
import { useQuery }            from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { systemConfigService }  from '@/services/system-config.service';
import type { OrgNode, BusinessHour } from '@/services/system-config.service';
import type { Tab } from './_types';

export function SetupChecklist({ setTab }: { setTab: (t: Tab) => void }) {
  const [open, setOpen] = useState(true);

  const { data: tree  = [] } = useQuery<OrgNode[]>({
    queryKey: ['org-node-tree'],
    queryFn:  systemConfigService.getOrgNodeTree,
    staleTime: 60_000,
  });
  const { data: hours = [] } = useQuery<BusinessHour[]>({
    queryKey: ['sys-sla-hours'],
    queryFn:  () => systemConfigService.getBusinessHours(),
    staleTime: 60_000,
  });

  const activeHours = (hours as BusinessHour[]).filter(h => h.is_active);
  const rootNodes   = (tree  as OrgNode[]).length;
  const hasOrg      = rootNodes > 0;

  const checks: { key: string; label: string; done: boolean; info: string; tab: Tab }[] = [
    {
      key:   'org',
      label: 'Estructura organizacional',
      done:  hasOrg,
      info:  hasOrg
        ? `${rootNodes} nodo${rootNodes !== 1 ? 's' : ''} raíz configurado${rootNodes !== 1 ? 's' : ''}`
        : 'Sin nodos — motor de prioridad no puede operar',
      tab: 'organigrama',
    },
    {
      key:   'hours',
      label: 'Horario laboral global',
      done:  activeHours.length > 0,
      info:  activeHours.length > 0
        ? `${activeHours.length} día${activeHours.length !== 1 ? 's' : ''} configurado${activeHours.length !== 1 ? 's' : ''}`
        : 'Sin horario — SLA calculará como 24/7',
      tab: 'calendario',
    },
  ];

  const pending = checks.filter(c => !c.done).length;
  const allDone = pending === 0;

  useEffect(() => { if (allDone) setOpen(false); }, [allDone]);

  const borderColor = allDone ? '#bbf7d0' : pending === checks.length ? '#fca5a5' : '#fde68a';
  const headerBg    = allDone ? '#f0fdf4' : pending === checks.length ? '#fef2f2' : '#fffbeb';

  return (
    <div style={{ marginBottom: 20, border: `1px solid ${borderColor}`, borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: headerBg, border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}>
        {allDone
          ? <CheckCircle2 size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
          : <AlertCircle  size={16} style={{ color: pending === checks.length ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--app-text-main)' }}>
          {allDone
            ? 'Sistema configurado correctamente'
            : `${pending} configuración${pending !== 1 ? 'es' : ''} pendiente${pending !== 1 ? 's' : ''}`}
        </span>
        {open
          ? <ChevronUp   size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />}
      </button>

      {open && (
        <div style={{ background: 'var(--app-card)' }}>
          {checks.map((c, i) => (
            <div key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px',
              borderTop: i === 0 ? `1px solid ${borderColor}` : '1px solid #f1f5f9',
            }}>
              {c.done
                ? <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                : <AlertCircle  size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--app-text-main)' }}>{c.label}</span>
                <span style={{ fontSize: 11, color: c.done ? '#94a3b8' : '#d97706', marginLeft: 8 }}>
                  {c.info}
                </span>
              </div>
              {!c.done && (
                <button
                  onClick={() => setTab(c.tab)}
                  style={{
                    padding: '4px 12px', background: '#fff7ed', color: '#d97706',
                    border: '1px solid #fed7aa', borderRadius: 8, fontSize: 11,
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  }}>
                  Configurar →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
