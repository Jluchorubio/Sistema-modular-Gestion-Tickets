class AppHeader extends HTMLElement {
  connectedCallback() {
    this._render();
    this._setup();
  }

  _render() {
    this.innerHTML = `
      <style>
        app-header {
          display: block;
          background: #FFFFFF;
          border-bottom: 1px solid #E2E8F0;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .ah-inner {
          max-width: 1400px; margin: 0 auto; padding: 0 20px;
          height: 56px; display: flex; align-items: center; justify-content: space-between;
        }
        .ah-brand { display: flex; align-items: center; gap: 9px; }
        .ah-brand-icon {
          width: 31px; height: 31px; background: #0F2A3D; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 800; font-size: 13px; letter-spacing: -.5px; flex-shrink: 0;
        }
        .ah-brand-name { font-weight: 700; font-size: 14px; color: #0F172A; letter-spacing: -.01em; }

        .ah-right { display: flex; align-items: center; gap: 8px; }

        /* Notification */
        .ah-notif-btn {
          width: 36px; height: 36px; border-radius: 9px;
          border: 1.5px solid #E2E8F0; background: #FFFFFF;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #64748B; transition: all .12s;
        }
        .ah-notif-btn:hover { background: #F8FAFC; border-color: #CBD5E1; }

        /* Profile trigger */
        .ah-profile-wrap { position: relative; }
        .ah-trigger {
          display: flex; align-items: center; gap: 8px;
          background: none; border: 1.5px solid transparent; border-radius: 10px;
          padding: 5px 8px; cursor: pointer;
          transition: border-color .15s, background .15s;
          font-family: inherit;
        }
        .ah-trigger:hover { border-color: #E2E8F0; background: #F8FAFC; }
        .ah-trigger[aria-expanded="true"] { border-color: #E2E8F0; background: #F1F5F9; }

        .ah-avatar {
          width: 30px; height: 30px; border-radius: 50%;
          background: #1F7AE0; display: flex; align-items: center;
          justify-content: center; font-weight: 800; font-size: 12px; color: #fff;
          overflow: hidden; flex-shrink: 0;
        }
        .ah-avatar img { width: 30px; height: 30px; object-fit: cover; }
        .ah-uname { font-size: 13px; font-weight: 600; color: #374151; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ah-chevron { font-size: 11px; color: #94A3B8; transition: transform .15s; }
        .ah-trigger[aria-expanded="true"] .ah-chevron { transform: rotate(180deg); }

        /* Dropdown */
        .ah-dropdown {
          display: none; position: absolute; right: 0; top: calc(100% + 6px);
          background: #FFFFFF; border: 1.5px solid #E2E8F0; border-radius: 12px;
          min-width: 215px; padding: 8px 0;
          box-shadow: 0 8px 32px rgba(0,0,0,.10), 0 2px 8px rgba(0,0,0,.05);
          z-index: 200;
        }
        .ah-dropdown.open { display: block; }
        .ah-dd-info { padding: 10px 16px 10px; border-bottom: 1px solid #F1F5F9; margin-bottom: 4px; }
        .ah-dd-name { font-size: 14px; font-weight: 700; color: #0F172A; }
        .ah-dd-user { font-size: 12px; color: #94A3B8; margin-top: 2px; }
        .ah-dd-item {
          display: flex; align-items: center; gap: 9px;
          padding: 9px 16px; background: none; border: none;
          color: #374151; font-size: 13px; font-weight: 500; cursor: pointer;
          transition: background .12s; width: 100%; text-align: left;
          font-family: inherit;
        }
        .ah-dd-item:hover { background: #F8FAFC; color: #0F172A; }
        .ah-dd-sep { height: 1px; background: #F1F5F9; margin: 4px 0; }
        .ah-dd-danger { color: #EF4444; }
        .ah-dd-danger:hover { color: #DC2626; background: #FFF5F5; }

        @media (max-width: 640px) { .ah-uname { display: none; } }
      </style>

      <div class="ah-inner">
        <div class="ah-brand">
          <div class="ah-brand-icon">T</div>
          <span class="ah-brand-name">Tickets System</span>
        </div>

        <div class="ah-right">
          <button class="ah-notif-btn" title="Notificaciones">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>

          <div class="ah-profile-wrap">
            <button class="ah-trigger" id="ah-trigger" aria-expanded="false">
              <div class="ah-avatar" id="ah-avatar"><span id="ah-avatar-letter">?</span></div>
              <span class="ah-uname" id="ah-uname">Cargando…</span>
              <span class="ah-chevron">▾</span>
            </button>
            <div class="ah-dropdown" id="ah-dropdown">
              <div class="ah-dd-info">
                <div class="ah-dd-name" id="ah-dd-name">—</div>
                <div class="ah-dd-user" id="ah-dd-user">—</div>
              </div>
              <div class="ah-dd-sep"></div>
              <button class="ah-dd-item" id="ah-dd-profile">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                Mi perfil
              </button>
              <div class="ah-dd-sep"></div>
              <button class="ah-dd-item ah-dd-danger" id="ah-dd-logout">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _setup() {
    const trigger  = this.querySelector('#ah-trigger');
    const dropdown = this.querySelector('#ah-dropdown');

    trigger.addEventListener('click', () => {
      const open = dropdown.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(open));
    });

    this.querySelector('#ah-dd-profile').addEventListener('click', () => {
      window.location.href = 'profile.html';
    });

    this.querySelector('#ah-dd-logout').addEventListener('click', () => {
      if (typeof doLogout === 'function') doLogout();
    });

    document.addEventListener('click', (e) => {
      if (!this.contains(e.target)) {
        dropdown.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setUser({ fullName, username, avatarUrl, avatarLetter } = {}) {
    const displayName = username || fullName || '?';
    const letter      = avatarLetter || (fullName ? fullName[0].toUpperCase() : '?');

    const uname   = this.querySelector('#ah-uname');
    const ddName  = this.querySelector('#ah-dd-name');
    const ddUser  = this.querySelector('#ah-dd-user');
    const avatar  = this.querySelector('#ah-avatar');
    const letterEl = this.querySelector('#ah-avatar-letter');

    if (uname)   uname.textContent  = displayName;
    if (ddName)  ddName.textContent = fullName || '—';
    if (ddUser)  ddUser.textContent = username ? `@${username}` : '—';

    if (avatarUrl && avatar) {
      avatar.innerHTML = `<img src="${avatarUrl}" alt="" onerror="this.parentElement.innerHTML='<span>${letter}</span>'">`;
    } else if (letterEl) {
      letterEl.textContent = letter;
    }
  }

}

customElements.define('app-header', AppHeader);
