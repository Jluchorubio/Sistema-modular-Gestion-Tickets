'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, BookOpen } from 'lucide-react';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8' };

const NAV = [
  { href: '/helpdesk/knowledge/docs',  label: 'Base documental', Icon: BookOpen      },
  { href: '/helpdesk/knowledge/forum', label: 'Foro técnico',    Icon: MessageSquare },
];

export function KnowledgeNav() {
  const pathname = usePathname();
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link key={href} href={href}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: '8px 8px 0 0', border: `1px solid ${active ? C.border : 'transparent'}`, borderBottom: active ? '1px solid #fff' : 'none', background: active ? '#fff' : 'transparent', color: active ? C.navy : C.muted, fontSize: 13, fontWeight: active ? 700 : 500, textDecoration: 'none', marginBottom: active ? -1 : 0, transition: 'color .12s' }}>
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
