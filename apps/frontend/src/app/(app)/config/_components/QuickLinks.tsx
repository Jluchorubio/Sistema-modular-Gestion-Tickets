'use client';

import { ExternalLink, Shield, Users, Zap, CheckCircle2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const LINKS = [
  { href: '/roles',            Icon: Shield,       label: 'Roles y Permisos',    desc: 'Roles globales y de módulo, asignación de permisos'                },
  { href: '/users',            Icon: Users,        label: 'Gestión de Usuarios', desc: 'Importación masiva, activación, asignación de roles'               },
  { href: '/helpdesk/config',  Icon: Zap,          label: 'Config Helpdesk',     desc: 'SLA tickets, tipos de daño, sedes y calendario del módulo'         },
  { href: '/inventory/config', Icon: CheckCircle2, label: 'Config Inventario',   desc: 'Categorías de activos, sedes, SLA y calendario del módulo'         },
  { href: '/requests/config',  Icon: AlertTriangle, label: 'Config Solicitudes', desc: 'SLA solicitudes, tipos de solicitud, calendario del módulo'        },
];

export function QuickLinks() {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      {LINKS.map(({ href, Icon, label, desc }) => (
        <Link key={href} href={href} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          textDecoration: 'none', color: 'inherit', flex: '1 1 200px',
          transition: 'border-color .15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,94,58,.4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon size={15} style={{ color: '#0e2235' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{desc}</div>
          </div>
          <ExternalLink size={11} style={{ color: '#cbd5e1', flexShrink: 0 }} />
        </Link>
      ))}
    </div>
  );
}
