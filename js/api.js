// frontend/js/api.js
// ─────────────────────────────────────────────────────────────
//  Central API wrapper — semua request ke backend Voiz
//  Berisi:
//   - Auth helper (token, user, login, logout)
//   - Fetch wrapper (get, post, patch, delete)
//   - Toast notification
//   - Format helpers (tanggal, angka, truncate, escapeHtml)
// ─────────────────────────────────────────────────────────────

const API_BASE = 'http://voiz-production.up.railway.app/api';

// ============================================================
//  AUTH HELPER
// ============================================================
const Auth = {
  getToken: () => localStorage.getItem('voiz_token'),
  getUser: () => JSON.parse(localStorage.getItem('voiz_user') || 'null'),
  isLoggedIn: () => !!localStorage.getItem('voiz_token'),

  save(token, user) {
    localStorage.setItem('voiz_token', token);
    localStorage.setItem('voiz_user', JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem('voiz_token');
    localStorage.removeItem('voiz_user');
  },

  // Redirect ke login jika belum login
  requireAuth(redirect = 'login.html') {
    if (!this.isLoggedIn()) {
      sessionStorage.setItem('voiz_redirect', window.location.href);
      window.location.href = redirect;
      return false;
    }
    return true;
  },

  // Redirect jika role tidak sesuai
  requireRole(role, redirect = 'dashboard.html') {
    const user = this.getUser();
    const allowed = Array.isArray(role) ? role : [role];
    if (!user || !allowed.includes(user.role)) {
      window.location.href = redirect;
      return false;
    }
    return true;
  },

  // Redirect ke halaman setelah login berhasil
  redirectAfterLogin(role) {
    const saved = sessionStorage.getItem('voiz_redirect');
    sessionStorage.removeItem('voiz_redirect');
    if (saved && !saved.includes('login.html') && !saved.includes('register.html')) {
      window.location.href = saved;
    } else {
      window.location.href =
        role === 'admin' || role === 'pimpinan' ? 'admin.html' : 'dashboard.html';
    }
  },

  // Inisial nama untuk avatar: "Budi Santoso" → "BS"
  initials(nama) {
    if (!nama) return '?';
    return nama
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');
  },
};

// ============================================================
//  FETCH WRAPPER
// ============================================================
async function request(method, endpoint, data = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config = { method, headers };
  if (data) config.body = JSON.stringify(data);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, config);
    const json = await res.json().catch(() => ({
      success: false,
      message: 'Respons server tidak valid.',
    }));

    // Auto logout jika token expired / invalid
    if (res.status === 401) {
      Auth.clear();
      window.location.href = 'login.html';
      return null;
    }

    return { ok: res.ok, status: res.status, ...json };
  } catch (_) {
    return {
      ok: false,
      success: false,
      message: 'Tidak dapat terhubung ke server. Pastikan backend sudah berjalan.',
    };
  }
}

const api = {
  get: (url) => request('GET', url),
  post: (url, data) => request('POST', url, data),
  patch: (url, data) => request('PATCH', url, data),
  put: (url, data) => request('PUT', url, data),
  delete: (url) => request('DELETE', url),
};

// ============================================================
//  TOAST NOTIFICATION
// ============================================================
function toast(message, type = 'info') {
  // Buat container jika belum ada
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    document.body.appendChild(wrap);
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span>${icons[type] || 'ℹ️'}</span>
    <span style="flex:1;">${message}</span>
    <button onclick="this.parentElement.remove()"
      style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.9rem;padding:0 0 0 .5rem;">✕</button>
  `;
  wrap.appendChild(el);

  // Auto remove setelah 3.5 detik
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(16px)';
    el.style.transition = 'all .3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ============================================================
//  FORMAT HELPERS
// ============================================================

// Format tanggal: "10 Jun 2025, 14:30"
function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format angka vote: 1200 → "1.2k"
function formatVote(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n || 0);
}

// Potong teks panjang
function truncate(str, n = 120) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// Escape HTML untuk mencegah XSS
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Badge status HTML
function statusBadge(status) {
  return `<span class="badge badge-${status}">${esc(status)}</span>`;
}

// Chip kategori HTML
function kategoriChip(nama, warna, icon = '') {
  return `<span class="chip" style="color:${warna};border-color:${warna};">${icon ? icon + ' ' : ''}${esc(nama)}</span>`;
}

// ============================================================
//  NAVBAR HELPER — render isi navbar sesuai status login
// ============================================================
function initNavbar() {
  const navRight = document.getElementById('navRight');
  if (!navRight) return;

  if (Auth.isLoggedIn()) {
    const user = Auth.getUser();
    const isAdmin = user?.role === 'admin' || user?.role === 'pimpinan';

    navRight.innerHTML = `
      <div class="nav-user">
        <div class="nav-avatar">${Auth.initials(user?.nama)}</div>
        <span class="nav-name">${esc(user?.nama?.split(' ')[0] || 'User')}</span>
      </div>
      <a href="${isAdmin ? 'admin.html' : 'dashboard.html'}" class="btn btn-outline btn-sm">
        ${isAdmin ? '⚙️ Admin' : '📋 Dashboard'}
      </a>
      <button class="btn btn-outline btn-sm" onclick="doLogout()">Keluar</button>
    `;
  } else {
    navRight.innerHTML = `
      <a href="login.html"    class="btn btn-outline btn-sm">Masuk</a>
      <a href="register.html" class="btn btn-primary btn-sm">Daftar</a>
    `;
  }
}

function doLogout() {
  if (!confirm('Yakin ingin keluar dari Voiz?')) return;
  Auth.clear();
  toast('Sampai jumpa! 👋', 'info');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 800);
}
