// Autodarts <-> Target DartCounter MV3 Background Service Worker (v1.3.0)
// Bridges local Kiosk Vite SSE relay (http://127.0.0.1:5173/api/dartcounter/*)
// with the content script + MAIN-world Angular bridge running on https://app.dartcounter.net/*

const DEFAULT_SETTINGS = {
  kioskUrl: 'http://127.0.0.1:5173',
  playerName: 'Callum',
  mode: 'confirm', // 'auto' | 'confirm' | 'read-only'
  paused: false,
};

let settings = { ...DEFAULT_SETTINGS };
let kioskConnected = false;
let latestScrapedState = null;
let latestSubmitResult = null;
let streamAbortController = null;
let streamConnecting = false;
let reconnectTimer = null;
let lastStreamActivityAt = 0;
const tabStates = new Map(); // tabId -> { state, updatedAt }

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
  void broadcastToDartCounterTabs({ type: 'bridge_status', kioskConnected, settings });
}

function getBaseUrl() {
  return (settings.kioskUrl || DEFAULT_SETTINGS.kioskUrl).replace(/\/+$/, '');
}

const DARTCOUNTER_URL_PATTERNS = [
  'https://app.dartcounter.net/*',
  'https://*.dartcounter.net/*',
];

async function queryDartCounterTabs() {
  try {
    return await chrome.tabs.query({ url: DARTCOUNTER_URL_PATTERNS });
  } catch {
    return [];
  }
}

function selectPrimaryTab(tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;

  const openIds = new Set(tabs.map((t) => t.id).filter((id) => typeof id === 'number'));
  for (const knownId of tabStates.keys()) {
    if (!openIds.has(knownId)) {
      tabStates.delete(knownId);
    }
  }

  let bestMatchTab = null;
  let bestMatchTs = -1;
  let bestRecentTab = null;
  let bestRecentTs = -1;

  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    const entry = tabStates.get(tab.id);
    const ts = entry?.updatedAt || 0;
    if (entry?.state?.isMatchActive) {
      if (ts >= bestMatchTs) {
        bestMatchTs = ts;
        bestMatchTab = tab;
      }
    }
    if (entry && ts >= bestRecentTs) {
      bestRecentTs = ts;
      bestRecentTab = tab;
    }
  }

  if (bestMatchTab) return bestMatchTab;
  if (bestRecentTab) return bestRecentTab;
  return tabs.find((t) => t.active && typeof t.id === 'number') || tabs.find((t) => typeof t.id === 'number') || null;
}

async function sendToPrimaryDartCounterTab(message) {
  try {
    const tabs = await queryDartCounterTabs();
    const primary = selectPrimaryTab(tabs);
    if (primary && typeof primary.id === 'number') {
      chrome.tabs.sendMessage(primary.id, message).catch(() => {});
    }
  } catch {
    // ignore
  }
}

async function broadcastToDartCounterTabs(message) {
  try {
    const tabs = await queryDartCounterTabs();
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
  if (reconnectTimer || streamConnecting || streamAbortController) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectKioskStream();
  }, delayMs);
}

/**
 * Uses streaming fetch() + ReadableStream to consume SSE from the Kiosk Vite server
 * cleanly inside an MV3 Service Worker without opening duplicate connections.
 */
async function connectKioskStream(forceReset = false) {
  if (streamConnecting && !forceReset) return;
  if (streamAbortController && !forceReset) return;

  streamConnecting = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (streamAbortController) {
    try {
      streamAbortController.abort();
    } catch {
      // ignore
    }
    streamAbortController = null;
  }

  const abort = new AbortController();
  streamAbortController = abort;
  let reader = null;

  try {
    await loadSettings();
    const res = await fetch(`${getBaseUrl()}/api/dartcounter/stream?role=extension`, {
      method: 'GET',
      cache: 'no-store',
      signal: abort.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    if (streamAbortController !== abort || abort.signal.aborted) {
      return;
    }

    streamConnecting = false;
    kioskConnected = true;
    lastStreamActivityAt = Date.now();
    void broadcastToDartCounterTabs({ type: 'bridge_status', kioskConnected, settings });

    // Re-push latest scraped state right away if we already have an active tab
    if (latestScrapedState) {
      void postJson('/api/dartcounter/state', latestScrapedState);
    }

    reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (!abort.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      lastStreamActivityAt = Date.now();
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
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
    if (streamAbortController === abort) {
      streamConnecting = false;
      streamAbortController = null;
      kioskConnected = false;
      lastStreamActivityAt = 0;
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
    void sendToPrimaryDartCounterTab({
      type: 'submit_visit',
      visit: payload,
      settings,
    });
  } else if (eventName === 'dc_control' && payload) {
    void sendToPrimaryDartCounterTab({
      type: 'dc_control_command',
      command: payload,
      settings,
    });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'content_heartbeat') {
    if (!streamAbortController && !streamConnecting && !reconnectTimer) {
      void connectKioskStream();
    }
    sendResponse({ ok: true, kioskConnected, settings });
    return false;
  }

  if (msg.type === 'dc_state_update') {
    const tabId = sender?.tab?.id;
    const now = Date.now();
    if (typeof tabId === 'number') {
      tabStates.set(tabId, { state: msg.state, updatedAt: now });
    }

    // Prevent a background lobby tab from wiping out an active match tab!
    let otherTabHasActiveMatch = false;
    if (!msg.state?.isMatchActive) {
      for (const [id, entry] of tabStates.entries()) {
        if (id !== tabId && entry?.state?.isMatchActive) {
          otherTabHasActiveMatch = true;
          break;
        }
      }
    }

    if (!otherTabHasActiveMatch) {
      latestScrapedState = msg.state;
      void postJson('/api/dartcounter/state', msg.state).then((ok) => {
        if (ok && !kioskConnected && !streamAbortController && !streamConnecting) {
          void connectKioskStream();
        }
      });
    }
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
    void (async () => {
      try {
        await loadSettings();
        sendResponse({
          ok: true,
          kioskConnected,
          settings,
          latestScrapedState,
          latestSubmitResult,
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err?.message || String(err),
          kioskConnected,
          settings,
          latestScrapedState,
          latestSubmitResult,
        });
      }
    })();
    return true;
  }

  if (msg.type === 'popup_update_settings') {
    void (async () => {
      try {
        await saveSettings(msg.partial || {});
        if (msg.partial && msg.partial.mode) {
          await postJson('/api/dartcounter/config', { mode: msg.partial.mode });
        }
        if (msg.partial && msg.partial.kioskUrl) {
          void connectKioskStream(true);
        }
        sendResponse({ ok: true, kioskConnected, settings });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err?.message || String(err),
          kioskConnected,
          settings,
        });
      }
    })();
    return true;
  }

  if (msg.type === 'popup_reconnect') {
    void connectKioskStream(true);
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

chrome.tabs.onRemoved.addListener((removedTabId) => {
  tabStates.delete(removedTabId);
  void queryDartCounterTabs()
    .then((tabs) => {
      const primary = selectPrimaryTab(tabs);
      if (primary && typeof primary.id === 'number') {
        const entry = tabStates.get(primary.id);
        if (entry?.state) {
          latestScrapedState = entry.state;
          void postJson('/api/dartcounter/state', latestScrapedState);
          return;
        }
      }
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

// MV3 keepalive alarm (0.5m = 30s Chrome MV3 minimum) + stale SSE stream watchdog (> 45s)
function ensureKeepaliveAlarm() {
  try {
    chrome.alarms?.create('dc-keepalive', { periodInMinutes: 0.5 });
  } catch {
    // ignore
  }
}

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dc-keepalive') {
    const streamIsStale =
      Boolean(streamAbortController) &&
      lastStreamActivityAt > 0 &&
      Date.now() - lastStreamActivityAt > 45000;

    if (streamIsStale) {
      void connectKioskStream(true);
    } else if (!streamAbortController && !streamConnecting && !reconnectTimer) {
      void connectKioskStream();
    }
    void broadcastToDartCounterTabs({ type: 'force_scrape' });
  }
});

async function refreshExistingDartCounterTabs() {
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://app.dartcounter.net/*', 'https://*.dartcounter.net/*'],
    });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.reload(tab.id).catch(() => {});
      }
    }
  } catch {
    // ignore
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureKeepaliveAlarm();
  void loadSettings().then(() => connectKioskStream());
  void refreshExistingDartCounterTabs();
});

chrome.runtime.onStartup.addListener(() => {
  ensureKeepaliveAlarm();
  void loadSettings().then(() => connectKioskStream());
});

// Boot immediately when service worker wakes
ensureKeepaliveAlarm();
void loadSettings().then(() => connectKioskStream());
