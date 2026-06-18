// frontend/js/admin.js
// ─────────────────────────────────────────────────────────────
//  Admin Dashboard
//  - Overview: statistik + chart (Chart.js)
//  - Kelola aspirasi: tabel + update status
//  - Notifikasi admin
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Guard: harus login sebagai admin/pimpinan
  if (!Auth.requireAuth('login.html')) return;
  if (!Auth.requireRole(['admin', 'pimpinan'], 'dashboard.html')) return;

  const user = Auth.getUser();
  const nameEl = document.getElementById('adminName');
  if (nameEl) nameEl.textContent = user?.nama || '';

  // Navbar
  const navRight = document.getElementById('navRight');
  if (navRight) {
    navRight.innerHTML = `
      <div class="nav-user">
        <div class="nav-avatar">${Auth.initials(user?.nama)}</div>
        <span class="nav-name">${esc(user?.nama?.split(' ')[0] || 'Admin')}</span>
      </div>
      <a href="dashboard.html" class="btn btn-outline btn-sm">👁 User View</a>
      <button class="btn btn-outline btn-sm" onclick="doLogout()">Keluar</button>
    `;
  }

  // Load overview saat pertama kali
  loadOverview();
});

// ============================================================
//  VIEW SWITCHER
// ============================================================
function showView(name, btnEl) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach((b) => b.classList.remove('active'));

  document.getElementById(`view-${name}`)?.classList.add('active');
  if (btnEl) btnEl.classList.add('active');

  if (name === 'aspirasi') loadAdminAspirasi();
  if (name === 'notifikasi') loadAdminNotif();
}

function filterView(status) {
  document.getElementById('adminStatusFilter').value = status;
  showView('aspirasi', null);
  document.querySelectorAll('.sb-item').forEach((b) => b.classList.remove('active'));
}

// ============================================================
//  OVERVIEW — Statistik & Chart
// ============================================================
async function loadOverview() {
  const res = await api.get('/admin/stats');
  if (!res?.success) {
    toast('Gagal memuat statistik.', 'error');
    return;
  }

  const d = res.data;
  const sm = d.statusStats.reduce((acc, r) => {
    acc[r.status] = r.total;
    return acc;
  }, {});

  // Stat cards
  const cards = [
    { icon: '📥', num: d.total, label: 'Total Aspirasi', color: 'var(--accent)' },
    { icon: '⏳', num: sm.menunggu || 0, label: 'Menunggu', color: 'var(--s-menunggu)' },
    { icon: '⚙️', num: sm.diproses || 0, label: 'Diproses', color: 'var(--s-diproses)' },
    { icon: '✅', num: sm.selesai || 0, label: 'Selesai', color: 'var(--s-selesai)' },
    { icon: '👥', num: d.totalUser, label: 'Mahasiswa', color: 'var(--blue)' },
  ];
  document.getElementById('statsGrid').innerHTML = cards
    .map(
      (c) => `
    <div class="stat-card">
      <div class="stat-icon">${c.icon}</div>
      <div class="stat-num" style="color:${c.color};">${c.num}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `
    )
    .join('');

  // Chart tren
  const trendCtx = document.getElementById('trendChart');
  if (trendCtx) {
    new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: d.tren.map((t) => {
          const [y, m] = t.bulan.split('-');
          return new Date(y, m - 1).toLocaleDateString('id-ID', {
            month: 'short',
            year: '2-digit',
          });
        }),
        datasets: [
          {
            label: 'Aspirasi',
            data: d.tren.map((t) => t.total),
            borderColor: '#f0a500',
            backgroundColor: 'rgba(240,165,0,.10)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#f0a500',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#1f2330' }, ticks: { color: '#7c85a0' } },
          y: { grid: { color: '#1f2330' }, ticks: { color: '#7c85a0', stepSize: 1 } },
        },
      },
    });
  }

  // Chart kategori donut
  const katCtx = document.getElementById('katChart');
  if (katCtx) {
    new Chart(katCtx, {
      type: 'doughnut',
      data: {
        labels: d.kategoriStats.map((k) => k.nama),
        datasets: [
          {
            data: d.kategoriStats.map((k) => k.total),
            backgroundColor: d.kategoriStats.map((k) => k.warna + 'cc'),
            borderColor: d.kategoriStats.map((k) => k.warna),
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#7c85a0', padding: 14, font: { size: 12 } },
          },
        },
      },
    });
  }

  // Top vote
  const tvEl = document.getElementById('topVoteList');
  if (tvEl) {
    tvEl.innerHTML = d.topVote.length
      ? d.topVote
          .map(
            (a, i) => `
          <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 0;border-bottom:1px solid var(--border);">
            <span style="font-family:var(--font-heading);font-size:1.1rem;font-weight:800;color:var(--text-dim);min-width:26px;">
              ${['🥇', '🥈', '🥉'][i] || '#' + (i + 1)}
            </span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:.88rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.judul)}</div>
              <div style="font-size:.74rem;color:var(--text-sub);">${esc(a.kategori)}</div>
            </div>
            <span style="color:var(--accent);font-weight:700;font-size:.88rem;">▲ ${a.vote_count}</span>
          </div>
        `
          )
          .join('')
      : '<p class="text-sub text-sm" style="padding:.75rem 0;">Belum ada aspirasi.</p>';
  }
}

// ============================================================
//  KELOLA ASPIRASI — Tabel
// ============================================================
let adminPage = 1;

async function loadAdminAspirasi(page) {
  if (page) adminPage = page;

  const tbody = document.getElementById('adminTbody');
  const status = document.getElementById('adminStatusFilter')?.value || '';

  tbody.innerHTML = `
    <tr><td colspan="6" class="text-center text-sub" style="padding:2rem;">
      <div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;"></div>
    </td></tr>`;

  const res = await api.get(
    `/admin/aspirasi?page=${adminPage}&limit=15${status ? '&status=' + status : ''}`
  );
  if (!res?.success) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-sub" style="padding:2rem;">Gagal memuat data.</td></tr>`;
    return;
  }

  if (!res.data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-sub" style="padding:2rem;">Tidak ada aspirasi.</td></tr>`;
    return;
  }

  tbody.innerHTML = res.data
    .map(
      (a) => `
    <tr>
      <td style="max-width:250px;">
        <div style="font-weight:500;font-size:.88rem;">${esc(truncate(a.judul, 60))}</div>
        <div style="font-size:.73rem;color:var(--text-dim);margin-top:.18rem;">${formatDate(a.created_at)}</div>
      </td>
      <td><span style="font-size:.8rem;color:${a.kategori_warna};">● ${esc(a.kategori_nama)}</span></td>
      <td style="font-size:.84rem;">${esc(a.pengirim)}</td>
      <td style="color:var(--accent);font-weight:700;">▲ ${a.vote_count}</td>
      <td>${statusBadge(a.status)}</td>
      <td>
        <button class="btn btn-outline btn-sm"
                onclick="openStatusModal(${a.id}, '${esc(a.judul)}', '${a.status}')">
          Update
        </button>
      </td>
    </tr>
  `
    )
    .join('');

  // Pagination
  const { page: pg, totalPages } = res.pagination;
  const pgEl = document.getElementById('adminPagination');
  if (pgEl) {
    if (totalPages <= 1) {
      pgEl.innerHTML = '';
      return;
    }
    let html = `<button class="pg-btn" onclick="loadAdminAspirasi(${pg - 1})" ${pg <= 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="pg-btn ${i === pg ? 'active' : ''}" onclick="loadAdminAspirasi(${i})">${i}</button>`;
    }
    html += `<button class="pg-btn" onclick="loadAdminAspirasi(${pg + 1})" ${pg >= totalPages ? 'disabled' : ''}>›</button>`;
    pgEl.innerHTML = html;
  }
}

// ============================================================
//  MODAL UPDATE STATUS
// ============================================================
function openStatusModal(id, judul, currentStatus) {
  const modal = document.getElementById('statusModal');
  const content = document.getElementById('statusModalContent');
  modal.style.display = 'flex';

  content.innerHTML = `
    <p style="color:var(--text-sub);font-size:.86rem;margin-bottom:1.15rem;">
      ID #${id} — <strong>${esc(judul)}</strong>
    </p>

    <div class="form-group">
      <label class="form-label">Status Baru</label>
      <select id="newStatus" class="form-control">
        ${['diterima', 'diproses', 'selesai', 'ditolak']
          .map(
            (s) =>
              `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
          )
          .join('')}
      </select>
    </div>

    <div class="form-group" style="margin-top:1rem;">
      <label class="form-label">Catatan (opsional)</label>
      <textarea id="statusNote" class="form-control" rows="3"
                placeholder="Catatan atau alasan perubahan status…"></textarea>
    </div>

    <div class="form-group" style="margin-top:1rem;">
      <label class="form-label">Prioritas</label>
      <select id="newPrioritas" class="form-control">
        <option value="">— Tidak diubah —</option>
        <option value="rendah">Rendah</option>
        <option value="sedang">Sedang</option>
        <option value="tinggi">Tinggi</option>
      </select>
    </div>

    <div style="display:flex;gap:.75rem;margin-top:1.5rem;">
      <button class="btn btn-outline"
              onclick="document.getElementById('statusModal').style.display='none'">
        Batal
      </button>
      <button class="btn btn-primary w-full" id="saveStatusBtn"
              onclick="submitStatus(${id})">
        Simpan
      </button>
    </div>
  `;
}

async function submitStatus(id) {
  const btn = document.getElementById('saveStatusBtn');
  const status = document.getElementById('newStatus').value;
  const catatan = document.getElementById('statusNote').value.trim();
  const prioritas = document.getElementById('newPrioritas').value;

  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Menyimpan…';

  const body = { status };
  if (catatan) body.catatan = catatan;
  if (prioritas) body.prioritas = prioritas;

  const res = await api.patch(`/admin/aspirasi/${id}/status`, body);

  if (res?.success) {
    toast('Status berhasil diperbarui!', 'success');
    document.getElementById('statusModal').style.display = 'none';
    loadAdminAspirasi();
  } else {
    toast(res?.message || 'Gagal update status.', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Simpan';
  }
}

// ============================================================
//  NOTIFIKASI ADMIN
// ============================================================
async function loadAdminNotif() {
  const el = document.getElementById('adminNotifList');
  const res = await api.get('/admin/notifikasi');

  if (!res?.success || !res.data.length) {
    el.innerHTML = `<div class="empty" style="padding:2rem;"><p>Tidak ada notifikasi.</p></div>`;
    return;
  }

  el.innerHTML = res.data
    .map(
      (n) => `
    <div class="card ${n.is_read ? '' : 'card-raised'}"
         style="cursor:pointer;margin-bottom:.6rem;"
         onclick="markAdminRead(${n.id}, this)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">
        <div>
          <div style="font-weight:600;font-size:.88rem;${n.is_read ? 'color:var(--text-sub)' : ''}">${esc(n.judul)}</div>
          <div style="font-size:.82rem;color:var(--text-sub);margin-top:.28rem;">${esc(n.pesan)}</div>
          <div style="font-size:.72rem;color:var(--text-dim);margin-top:.35rem;">${formatDate(n.created_at)}</div>
        </div>
        ${
          !n.is_read
            ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:.35rem;"></span>'
            : ''
        }
      </div>
    </div>
  `
    )
    .join('');
}

async function markAdminRead(id, el) {
  await api.patch(`/admin/notifikasi/${id}/read`, {});
  el?.querySelectorAll('[style*="background:var(--accent)"]').forEach((d) => d.remove());
  el?.querySelector('[style*="font-weight:600"]')?.removeAttribute('style');
  el?.classList.remove('card-raised');
}
