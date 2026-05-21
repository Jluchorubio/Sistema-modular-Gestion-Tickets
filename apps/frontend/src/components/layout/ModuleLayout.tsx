'use client';

import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { getInitials } from '@/lib/utils';
import styles from './module-layout.module.css';

interface Props {
  moduleId?: string;
  title: string;
  description?: string | null;
  isSuperadmin?: boolean;
  children: React.ReactNode;
}

export function ModuleLayout({
  moduleId,
  title,
  description,
  isSuperadmin = false,
  children,
}: Props) {
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
  const imageUrl           = mod?.image_url ?? null;
  const overlayColor       = mod?.color ?? '#3730a3';

  const adminName     = admin ? `${admin.first_name} ${admin.last_name}` : null;
  const adminEmail    = admin?.email ?? null;
  const adminAvatar   = admin?.avatar_url ?? null;
  const adminInitials = admin
    ? getInitials(admin.first_name, admin.last_name)
    : null;

  /* ── Hero background style ── */
  const heroStyle: React.CSSProperties = imageUrl
    ? { backgroundImage: `url(${imageUrl})` }
    : {};

  return (
    <div className={styles.card}>
      {/* ── Hero section ── */}
      <div className={styles.hero} style={heroStyle}>
        {/* Color overlay — always shown; tints image or fills plain bg */}
        <div
          className={styles.overlay}
          style={{
            background: imageUrl
              ? `linear-gradient(to bottom, ${overlayColor}55 0%, ${overlayColor}cc 100%)`
              : `linear-gradient(135deg, ${overlayColor}e6 0%, ${overlayColor}99 100%)`,
          }}
        />
        {/* Bottom gradient for depth */}
        <div className={styles.overlayGrad} />

        {/* Admin avatar — overlaps hero/content boundary */}
        <div className={styles.adminAvatar}>
          <div className={styles.adminAvatarInner}>
            {adminAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={adminAvatar}
                alt={adminName ?? 'Admin'}
                className={styles.adminAvatarImg}
              />
            ) : adminInitials ? (
              <span className={styles.adminAvatarInitials}>{adminInitials}</span>
            ) : (
              <span className={styles.adminPlaceholder}>?</span>
            )}
          </div>
          {admin && <span className={styles.adminOnlineDot} />}
        </div>
      </div>

      {/* ── Module info ── */}
      <div className={styles.info}>
        {/* Spacer so content clears the overlapping avatar */}
        <div className={styles.avatarSpacer} />

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
