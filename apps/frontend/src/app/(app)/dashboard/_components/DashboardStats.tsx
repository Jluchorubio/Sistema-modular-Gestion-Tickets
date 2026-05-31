'use client';

import { Layers, Users, Ticket, AlertTriangle } from 'lucide-react';
import styles from '../dashboard.module.css';

type SystemStats = {
  users:    { total: number; active: number; inactive: number };
  modules:  { total: number; active: number; inactive: number };
  tickets:  { total: number; open: number };
  requests: { total: number; pending: number; in_progress: number };
};

interface Props {
  stats: SystemStats;
}

export function DashboardStats({ stats }: Props) {
  return (
    <div className={styles.statsStrip}>
      <div className={styles.statCard}>
        <Layers size={16} className={styles.statCardIcon} />
        <div>
          <span className={styles.statCardValue}>{stats.modules.total}</span>
          <span className={styles.statCardLabel}>Módulos</span>
        </div>
        <div className={styles.statCardSub}>
          {stats.modules.active} activos · {stats.modules.inactive} inactivos
        </div>
      </div>

      <div className={styles.statCard}>
        <Users size={16} className={styles.statCardIcon} />
        <div>
          <span className={styles.statCardValue}>{stats.users.total}</span>
          <span className={styles.statCardLabel}>Usuarios</span>
        </div>
        <div className={styles.statCardSub}>
          {stats.users.active} activos · {stats.users.inactive} inactivos
        </div>
      </div>

      <div className={styles.statCard}>
        <Ticket size={16} className={styles.statCardIcon} />
        <div>
          <span className={styles.statCardValue}>{stats.tickets.total}</span>
          <span className={styles.statCardLabel}>Tickets</span>
        </div>
        <div className={styles.statCardSub}>{stats.tickets.open} abiertos</div>
      </div>

      <div className={styles.statCard}>
        <AlertTriangle
          size={16}
          className={styles.statCardIcon}
          style={{ color: stats.requests.pending > 0 ? '#F59E0B' : undefined }}
        />
        <div>
          <span className={styles.statCardValue}>{stats.requests.pending}</span>
          <span className={styles.statCardLabel}>Solicitudes</span>
        </div>
        <div className={styles.statCardSub}>
          {stats.requests.in_progress} en proceso · {stats.requests.total} total
        </div>
      </div>
    </div>
  );
}
