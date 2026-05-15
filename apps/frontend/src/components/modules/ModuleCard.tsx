'use client';

import { memo, useRef, useState, useEffect } from 'react';
import {
  Ticket,
  Package,
  Users,
  UserCheck,
  Boxes,
  MessageSquare,
  Lock,
  MoreVertical,
  Pencil,
  Pause,
  Play,
  Trash2,
  Construction,
  WrenchIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SystemModule } from '@/types/module.types';
import styles from './module-card.module.css';

interface TypeConfig {
  Icon:        LucideIcon;
  panelCls:    string;
  iconColor:   string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  tickets:    { Icon: Ticket,        panelCls: styles.imagePanelTickets,    iconColor: '#93c5fd' },
  helpdesk:   { Icon: MessageSquare, panelCls: styles.imagePanelTickets,    iconColor: '#93c5fd' },
  inventario: { Icon: Package,       panelCls: styles.imagePanelInventario, iconColor: '#6ee7b7' },
  inventory:  { Icon: Package,       panelCls: styles.imagePanelInventario, iconColor: '#6ee7b7' },
  crm:        { Icon: Users,         panelCls: styles.imagePanelCrm,        iconColor: '#c4b5fd' },
  rrhh:       { Icon: UserCheck,     panelCls: styles.imagePanelRrhh,       iconColor: '#86efac' },
  custom:     { Icon: Boxes,         panelCls: styles.imagePanelCustom,     iconColor: '#c4b5fd' },
};

const FALLBACK_CONFIG: TypeConfig = {
  Icon:      Boxes,
  panelCls:  styles.imagePanelDefault,
  iconColor: '#94a3b8',
};

interface ModuleCardProps {
  module:                SystemModule;
  isSuperadmin:          boolean;
  onClick:               () => void;
  onEdit?:               () => void;
  onToggleActive?:       () => void;
  onDelete?:             () => void;
  onToggleMaintenance?:  () => void;
}

export const ModuleCard = memo(function ModuleCard({
  module: m,
  isSuperadmin,
  onClick,
  onEdit,
  onToggleActive,
  onDelete,
  onToggleMaintenance,
}: ModuleCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef  = useRef<HTMLDivElement>(null);
  const cfg      = TYPE_CONFIG[m.type ?? ''] ?? FALLBACK_CONFIG;
  const isLocked = !isSuperadmin && m.has_access === false;

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  const inMaintenance = !!m.maintenance_mode;

  const cardCls = [
    styles.card,
    isLocked        ? styles.locked          : '',
    !m.is_active    ? styles.inactive        : '',
    inMaintenance   ? styles.maintenance     : '',
    menuOpen        ? styles.cardMenuOpen    : '',
  ].filter(Boolean).join(' ');

  function handleCardClick() {
    if (!m.is_active || isLocked) return;
    if (inMaintenance && !isSuperadmin) return;
    onClick();
  }

  return (
    <div
      className={cardCls}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleCardClick()}
    >
      {/* ── Left: image panel (30%) ── */}
      <div className={`${styles.imagePanel} ${cfg.panelCls}`}>
        {m.image_url ? (
          <img src={m.image_url} alt={m.name} className={styles.coverImg} />
        ) : (
          <div className={styles.iconWrap}>
            <cfg.Icon size={28} color={cfg.iconColor} />
          </div>
        )}

        {/* Locked overlay lives in image panel */}
        {isLocked && (
          <div className={styles.lockedOverlay}>
            <Lock size={18} />
            <span className={styles.lockedLabel}>Sin acceso</span>
            <span className={styles.lockedHint}>Solicitar acceso</span>
          </div>
        )}

        {/* Inactive badge */}
        {!m.is_active && (
          <span className={styles.inactiveBadge}>Inactivo</span>
        )}

        {/* Maintenance badge */}
        {inMaintenance && (
          <span className={styles.maintenanceBadge}>
            <Construction size={10} /> Mantenimiento
          </span>
        )}
      </div>

      {/* ── Right: content panel (70%) ── */}
      <div className={styles.contentPanel}>
        {/* Kebab menu */}
        {isSuperadmin && (
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
              <MoreVertical size={15} />
            </button>
            <div className={`${styles.dropdown}${menuOpen ? ` ${styles.dropdownOpen}` : ''}`}>
              <button
                type="button"
                className={styles.ddItem}
                onClick={() => { setMenuOpen(false); onEdit?.(); }}
              >
                <Pencil size={13} /> Editar
              </button>
              <button
                type="button"
                className={styles.ddItem}
                onClick={() => { setMenuOpen(false); onToggleActive?.(); }}
              >
                {m.is_active
                  ? <><Pause size={13} /> Desactivar</>
                  : <><Play  size={13} /> Activar</>
                }
              </button>
              <button
                type="button"
                className={styles.ddItem}
                onClick={() => { setMenuOpen(false); onToggleMaintenance?.(); }}
              >
                {inMaintenance
                  ? <><WrenchIcon size={13} /> Desactivar mantenimiento</>
                  : <><WrenchIcon size={13} /> Modo mantenimiento</>
                }
              </button>
              <div className={styles.ddSep} />
              <button
                type="button"
                className={`${styles.ddItem} ${styles.ddDanger}`}
                onClick={() => { setMenuOpen(false); onDelete?.(); }}
              >
                <Trash2 size={13} /> Eliminar
              </button>
            </div>
          </div>
        )}

        <div className={styles.name}>{m.name}</div>
        {m.description && (
          <div className={styles.desc}>{m.description}</div>
        )}
        {m.type && (
          <span className={`${styles.typePill} ${styles[`type${m.type.charAt(0).toUpperCase()}${m.type.slice(1)}`] ?? styles.typeCustom}`}>
            {m.type}
          </span>
        )}
      </div>
    </div>
  );
});
