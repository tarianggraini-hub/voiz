// frontend/js/dashboard.js
// ─────────────────────────────────────────────────────────────
//  Dashboard Mahasiswa
//  - List aspirasi + filter + search + pagination
//  - Modal detail + riwayat status
//  - Notifikasi dropdown
//  - Panel aspirasi milik sendiri
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initNavbar();

  // Greeting nama user di navbar
  if (Auth.isLoggedIn()) {
    const user = Auth.getUser();
    const greet = document.getElementById('userGreet');
    if (greet) greet.textContent = `Hi, ${user?.nama?.split(' ')[0]}`;
    loadNotifikasi();
  }

  // Load kategori ke filter select
  await loadKategoriFilter();

  // Load aspirasi pertama kali
  loadAspirasi(1);

  // ── Event filter ────────────────────────────────────────
  let searchTimer;
  document.getElementById('searchInput')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadAspirasi(1), 450);
  });
  document.getElementById('filterKat')?.addEventListener('change', () => loadAspirasi(1));
  document.getElementById('filterStatus')?.addEventListener('change', () => loadAspirasi(1));

  // ── Aspirasi saya link ───────────────────────────────────
  document.getElementById('linkSaya')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!Auth.isLoggedIn()) {
      window.location.href = 'login.html';
      return;
    }
    openSidePanel();
  });

  // ── Notif button ─────────────────────────────────────────
  document.getElementById('notifBtn')?.addEventListener('click', toggleNotifDD);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notifBtn') && !e.target.closest('#notifDD')) {
      document.getElementById('notifDD')?.remove();
    }
  });
});

// ============================================================
//  LOAD KATEGORI FILTER
// ============================================================
async function loadKategoriFilter() {
  const sel = document.getElementById('filterKat');
  if (!sel) return;

  const res = await api.get('/kategori');
  if (!res?.success) return;

  res.data.forEach((k) => {
    const opt = document.createElement('option');
    opt.value = k.id;
    opt.textContent = k.nama;
    sel.appendChild(opt);
  });
}

// ============================================================
//  LOAD & RENDER ASPIRASI
// ============================================================
async function loadAspirasi(page = 1) {
  const listEl = document.getElementById('aspirasiList');
  listEl.innerHTML = `
    <div class="flex-center" style="padding:3.5rem;flex-direction:column;gap:.85rem;">
      <div class="spinner" style="width:28px;height:28px;border-width:3px;"></div>
      <p class="text-sub text-sm">Memuat aspirasi…</p>
    </div>`;

  const q = document.getElementById('searchInput')?.value.trim() || '';
  const kat = document.getElementById('filterKat')?.value || '';
  const status = document.getElementById('filterStatus')?.value || '';

  let url = `/aspirasi?page=${page}&limit=10`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (kat) url += `&kategori_id=${kat}`;
  if (status) url += `&status=${status}`;

  const res = await api.get(url);

  if (!res?.success) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><h3>Gagal memuat</h3><p>${esc(res?.message || 'Coba lagi.')}</p></div>`;
    return;
  }

  if (!res.data.length) {
    listEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📭</div>
        <h3>Belum ada aspirasi</h3>
        <p>Jadilah yang pertama menyuarakan aspirasimu!</p>
        <a href="kirim-aspirasi.html" class="btn btn-primary" style="margin-top:1rem;">✍️ Kirim Aspirasi</a>
      </div>`;
    return;
  }

  // Fetch status vote semua aspirasi yang tampil (paralel)
  if (Auth.isLoggedIn()) {
    await fetchVoteStatusBatch(res.data.map((a) => a.id));
  }

  renderAspirasi(res.data);
  renderPagination(res.pagination, loadAspirasi);
}

function renderAspirasi(data) {
  const listEl = document.getElementById('aspirasiList');
  listEl.innerHTML = data
    .map(
      (a, i) => `
    <div class="asp-card fade-up" style="animation-delay:${i * 0.045}s"
         onclick="openModal(${a.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">
        <div style="flex:1;">
          <div class="asp-title">${esc(a.judul)}</div>
          <div class="asp-meta" style="margin-top:.3rem;">
            ${kategoriChip(a.kategori_nama, a.kategori_warna, a.kategori_icon)}
            ${statusBadge(a.status)}
            <span>👤 ${esc(a.pengirim)}</span>
            <span>🕐 ${formatDate(a.created_at)}</span>
          </div>
        </div>
      </div>
      <div class="asp-body">${esc(truncate(a.isi, 180))}</div>
      <div class="asp-footer" onclick="event.stopPropagation()">
        ${createVoteBtn(a.id, a.vote_count, VoteState.get(a.id))}
        <span class="text-sm text-sub">Klik untuk detail →</span>
      </div>
    </div>
  `
    )
    .join('');
}

// ============================================================
//  PAGINATION
// ============================================================
function renderPagination({ page, totalPages }, onPageChange) {
  const pg = document.getElementById('pagination');
  if (!pg) return;
  if (totalPages <= 1) {
    pg.innerHTML = '';
    return;
  }

  let html = `<button class="pg-btn" onclick="loadAspirasi(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="pg-btn ${i === page ? 'active' : ''}" onclick="loadAspirasi(${i})">${i}</button>`;
  }
  html += `<button class="pg-btn" onclick="loadAspirasi(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>›</button>`;
  pg.innerHTML = html;
}

// ============================================================
//  MODAL DETAIL
// ============================================================
async function openModal(id) {
  const overlay = document.getElementById('modalBg');
  const content = document.getElementById('modalContent');
  overlay.style.display = 'flex';
  content.innerHTML = `
    <div class="flex-center" style="padding:3rem;">
      <div class="spinner" style="width:26px;height:26px;border-width:2px;"></div>
    </div>`;

  const res = await api.get(`/aspirasi/${id}`);
  if (!res?.success) {
    content.innerHTML = `<p class="text-sub">Gagal memuat detail.</p>`;
    return;
  }

  const a = res.data;
  const riwayat = (a.riwayat || [])
    .map(
      (r, i, arr) => `
    <div class="tl-item ${i === arr.length - 1 ? 'latest' : ''}">
      <div class="tl-date">${formatDate(r.created_at)}</div>
      <div class="tl-label">
        ${r.status_lama ? `${esc(r.status_lama)} → ` : ''}${esc(r.status_baru)}
        <span class="text-sub text-sm"> · ${esc(r.oleh)}</span>
      </div>
      ${r.catatan ? `<div class="tl-note">${esc(r.catatan)}</div>` : ''}
    </div>
  `
    )
    .join('');

  content.innerHTML = `
    <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-bottom:.85rem;">
      ${kategoriChip(a.kategori_nama, a.kategori_warna, a.kategori_icon)}
      ${statusBadge(a.status)}
      <span class="badge" style="background:var(--bg-raised);color:var(--text-sub);">
        ${a.prioritas}
      </span>
    </div>
    <h2 style="font-size:1.25rem;margin-bottom:.55rem;">${esc(a.judul)}</h2>
    <div class="asp-meta" style="margin-bottom:1.1rem;">
      <span>👤 ${esc(a.pengirim)}</span>
      <span>🕐 ${formatDate(a.created_at)}</span>
      <span style="color:var(--accent);font-weight:600;">▲ ${formatVote(a.vote_count)} vote</span>
    </div>
    <p style="color:var(--text-sub);line-height:1.8;white-space:pre-wrap;">${esc(a.isi)}</p>
    ${
      riwayat
        ? `
      <div style="margin-top:1.5rem;">
        <h4 style="margin-bottom:.75rem;font-size:.95rem;">📋 Riwayat Status</h4>
        <div class="timeline">${riwayat}</div>
      </div>`
        : ''
    }
    <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border);">
      ${createVoteBtn(a.id, a.vote_count, VoteState.get(a.id))}
    </div>
  `;
}

function closeModal() {
  document.getElementById('modalBg').style.display = 'none';
}

// ============================================================
//  NOTIFIKASI
// ============================================================
async function loadNotifikasi() {
  const res = await api.get('/admin/notifikasi');
  if (!res?.success) return;

  const dot = document.getElementById('notifDot');
  if (dot) {
    dot.style.display = res.unread > 0 ? 'flex' : 'none';
    dot.textContent = res.unread;
  }
  window._notifData = res.data;
}

function toggleNotifDD() {
  const existing = document.getElementById('notifDD');
  if (existing) {
    existing.remove();
    return;
  }

  const data = window._notifData || [];
  const dd = document.createElement('div');
  dd.id = 'notifDD';
  dd.className = 'notif-dd';
  dd.innerHTML = `
    <div class="notif-head">🔔 Notifikasi</div>
    ${
      data.length
        ? data
            .slice(0, 8)
            .map(
              (n) => `
          <div class="notif-item ${n.is_read ? '' : 'unread'}"
               onclick="markRead(${n.id}, this)">
            <div class="notif-item-title">${esc(n.judul)}</div>
            <div class="notif-item-msg">${esc(n.pesan)}</div>
            <div class="notif-item-time">${formatDate(n.created_at)}</div>
          </div>`
            )
            .join('')
        : '<div style="padding:1.5rem;text-align:center;color:var(--text-sub);font-size:.85rem;">Tidak ada notifikasi</div>'
    }
  `;
  document.body.appendChild(dd);
}

async function markRead(id, el) {
  await api.patch(`/admin/notifikasi/${id}/read`, {});
  el?.classList.remove('unread');
  loadNotifikasi();
}

// ============================================================
//  SIDE PANEL — Aspirasi Saya
// ============================================================
async function openSidePanel() {
  const panel = document.getElementById('sidePanel');
  panel.style.display = 'block';

  const listEl = document.getElementById('myList');
  listEl.innerHTML = `
    <div class="flex-center" style="padding:2rem;">
      <div class="spinner" style="width:22px;height:22px;border-width:2px;"></div>
    </div>`;

  const res = await api.get('/aspirasi/saya');
  if (!res?.success || !res.data.length) {
    listEl.innerHTML = `
      <div class="empty" style="padding:2rem;">
        <div class="empty-icon">📋</div>
        <p>Belum ada aspirasi yang kamu kirim.</p>
        <a href="kirim-aspirasi.html" class="btn btn-primary btn-sm" style="margin-top:1rem;">
          Kirim Sekarang
        </a>
      </div>`;
    return;
  }

  listEl.innerHTML = res.data
    .map(
      (a) => `
    <div class="my-item" onclick="closeSidePanel(); openModal(${a.id})">
      <div class="my-item-title">${esc(truncate(a.judul, 60))}</div>
      <div style="display:flex;gap:.45rem;align-items:center;flex-wrap:wrap;">
        ${kategoriChip(a.kategori_nama, a.kategori_warna, a.kategori_icon)}
        ${statusBadge(a.status)}
      </div>
      <div class="text-sm text-sub" style="margin-top:.3rem;">
        ▲ ${a.vote_count} · ${formatDate(a.created_at)}
      </div>
    </div>
  `
    )
    .join('');
}

function closeSidePanel() {
  document.getElementById('sidePanel').style.display = 'none';
}
