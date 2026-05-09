const API = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:3000'
  : 'https://soki-api.vayv.tech'; // update when backend is deployed

let MIN_PLAYERS = 10; // overridden by /api/config (DEMO_MODE → 4)
fetch(`${API}/api/config`).then(r => r.json()).then(c => {
  if (c?.min_players) MIN_PLAYERS = c.min_players;
}).catch(() => {});

// only the three fields needed to rejoin — nothing more
const SESSION_KEY = 'soki_s';

let state = {
  sessionCode: null,
  playerId: null,
  isHost: false,
  pollInterval: null,
};

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    c: state.sessionCode,
    p: state.playerId,
    h: state.isHost,
  }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setError(id, msg) {
  document.getElementById(id).textContent = msg;
}

async function handleCreate() {
  const username = document.getElementById('create-username').value.trim();
  setError('create-error', '');
  if (!username) return setError('create-error', '// name required');

  try {
    const res = await fetch(`${API}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return setError('create-error', `// ${data.error}`);

    state.sessionCode = data.session_code;
    state.playerId = data.player_id;
    state.isHost = true;
    saveSession();
    enterLobby();
  } catch {
    setError('create-error', '// connection failed');
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleJoin() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const input = document.getElementById('join-username').value.trim();
  setError('join-error', '');
  if (!code) return setError('join-error', '// session code required');
  if (!input) return setError('join-error', '// name or player id required');

  // If input looks like a UUID, treat as rejoin via player_id.
  if (UUID_RE.test(input)) {
    try {
      const r = await fetch(`${API}/api/games/${code}?player_id=${encodeURIComponent(input)}`);
      if (r.status === 404) return setError('join-error', '// game not found');
      const data = await r.json();
      if (!r.ok) return setError('join-error', `// ${data.error || 'failed'}`);

      const isHost = !!data.game.host_player_id && data.game.host_player_id === input;
      const known = isHost || (data.players && data.players.some(p => p.player_id === input));
      if (!known) return setError('join-error', '// player id not in this game');

      state.sessionCode = code;
      state.playerId = input;
      state.isHost = isHost;
      saveSession();

      if (data.game.status === 'playing') { window.location.href = '../play/'; return; }
      if (data.game.status === 'finished') return setError('join-error', '// game already finished');
      enterLobby();
      return;
    } catch {
      return setError('join-error', '// connection failed');
    }
  }

  // Otherwise: new join with username
  try {
    const res = await fetch(`${API}/api/games/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_code: code, username: input }),
    });
    const data = await res.json();
    if (!res.ok) return setError('join-error', `// ${data.error}`);

    state.sessionCode = data.session_code;
    state.playerId = data.player_id;
    state.isHost = false;
    saveSession();
    enterLobby();
  } catch {
    setError('join-error', '// connection failed');
  }
}

function enterLobby() {
  document.getElementById('lobby-code').textContent = state.sessionCode;
  // Title + section label vary by role
  const title = document.getElementById('lobby-title');
  const label = document.getElementById('lobby-section-label');
  if (state.isHost) {
    title.textContent = 'lobby_';
    label.textContent = '// host dashboard — haraya';
  } else {
    title.textContent = 'waiting room_';
    label.textContent = '// waiting for host — haraya';
  }
  // Always reveal player id so user can rejoin from another browser/device
  const idBlock = document.getElementById('my-id-block');
  const idDisp = document.getElementById('lobby-my-id');
  if (idBlock && idDisp && state.playerId) {
    idDisp.textContent = state.playerId;
    idBlock.hidden = false;
  }
  // Reveal editable profile block; populate with current username from server
  const profileBlock = document.getElementById('profile-block');
  if (profileBlock) {
    profileBlock.hidden = false;
    fetchMyUsername();
  }
  showScreen('screen-lobby');
  pollLobby();
  state.pollInterval = setInterval(pollLobby, 2500);
}

async function fetchMyUsername() {
  try {
    const r = await fetch(`${API}/api/games/${state.sessionCode}?player_id=${state.playerId}`);
    const data = await r.json();
    if (!r.ok) return;
    const me = (data.players || []).find(p => p.player_id === state.playerId);
    if (me) document.getElementById('profile-name').value = me.username;
  } catch {}
}

async function saveName() {
  const v = document.getElementById('profile-name').value.trim();
  const err = document.getElementById('profile-err');
  err.textContent = '';
  if (!v) { err.textContent = '// name required'; return; }
  try {
    const r = await fetch(`${API}/api/players/${state.playerId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username: v })
    });
    if (!r.ok) {
      const d = await r.json().catch(()=>({}));
      err.textContent = `// ${d.error || 'failed'}`;
      return;
    }
    err.style.color = '#88ff88';
    err.textContent = '// saved';
    setTimeout(() => { err.textContent = ''; err.style.color = ''; }, 1500);
  } catch {
    err.textContent = '// connection failed';
  }
}

function copyMyId() {
  if (!state.playerId) return;
  navigator.clipboard.writeText(state.playerId).then(() => {
    const btn = document.getElementById('copy-id-btn');
    btn.textContent = '[ copied ]';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '[ copy id ]'; btn.classList.remove('copied'); }, 2000);
  });
}

async function pollLobby() {
  try {
    const url = `${API}/api/games/${state.sessionCode}?player_id=${state.playerId}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) return;

    renderLobby(data);

    if (data.game.status === 'playing') {
      clearInterval(state.pollInterval);
      // keep localStorage — /play reads it
      document.getElementById('lobby-status').innerHTML = 'game starting<span class="blink">_</span>';
      window.location.href = '../play/';
    }
  } catch {
    // silent — keep polling
  }
}

function renderLobby(data) {
  const players = data.players || [];
  const count = data.player_count ?? players.length;
  const hostPresent = data.host_present;

  document.getElementById('player-count').textContent = `${count} / 12`;

  if (state.isHost) {
    // Host sees the full list with names + ids
    document.getElementById('player-list-items').innerHTML = players.map(p => `
      <div class="player-item">
        <div class="player-pip${p.is_host ? ' host' : ''}"></div>
        <span>${escapeHtml(p.username)}</span>
        ${p.is_host ? '<span class="player-role">host</span>' : ''}
        <span class="player-id" style="opacity:0.45;font-size:11px;margin-left:8px">${p.player_id.slice(0, 8)}</span>
      </div>
    `).join('');

    const ready = count >= MIN_PLAYERS;
    const hostActions = document.getElementById('host-actions');
    const status = document.getElementById('lobby-status');
    hostActions.hidden = !ready;
    status.innerHTML = ready
      ? 'ready to start<span class="blink">_</span>'
      : `need ${MIN_PLAYERS - count} more player${MIN_PLAYERS - count === 1 ? '' : 's'}<span class="blink">_</span>`;
    return;
  }

  // Non-host view: count + own row only, no other names
  const me = players[0]; // server returns only [me] for non-hosts
  document.getElementById('player-list-items').innerHTML = `
    ${me ? `
      <div class="player-item">
        <div class="player-pip"></div>
        <span>${escapeHtml(me.username)}</span>
        <span class="player-role">you</span>
      </div>
    ` : ''}
    <div class="player-item" style="opacity:0.55">
      <div class="player-pip${hostPresent ? ' host' : ''}"></div>
      <span>host</span>
      <span class="player-role">${hostPresent ? 'present' : 'absent'}</span>
    </div>
    <div class="player-item" style="opacity:0.55">
      <div class="player-pip"></div>
      <span>${count - 1} other player${count - 1 === 1 ? '' : 's'} in lobby</span>
    </div>
  `;
  document.getElementById('lobby-status').innerHTML = 'waiting for host<span class="blink">_</span>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function handleStart() {
  setError('lobby-error', '');
  try {
    const res = await fetch(`${API}/api/games/${state.sessionCode}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: state.playerId }),
    });
    const data = await res.json();
    if (!res.ok) return setError('lobby-error', `// ${data.error}`);
  } catch {
    setError('lobby-error', '// connection failed');
  }
}

function copyCode() {
  navigator.clipboard.writeText(state.sessionCode).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '[ copied ]';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '[ copy ]';
      btn.classList.remove('copied');
    }, 2000);
  });
}

// ── RESTORE SESSION ON LOAD ──
// Session persists for the full lifecycle of a game (waiting → playing → finished).
// Only cleared if the game no longer exists on the server (404) or host explicitly stops.
(async function restoreSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;

  const { c, p, h } = JSON.parse(raw);
  try {
    const res = await fetch(`${API}/api/games/${c}`);
    if (res.status === 404) { clearSession(); return; } // game gone
    const data = await res.json();
    if (!res.ok) return; // transient — keep session, retry next load

    state.sessionCode = c;
    state.playerId = p;
    state.isHost = h;

    // If game already in play, jump to /play. Otherwise stay in lobby.
    if (data.game.status === 'playing') {
      window.location.href = '../play/';
      return;
    }
    if (data.game.status === 'finished') {
      // game over — clear and stay on join screen
      clearSession();
      return;
    }
    enterLobby();
  } catch {
    // network error — keep session, do nothing
  }
})();
