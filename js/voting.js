// frontend/js/voting.js
// ─────────────────────────────────────────────────────────────
//  Voting System — toggle vote, cache state, animasi, render
// ─────────────────────────────────────────────────────────────

// ============================================================
//  1. STATE CACHE
// ============================================================
const VoteState = (() => {
  const _map = new Map(); // id → boolean
  return {
    set: (id, v) => _map.set(Number(id), Boolean(v)),
    get: (id) => _map.get(Number(id)) ?? false,
    has: (id) => _map.has(Number(id)),
    clear: () => _map.clear(),
  };
})();

// ============================================================
//  2. FETCH STATUS VOTE
// ============================================================

// Cek 1 aspirasi — di-cache agar tidak double fetch
async function fetchVoteStatus(id) {
  if (VoteState.has(id)) return VoteState.get(id);
  if (!Auth.isLoggedIn()) {
    VoteState.set(id, false);
    return false;
  }

  try {
    const res = await api.get(`/voting/${id}`);
    const voted = res?.success ? Boolean(res.voted) : false;
    VoteState.set(id, voted);
    return voted;
  } catch (_) {
    VoteState.set(id, false);
    return false;
  }
}

// Cek banyak aspirasi sekaligus (paralel) — untuk list dashboard
async function fetchVoteStatusBatch(ids) {
  if (!Auth.isLoggedIn() || !ids.length) return;
  const toFetch = ids.filter((id) => !VoteState.has(id));
  if (!toFetch.length) return;
  await Promise.allSettled(toFetch.map((id) => fetchVoteStatus(id)));
}

// ============================================================
//  3. TOGGLE VOTE — optimistic update + rollback
// ============================================================
async function toggleVote(aspirasiId, btnEl) {
  const id = Number(aspirasiId);

  if (!Auth.isLoggedIn()) {
    showLoginPrompt();
    return;
  }
  if (btnEl.disabled) return;
  btnEl.disabled = true;

  // Snapshot sebelum request
  const wasVoted = VoteState.get(id);
  const currentCount = getCountFromBtn(btnEl);
  const newVoted = !wasVoted;
  const newCount = newVoted ? currentCount + 1 : Math.max(currentCount - 1, 0);

  // Optimistic UI — langsung ubah tanpa tunggu server
  applyVoteUI(id, newVoted, newCount);
  VoteState.set(id, newVoted);

  try {
    const res = await api.post(`/voting/${id}`, {});
    if (res?.success) {
      applyVoteUI(id, newVoted, res.vote_count);
      animateBtn(id);
    } else {
      // Rollback
      applyVoteUI(id, wasVoted, currentCount);
      VoteState.set(id, wasVoted);
      toast(res?.message || 'Gagal memberikan vote.', 'error');
    }
  } catch (_) {
    applyVoteUI(id, wasVoted, currentCount);
    VoteState.set(id, wasVoted);
    toast('Koneksi bermasalah. Coba lagi.', 'error');
  }

  document.querySelectorAll(`[data-vid="${id}"]`).forEach((b) => {
    b.disabled = false;
  });
}

// ============================================================
//  4. RENDER TOMBOL VOTE
// ============================================================
function createVoteBtn(id, count, voted = false) {
  return `
    <button
      class="vote-btn ${voted ? 'voted' : ''}"
      data-vid="${id}"
      onclick="toggleVote(${id}, this)"
      title="${voted ? 'Batalkan vote' : 'Dukung aspirasi ini'}"
    >
      <span class="arr">▲</span>
      <span class="vc" id="vc-${id}">${formatVote(count)}</span>
    </button>
  `;
}

// Update semua tombol vote aspirasi yang sama di halaman
function applyVoteUI(id, voted, count) {
  document.querySelectorAll(`[data-vid="${id}"]`).forEach((btn) => {
    btn.classList.toggle('voted', voted);
    btn.title = voted ? 'Batalkan vote' : 'Dukung aspirasi ini';
  });
  document.querySelectorAll(`#vc-${id}`).forEach((el) => {
    el.textContent = formatVote(count);
  });
}

// ============================================================
//  5. ANIMASI
// ============================================================
function animateBtn(id) {
  document.querySelectorAll(`[data-vid="${id}"]`).forEach((btn) => {
    btn.classList.remove('v-pop');
    void btn.offsetWidth; // force reflow
    btn.classList.add('v-pop');
    spawnParticle(btn);
    setTimeout(() => btn.classList.remove('v-pop'), 400);
  });
}

function spawnParticle(btnEl) {
  const rect = btnEl.getBoundingClientRect();
  const p = document.createElement('span');
  p.textContent = '▲';
  p.style.cssText = `
    position:fixed; pointer-events:none; z-index:9999;
    left:${rect.left + rect.width / 2}px;
    top:${rect.top}px;
    color:var(--accent); font-size:.72rem; font-weight:700;
    animation: vParticle .65s ease forwards;
  `;
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 650);
}

// Inject style animasi (sekali saja)
(() => {
  if (document.getElementById('v-styles')) return;
  const s = document.createElement('style');
  s.id = 'v-styles';
  s.textContent = `
    @keyframes vParticle {
      0%   { opacity:1; transform:translateY(0) scale(1); }
      100% { opacity:0; transform:translateY(-38px) scale(.6); }
    }
    @keyframes vPop {
      0%  { transform:scale(1); }
      40% { transform:scale(1.22); }
      70% { transform:scale(.93); }
      100%{ transform:scale(1); }
    }
    .v-pop { animation: vPop .4s ease; }
  `;
  document.head.appendChild(s);
})();

// ============================================================
//  6. LOGIN PROMPT
// ============================================================
function showLoginPrompt() {
  document.getElementById('vLoginPrompt')?.remove();

  const el = document.createElement('div');
  el.id = 'vLoginPrompt';
  el.style.cssText = `
    position:fixed; bottom:5rem; left:50%; transform:translateX(-50%);
    background:var(--bg-raised); border:1px solid var(--accent);
    border-radius:var(--radius); padding:.9rem 1.3rem;
    display:flex; align-items:center; gap:.9rem;
    box-shadow:var(--shadow-lg); z-index:9999;
    animation:fadeUp .3s ease; white-space:nowrap;
  `;
  el.innerHTML = `
    <span style="font-size:.88rem;color:var(--text-sub);">🔒 Login dulu untuk vote</span>
    <a href="login.html" class="btn btn-primary btn-sm">Login</a>
    <button onclick="this.parentElement.remove()"
      style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1rem;">✕</button>
  `;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 4000);
}

// ============================================================
//  7. UTILITY
// ============================================================
function getCountFromBtn(btnEl) {
  const el = btnEl.querySelector('.vc');
  if (!el) return 0;
  const raw = el.textContent.trim();
  if (raw.endsWith('k')) return parseFloat(raw) * 1000;
  return parseInt(raw) || 0;
}
