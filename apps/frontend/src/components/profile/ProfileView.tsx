'use client';
import { useState, useCallback } from 'react';
import { LayoutGrid, ShieldCheck, Settings, ChevronLeft } from 'lucide-react';
import type { CurrentUser } from '@/types/user.types';
import { ProfileSidebar } from './ProfileSidebar';
import { ProfileOverviewTab } from './ProfileOverviewTab';
import { ProfileSecurityTab } from './ProfileSecurityTab';
import { ProfileSettingsTab } from './ProfileSettingsTab';
import { type ProfileUser, type ActiveTab } from './profile.types';
import styles from './profile.module.css';

export type { ProfileUser };

interface ProfileViewProps {
  user:           ProfileUser;
  isOwnProfile:   boolean;
  onBack?:        () => void;
  onUserUpdated?: (u: ProfileUser) => void;
}

export function ProfileView({ user: initialUser, isOwnProfile, onBack, onUserUpdated }: ProfileViewProps) {
  const [user,      setLocalUser] = useState<ProfileUser>(initialUser);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Sin nombre';

  const handleUserUpdated = useCallback((updated: CurrentUser) => {
    const merged = { ...user, ...updated } as ProfileUser;
    setLocalUser(merged);
    onUserUpdated?.(merged);
  }, [user, onUserUpdated]);

  const handleTotpToggled = useCallback((enabled: boolean) => {
    setLocalUser(prev => ({ ...prev, totp_enabled: enabled }));
  }, []);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 0 60px' }}>
      {onBack && (
        <button className={styles.btnBack} onClick={onBack}>
          <ChevronLeft size={14} />
          Volver a Usuarios
        </button>
      )}

      <div className={styles.layout}>
        <ProfileSidebar
          user={user}
          isOwnProfile={isOwnProfile}
          onUserUpdated={handleUserUpdated}
        />

        <div className={styles.rightCol}>
          <div className={styles.tabs}>
            <button
              className={`${styles.navTab}${activeTab === 'overview' ? ` ${styles.navTabActive}` : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <LayoutGrid size={13} />Overview
            </button>
            {isOwnProfile && (
              <>
                <button
                  className={`${styles.navTab}${activeTab === 'security' ? ` ${styles.navTabActive}` : ''}`}
                  onClick={() => setActiveTab('security')}
                >
                  <ShieldCheck size={13} />Seguridad
                </button>
                <button
                  className={`${styles.navTab}${activeTab === 'settings' ? ` ${styles.navTabActive}` : ''}`}
                  onClick={() => setActiveTab('settings')}
                >
                  <Settings size={13} />Configuración
                </button>
              </>
            )}
          </div>

          {activeTab === 'overview' && (
            <ProfileOverviewTab user={user} isOwnProfile={isOwnProfile} fullName={fullName} />
          )}
          {isOwnProfile && activeTab === 'security' && (
            <ProfileSecurityTab user={user} isOwnProfile={isOwnProfile} onTotpToggled={handleTotpToggled} />
          )}
          {isOwnProfile && activeTab === 'settings' && (
            <ProfileSettingsTab user={user} />
          )}
        </div>
      </div>
    </div>
  );
}
