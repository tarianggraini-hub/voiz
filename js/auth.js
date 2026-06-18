// frontend/js/auth.js
// ─────────────────────────────────────────────────────────────
//  Logika halaman Login & Register
//  Di-load di login.html dan register.html
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();

  const path = window.location.pathname;

  // ── Halaman Login ──────────────────────────────────────
  if (path.includes('login.html') || path.endsWith('/login')) {
    // Jika sudah login langsung redirect
    if (Auth.isLoggedIn()) {
      const user = Auth.getUser();
      Auth.redirectAfterLogin(user?.role);
      return;
    }
    setupLogin();
  }

  // ── Halaman Register ───────────────────────────────────
  if (path.includes('register.html') || path.endsWith('/register')) {
    if (Auth.isLoggedIn()) {
      window.location.href = 'dashboard.html';
      return;
    }
    setupRegister();
  }
});

// ============================================================
//  LOGIN
// ============================================================
function setupLogin() {
  const form = document.getElementById('loginForm');
  const errBox = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!form) return;

  // Toggle show/hide password
  window.togglePwd = (id) => {
    const inp = document.getElementById(id);
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Memproses…';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const res = await api.post('/auth/login', { email, password });

    if (res?.success) {
      Auth.save(res.token, res.user);
      toast('Login berhasil! Mengalihkan…', 'success');
      setTimeout(() => Auth.redirectAfterLogin(res.user.role), 700);
    } else {
      errBox.textContent = res?.message || 'Login gagal. Periksa email dan password.';
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Masuk';
    }
  });
}

// ============================================================
//  REGISTER
// ============================================================
function setupRegister() {
  const form = document.getElementById('registerForm');
  const errBox = document.getElementById('registerError');
  const btn = document.getElementById('registerBtn');

  if (!form) return;

  window.togglePwd = (id) => {
    const inp = document.getElementById(id);
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';

    const nama = document.getElementById('nama').value.trim();
    const email = document.getElementById('email').value.trim();
    const nim = document.getElementById('nim')?.value.trim();
    const prodi = document.getElementById('prodi')?.value.trim();
    const password = document.getElementById('password').value;
    const konfirmasi = document.getElementById('konfirmasi').value;

    // Validasi konfirmasi password
    if (password !== konfirmasi) {
      errBox.textContent = 'Password dan konfirmasi tidak cocok.';
      errBox.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Membuat akun…';

    const res = await api.post('/auth/register', {
      nama,
      email,
      password,
      nim: nim || undefined,
      prodi: prodi || undefined,
    });

    if (res?.success) {
      Auth.save(res.token, res.user);
      toast('Akun berhasil dibuat!', 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);
    } else {
      const msg = res?.errors?.[0]?.msg || res?.message || 'Registrasi gagal.';
      errBox.textContent = msg;
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Buat Akun';
    }
  });
}
