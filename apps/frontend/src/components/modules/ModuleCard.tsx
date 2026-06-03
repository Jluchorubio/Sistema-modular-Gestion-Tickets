'use client';

import { memo, useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Ticket, Package, Users, UserCheck, Boxes, MessageSquare, ClipboardList,
  Lock, MoreVertical, Pencil, Pause, Play, Trash2, Construction, WrenchIcon,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SystemModule } from '@/types/module.types';
import { usersService } from '@/services/users.service';
import styles from './module-card.module.css';

interface TypeConfig {
  Icon:      LucideIcon;
  panelCls:  string;
  iconColor: string;
  badge:     string; /* top-left badge label */
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  tickets:    { Icon: Ticket,        panelCls: styles.imagePanelTickets,    iconColor: '#93c5fd', badge: 'MÓDULO TICKETS'    },
  helpdesk:   { Icon: MessageSquare, panelCls: styles.imagePanelTickets,    iconColor: '#93c5fd', badge: 'MÓDULO ITSM'       },
  inventario: { Icon: Package,       panelCls: styles.imagePanelInventario, iconColor: '#6ee7b7', badge: 'CONTROL DE ACTIVOS'},
  inventory:  { Icon: Package,       panelCls: styles.imagePanelInventario, iconColor: '#6ee7b7', badge: 'CONTROL DE ACTIVOS'},
  crm:        { Icon: Users,         panelCls: styles.imagePanelCrm,        iconColor: '#c4b5fd', badge: 'CRM'               },
  rrhh:       { Icon: UserCheck,     panelCls: styles.imagePanelRrhh,       iconColor: '#86efac', badge: 'RRHH'              },
  custom:     { Icon: Boxes,         panelCls: styles.imagePanelCustom,     iconColor: '#c4b5fd', badge: 'MÓDULO CUSTOM'     },
  gestion:    { Icon: ClipboardList, panelCls: styles.imagePanelGestion,    iconColor: '#a5b4fc', badge: 'ADMINISTRATIVO'    },
};

const FALLBACK_CONFIG: TypeConfig = {
  Icon: Boxes, panelCls: styles.imagePanelDefault, iconColor: '#94a3b8', badge: 'MÓDULO',
};

const TYPE_LABELS: Record<string, string> = {
  helpdesk:   'Mesa de Ayuda',
  tickets:    'Tickets',
  inventario: 'Inventario',
  inventory:  'Inventario',
  gestion:    'Gestión Adm.',
  crm:        'CRM',
  rrhh:       'RRHH',
  custom:     'Personalizado',
};

interface ModuleCardProps {
  module:               SystemModule;
  isSuperadmin:         boolean;
  isBuiltIn?:           boolean;
  onClick:              () => void;
  onEdit?:              () => void;
  onToggleActive?:      () => void;
  onDelete?:            () => void;
  onToggleMaintenance?: () => void;
}

export const ModuleCard = memo(function ModuleCard({
  module: m,
  isSuperadmin,
  isBuiltIn = false,
  onClick,
  onEdit,
  onToggleActive,
  onDelete,
  onToggleMaintenance,
}: ModuleCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef  = useRef<HTMLDivElement>(null);
  const isRealId = !m.id.startsWith('__');
  const cfg      = TYPE_CONFIG[m.type ?? ''] ?? FALLBACK_CONFIG;
  const isLocked = !isSuperadmin && !m.has_access;
  const hasMenu  = isSuperadmin && (!!onEdit || !!onToggleActive || !!onToggleMaintenance || !!onDelete);
  const inMaint  = !!m.maintenance_mode;

  /* ── Admin fetch ── */
  const { data: members } = useQuery({
    queryKey:  ['module-members', m.id],
    queryFn:   () => usersService.getModuleUsers(m.id),
    enabled:   isRealId,
    staleTime: 5 * 60_000,
  });
  const admin         = (members as any[])?.find((mb) => mb.role_name === 'admin_modulo') ?? null;
  const adminName     = admin ? `${admin.first_name} ${admin.last_name}` : null;
  const adminInitials = adminName
    ? adminName.split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : null;

  /* ── Status ── */
  const statusColor = inMaint ? '#f59e0b' : m.is_active ? '#20c933' : '#94a3b8';
  const statusLabel = inMaint ? 'Mantenimiento' : m.is_active ? 'Activo' : 'Inactivo';

  /* ── Close menu on outside click ── */
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const cardCls = [
    styles.card,
    isLocked ? styles.locked      : '',
    !m.is_active ? styles.inactive : '',
    inMaint   ? styles.maintenance : '',
    menuOpen  ? styles.cardMenuOpen : '',
  ].filter(Boolean).join(' ');

  function handleCardClick() {
    if (!m.is_active || isLocked) return;
    if (inMaint && !isSuperadmin) return;
    onClick();
  }

  const typeLabel  = TYPE_LABELS[m.type ?? ''] ?? m.type ?? '';
  const typeBadge  = cfg.badge;

  return (
    <div
      className={cardCls}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleCardClick()}
    >
      {/* ── Image header — h-40 overflow-hidden relative bg-brand-dark ── */}
      <div className={`${styles.imagePanel} ${cfg.panelCls}`}>
        {m.image_url ? (
          <img src={m.image_url} alt={m.name} className={styles.coverImg} />
        ) : (
          <div className={styles.iconWrap}>
            <cfg.Icon size={34} color={cfg.iconColor} />
          </div>
        )}

        {/* Type badge — top-left */}
        <span className={styles.typeBadge}>{typeBadge}</span>

        {/* State badges — top-right (only one shows) */}
        {!m.is_active && !inMaint && <span className={styles.inactiveBadge}>Inactivo</span>}
        {inMaint && (
          <span className={styles.maintenanceBadge}>
            <Construction size={10} /> Mantenimiento
          </span>
        )}

        {/* Locked overlay */}
        {isLocked && (
          <div className={styles.lockedOverlay}>
            <Lock size={20} />
            <span className={styles.lockedLabel}>Sin acceso</span>
            <span className={styles.lockedHint}>Solicitar acceso</span>
          </div>
        )}
      </div>

      {/* ── Admin avatar bridge — relative h-0 ── */}
      {admin && (
        <div className={styles.adminBridge}>
          <div className={styles.adminAvatar} title={adminName ?? undefined}>
            {admin.avatar_url ? (
              <img src={admin.avatar_url} alt={adminName ?? ''} />
            ) : (
              adminInitials
            )}
          </div>
        </div>
      )}

      {/* ── Card body — p-5 flex-1 flex flex-col justify-between min-h-[160px] ── */}
      <div className={styles.contentPanel}>
        {/* Kebab menu (superadmin only) */}
        {hasMenu && (
          <div
            className={styles.menuWrap}
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.kebabBtn}
              onClick={() => setMenuOpen((v) => !v)}
              title="Opciones"
            >
              <MoreVertical size={14} />
            </button>
            <div className={`${styles.dropdown}${menuOpen ? ` ${styles.dropdownOpen}` : ''}`}>
              {onEdit && (
                <button type="button" className={styles.ddItem}
                  onClick={() => { setMenuOpen(false); onEdit(); }}>
                  <Pencil size={13} /> Editar
                </button>
              )}
              {onToggleActive && (
                <button type="button" className={styles.ddItem}
                  onClick={() => { setMenuOpen(false); onToggleActive(); }}>
                  {m.is_active ? <><Pause size={13} /> Desactivar</> : <><Play size={13} /> Activar</>}
                </button>
              )}
              {onToggleMaintenance && (
                <button type="button" className={styles.ddItem}
                  onClick={() => { setMenuOpen(false); onToggleMaintenance(); }}>
                  {inMaint
                    ? <><WrenchIcon size={13} /> Desactivar mantenimiento</>
                    : <><WrenchIcon size={13} /> Modo mantenimiento</>
                  }
                </button>
              )}
              {!isBuiltIn && onDelete && (
                <>
                  <div className={styles.ddSep} />
                  <button type="button" className={`${styles.ddItem} ${styles.ddDanger}`}
                    onClick={() => { setMenuOpen(false); onDelete(); }}>
                    <Trash2 size={13} /> Eliminar
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div>
          {/* Coral label badge */}
          {typeLabel && <span className={styles.periodBadge}>{typeLabel}</span>}

          {/* Module name */}
          <div className={styles.name}>{m.name}</div>

          {/* Description */}
          {m.description && <p className={styles.desc}>{m.description}</p>}
        </div>

        {/* Footer */}
        <div className={styles.cardFooter}>
          <span className={styles.statusBadge} style={{ color: statusColor }}>
            <span className={styles.dot} style={{ background: statusColor }} />
            {statusLabel}
          </span>
          <button
            type="button"
            className={styles.enterBtn}
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
          >
            <span>Ingresar</span>
            <ChevronRight size={10} />
          </button>
        </div>
      </div>
    </div>
  );
});
