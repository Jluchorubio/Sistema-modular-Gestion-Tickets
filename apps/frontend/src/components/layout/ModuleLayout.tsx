'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { getInitials } from '@/lib/utils';
import styles from './module-layout.module.css';

const PRESET_COLORS = [
  { key: 'violet',  label: 'Violeta',   value: '#5b21b6' },
  { key: 'indigo',  label: 'Índigo',    value: '#3730a3' },
  { key: 'blue',    label: 'Azul',      value: '#1e40af' },
  { key: 'emerald', label: 'Esmeralda', value: '#065f46' },
  { key: 'amber',   label: 'Ámbar',     value: '#92400e' },
  { key: 'rose',    label: 'Rosa',      value: '#9f1239' },
];

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
  const qc = useQueryClient();

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

  /* ── Local overlay color (initialized from DB, persisted on change) ── */
  const [overlayColor, setOverlayColor] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const effectiveColor = overlayColor ?? mod?.color ?? '#3730a3';

  const saveMut = useMutation({
    mutationFn: (color: string) =>
      modulesService.updateModule(moduleId!, { color }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['module', moduleId] }),
  });

  function handleColorSelect(color: string) {
    setOverlayColor(color);
    setShowPicker(false);
    if (isSuperadmin && moduleId) {
      saveMut.mutate(color);
    }
  }

  /* ── Derived values ── */
  const displayTitle       = mod?.name ?? title;
  const displayDescription = mod?.description ?? description;
  const imageUrl           = mod?.image_url ?? null;

  const adminName    = admin ? `${admin.first_name} ${admin.last_name}` : null;
  const adminEmail   = admin?.email ?? null;
  const adminAvatar  = admin?.avatar_url ?? null;
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
        {/* Color overlay */}
        <div
          className={styles.overlay}
          style={{
            background: `linear-gradient(135deg, ${effectiveColor}e6 0%, ${effectiveColor}99 100%)`,
          }}
        />
        {/* Bottom gradient for depth */}
        <div className={styles.overlayGrad} />

        {/* Color picker — superadmin only, and only when there's a moduleId to save to */}
        {isSuperadmin && moduleId && (
          <div className={styles.pickerWrap}>
            <button
              type="button"
              className={styles.pickerToggle}
              onClick={() => setShowPicker((v) => !v)}
            >
              <span
                className={styles.pickerDot}
                style={{ background: effectiveColor }}
              />
              Tono del banner
            </button>

            {showPicker && (
              <div className={styles.pickerDropdown}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    title={c.label}
                    className={`${styles.pickerColor}${effectiveColor === c.value ? ` ${styles.pickerColorActive}` : ''}`}
                    style={{ background: c.value }}
                    onClick={() => handleColorSelect(c.value)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

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
