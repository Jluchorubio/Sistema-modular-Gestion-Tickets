'use client';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera, Edit2, Check, Star, Eye, Upload, Trash2,
  Building2, MapPin, Mail, Phone, Home, CalendarDays,
  X, RefreshCw, Globe, ChevronDown, ShieldCheck,
  UserCircle, Briefcase, AlertCircle,
} from 'lucide-react';
import { RoleManagementPanel } from './RoleManagementPanel';
import { useGeoData } from '@/hooks/useGeoData';
import { GeoCombobox } from '@/components/ui/GeoCombobox';
import { usersService } from '@/services/users.service';
import type { UpdateMeDto, AdminUpdateUserDto } from '@/services/users.service';
import { systemConfigService } from '@/services/system-config.service';
import { useAuthStore } from '@/stores/auth.store';
import { getInitials } from '@/lib/utils';
import type { CurrentUser } from '@/types/user.types';
import { fmtDate, fmtRelative, getActiveModules, type ProfileUser } from './profile.types';
import styles from './profile.module.css';

// ── Country calling codes ─────────────────────────────────────────────────────
type CountryOption = { name: string; dialCode: string; flag: string };
let _countriesCache: CountryOption[] | null = null;

async function fetchCountries(): Promise<CountryOption[]> {
  if (_countriesCache) return _countriesCache;
  const res  = await fetch('https://restcountries.com/v3.1/all?fields=name,idd,flag');
  const raw: Array<{ name: { common: string }; idd: { root: string; suffixes: string[] }; flag: string }> = await res.json();
  const list = raw
    .filter(c => c.idd?.root && c.idd?.suffixes?.length)
    .map(c => ({
      name:     c.name.common,
      dialCode: c.idd.suffixes.length === 1
        ? `${c.idd.root}${c.idd.suffixes[0]}`
        : c.idd.root,
      flag: c.flag,
    }))
    .filter(c => /^\+\d/.test(c.dialCode))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  _countriesCache = list;
  return list;
}

const GENDERS = ['masculino', 'femenino', 'no_binario', 'prefiero_no_decir', 'otro'] as const;
const GENDER_LABELS: Record<string, string> = {
  masculino:         'Masculino',
  femenino:          'Femenino',
  no_binario:        'No binario',
  prefiero_no_decir: 'Prefiero no decir',
  otro:              'Otro',
};

const editSchema = z.object({
  first_name:              z.string().min(1, 'Requerido'),
  last_name:               z.string().min(1, 'Requerido'),
  username:                z.string().optional(),
  gender:                  z.enum(GENDERS).optional().or(z.literal('')),
  birth_date:              z.string().optional(),
  national_id:             z.string().max(50).optional(),
  phone_prefix:            z.string().max(10).optional(),
  phone:                   z.string().max(30).optional(),
  country:                 z.string().max(100).optional(),
  state_province:          z.string().max(150).optional(),
  city:                    z.string().max(150).optional(),
  address:                 z.string().optional(),
  emergency_contact_name:  z.string().max(100).optional(),
  emergency_contact_phone: z.string().max(50).optional(),
  job_title:               z.string().max(150).optional(),
  department:              z.string().max(150).optional(),
  primary_sede:            z.string().max(200).optional(),
});
type EditForm = z.infer<typeof editSchema>;

interface Props {
  user:                ProfileUser;
  isOwnProfile:        boolean;
  viewerIsSuperadmin?: boolean;
  onUserUpdated:       (updated: CurrentUser) => void;
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

export function ProfileSidebar({ user, isOwnProfile, viewerIsSuperadmin = false, onUserUpdated }: Props) {
  const { setUser } = useAuthStore();
  const qc          = useQueryClient();
  const menuRef      = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const prefixRef    = useRef<HTMLDivElement>(null);

  const [menuOpen,      setMenuOpen]      = useState(false);
  const [editOpen,      setEditOpen]      = useState(false);
  const [editMsg,       setEditMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [cameraOpen,    setCameraOpen]    = useState(false);
  const [captured,      setCaptured]      = useState<string | null>(null);
  const [streamRef,     setStreamRef]     = useState<MediaStream | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadError,   setUploadError]   = useState<string | null>(null);
  const [isUploading,   setIsUploading]   = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoZoomed,     setPhotoZoomed]     = useState(false);
  const [countries,    setCountries]    = useState<CountryOption[]>([]);
  const [prefixOpen,   setPrefixOpen]   = useState(false);
  const [prefixSearch, setPrefixSearch] = useState('');

  const canEdit = isOwnProfile || viewerIsSuperadmin;

  const { data: sessionsData } = useQuery({
    queryKey:  ['my-sessions'],
    queryFn:   () => usersService.getMySessions(),
    enabled:   isOwnProfile,
    staleTime: 30_000,
  });
  const isOnline = sessionsData?.is_online ?? false;

  /* ── Org dropdowns ── */
  const { data: positions = [] }    = useQuery({ queryKey: ['positions'],    queryFn: systemConfigService.getPositions,    staleTime: 5 * 60_000 });
  const { data: areas = [] }        = useQuery({ queryKey: ['areas'],        queryFn: () => systemConfigService.getAreas(), staleTime: 5 * 60_000 });
  const { data: headquarters = [] } = useQuery({ queryKey: ['headquarters'], queryFn: systemConfigService.getHeadquarters,  staleTime: 5 * 60_000 });

  const activePositions = positions.filter(p => p.is_active);
  const activeHQ        = headquarters.filter(h => h.is_active);

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

  // ── Close photo viewer on Escape ─────────────────────────────────────────
  useEffect(() => {
    if (!photoViewerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPhotoViewerOpen(false); setPhotoZoomed(false); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [photoViewerOpen]);

  // ── Fetch country calling codes (once, module-level cache) ────────────────
  useEffect(() => {
    fetchCountries().then(setCountries).catch(() => {});
  }, []);

  // ── Close prefix dropdown on outside click ────────────────────────────────
  useEffect(() => {
    if (!prefixOpen) return;
    function handler(e: MouseEvent) {
      if (prefixRef.current && !prefixRef.current.contains(e.target as Node)) {
        setPrefixOpen(false);
        setPrefixSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [prefixOpen]);

  const filteredCountries = useMemo(() =>
    countries.filter(c =>
      !prefixSearch ||
      c.name.toLowerCase().includes(prefixSearch.toLowerCase()) ||
      c.dialCode.includes(prefixSearch)
    ).slice(0, 60),
  [countries, prefixSearch]);

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
      first_name:              user.first_name              || '',
      last_name:               user.last_name               || '',
      username:                user.username                || '',
      gender:                  (user.gender as typeof GENDERS[number] | undefined) ?? '',
      birth_date:              user.birth_date              || '',
      national_id:             user.national_id             || '',
      phone_prefix:            user.phone_prefix            || '',
      phone:                   user.phone                   || '',
      country:                 user.country                 || '',
      state_province:          user.state_province          || '',
      city:                    user.city                    || '',
      address:                 user.address                 || '',
      emergency_contact_name:  user.emergency_contact_name  || '',
      emergency_contact_phone: user.emergency_contact_phone || '',
      job_title:               user.job_title               || '',
      department:              user.department              || '',
      primary_sede:            user.primary_sede            || '',
    },
  });
  const {
    register: regEdit,
    handleSubmit: submitEdit,
    setValue: setVal,
    watch: watchEdit,
    control: editControl,
    formState: { errors: editErr, isSubmitting: editPending },
  } = editForm;

  const watchedPrefix  = watchEdit('phone_prefix');
  const watchedCountry = watchEdit('country') ?? '';
  const watchedState   = watchEdit('state_province') ?? '';

  const { countryOptions, stateOptions, cityOptions, statesLoading, citiesLoading } =
    useGeoData(watchedCountry, watchedState);

  const updateMeMut = useMutation({
    mutationFn: (dto: UpdateMeDto) => usersService.updateMe(dto),
    onSuccess: (updated) => {
      applyUpdate(updated);
      setEditMsg({ ok: true, text: 'Cambios guardados' });
      setTimeout(() => { setEditOpen(false); setEditMsg(null); }, 800);
    },
    onError: (e: Error) => setEditMsg({ ok: false, text: e.message ?? 'Error al guardar' }),
  });

  const updateAdminMut = useMutation({
    mutationFn: (dto: AdminUpdateUserDto) => usersService.updateUser(user.id, dto),
    onSuccess: (updated) => {
      applyUpdate({ ...user, ...updated } as CurrentUser);
      setEditMsg({ ok: true, text: 'Cambios guardados' });
      setTimeout(() => { setEditOpen(false); setEditMsg(null); }, 800);
    },
    onError: (e: Error) => setEditMsg({ ok: false, text: e.message ?? 'Error al guardar' }),
  });

  return (
    <div className={styles.leftCol}>

      {/* ── Photo Viewer / Lightbox ── */}
      {photoViewerOpen && user.avatar_url && (
        <div
          className={styles.photoViewerBackdrop}
          onClick={() => { setPhotoViewerOpen(false); setPhotoZoomed(false); }}
        >
          <button
            type="button"
            className={styles.photoViewerClose}
            onClick={() => { setPhotoViewerOpen(false); setPhotoZoomed(false); }}
            aria-label="Cerrar visor"
          >
            <X size={18} />
          </button>

          <div
            className={`${styles.photoViewerImgWrap}${photoZoomed ? ` ${styles.photoViewerZoomed}` : ''}`}
            onClick={e => { e.stopPropagation(); setPhotoZoomed(v => !v); }}
            role="button"
            tabIndex={0}
            aria-label={photoZoomed ? 'Reducir imagen' : 'Ampliar imagen'}
            onKeyDown={e => e.key === 'Enter' && setPhotoZoomed(v => !v)}
          >
            <img
              src={user.avatar_url}
              alt={fullName}
              className={styles.photoViewerImg}
              draggable={false}
            />
          </div>

          <p className={styles.photoViewerHint}>
            {photoZoomed ? 'Clic para reducir · Esc para cerrar' : 'Clic para ampliar · Esc para cerrar'}
          </p>
        </div>
      )}

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

        <div className={`${styles.onlineDot} ${isOwnProfile && !isOnline ? styles.onlineDotOffline : ''}`} />

        {isOwnProfile && menuOpen && !isAvatarBusy && (
          <div className={styles.avatarCtxMenu}>
            {user.avatar_url && (
              <>
                <button
                  className={styles.avatarCtxItem}
                  onClick={e => { e.stopPropagation(); setPhotoViewerOpen(true); setMenuOpen(false); }}
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
      {canEdit && (
        <>
          <button className={styles.btnSecondary} onClick={() => { setEditOpen(v => !v); setEditMsg(null); }}>
            <Edit2 size={13} />
            {editOpen ? 'Cancelar edición' : 'Editar perfil'}
          </button>
          <div className={`${styles.editAccordion}${editOpen ? ` ${styles.editAccordionOpen}` : ''}`}>
            <div className={styles.editAccordionInner}>
              <form onSubmit={submitEdit(data => {
                setEditMsg(null);
                const payload = {
                  ...data,
                  gender: data.gender || undefined,
                  birth_date: data.birth_date || undefined,
                };
                if (isOwnProfile) {
                  updateMeMut.mutate(payload);
                } else {
                  updateAdminMut.mutate(payload);
                }
              })}>

                {/* Personal */}
                <p className={styles.formSectionLabel}><UserCircle size={11} style={{ display: 'inline', marginRight: 4 }} />Información personal</p>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nombre *</label>
                    <input className={styles.formInput} placeholder="Nombre" {...regEdit('first_name')} />
                    {editErr.first_name && <span className={styles.fieldError}>{editErr.first_name.message}</span>}
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Apellido *</label>
                    <input className={styles.formInput} placeholder="Apellido" {...regEdit('last_name')} />
                    {editErr.last_name && <span className={styles.fieldError}>{editErr.last_name.message}</span>}
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Usuario (@)</label>
                    <input className={styles.formInput} placeholder="usuario123" {...regEdit('username')} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Género</label>
                    <select className={styles.formInput} {...regEdit('gender')}>
                      <option value="">Sin especificar</option>
                      {GENDERS.map(g => (
                        <option key={g} value={g}>{GENDER_LABELS[g]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fecha de nacimiento</label>
                    <input className={styles.formInput} type="date" {...regEdit('birth_date')} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nro. documento</label>
                    <input className={styles.formInput} placeholder="1234567890" {...regEdit('national_id')} />
                  </div>
                </div>

                {/* Contacto */}
                <p className={styles.formSectionLabel} style={{ marginTop: 8 }}>
                  <Phone size={11} style={{ display: 'inline', marginRight: 4 }} />Contacto
                </p>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Celular</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* Phone prefix picker */}
                    <div ref={prefixRef} style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        type="button"
                        className={styles.formInput}
                        style={{ width: 88, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', paddingRight: 6 }}
                        onClick={() => { setPrefixOpen(v => !v); setPrefixSearch(''); }}
                      >
                        <Globe size={12} style={{ flexShrink: 0, color: '#94A3B8' }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {watchedPrefix || '+'}
                        </span>
                        <ChevronDown size={11} style={{ flexShrink: 0, color: '#94A3B8' }} />
                      </button>
                      {prefixOpen && (
                        <div className={styles.prefixDropdown}>
                          <input
                            className={styles.prefixSearch}
                            placeholder="Buscar país…"
                            value={prefixSearch}
                            onChange={e => setPrefixSearch(e.target.value)}
                            autoFocus
                          />
                          <div className={styles.prefixList}>
                            {filteredCountries.length === 0 && (
                              <p className={styles.prefixEmpty}>Sin resultados</p>
                            )}
                            {filteredCountries.map(c => (
                              <button
                                key={c.name}
                                type="button"
                                className={styles.prefixItem}
                                onClick={() => {
                                  setVal('phone_prefix', c.dialCode, { shouldDirty: true });
                                  setPrefixOpen(false);
                                  setPrefixSearch('');
                                }}
                              >
                                <span>{c.flag}</span>
                                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                                <span style={{ color: '#64748B', flexShrink: 0 }}>{c.dialCode}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <input className={styles.formInput} placeholder="300 000 0000" {...regEdit('phone')} style={{ flex: 1 }} />
                  </div>
                </div>

                {/* Ubicación */}
                <p className={styles.formSectionLabel} style={{ marginTop: 8 }}>
                  <MapPin size={11} style={{ display: 'inline', marginRight: 4 }} />Ubicación
                </p>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>País</label>
                  <Controller
                    control={editControl}
                    name="country"
                    render={({ field }) => (
                      <GeoCombobox
                        value={field.value ?? ''}
                        onChange={val => {
                          field.onChange(val);
                          setVal('state_province', '');
                          setVal('city', '');
                        }}
                        options={countryOptions}
                        placeholder="Colombia"
                        inputClass={styles.formInput}
                      />
                    )}
                  />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Departamento / Estado</label>
                    <Controller
                      control={editControl}
                      name="state_province"
                      render={({ field }) => (
                        <GeoCombobox
                          value={field.value ?? ''}
                          onChange={val => {
                            field.onChange(val);
                            setVal('city', '');
                          }}
                          options={stateOptions}
                          loading={statesLoading}
                          placeholder={watchedCountry ? 'Cundinamarca' : 'Selecciona país'}
                          disabled={!watchedCountry}
                          inputClass={styles.formInput}
                        />
                      )}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Ciudad</label>
                    <Controller
                      control={editControl}
                      name="city"
                      render={({ field }) => (
                        <GeoCombobox
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          options={cityOptions}
                          loading={citiesLoading}
                          placeholder={watchedState ? 'Bogotá' : 'Selecciona departamento'}
                          disabled={!watchedState}
                          inputClass={styles.formInput}
                        />
                      )}
                    />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Dirección</label>
                  <input className={styles.formInput} placeholder="Calle 123 #45-67" {...regEdit('address')} />
                </div>

                {/* Emergencia */}
                <p className={styles.formSectionLabel} style={{ marginTop: 8 }}>
                  <AlertCircle size={11} style={{ display: 'inline', marginRight: 4 }} />Contacto de emergencia
                </p>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Nombre</label>
                  <input className={styles.formInput} placeholder="Nombre del contacto" {...regEdit('emergency_contact_name')} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Teléfono</label>
                  <input className={styles.formInput} placeholder="+57 300 000 0000" {...regEdit('emergency_contact_phone')} />
                </div>

                {/* Sistema — visible solo para superadmin o propio perfil */}
                {(isOwnProfile || viewerIsSuperadmin) && (
                  <>
                    <p className={styles.formSectionLabel} style={{ marginTop: 8 }}>
                      <Briefcase size={11} style={{ display: 'inline', marginRight: 4 }} />Información laboral
                    </p>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Cargo</label>
                      {activePositions.length > 0 ? (
                        <select className={styles.formInput} {...regEdit('job_title')}>
                          <option value="">Sin especificar</option>
                          {activePositions.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input className={styles.formInput} placeholder="Desarrollador, Técnico…" {...regEdit('job_title')} />
                      )}
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Área / Departamento</label>
                        {areas.length > 0 ? (
                          <select className={styles.formInput} {...regEdit('department')}>
                            <option value="">Sin especificar</option>
                            {areas.map(a => (
                              <option key={a.id} value={a.name}>
                                {a.department_name ? `${a.name} (${a.department_name})` : a.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input className={styles.formInput} placeholder="TI, Soporte…" {...regEdit('department')} />
                        )}
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Sede principal</label>
                        {activeHQ.length > 0 ? (
                          <select className={styles.formInput} {...regEdit('primary_sede')}>
                            <option value="">Sin especificar</option>
                            {activeHQ.map(h => (
                              <option key={h.id} value={h.name}>
                                {h.city ? `${h.name} — ${h.city}` : h.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input className={styles.formInput} placeholder="Sede Centro" {...regEdit('primary_sede')} />
                        )}
                      </div>
                    </div>
                  </>
                )}

                {editMsg && (
                  <p className={editMsg.ok ? styles.msgOk : styles.msgErr}>{editMsg.text}</p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    style={{ flex: 1 }}
                    disabled={editPending || updateMeMut.isPending || updateAdminMut.isPending}
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
            { label: user.department   || '—',  Icon: Building2   },
            { label: user.primary_sede || '—',  Icon: MapPin       },
            { label: user.email        || '—',  Icon: Mail         },
            {
              label: user.phone
                ? `${user.phone_prefix ? user.phone_prefix + ' ' : ''}${user.phone}`
                : '—',
              Icon: Phone,
            },
            {
              label: [user.city, user.state_province, user.country].filter(Boolean).join(', ') || user.address || '—',
              Icon: Home,
            },
            { label: `Desde ${fmtDate(user.created_at)}`, Icon: CalendarDays },
          ] as { label: string; Icon: React.ElementType }[]).map((row, i) => (
            <div key={i} className={styles.sideRow}>
              <row.Icon size={14} style={{ flexShrink: 0, marginTop: 1, color: '#64748B' }} />
              <span className={styles.sideRowText}>{row.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Roles (#11) ── */}
      <div className={styles.divider}>
        {/* Superadmin viewing another user → full role management panel */}
        {viewerIsSuperadmin && !isOwnProfile ? (
          <RoleManagementPanel
            userId={user.id}
            currentGlobalRoleId={(user as any).global_role_id ?? null}
          />
        ) : (
          <>
            <p className={styles.leftSectionTitle}>
              <ShieldCheck size={11} style={{ display: 'inline', marginRight: 4 }} />
              Roles del sistema
            </p>

            {/* Global role */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Rol global</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {user.is_superadmin && (
                  <span className={`${styles.badge} ${styles.badgeGray}`}><Star size={10} />Superadmin</span>
                )}
                {user.global_role && (
                  <span className={`${styles.badge} ${styles.badgeBlue}`}>{user.global_role.toUpperCase()}</span>
                )}
                {!user.is_superadmin && !user.global_role && (
                  <span className={`${styles.badge} ${styles.badgeGray}`}>USUARIO</span>
                )}
              </div>
            </div>

            {/* Module roles */}
            {activeModules.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Roles por módulo</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeModules.map(r => (
                    <div key={r.umr_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.module_name}
                      </span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <span className={`${styles.badge} ${styles.badgeBlue}`} style={{ fontSize: 10 }}>
                          {r.role_name.toUpperCase()}
                        </span>
                        <span className={`${styles.badge} ${r.status === 'active' ? styles.badgeGreen : styles.badgeGray}`} style={{ fontSize: 10 }}>
                          {r.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
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
