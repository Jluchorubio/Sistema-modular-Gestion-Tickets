'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, LockKeyhole } from 'lucide-react';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { RequestModuleAccessModal } from '@/components/modules/RequestModuleAccessModal';
import styles from './module-layout.module.css';

interface Props {
  moduleId?: string;
  title: string;
  description?: string | null;
  isSuperadmin?: boolean;
  subBar?: React.ReactNode;
  children: React.ReactNode;
}

export function ModuleLayout({
  moduleId,
  title,
  description,
  isSuperadmin = false,
  subBar,
  children,
}: Props) {
  const [showAccessModal, setShowAccessModal] = useState(false);
  const { hasAccess, isChecking } = useModuleAccess(moduleId);

  /* ── Fetch module data & members ── */
  const { data: mod } = useQuery({
    queryKey: ['module', moduleId],
    queryFn: () => modulesService.getModule(moduleId!),
    enabled: !!moduleId,
    staleTime: 5 * 60_000,
  });

  const { data: members } = useQuery({
    queryKey: ['module-members', moduleId],
    queryFn: () => usersService.getModuleUsers(moduleId!),
    enabled: !!moduleId,
    staleTime: 5 * 60_000,
  });

  /* ── Derive admin from members ── */
  const admin = (members as any[])?.find(
    (m) => m.role_name === 'admin_modulo',
  ) ?? null;

  /* ── Derived values ── */
  const displayTitle       = mod?.name ?? title;
  const displayDescription = mod?.description ?? description;

  const adminName  = admin ? `${admin.first_name} ${admin.last_name}` : null;
  const adminEmail = admin?.email ?? null;

  /* ── Access guard ── */
  if (!isChecking && !hasAccess) {
    const displayName = mod?.name ?? title;
    return (
      <>
        <div className={styles.card}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '80px 24px', gap: 16, textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(255,94,58,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LockKeyhole size={24} style={{ color: '#ff5e3a' }} />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
                Sin acceso a {displayName}
              </p>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, maxWidth: 340 }}>
                No tienes un rol activo en este módulo. Solicita acceso para que un administrador lo revise.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAccessModal(true)}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: '#ff5e3a', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Solicitar acceso
            </button>
          </div>
        </div>
        {showAccessModal && moduleId && (
          <RequestModuleAccessModal
            moduleName={displayName}
            moduleId={moduleId}
            onClose={() => setShowAccessModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className={styles.card}>
      {subBar}
      {/* ── Module info ── */}
      <div className={styles.info}>

        {/* Title row */}
        <div className={styles.titleRow}>
          <div>
            <span className={styles.badge}>Módulo Operativo Activo</span>
            <h2 className={styles.title}>{displayTitle}</h2>
            {admin && (
              <p className={styles.adminLine}>
                Administrador responsable:{' '}
                <strong>{adminName}</strong>
                {(admin as any).position_name && (
                  <>
                    <span className={styles.sep}>·</span>
                    {(admin as any).position_name}
                  </>
                )}
              </p>
            )}
          </div>

          {admin && adminEmail && (
            <a
              href={`mailto:${adminEmail}`}
              className={styles.contactBtn}
            >
              <Mail size={13} strokeWidth={2} />
              Contactar administrador
            </a>
          )}
        </div>

        {/* Description */}
        {displayDescription && (
          <div className={styles.descCard}>
            <div className={styles.descIcon}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <span className={styles.descLabel}>Descripción del módulo</span>
              <p className={styles.descText}>{displayDescription}</p>
            </div>
          </div>
        )}

        {/* Page content */}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
