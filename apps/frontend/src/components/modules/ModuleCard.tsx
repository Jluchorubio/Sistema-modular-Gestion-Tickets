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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SystemModule } from '@/types/module.types';
import styles from './module-card.module.css';

interface TypeConfig {
  Icon: LucideIcon;
  iconCls: string;
  pillCls: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  tickets:    { Icon: Ticket,        iconCls: styles.iconTickets,    pillCls: styles.typeTickets    },
  helpdesk:   { Icon: MessageSquare, iconCls: styles.iconTickets,    pillCls: styles.typeHelpdesk   },
  inventario: { Icon: Package,       iconCls: styles.iconInventario, pillCls: styles.typeInventario },
  inventory:  { Icon: Package,       iconCls: styles.iconInventario, pillCls: styles.typeInventory  },
  crm:        { Icon: Users,         iconCls: styles.iconCrm,        pillCls: styles.typeCrm        },
  rrhh:       { Icon: UserCheck,     iconCls: styles.iconRrhh,       pillCls: styles.typeRrhh       },
  custom:     { Icon: Boxes,         iconCls: styles.iconCustom,     pillCls: styles.typeCustom     },
};

const FALLBACK_CONFIG: TypeConfig = {
  Icon: Boxes,
  iconCls: styles.iconCustom,
  pillCls: styles.typeCustom,
};

interface ModuleCardProps {
  module: SystemModule;
  isSuperadmin: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onToggleActive?: () => void;
  onDelete?: () => void;
}

export const ModuleCard = memo(function ModuleCard({
  module: m,
  isSuperadmin,
  onClick,
  onEdit,
  onToggleActive,
  onDelete,
}: ModuleCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const cfg = TYPE_CONFIG[m.type ?? ''] ?? FALLBACK_CONFIG;
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

  const cardCls = [
    styles.card,
    isLocked    ? styles.locked   : '',
    !m.is_active ? styles.inactive : '',
  ].filter(Boolean).join(' ');

  function handleCardClick() {
    if (!m.is_active || isLocked) return;
    onClick();
  }

  const iconNode = m.image_url ? (
    <img src={m.image_url} alt={m.name} className={styles.iconImg} />
  ) : (
    <cfg.Icon size={24} />
  );

  return (
    <div className={cardCls} onClick={handleCardClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleCardClick()}>

      {isLocked && (
        <div className={styles.lockedOverlay}>
          <Lock size={22} />
          <span className={styles.lockedLabel}>Sin acceso</span>
          <span className={styles.lockedHint}>Solicitar acceso</span>
        </div>
      )}

      {!m.is_active && <span className={styles.inactiveBadge}>Inactivo</span>}

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
            <MoreVertical size={16} />
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
              {m.is_active ? <><Pause size={13} /> Desactivar</> : <><Play size={13} /> Activar</>}
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

      <div className={`${styles.icon} ${cfg.iconCls}`}>{iconNode}</div>
      <div className={styles.name}>{m.name}</div>
      <div className={styles.desc}>{m.description ?? ''}</div>
      {m.type && <span className={`${styles.typePill} ${cfg.pillCls}`}>{m.type}</span>}
    </div>
  );
});
