class AppSidebar extends HTMLElement {
  connectedCallback() {
    this.classList.add('hidden');
    this._render();
    this._setup();
  }

  _render() {
    const page = this.getAttribute('page') || '';

    const NAV = [
      {
        key: 'modules', label: 'Módulos',
        icon: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5h5v5"/>',
      },
      {
        key: 'users', label: 'Usuarios',
        icon: '<path d="M7 7.5h10"/><path d="M7 12h10"/><path d="M7 16.5h6"/><path d="M5 3.5h12l2 2V20.5H5z"/><path d="M17 3.5v3h3"/>',
      },
      {
        key: 'roles', label: 'Roles Globales',
        icon: '<path d="M4 7.5h11.5l4.5 4.5-4.5 4.5H4z"/><path d="M8 12h.01"/>',
      },
      {
        key: 'requests', label: 'Solicitudes',
        icon: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6"/><path d="M9 14h4"/>',
      },
      {
        key: 'trash', label: 'Papelera',
        icon: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
      },
    ];

    const navHTML = NAV.map(({ key, label, icon }) => `
      <button type="button" class="as-nav-item" data-view="${key}" title="${label}" aria-label="${label}">
        <svg class="as-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${icon}</svg>
        <span class="as-nav-label">${label}</span>
      </button>
    `).join('');

    const profileActive = page === 'profile' ? 'as-nav-item--active' : '';

    this.innerHTML = `
      <style>
        app-sidebar {
          display: flex; flex-direction: column; align-items: center;
          width: 76px;
          background: #fff; border-right: 1px solid #edf2f6;
          overflow: hidden; flex-shrink: 0;
          transition: width .22s ease, box-shadow .22s ease;
          box-shadow: 18px 0 38px rgba(15,23,42,.06);
          height: 100vh; position: sticky; top: 0; z-index: 120;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        app-sidebar.hidden { display: none !important; }
        app-sidebar.expanded { width: 220px; align-items: stretch; }

        .as-brand {
          height: 92px; display: flex; align-items: center; justify-content: center;
          width: 100%; flex-shrink: 0;
        }
        app-sidebar.expanded .as-brand { justify-content: flex-start; padding-left: 25px; }

        .as-brand-mark { position: relative; width: 38px; height: 30px; }
        .as-brand-mark::before,
        .as-brand-mark::after {
          content: ''; position: absolute; top: 8px; width: 8px; height: 28px;
          border-radius: 999px; background: #17384a; transform: rotate(-28deg);
          box-shadow: 0 1px 3px rgba(23,56,74,.18);
        }
        .as-brand-mark::before { left: 5px; }
        .as-brand-mark::after  { left: 18px; }
        .as-brand-dot {
          position: absolute; top: 1px; right: 2px; width: 8px; height: 8px;
          border-radius: 50%; background: #ff6347;
          box-shadow: 0 0 0 3px rgba(255,99,71,.12);
        }

        .as-nav {
          display: flex; flex-direction: column; align-items: center;
          gap: 18px; width: 100%; padding: 56px 0 12px;
        }
        app-sidebar.expanded .as-nav { align-items: stretch; padding: 34px 14px 12px; gap: 8px; }

        .as-nav-item {
          width: 42px; min-width: 42px; height: 42px; border: 0;
          display: flex; align-items: center; justify-content: center; gap: 12px;
          padding: 0; cursor: pointer; background: transparent;
          font-size: 13px; font-weight: 650; color: #17384a;
          transition: background .16s, color .16s, box-shadow .16s, transform .16s;
          white-space: nowrap; border-radius: 12px; font-family: inherit;
        }
        .as-nav-item:hover { background: #f2f6f8; transform: translateY(-1px); }
        .as-nav-item--active,
        .as-nav-item.as-nav-item--active {
          background: #0e3546; color: #fff;
          box-shadow: 0 14px 28px rgba(14,53,70,.24);
        }
        .as-nav-item--active:hover { transform: none; }
        app-sidebar.expanded .as-nav-item { width: 100%; justify-content: flex-start; padding: 0 13px; }

        .as-nav-icon { width: 18px; height: 18px; flex-shrink: 0; stroke-width: 2.25; }
        .as-nav-label { display: none; overflow: hidden; color: inherit; opacity: 0; transition: opacity .14s ease; }
        app-sidebar.expanded .as-nav-label { display: inline; opacity: 1; }

        .as-bottom {
          margin-top: auto; width: 100%; padding: 12px 0 18px;
          display: flex; flex-direction: column; align-items: center; gap: 40px;
        }
        app-sidebar.expanded .as-bottom { padding: 12px 14px 18px; align-items: stretch; gap: 18px; }

        .as-toggle-btn {
          width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center;
          background: transparent; border: none; color: #17384a;
          cursor: pointer; border-radius: 12px;
          transition: background .16s, color .16s, transform .16s;
        }
        .as-toggle-btn:hover { background: #f2f6f8; transform: translateX(1px); }
        .as-toggle-btn svg { width: 20px; height: 20px; stroke-width: 2.2; transition: transform .2s; }
        app-sidebar.expanded .as-toggle-btn svg { transform: rotate(180deg); }

        @media (max-width: 720px) {
          app-sidebar { width: 64px; }
          app-sidebar.expanded { width: 188px; }
          .as-brand { height: 78px; }
          .as-nav { padding-top: 34px; gap: 14px; }
        }
      </style>

      <div class="as-brand" aria-label="Tickets System">
        <div class="as-brand-mark" aria-hidden="true">
          <span class="as-brand-dot"></span>
        </div>
      </div>

      <nav class="as-nav" aria-label="Panel global">
        ${navHTML}
      </nav>

      <div class="as-bottom">
        <button type="button" class="as-nav-item ${profileActive}" id="as-profile-btn" title="Mi perfil" aria-label="Mi perfil">
          <svg class="as-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M16 19a4 4 0 0 0-8 0"/><circle cx="12" cy="9" r="3"/>
            <path d="M19 8.5h.01"/><path d="M19.5 15.5h.01"/>
          </svg>
          <span class="as-nav-label">Mi perfil</span>
        </button>
        <button type="button" class="as-toggle-btn" id="as-toggle-btn" title="Expandir menú" aria-label="Expandir menú">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="m9 6 6 6-6 6"/>
          </svg>
        </button>
      </div>
    `;
  }

  _setup() {
    // Nav item clicks
    this.querySelectorAll('.as-nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        if (typeof showView === 'function') {
          showView(view);
        } else {
          window.location.href = 'modules-test.html';
        }
      });
    });

    // Mi perfil button
    this.querySelector('#as-profile-btn').addEventListener('click', () => {
      if (window.location.pathname.includes('profile.html')) return;
      window.location.href = 'profile.html';
    });

    // Toggle expand/collapse
    this.querySelector('#as-toggle-btn').addEventListener('click', () => {
      const expanded = this.classList.toggle('expanded');
      document.body.classList.toggle('sidebar-expanded', expanded);
      const btn = this.querySelector('#as-toggle-btn');
      btn.setAttribute('title', expanded ? 'Contraer menú' : 'Expandir menú');
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  show() {
    this.classList.remove('hidden');
  }

  hide() {
    this.classList.add('hidden');
    this.classList.remove('expanded');
    document.body.classList.remove('sidebar-expanded');
  }
}

customElements.define('app-sidebar', AppSidebar);
