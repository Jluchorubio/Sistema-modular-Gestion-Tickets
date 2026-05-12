'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Edit2, Check, Star, Eye, Upload, Trash2, Building2, MapPin, Mail, Phone, Home, CalendarDays, X, RefreshCw } from 'lucide-react';
import { usersService } from '@/services/users.service';
import type { UpdateMeDto } from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import { getInitials } from '@/lib/utils';
import type { CurrentUser } from '@/types/user.types';
import { fmtDate, fmtRelative, getActiveModules, type ProfileUser } from './profile.types';
import styles from './profile.module.css';

const editSchema = z.object({
  first_name: z.string().min(1, 'Requerido'),
  last_name:  z.string().min(1, 'Requerido'),
  phone:      z.string().optional(),
  address:    z.string().optional(),
});
type EditForm = z.infer<typeof editSchema>;

interface Props {
  user:          ProfileUser;
  isOwnProfile:  boolean;
  onUserUpdated: (updated: CurrentUser) => void;
}

async function resizeImageToBase64(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width  * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/webp', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function ProfileSidebar({ user, isOwnProfile, onUserUpdated }: Props) {
  const { setUser } = useAuthStore();
  const qc          = useQueryClient();
  const menuRef     = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);

  const [menuOpen,    setMenuOpen]    = useState(false);
  const [editOpen,    setEditOpen]    = useState(false);
  const [editMsg,     setEditMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [cameraOpen,  setCameraOpen]  = useState(false);
  const [captured,    setCaptured]    = useState<string | null>(null);
  const [streamRef,   setStreamRef]   = useState<MediaStream | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadError,   setUploadError]  = useState<string | null>(null);
  const [isUploading,   setIsUploading]  = useState(false);

  const fullName      = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Sin nombre';
  const initials      = getInitials(user.first_name || '?', user.last_name || '?');
  const activeModules = getActiveModules(user);

  const avatarSrc = avatarPreview ?? user.avatar_url;

  const applyAvatarMut = useMutation({
    mutationFn: (url: string) => usersService.updateMe({ avatar_url: url }),
    onSuccess:  (updated) => {
      applyUpdate(updated);
      setMenuOpen(false);
      setAvatarPreview(null);
      setCameraOpen(false);
      setCaptured(null);
    },
    onError: () => setUploadError('Error al guardar la foto'),
  });

  const deleteAvatarMut = useMutation({
    mutationFn: () => usersService.updateMe({ avatar_url: null }),
    onSuccess:  (updated) => { applyUpdate(updated); setMenuOpen(false); },
  });

  const isAvatarBusy = isUploading || applyAvatarMut.isPending;

  async function handleAvatarFile(file: File) {
    setUploadError(null);
    setIsUploading(true);
    try {
      const base64 = await resizeImageToBase64(file);
      setAvatarPreview(base64);
      applyAvatarMut.mutate(base64);
    } catch {
      setUploadError('Error al procesar la imagen');
    } finally {
      setIsUploading(false);
    }
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  async function openCamera() {
    setMenuOpen(false);
    setCaptured(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStreamRef(stream);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 80);
    } catch {
      setUploadError('No se pudo acceder a la cámara');
    }
  }

  function closeCamera() {
    streamRef?.getTracks().forEach(t => t.stop());
    setStreamRef(null);
    setCameraOpen(false);
    setCaptured(null);
  }

  function captureFrame() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const size = 320;
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const scale = Math.max(size / video.videoWidth, size / video.videoHeight);
    const w = video.videoWidth  * scale;
    const h = video.videoHeight * scale;
    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (size - w) / 2, (size - h) / 2, w, h);
    ctx.restore();
    setCaptured(canvas.toDataURL('image/webp', 0.85));
  }

  function confirmCapture() {
    if (!captured) return;
    streamRef?.getTracks().forEach(t => t.stop());
    setStreamRef(null);
    setAvatarPreview(captured);
    applyAvatarMut.mutate(captured);
    setCameraOpen(false);
    setCaptured(null);
  }

  // Re-attach stream when user hits "Retomar" (captured → null resets the <video> element)
  useEffect(() => {
    if (!captured && streamRef && cameraOpen && videoRef.current) {
      videoRef.current.srcObject = streamRef;
      videoRef.current.play().catch(() => {});
    }
  }, [captured, streamRef, cameraOpen]);

  // ── Close menu on outside click ──────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Shared update helper ─────────────────────────────────────────────────
  const applyUpdate = useCallback((updated: CurrentUser) => {
    if (isOwnProfile) {
      setUser({ ...user, ...updated } as ProfileUser);
      qc.invalidateQueries({ queryKey: ['me'] });
    }
    onUserUpdated(updated);
  }, [user, isOwnProfile, setUser, qc, onUserUpdated]);

  // ── Edit form ────────────────────────────────────────────────────────────
  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    values: {
      first_name: user.first_name || '',
      last_name:  user.last_name  || '',
      phone:      user.phone      || '',
      address:    user.address    || '',
    },
  });
  const { register: regEdit, handleSubmit: submitEdit, formState: { errors: editErr, isSubmitting: editPending } } = editForm;

  const updateMeMut = useMutation({
    mutationFn: (dto: UpdateMeDto) => usersService.updateMe(dto),
    onSuccess: (updated) => {
      applyUpdate(updated);
      setEditMsg({ ok: true, text: 'Cambios guardados' });
      setTimeout(() => { setEditOpen(false); setEditMsg(null); }, 800);
    },
    onError: (e: Error) => setEditMsg({ ok: false, text: e.message ?? 'Error al guardar' }),
  });

  return (
    <div className={styles.leftCol}>

      {/* ── Camera Modal ── */}
      {cameraOpen && (
        <div className={styles.cameraBackdrop} onClick={closeCamera}>
          <div className={styles.cameraModal} onClick={e => e.stopPropagation()}>
            <button className={styles.cameraClose} onClick={closeCamera}><X size={18} /></button>
            <h3 className={styles.cameraTitle}>Tomar foto de perfil</h3>

            {captured ? (
              <img src={captured} alt="preview" className={styles.cameraPreview} />
            ) : (
              <video
                ref={videoRef}
                className={styles.cameraVideo}
                autoPlay
                playsInline
                muted
                style={{ transform: 'scaleX(-1)' }}
              />
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div className={styles.cameraBtns}>
              {captured ? (
                <>
                  <button className={styles.btnSecondary} onClick={() => setCaptured(null)}>
                    <RefreshCw size={13} /> Retomar
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={confirmCapture}
                    disabled={applyAvatarMut.isPending}
                  >
                    <Check size={13} /> Usar esta foto
                  </button>
                </>
              ) : (
                <button className={styles.btnPrimary} onClick={captureFrame}>
                  <Camera size={13} /> Capturar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Avatar ── */}
      <div
        ref={menuRef}
        className={styles.avatarContainer}
        onClick={isOwnProfile && !isAvatarBusy ? () => setMenuOpen(v => !v) : undefined}
        style={isOwnProfile && !isAvatarBusy ? undefined : { cursor: 'default' }}
      >
        <div className={styles.avatarWrap}>
          {avatarSrc
            ? <img src={avatarSrc} alt={fullName} className={styles.avatarImg} />
            : <span className={styles.avatarInitials}>{initials}</span>
          }
        </div>

        {isOwnProfile && !isAvatarBusy && (
          <div className={styles.avatarOverlay}>
            <span className={styles.avatarOverlayLabel}><Camera size={14} />Editar foto</span>
          </div>
        )}

        {isAvatarBusy && (
          <div className={`${styles.avatarOverlay} ${styles.avatarOverlayVisible}`}>
            <span className={styles.avatarSpinner} />
          </div>
        )}

        <div className={styles.onlineDot} />

        {isOwnProfile && menuOpen && !isAvatarBusy && (
          <div className={styles.avatarCtxMenu}>
            {user.avatar_url && (
              <>
                <button
                  className={styles.avatarCtxItem}
                  onClick={e => { e.stopPropagation(); window.open(user.avatar_url!, '_blank'); setMenuOpen(false); }}
                >
                  <Eye size={13} /> Ver foto
                </button>
                <div className={styles.avatarCtxSep} />
              </>
            )}
            <button
              className={styles.avatarCtxItem}
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              <Upload size={13} /> Subir foto
            </button>
            <button
              className={styles.avatarCtxItem}
              onClick={e => { e.stopPropagation(); openCamera(); }}
            >
              <Camera size={13} /> Tomar foto
            </button>
            {user.avatar_url && (
              <>
                <div className={styles.avatarCtxSep} />
                <button
                  className={`${styles.avatarCtxItem} ${styles.avatarCtxItemDanger}`}
                  onClick={e => { e.stopPropagation(); deleteAvatarMut.mutate(); }}
                  disabled={deleteAvatarMut.isPending}
                >
                  <Trash2 size={13} /> Eliminar foto
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      {isOwnProfile && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleAvatarFile(file);
            e.target.value = '';
          }}
        />
      )}

      {uploadError && <p className={styles.avatarError}>{uploadError}</p>}

      {/* ── Identity ── */}
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#020617', lineHeight: 1.2, marginBottom: 4 }}>
        {fullName}
      </h1>
      <p style={{ fontSize: 18, color: '#64748B', fontWeight: 500, marginBottom: 12 }}>
        {user.username ? `@${user.username}` : '@usuario'}
      </p>
      {user.job_title && (
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>{user.job_title}</p>
      )}
      {user.is_superadmin && (
        <div style={{ marginBottom: 10 }}>
          <span className={`${styles.badge} ${styles.badgeGray}`}><Star size={10} />Superadmin</span>
        </div>
      )}
      {user.global_role && (
        <div style={{ marginBottom: 18 }}>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>{user.global_role.toUpperCase()}</span>
        </div>
      )}

      {/* ── Edit accordion ── */}
      {isOwnProfile && (
        <>
          <button className={styles.btnSecondary} onClick={() => { setEditOpen(v => !v); setEditMsg(null); }}>
            <Edit2 size={13} />
            {editOpen ? 'Cancelar edición' : 'Editar perfil'}
          </button>
          <div className={`${styles.editAccordion}${editOpen ? ` ${styles.editAccordionOpen}` : ''}`}>
            <div className={styles.editAccordionInner}>
              <form onSubmit={submitEdit(data => { setEditMsg(null); updateMeMut.mutate(data); })}>
                <p className={styles.formSectionLabel}>Información personal</p>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nombre</label>
                    <input className={styles.formInput} placeholder="Nombre" {...regEdit('first_name')} />
                    {editErr.first_name && <span className={styles.fieldError}>{editErr.first_name.message}</span>}
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Apellido</label>
                    <input className={styles.formInput} placeholder="Apellido" {...regEdit('last_name')} />
                    {editErr.last_name && <span className={styles.fieldError}>{editErr.last_name.message}</span>}
                  </div>
                </div>
                <p className={styles.formSectionLabel} style={{ marginTop: 8 }}>Contacto</p>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Celular</label>
                  <input className={styles.formInput} placeholder="+57 300 000 0000" {...regEdit('phone')} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Dirección</label>
                  <input className={styles.formInput} placeholder="Calle 123 #45-67" {...regEdit('address')} />
                </div>
                {editMsg && (
                  <p className={editMsg.ok ? styles.msgOk : styles.msgErr}>{editMsg.text}</p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    style={{ flex: 1 }}
                    disabled={editPending || updateMeMut.isPending}
                  >
                    <Check size={13} />Guardar cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ── Info rows ── */}
      <div className={styles.divider}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {([
            { label: user.department   || '—', Icon: Building2  },
            { label: user.primary_sede || '—', Icon: MapPin      },
            { label: user.email        || '—', Icon: Mail        },
            { label: user.phone        || '—', Icon: Phone       },
            { label: user.address      || '—', Icon: Home        },
            { label: `Desde ${fmtDate(user.created_at)}`, Icon: CalendarDays },
          ] as { label: string; Icon: React.ElementType }[]).map((row, i) => (
            <div key={i} className={styles.sideRow}>
              <row.Icon size={14} style={{ flexShrink: 0, marginTop: 1, color: '#64748B' }} />
              <span className={styles.sideRowText}>{row.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Roles ── */}
      <div className={styles.divider}>
        <p className={styles.leftSectionTitle}>Roles en sistema</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {user.is_superadmin ? (
            <span className={`${styles.badge} ${styles.badgeGray}`}><Star size={10} />Superadmin</span>
          ) : activeModules.length ? (
            activeModules.map(r => (
              <span key={r.umr_id} className={`${styles.badge} ${styles.badgeBlue}`}>
                {r.role_name.toUpperCase()}
              </span>
            ))
          ) : (
            <span className={`${styles.badge} ${styles.badgeGray}`}>USUARIO</span>
          )}
        </div>
      </div>

      {/* ── Active modules ── */}
      {activeModules.length > 0 && (
        <div className={styles.divider}>
          <p className={styles.leftSectionTitle}>Módulos activos</p>
          {activeModules.map(r => (
            <div key={r.umr_id} className={styles.moduleItem}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A' }}>{r.module_name}</p>
                <p style={{ fontSize: 11, color: '#64748B' }}>{r.role_name}</p>
              </div>
              <span className={`${styles.badge} ${styles.badgeBlue}`} style={{ fontSize: 10 }}>
                {r.role_name.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Stats ── */}
      <div className={styles.divider}>
        <p className={styles.leftSectionTitle}>Estadísticas</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Módulos activos</span>
            <span className={styles.statValue} style={{ color: '#22C55E' }}>{activeModules.length}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Último acceso</span>
            <span className={styles.statValue} style={{ fontSize: 13, color: '#64748B' }}>
              {fmtRelative(user.last_login_at)}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Perfil</span>
            <span className={`${styles.badge} ${user.profile_complete ? styles.badgeGreen : styles.badgeYellow}`}>
              {user.profile_complete ? 'Completo' : 'Incompleto'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
