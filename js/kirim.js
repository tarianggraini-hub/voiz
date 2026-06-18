// frontend/js/kirim.js
// ─────────────────────────────────────────────────────────────
//  Halaman Kirim Aspirasi
//  - Load kategori dari server (fallback lokal jika offline)
//  - Validasi form
//  - Submit ke API
// ─────────────────────────────────────────────────────────────

let selectedKatId = null;

const FALLBACK_KAT = [
  { id: 1, nama: 'Akademik', icon: '📖', warna: '#6366f1' },
  { id: 2, nama: 'Fasilitas', icon: '🏢', warna: '#f59e0b' },
  { id: 3, nama: 'Sosial', icon: '👥', warna: '#10b981' },
  { id: 4, nama: 'Keuangan', icon: '💸', warna: '#ef4444' },
  { id: 5, nama: 'Lainnya', icon: '📌', warna: '#8b5cf6' },
];

document.addEventListener('DOMContentLoaded', async () => {
  initNavbar();

  // Jika belum login → tampil login wall, bukan redirect
  if (!Auth.isLoggedIn()) {
    renderLoginWall();
    return;
  }

  await renderForm();
});

// ============================================================
//  LOGIN WALL
// ============================================================
function renderLoginWall() {
  document.getElementById('mainContent').innerHTML = `
    <div class="form-card">
      <div class="login-wall">
        <div class="licon">🔒</div>
        <h3>Login Diperlukan</h3>
        <p>Kamu harus login terlebih dahulu untuk mengirim aspirasi.</p>
        <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;">
          <a href="login.html"    class="btn btn-primary">Login</a>
          <a href="register.html" class="btn btn-outline">Daftar Dulu</a>
        </div>
      </div>
    </div>`;
}

// ============================================================
//  RENDER FORM
// ============================================================
async function renderForm() {
  document.getElementById('mainContent').innerHTML = `
    <div class="form-card" id="formCard">
      <form id="aspirasiForm" novalidate>

        <!-- Kategori -->
        <div class="form-group">
          <label class="form-label">Pilih Kategori *</label>
          <div class="kat-grid" id="katGrid">
            <p class="text-sub text-sm">Memuat…</p>
          </div>
        </div>

        <!-- Judul -->
        <div class="form-group" style="margin-top:1.2rem;">
          <label class="form-label">Judul Aspirasi *</label>
          <input id="judul" type="text" class="form-control"
                 placeholder="Ringkasan singkat aspirasi/pengaduanmu…"
                 maxlength="200" required/>
          <div class="char-count" id="judulCount">0 / 200</div>
        </div>

        <!-- Isi -->
        <div class="form-group" style="margin-top:1rem;">
          <label class="form-label">Detail Aspirasi *</label>
          <textarea id="isi" class="form-control" rows="6"
            placeholder="Jelaskan aspirasimu secara detail. Semakin jelas, semakin mudah ditindaklanjuti."
            required></textarea>
          <div class="char-count" id="isiCount">0 karakter</div>
        </div>

        <!-- Anonim -->
        <div style="margin-top:1.2rem;">
          <label class="form-label">Mode Pengiriman</label>
          <label class="anonim-row">
            <input type="checkbox" id="isAnonim"
                   style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0;"/>
            <span style="font-size:1.45rem;">🎭</span>
            <div class="anonim-info">
              <h4>Kirim Secara Anonim</h4>
              <p>Identitasmu tidak akan ditampilkan kepada siapa pun.</p>
            </div>
          </label>
        </div>

        <!-- Error -->
        <div id="formErr" class="form-err"></div>

        <!-- Actions -->
        <div style="display:flex;gap:.75rem;margin-top:1.6rem;">
          <a href="dashboard.html" class="btn btn-outline">Batal</a>
          <button type="submit" class="btn btn-primary w-full" id="submitBtn">
            🚀 Kirim Aspirasi
          </button>
        </div>

      </form>
    </div>`;

  await loadKategori();
  setupCharCounters();
  setupFormSubmit();
}

// ============================================================
//  LOAD KATEGORI
// ============================================================
async function loadKategori() {
  const grid = document.getElementById('katGrid');
  if (!grid) return;

  let data = FALLBACK_KAT;
  const res = await api.get('/kategori');
  if (res?.success && res.data?.length) data = res.data;

  grid.innerHTML = data
    .map(
      (k) => `
    <button type="button" class="kat-btn"
            onclick="selectKat(${k.id}, this)"
            data-kid="${k.id}">
      <span class="ki">${k.icon}</span>
      <span>${esc(k.nama)}</span>
    </button>
  `
    )
    .join('');
}

function selectKat(id, el) {
  document.querySelectorAll('.kat-btn').forEach((b) => b.classList.remove('sel'));
  el.classList.add('sel');
  selectedKatId = id;
  // Hapus error kategori jika ada
  const errEl = document.getElementById('formErr');
  if (errEl?.textContent.includes('kategori')) {
    errEl.style.display = 'none';
  }
}

// ============================================================
//  CHAR COUNTERS
// ============================================================
function setupCharCounters() {
  document.getElementById('judul')?.addEventListener('input', function () {
    const el = document.getElementById('judulCount');
    el.textContent = `${this.value.length} / 200`;
    el.className = `char-count${this.value.length > 180 ? ' warn' : ''}`;
  });

  document.getElementById('isi')?.addEventListener('input', function () {
    document.getElementById('isiCount').textContent = `${this.value.length} karakter`;
  });
}

// ============================================================
//  FORM SUBMIT
// ============================================================
function setupFormSubmit() {
  document.getElementById('aspirasiForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const errEl = document.getElementById('formErr');
    const btn = document.getElementById('submitBtn');
    const judul = document.getElementById('judul').value.trim();
    const isi = document.getElementById('isi').value.trim();
    const anonim = document.getElementById('isAnonim').checked;

    errEl.style.display = 'none';

    if (!selectedKatId) {
      showFormErr('⚠️ Pilih kategori terlebih dahulu.');
      document.getElementById('katGrid').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!judul) {
      showFormErr('⚠️ Judul aspirasi tidak boleh kosong.');
      return;
    }
    if (!isi) {
      showFormErr('⚠️ Detail aspirasi tidak boleh kosong.');
      return;
    }

    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Mengirim…';

    const res = await api.post('/aspirasi', {
      judul,
      isi,
      kategori_id: selectedKatId,
      is_anonim: anonim,
    });

    if (res?.success) {
      document.getElementById('formCard').innerHTML = `
        <div class="success-state">
          <div class="sicon">🎉</div>
          <h2>Aspirasi Terkirim!</h2>
          <p>Aspirasi kamu telah diterima dan akan segera ditinjau oleh tim kami.
             Pantau statusnya di dashboard.</p>
          <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;">
            <a href="dashboard.html"      class="btn btn-outline">📋 Lihat Semua</a>
            <a href="kirim-aspirasi.html" class="btn btn-primary">✍️ Kirim Lagi</a>
          </div>
        </div>`;
      toast('Aspirasi berhasil dikirim!', 'success');
    } else {
      const msg = res?.errors?.[0]?.msg || res?.message || 'Gagal mengirim. Coba lagi.';
      showFormErr(`❌ ${msg}`);
      btn.disabled = false;
      btn.innerHTML = '🚀 Kirim Aspirasi';
    }
  });
}

function showFormErr(msg) {
  const el = document.getElementById('formErr');
  el.textContent = msg;
  el.style.display = 'block';
}
