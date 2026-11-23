// Autodarts <-> Target DartCounter MV3 Background Service Worker
// Bridges local Kiosk Vite SSE relay (http://127.0.0.1:5173/api/dartcounter/*)
// with the content script running on https://app.dartcounter.net/*

const DEFAULT_SETTINGS = {
  kioskUrl: 'http://127.0.0.1:5173',
  playerName: 'Callum',
  mode: 'auto', // 'auto' | 'confirm' | 'read-only'
  paused: false,
};

let settings = { ...DEFAULT_SETTINGS };
let kioskConnected = false;
let latestScrapedState = null;
let latestSubmitResult = null;
let streamAbortController = null;
let reconnectTimer = null;

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    settings = { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  return settings;
}

async function saveSettings(partial) {
  settings = { ...settings, ...partial };
  try {
    await chrome.storage.local.set(partial);
  } catch {
    // ignore storage errors
  }
  broadcastToDartCounterTabs({ type: 'bridge_status', kioskConnected, settings });
}

function getBaseUrl() {
  return (settings.kioskUrl || DEFAULT_SETTINGS.kioskUrl).replace(/\/+$/, '');
}

async function broadcastToDartCounterTabs(message) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://app.dartcounter.net/*', 'https://*.dartcounter.net/*'],
    });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  } catch {
    // ignore
  }
}

async function postJson(pathname, payload) {
  try {
    const res = await fetch(`${getBaseUrl()}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function scheduleReconnect(delayMs = 3000) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectKioskStream();
  }, delayMs);
}

/**
 * Uses streaming fetch() + ReadableStream to consume SSE from the Kiosk Vite server
 * cleanly inside an MV3 Service Worker without relying on EventSource availability.
 */
async function connectKioskStream() {
  if (streamAbortController) {
    try {
      streamAbortController.abort();
    } catch {
      // ignore
    }
  }

  await loadSettings();
  const abort = new AbortController();
  streamAbortController = abort;

  try {
    const res = await fetch(`${getBaseUrl()}/api/dartcounter/stream?role=extension`, {
      method: 'GET',
      cache: 'no-store',
      signal: abort.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    kioskConnected = true;
    void broadcastToDartCounterTabs({ type: 'bridge_status', kioskConnected, settings });

    // Re-push latest scraped state right away if we already have an active tab
    if (latestScrapedState) {
      void postJson('/api/dartcounter/state', latestScrapedState);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (!abort.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });

      let sepIdx;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        handleSseBlock(block);
      }
    }
  } catch {
    // Expected during reconnect or when Kiosk server is offline
  } finally {
    if (streamAbortController === abort) {
      streamAbortController = null;
      kioskConnected = false;
      void broadcastToDartCounterTabs({ type: 'bridge_status', kioskConnected, settings });
      scheduleReconnect(3000);
    }
  }
}

function handleSseBlock(block) {
  const lines = block.split(/\r?\n/);
  let eventName = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return;
  let payload = null;
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    return;
  }

  if (eventName === 'dc_config' && payload && payload.mode) {
    void saveSettings({ mode: payload.mode });
  } else if (eventName === 'dc_visit' && payload) {
    void broadcastToDartCounterTabs({
      type: 'submit_visit',
      visit: payload,
      settings,
    });
  } else if (eventName === 'dc_control' && payload) {
    void broadcastToDartCounterTabs({
      type: 'dc_control_command',
      command: payload,
      settings,
    });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'content_heartbeat') {
    if (!streamAbortController && !reconnectTimer) {
      void connectKioskStream();
    }
    sendResponse({ ok: true, kioskConnected, settings });
    return false;
  }

  if (msg.type === 'dc_state_update') {
    latestScrapedState = msg.state;
    void postJson('/api/dartcounter/state', msg.state).then((ok) => {
      if (ok && !kioskConnected && !streamAbortController) {
        void connectKioskStream();
      }
    });
    sendResponse({ ok: true, kioskConnected, settings });
    return false;
  }

  if (msg.type === 'dc_submit_result') {
    latestSubmitResult = msg.result;
    void postJson('/api/dartcounter/submit-result', msg.result);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'dc_control_result') {
    void postJson('/api/dartcounter/control-result', msg.result);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'popup_get_status') {
    void loadSettings().then(() => {
      sendResponse({
        ok: true,
        kioskConnected,
        settings,
        latestScrapedState,
        latestSubmitResult,
      });
    });
    return true;
  }

  if (msg.type === 'popup_update_settings') {
    void (async () => {
      await saveSettings(msg.partial || {});
      if (msg.partial && msg.partial.mode) {
        await postJson('/api/dartcounter/config', { mode: msg.partial.mode });
      }
      if (msg.partial && msg.partial.kioskUrl) {
        void connectKioskStream();
      }
      sendResponse({ ok: true, kioskConnected, settings });
    })();
    return true;
  }

  if (msg.type === 'popup_reconnect') {
    void connectKioskStream();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'popup_force_scrape') {
    void broadcastToDartCounterTabs({ type: 'force_scrape' });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(() => {
  void chrome.tabs
    .query({ url: ['https://app.dartcounter.net/*', 'https://*.dartcounter.net/*'] })
    .then((tabs) => {
      if (tabs.length === 0 && latestScrapedState?.isMatchActive) {
        latestScrapedState = {
          ...latestScrapedState,
          isMatchActive: false,
          updatedAt: Date.now(),
        };
        void postJson('/api/dartcounter/state', latestScrapedState);
      }
    })
    .catch(() => {});
});

// MV3 keepalive alarm (every 24s) so Brave NEVER suspends the service worker while occluded behind the Kiosk TV!
function ensureKeepaliveAlarm() {
  try {
    chrome.alarms?.create('dc-keepalive', { periodInMinutes: 0.4 });
  } catch {
    // ignore
  }
}

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dc-keepalive') {
    if (!streamAbortController && !reconnectTimer) {
      void connectKioskStream();
    }
    void broadcastToDartCounterTabs({ type: 'force_scrape' });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  ensureKeepaliveAlarm();
  void loadSettings().then(() => connectKioskStream());
});

chrome.runtime.onStartup.addListener(() => {
  ensureKeepaliveAlarm();
  void loadSettings().then(() => connectKioskStream());
});

// Boot immediately when service worker wakes
ensureKeepaliveAlarm();
void loadSettings().then(() => connectKioskStream());
