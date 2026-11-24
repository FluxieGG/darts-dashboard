const statusPill = document.getElementById('status-pill');
const playerInput = document.getElementById('player-name');
const urlInput = document.getElementById('kiosk-url');
const matchPreview = document.getElementById('match-preview');
const modeHint = document.getElementById('mode-hint');
const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
const saveBtn = document.getElementById('save-btn');
const reconnectBtn = document.getElementById('reconnect-btn');

let currentMode = 'confirm';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeSendMessage(msg, cb) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (typeof cb === 'function') {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime?.lastError) return;
        cb(resp);
      });
    } else {
      chrome.runtime.sendMessage(msg)?.catch?.(() => {});
    }
  } catch {
    // ignore
  }
}

const MODE_HINTS = {
  auto: 'Auto-Score: Enters your Autodarts visit total into DartCounter automatically as soon as you pull your darts.',
  confirm:
    'iPad Confirm (Recommended): Shows a 1-tap "Send to DartCounter" button on your iPad after each visit so misreads never submit.',
  'read-only':
    'Sync Only: Mirrors DartCounter scores, opponent remaining, checkout routes & auto-clips to your TV without typing into DartCounter.',
};

function renderModeButtons(mode) {
  currentMode = mode || 'confirm';
  modeHint.textContent = MODE_HINTS[currentMode] || MODE_HINTS.confirm;
  for (const btn of modeButtons) {
    const m = btn.dataset.mode;
    btn.classList.remove('active', 'active-auto');
    if (m === currentMode) {
      btn.classList.add(m === 'auto' ? 'active-auto' : 'active');
    }
  }
}

function renderStatus(resp) {
  if (!resp) return;
  statusPill.textContent = resp.kioskConnected ? 'Kiosk Live' : 'Offline';
  statusPill.className = `pill ${resp.kioskConnected ? 'ok' : 'err'}`;

  if (resp.settings) {
    playerInput.value = resp.settings.playerName || 'Callum';
    urlInput.value = resp.settings.kioskUrl || 'http://127.0.0.1:5173';
    renderModeButtons(resp.settings.mode);
  }

  const st = resp.latestScrapedState;
  if (st && st.isMatchActive) {
    matchPreview.innerHTML = `
      <div><strong>${escapeHtml(st.playerName)}</strong> ${escapeHtml(st.playerRemaining)} vs <strong>${escapeHtml(st.opponentName)}</strong> ${escapeHtml(st.opponentRemaining ?? '—')}</div>
      <div style="color:#94a3b8;margin-top:3px;">Legs ${escapeHtml(st.playerLegs)}–${escapeHtml(st.opponentLegs)} • ${escapeHtml(st.startScore)} • ${st.isPlayerTurn ? 'Your Turn' : 'Opponent Turn'}</div>
    `;
  } else {
    matchPreview.textContent = 'No active DartCounter match detected yet. Start a match on app.dartcounter.net.';
  }
}

function refresh() {
  safeSendMessage({ type: 'popup_get_status' }, (resp) => {
    renderStatus(resp);
  });
}

for (const btn of modeButtons) {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    renderModeButtons(mode);
    safeSendMessage(
      { type: 'popup_update_settings', partial: { mode } },
      (resp) => {
        renderStatus(resp);
      }
    );
  });
}

saveBtn.addEventListener('click', () => {
  safeSendMessage(
    {
      type: 'popup_update_settings',
      partial: {
        playerName: playerInput.value.trim() || 'Callum',
        kioskUrl: urlInput.value.trim() || 'http://127.0.0.1:5173',
        mode: currentMode,
      },
    },
    (resp) => {
      renderStatus(resp);
      safeSendMessage({ type: 'popup_force_scrape' });
      saveBtn.textContent = 'Saved ✓';
      setTimeout(() => {
        saveBtn.textContent = 'Save & Sync';
      }, 1200);
    }
  );
});

reconnectBtn.addEventListener('click', () => {
  safeSendMessage({ type: 'popup_reconnect' });
  safeSendMessage({ type: 'popup_force_scrape' });
  setTimeout(refresh, 400);
});

refresh();
