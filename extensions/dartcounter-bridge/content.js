// Autodarts <-> Target DartCounter Web Content Script (v1.3.0)
// Runs on https://app.dartcounter.net/*
// - Coordinates with page-bridge.js (MAIN-world Angular Ivy bridge) AND exact DartCounter custom-element DOM selectors
// - Streams live match state (scores, opponent, legs, turn), online friends, and friend invites to Kiosk TV & iPad
// - Enters Autodarts visit totals into DartCounter Web (<app-keyboard-score-input>, <app-numbers-keyboard>, <app-darts-for-throwout-dialog>)
// - Executes remote iPad commands (Start DartBot 1..20, See/Refresh Online Friends, Challenge Friend, Accept/Decline Invite, Undo, Rematch, Leave)

(() => {
  if (window.__AUTODARTS_DC_BRIDGE_LOADED__) return;
  window.__AUTODARTS_DC_BRIDGE_LOADED__ = true;

  let kioskConnected = false;
  let settings = {
    kioskUrl: 'http://127.0.0.1:5173',
    playerName: 'Callum',
    mode: 'confirm',
    paused: false,
  };

  let lastStateHash = '';
  let lastScrapedState = null;
  let lastSubmitMessage = '';
  let sessionStartScore = 501;
  let lastMatchUrl = '';
  const submittedVisitIds = new Set();
  const MAX_SUBMITTED_VISIT_IDS = 200;
  const inviteFirstSeenMap = new Map();
  let lastDomInviteScrapeAt = 0;
  let cachedDomInvites = [];
  let tornDown = false;
  let pollIntervalId = null;
  let mutTimer = null;
  let observer = null;
  const PENDING_CMD_STORAGE_KEY = '__AD_PENDING_DC_CMD_V2__';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function rememberSubmittedVisit(id) {
    if (!id) return;
    submittedVisitIds.add(id);
    while (submittedVisitIds.size > MAX_SUBMITTED_VISIT_IDS) {
      const oldest = submittedVisitIds.values().next().value;
      submittedVisitIds.delete(oldest);
    }
  }

  function onNgSnapshot() {
    if (tornDown) return;
    pushStateIfChanged(false);
  }

  function teardownExtension() {
    if (tornDown) return;
    tornDown = true;
    if (pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    if (mutTimer !== null) {
      clearTimeout(mutTimer);
      mutTimer = null;
    }
    if (observer) {
      try {
        observer.disconnect();
      } catch {
        // ignore
      }
      observer = null;
    }
    try {
      window.removeEventListener('ad-dc-ng-snapshot', onNgSnapshot);
    } catch {
      // ignore
    }
  }

  function safeSendMessage(msg, cb) {
    if (tornDown) return;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        teardownExtension();
        return;
      }
      if (typeof cb === 'function') {
        chrome.runtime.sendMessage(msg, (resp) => {
          const err = chrome.runtime?.lastError;
          if (err) {
            if (/Extension context invalidated/i.test(err.message || '')) {
              teardownExtension();
            }
            return;
          }
          cb(resp);
        });
      } else {
        const res = chrome.runtime.sendMessage(msg);
        res?.catch?.((err) => {
          if (/Extension context invalidated/i.test(err?.message || '')) {
            teardownExtension();
          }
        });
      }
    } catch (err) {
      if (/Extension context invalidated/i.test(err?.message || '')) {
        teardownExtension();
      }
    }
  }

  // Ensure MAIN-world Angular bridge is injected even on tabs opened before extension update
  function ensureMainWorldPageBridge() {
    if (tornDown) return;
    if (document.documentElement?.dataset?.adPageBridgeReady === '1') return;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        teardownExtension();
        return;
      }
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('page-bridge.js');
      script.async = false;
      (document.head || document.documentElement).appendChild(script);
      script.onload = () => script.remove();
    } catch (err) {
      if (/Extension context invalidated/i.test(err?.message || '')) {
        teardownExtension();
      }
    }
  }
  ensureMainWorldPageBridge();

  function readNgSnapshot() {
    try {
      const raw = document.documentElement?.dataset?.adNgSnapshot;
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function sendPageBridgeCommand(type, payload = {}, timeoutMs = 6500) {
    ensureMainWorldPageBridge();
    return new Promise((resolve) => {
      const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let settled = false;

      const onResult = (ev) => {
        const detail = ev.detail || {};
        if (detail.reqId !== reqId) return;
        settled = true;
        window.removeEventListener('ad-dc-page-cmd-result', onResult);
        clearTimeout(timer);
        resolve(detail);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('ad-dc-page-cmd-result', onResult);
        resolve({ handled: false, timedOut: true });
      }, timeoutMs);

      window.addEventListener('ad-dc-page-cmd-result', onResult);
      window.dispatchEvent(
        new CustomEvent('ad-dc-page-cmd', {
          detail: { reqId, type, ...payload },
        })
      );
    });
  }

  // =========================================================================
  // COMPACT FLOATING HUD PILL (Bottom-Right of DartCounter Web)
  // =========================================================================
  let hudEl = null;
  let hudCollapsed = false;
  let lastHudSig = '';

  function ensureHud() {
    if (hudEl && document.body.contains(hudEl)) return hudEl;
    const el = document.createElement('div');
    el.id = 'ad-dc-bridge-hud';
    Object.assign(el.style, {
      position: 'fixed',
      right: '14px',
      bottom: '14px',
      zIndex: '2147483640',
      background: 'rgba(11, 15, 23, 0.94)',
      color: '#F8FAFC',
      border: '1px solid rgba(247, 101, 5, 0.55)',
      borderRadius: '14px',
      padding: '8px 12px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: '11px',
      lineHeight: '1.35',
      boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
      backdropFilter: 'blur(8px)',
      maxWidth: '320px',
      userSelect: 'none',
    });
    document.body.appendChild(el);
    hudEl = el;
    lastHudSig = '';
    return el;
  }

  function renderHud() {
    if (tornDown || !document.body) return;
    const el = ensureHud();
    const dotColor = !kioskConnected
      ? '#F43F5E'
      : settings.paused
      ? '#F59E0B'
      : '#10B981';

    const modeLabel =
      settings.mode === 'auto'
        ? 'AUTO'
        : settings.mode === 'read-only'
        ? 'SYNC'
        : 'CONFIRM';

    const friendsCount =
      lastScrapedState?.onlineFriends?.filter((f) =>
        ['online', 'in_lobby', 'in_queue', 'spectating', 'busy', 'online_game', 'local_game'].includes(
          f.status
        )
      ).length || 0;

    const st = lastScrapedState;
    const hudSig = hudCollapsed
      ? `C|${dotColor}|${modeLabel}`
      : [
          'E',
          dotColor,
          modeLabel,
          settings.paused ? '1' : '0',
          st?.isMatchActive ? '1' : '0',
          st?.playerName ?? '',
          st?.playerRemaining ?? '',
          st?.opponentName ?? '',
          st?.opponentRemaining ?? '',
          st?.playerLegs ?? '',
          st?.opponentLegs ?? '',
          st?.isPlayerTurn ? '1' : '0',
          friendsCount,
          lastSubmitMessage,
        ].join('|');

    if (hudSig === lastHudSig) return;
    lastHudSig = hudSig;

    if (hudCollapsed) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;cursor:pointer;" id="ad-hud-toggle">
          <span style="width:8px;height:8px;border-radius:999px;background:${dotColor};display:inline-block;"></span>
          <strong style="letter-spacing:0.04em;">AD BRIDGE</strong>
          <span style="color:#F76505;font-weight:700;">${escapeHtml(modeLabel)}</span>
        </div>
      `;
      el.querySelector('#ad-hud-toggle')?.addEventListener('click', () => {
        hudCollapsed = false;
        renderHud();
      });
      return;
    }

    const matchLine = st?.isMatchActive
      ? `${escapeHtml(st.playerName)}: <strong>${escapeHtml(st.playerRemaining)}</strong> vs ${escapeHtml(st.opponentName)}: <strong>${escapeHtml(st.opponentRemaining ?? '—')}</strong> (${escapeHtml(st.playerLegs)}-${escapeHtml(st.opponentLegs)})`
      : `Ready • ${friendsCount} friend${friendsCount === 1 ? '' : 's'} online`;

    const turnBadge = st?.isMatchActive
      ? st.isPlayerTurn
        ? '<span style="color:#34D399;font-weight:700;">YOUR TURN</span>'
        : '<span style="color:#FBBF24;font-weight:700;">OPP TURN</span>'
      : '';

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="width:8px;height:8px;border-radius:999px;background:${dotColor};display:inline-block;"></span>
          <strong style="font-size:11px;letter-spacing:0.05em;">AUTODARTS BRIDGE v1.3</strong>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="padding:1px 6px;border-radius:6px;background:rgba(247,101,5,0.2);border:1px solid rgba(247,101,5,0.45);color:#FDBA74;font-size:10px;font-weight:700;">${escapeHtml(modeLabel)}</span>
          <button id="ad-hud-pause" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#E2E8F0;border-radius:6px;padding:1px 6px;cursor:pointer;font-size:10px;">${settings.paused ? 'Resume' : 'Pause'}</button>
          <button id="ad-hud-min" style="background:transparent;border:none;color:#94A3B8;cursor:pointer;font-size:12px;padding:0 2px;">–</button>
        </div>
      </div>
      <div style="color:#CBD5E1;font-size:10.5px;">${matchLine} ${turnBadge}</div>
      ${
        lastSubmitMessage
          ? `<div style="color:#38BDF8;font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(lastSubmitMessage)}</div>`
          : ''
      }
    `;

    el.querySelector('#ad-hud-min')?.addEventListener('click', () => {
      hudCollapsed = true;
      renderHud();
    });
    el.querySelector('#ad-hud-pause')?.addEventListener('click', () => {
      settings.paused = !settings.paused;
      safeSendMessage({
        type: 'popup_update_settings',
        partial: { paused: settings.paused },
      });
      renderHud();
    });
  }

  // =========================================================================
  // DOM HELPERS
  // =========================================================================
  function isVisible(el) {
    if (!el || el.id === 'ad-dc-bridge-hud' || el.closest?.('#ad-dc-bridge-hud')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 3 || rect.height < 3) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0.04
    );
  }

  function queryAllDeep(selector, root = document) {
    const out = [];
    const stack = [root];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (!cur || !cur.querySelectorAll) continue;
      for (const el of cur.querySelectorAll(selector)) {
        out.push(el);
      }
      for (const el of cur.querySelectorAll('*')) {
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
    return out;
  }

  function getAllClickableButtons() {
    return queryAllDeep(
      'button, [role="button"], ion-button, a[href], [dcbutton], [dclistswitch]'
    ).filter((el) => {
      if (!isVisible(el)) return false;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.9 || rect.height > 200) return false;
      return true;
    });
  }

  // =========================================================================
  // EXACT DARTCOUNTER DOM SCRAPERS (Friends, Invites & Live X01 Scoreboard)
  // =========================================================================
  function scrapeFriendsFromDomAndNg(ngSnap) {
    const friendsMap = new Map();

    // 1. Primary: Angular OnlinePlayStateService friends list
    if (Array.isArray(ngSnap?.onlineFriends)) {
      for (const f of ngSnap.onlineFriends) {
        if (f && f.name) {
          friendsMap.set(String(f.userId ?? f.name.toLowerCase()), f);
        }
      }
    }

    // 2. DOM Supplement: Scrape <app-friends-lobby> rows if currently on /friends-lobby
    const friendRows = Array.from(
      document.querySelectorAll(
        'app-friends-lobby [role="listitem"], app-friends-lobby [friendrow]'
      )
    ).filter(isVisible);

    for (const row of friendRows) {
      const nameEl = row.querySelector('[dctypography*="geist-14-semibold"], .truncate');
      const name = (nameEl?.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length < 2) continue;

      const rowText = (row.innerText || '').toLowerCase();
      let status = 'online';
      if (/\bbusy\b/.test(rowText)) status = 'busy';
      else if (/\bin\s*queue\b/.test(rowText)) status = 'in_queue';
      else if (/\bwatch\b/.test(rowText)) status = 'online_game';

      const key = name.toLowerCase();
      const already = Array.from(friendsMap.values()).some(
        (existing) => existing.name.toLowerCase() === key
      );
      if (!already) {
        friendsMap.set(key, {
          userId: key,
          name,
          status,
          avg: null,
          country: null,
        });
      }
    }

    return Array.from(friendsMap.values());
  }

  function getStableInviteDetectedAt(id, fallbackTs) {
    if (!inviteFirstSeenMap.has(id)) {
      inviteFirstSeenMap.set(id, typeof fallbackTs === 'number' ? fallbackTs : Date.now());
    }
    return inviteFirstSeenMap.get(id);
  }

  function scrapePendingInvitesFromDomAndNg(ngSnap) {
    const invites = [];
    const seenKeys = new Set();

    // 1. Primary: Angular OnlinePlayGameInviteService incoming invite
    if (Array.isArray(ngSnap?.pendingInvites)) {
      for (const inv of ngSnap.pendingInvites) {
        if (inv && inv.fromName) {
          const key = `${inv.fromName.toLowerCase()}`;
          seenKeys.add(key);
          const id = String(inv.id || `ng-inv-${key}`);
          invites.push({
            ...inv,
            id,
            detectedAt: getStableInviteDetectedAt(id, inv.detectedAt),
          });
        }
      }
    }

    // 2. DOM Supplement: Avoid expensive queryAllDeep('*') unless a dialog/invite overlay exists,
    //    and throttle DOM invite fallback scraping to at most once every 1500ms.
    const hasInviteSurface = Boolean(
      document.querySelector(
        'ion-modal, ion-alert, [role="dialog"], [role="alertdialog"], app-incoming-game-invite-dialog, app-game-invite-dialog, .swal2-container, [class*="invite"]'
      )
    );

    if (!hasInviteSurface) {
      cachedDomInvites = [];
    } else {
      const now = Date.now();
      if (now - lastDomInviteScrapeAt >= 1500) {
        lastDomInviteScrapeAt = now;
        const freshDomInvites = [];
        const domSeenKeys = new Set();
        const acceptBtns = getAllClickableButtons().filter((b) => {
          const t = (b.textContent || '').trim().toLowerCase();
          return /^(accept|accept\s*invite|accept\s*challenge)$/.test(t);
        });

        for (const btn of acceptBtns) {
          let card = btn.parentElement;
          for (let d = 0; d < 6 && card && card.parentElement; d++) {
            const txt = (card.textContent || '').trim();
            if (
              txt.length >= 10 &&
              txt.length <= 320 &&
              /(invite|challenge|wants\s*to\s*play|501|301|701|decline|reject)/i.test(txt)
            ) {
              break;
            }
            card = card.parentElement;
          }
          if (!card) continue;
          const rawText = (card.textContent || '').replace(/\s+/g, ' ').trim();
          if (!/(invite|challenge|wants\s*to\s*play|decline|reject)/i.test(rawText)) continue;

          const invMatch = rawText.match(
            /^(.{2,28}?)\s+(?:invited\s+you|challenges?\s+you|wants\s+to\s+play)/i
          );
          const fromName = invMatch
            ? invMatch[1].trim()
            : rawText.split(/\s+/)[0]?.slice(0, 24) || 'Friend';

          const key = fromName.toLowerCase();
          if (domSeenKeys.has(key)) continue;
          domSeenKeys.add(key);

          const gameMatch = rawText.match(/(501|301|701)[^.\n]{0,40}/i);
          const summary = gameMatch ? gameMatch[0].trim() : 'Online Match Invite';
          const id = `dom-inv-${key.replace(/[^a-z0-9]/g, '').slice(0, 18)}`;

          freshDomInvites.push({
            id,
            fromName,
            summary,
            detectedAt: getStableInviteDetectedAt(id),
          });
        }
        cachedDomInvites = freshDomInvites;
      }

      for (const domInv of cachedDomInvites) {
        const key = domInv.fromName.toLowerCase();
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        invites.push(domInv);
      }
    }

    // Prune first-seen timestamps for invites that are no longer present
    const activeIds = new Set(invites.map((i) => i.id));
    for (const id of inviteFirstSeenMap.keys()) {
      if (!activeIds.has(id)) {
        inviteFirstSeenMap.delete(id);
      }
    }

    return invites;
  }

  /**
   * Exact Custom-Element DOM Scraper for DartCounter's <app-match-team-score> & <app-remaining-score>
   */
  function scrapeExactDartCounterMatchDom() {
    const teamScoreEls = Array.from(
      document.querySelectorAll('app-match-team-score')
    ).filter(isVisible);

    const remainingEls = Array.from(
      document.querySelectorAll('app-remaining-score')
    ).filter(isVisible);

    if (teamScoreEls.length === 0 && remainingEls.length === 0) {
      return null;
    }

    const cards = [];
    const targetTeamEls =
      teamScoreEls.length > 0
        ? teamScoreEls
        : remainingEls.map((r) => r.closest('app-match-team-score') || r.parentElement);

    for (const teamEl of targetTeamEls) {
      if (!teamEl) continue;
      const remEl =
        teamEl.tagName?.toLowerCase() === 'app-remaining-score'
          ? teamEl
          : teamEl.querySelector('app-remaining-score');
      const remTxt = (remEl?.textContent || '').trim();
      if (!/^\d{1,4}$/.test(remTxt)) continue;
      const score = parseInt(remTxt, 10);

      // Walk up to the player card container holding [appInGamePlayerName] / profile picture
      let playerCard = teamEl.parentElement;
      for (let d = 0; d < 6 && playerCard && playerCard !== document.body; d++) {
        if (
          playerCard.querySelector('[appInGamePlayerName], app-dartbot-profile-picture, app-profile-picture')
        ) {
          break;
        }
        playerCard = playerCard.parentElement;
      }
      const container = playerCard || teamEl;

      const isCpu = Boolean(container.querySelector('app-dartbot-profile-picture'));
      const nameNode = container.querySelector('[appInGamePlayerName]');
      let name = (nameNode?.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name && isCpu) {
        const cpuPic = container.querySelector('app-dartbot-profile-picture');
        const lvlTxt = (cpuPic?.textContent || '').replace(/\s+/g, ' ').trim();
        name = lvlTxt ? `DartBot (${lvlTxt})` : 'DartBot';
      }

      // Extract legs from <app-in-game-interim-score>
      let legs = 0;
      const interimEl = teamEl.querySelector('app-in-game-interim-score');
      if (interimEl) {
        const nums = (interimEl.innerText || '')
          .split(/\s+/)
          .map((s) => s.trim())
          .filter((s) => /^\d{1,2}$/.test(s));
        if (nums.length > 0) {
          legs = parseInt(nums[0], 10);
        }
      }

      // Extract 3-dart avg from <app-match-team-stats>
      let avg = null;
      const statsEl = teamEl.querySelector('app-match-team-stats');
      if (statsEl) {
        const lines = (statsEl.innerText || '')
          .split(/\n+/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          if (/3[-\s]?dart\s*avg/i.test(lines[i])) {
            const nextVal = parseFloat(lines[i + 1] || '');
            if (!Number.isNaN(nextVal) && nextVal >= 0 && nextVal <= 180) {
              avg = Number(nextVal.toFixed(1));
              break;
            }
          }
        }
      }

      const isCurrentTurnCard =
        Boolean(container.querySelector('.current-turn')) ||
        container.classList.contains('current-turn') ||
        teamEl.parentElement?.classList.contains('currentPlayerStats') ||
        !container.querySelector('.opacity-50');

      const rect = teamEl.getBoundingClientRect();
      cards.push({
        score,
        name: name || (isCpu ? 'DartBot' : 'Player'),
        isCpu,
        legs,
        avg,
        isCurrentTurnCard,
        left: rect.left,
        top: rect.top,
      });
    }

    if (cards.length === 0) return null;

    // Sort left-to-right or top-to-bottom
    cards.sort((a, b) => a.left - b.left || a.top - b.top);

    const desiredName = (settings.playerName || 'Callum').trim().toLowerCase();
    let meIdx = 0;
    if (cards.length >= 2) {
      const nonCpuIdx = cards.findIndex((c) => !c.isCpu);
      const nameIdx = cards.findIndex(
        (c) => !c.isCpu && desiredName && c.name.toLowerCase().includes(desiredName)
      );
      if (nameIdx !== -1) meIdx = nameIdx;
      else if (nonCpuIdx !== -1) meIdx = nonCpuIdx;
    }

    const me = cards[meIdx];
    const opp = cards.length >= 2 ? cards[1 - meIdx] : null;

    if (me.score > 501 || (opp && opp.score > 501)) {
      sessionStartScore = 701;
    } else if (
      me.score === 501 ||
      (opp && opp.score === 501) ||
      me.score > 301 ||
      (opp && opp.score > 301)
    ) {
      sessionStartScore = 501;
    } else if (me.score === 301 && (!opp || opp.score === 301)) {
      sessionStartScore = 301;
    }

    const pageHeader = (
      document.querySelector('app-page-layout [pagetitle]')?.textContent ||
      (document.body?.textContent || '').slice(0, 450)
    ).toLowerCase();

    const outRule = /straight\s*out/i.test(pageHeader) ? 'straight' : 'double';
    let legsToWin = 3;
    const firstToM = pageHeader.match(/first\s*to\s*(\d+)/i);
    const bestOfM = pageHeader.match(/best\s*of\s*(\d+)/i);
    if (firstToM) legsToWin = parseInt(firstToM[1], 10);
    else if (bestOfM) legsToWin = Math.ceil(parseInt(bestOfM[1], 10) / 2);

    // Angular mounts <app-keyboard-score-input> IF AND ONLY IF it is the human player's turn!
    const hasKeyboardScoreInput = Boolean(
      document.querySelector('app-keyboard-score-input')
    );

    const isPlayerTurn = hasKeyboardScoreInput || (me.isCurrentTurnCard && !opp?.isCurrentTurnCard);

    return {
      isMatchActive: true,
      startScore: sessionStartScore,
      outRule,
      legsToWin,
      playerName: me.name || settings.playerName || 'Callum',
      opponentName: opp?.name || 'DartBot',
      playerRemaining: me.score,
      opponentRemaining: opp ? opp.score : null,
      playerLegs: me.legs,
      opponentLegs: opp ? opp.legs : 0,
      playerAvg: me.avg,
      opponentAvg: opp ? opp.avg : null,
      isPlayerTurn,
    };
  }

  function scrapeDartCounterState() {
    const url = window.location.href;
    const ngSnap = readNgSnapshot();
    const onlineFriends = scrapeFriendsFromDomAndNg(ngSnap);
    const pendingInvites = scrapePendingInvitesFromDomAndNg(ngSnap);
    const outgoingInviteTo = ngSnap?.outgoingInviteTo || null;

    if (url !== lastMatchUrl) {
      lastMatchUrl = url;
      sessionStartScore = 501;
    }

    const isMatchComponentMounted = Boolean(
      document.querySelector('app-match-local-game, app-match-online-gameplay')
    );
    const isMatchRoute = /\/(game\/match|online-game\/match|local-tournament-game\/match|ranked\/match|match)(\/|$|\?)/i.test(
      url
    );

    if (isMatchComponentMounted || isMatchRoute) {
      // 1. Prefer MAIN-world Angular component state if available
      if (ngSnap?.matchState?.isMatchActive) {
        return {
          ...ngSnap.matchState,
          pendingInvites,
          onlineFriends,
          outgoingInviteTo,
          url,
          debug: {
            source: 'angular-lview',
            hasChMap: Boolean(ngSnap.hasChMap),
            hasScoreInput: Boolean(document.querySelector('app-keyboard-score-input')),
          },
          updatedAt: Date.now(),
        };
      }

      // 2. Exact Custom-Element DOM scraper (<app-remaining-score> + <app-match-team-score>)
      const domMatch = scrapeExactDartCounterMatchDom();
      if (domMatch) {
        return {
          ...domMatch,
          pendingInvites,
          onlineFriends,
          outgoingInviteTo,
          url,
          debug: {
            source: 'custom-elements-dom',
            hasScoreInput: Boolean(document.querySelector('app-keyboard-score-input')),
          },
          updatedAt: Date.now(),
        };
      }
    }

    return {
      isMatchActive: false,
      startScore: 501,
      outRule: 'double',
      legsToWin: 3,
      playerName: ngSnap?.authUserName || settings.playerName || 'Callum',
      opponentName: 'DartCounter Opponent',
      playerRemaining: 501,
      opponentRemaining: null,
      playerLegs: 0,
      opponentLegs: 0,
      playerAvg: null,
      opponentAvg: null,
      isPlayerTurn: true,
      pendingInvites,
      onlineFriends,
      outgoingInviteTo,
      url,
      debug: {
        source: 'standby',
        hasChMap: Boolean(ngSnap?.hasChMap),
        friendsCount: onlineFriends.length,
      },
      updatedAt: Date.now(),
    };
  }

  function pushStateIfChanged(force = false) {
    if (tornDown) return;
    const state = scrapeDartCounterState();
    lastScrapedState = state;
    const { updatedAt: _omit, pendingInvites, ...rest } = state;
    const comparable = {
      ...rest,
      pendingInvites: Array.isArray(pendingInvites)
        ? pendingInvites.map(({ detectedAt: _ts, ...inv }) => inv)
        : [],
    };
    const hash = JSON.stringify(comparable);
    if (force || hash !== lastStateHash) {
      lastStateHash = hash;
      renderHud();
      safeSendMessage({ type: 'dc_state_update', state }, (resp) => {
        if (resp) {
          const prevConnected = kioskConnected;
          const prevMode = settings.mode;
          const prevPaused = settings.paused;
          kioskConnected = Boolean(resp.kioskConnected);
          if (resp.settings) settings = { ...settings, ...resp.settings };
          if (
            prevConnected !== kioskConnected ||
            prevMode !== settings.mode ||
            prevPaused !== settings.paused
          ) {
            renderHud();
          }
        }
      });
    }
  }

  // =========================================================================
  // SCORE SUBMISSION & AUTO-DIALOG HANDLING INTO DARTCOUNTER WEB
  // =========================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function simulateClick(el) {
    if (!el) return;
    try {
      el.focus?.();
    } catch {
      // ignore
    }
    el.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 })
    );
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 })
    );
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();
  }

  function reportSubmitResult(visitId, ok, score, message) {
    lastSubmitMessage = message;
    renderHud();
    safeSendMessage({
      type: 'dc_submit_result',
      result: {
        visitId,
        ok,
        score,
        message,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Automatically handles <app-darts-for-throwout-dialog>, <app-match-confirm-throwout-dialog>,
   * and SweetAlert bust confirmation dialogs via DOM when they appear after score entry.
   */
  async function autoHandlePostSubmitDialogsDom(visit) {
    for (let i = 0; i < 14; i++) {
      await sleep(170);

      // 1. <app-darts-for-throwout-dialog> ("Darts used on a double" / "Darts used for checkout")
      const throwoutDlg = document.querySelector('app-darts-for-throwout-dialog');
      if (throwoutDlg && isVisible(throwoutDlg)) {
        const sections = Array.from(
          throwoutDlg.querySelectorAll('div.flex.flex-col.space-y-3')
        );
        for (const sec of sections) {
          const title = (sec.innerText || '').toLowerCase();
          const btns = Array.from(sec.querySelectorAll('button')).filter(isVisible);
          if (/double/i.test(title)) {
            const desiredD = String(
              typeof visit.dartsAtDouble === 'number'
                ? visit.dartsAtDouble
                : visit.isCheckout
                ? 1
                : 0
            );
            const matchBtn = btns.find((b) => (b.textContent || '').trim() === desiredD);
            if (matchBtn) simulateClick(matchBtn);
          } else if (/checkout|finish/i.test(title)) {
            const desiredF = String(visit.dartsUsed || 3);
            const matchBtn =
              btns.find((b) => (b.textContent || '').trim() === desiredF) ||
              btns[btns.length - 1];
            if (matchBtn) simulateClick(matchBtn);
          }
        }
        await sleep(90);
        const confirmBtn =
          throwoutDlg.querySelector('[footer] button, button[dcbutton]') ||
          Array.from(throwoutDlg.querySelectorAll('button')).find((b) =>
            /confirm/i.test((b.textContent || '').trim())
          );
        if (confirmBtn) {
          simulateClick(confirmBtn);
          return;
        }
      }

      // 2. <app-match-confirm-throwout-dialog> ("Confirm checkout")
      const confirmCheckoutDlg = document.querySelector(
        'app-match-confirm-throwout-dialog'
      );
      if (confirmCheckoutDlg && isVisible(confirmCheckoutDlg)) {
        const confirmBtn = confirmCheckoutDlg.querySelector(
          'button[dcbutton], button'
        );
        if (confirmBtn) {
          simulateClick(confirmBtn);
          return;
        }
      }

      // 3. SweetAlert2 / Alert dialog ("You have bust your score, confirm to continue")
      const swalConfirm = document.querySelector('.swal2-confirm');
      if (swalConfirm && isVisible(swalConfirm)) {
        simulateClick(swalConfirm);
        return;
      }
    }
  }

  async function submitVisitToDartCounter(visit) {
    if (!visit || typeof visit.score !== 'number') return;
    if (visit.id && submittedVisitIds.has(visit.id)) return;

    if (settings.paused) {
      reportSubmitResult(visit.id, false, visit.score, 'Bridge paused — score not entered');
      return;
    }

    const isOnMatchScreen =
      Boolean(
        document.querySelector(
          'app-match-local-game, app-match-online-gameplay, app-remaining-score, app-keyboard-score-input'
        )
      ) || /\/(game\/match|online-game\/match|local-tournament-game\/match|ranked\/match|match)(\/|$|\?)/i.test(window.location.href);

    if (!isOnMatchScreen) {
      reportSubmitResult(visit.id, false, visit.score, 'No active DartCounter match screen');
      return;
    }

    // 1. Primary: Ask MAIN-world Angular bridge to submit directly to MatchComponent / KeyboardScoreInputComponent
    //    Timeout (6000ms) sits cleanly above page-bridge.js's capped 3.5s readiness loop to prevent double-submission.
    const ngRes = await sendPageBridgeCommand('submit_visit', { visit }, 6000);
    if (ngRes && ngRes.handled && ngRes.ok) {
      rememberSubmittedVisit(visit.id);
      reportSubmitResult(visit.id, true, visit.score, ngRes.message);
      setTimeout(() => pushStateIfChanged(true), 350);
      setTimeout(() => pushStateIfChanged(true), 1200);
      return;
    }

    // 2. DOM Fallback: Wait up to 4s for <app-keyboard-score-input> to appear (e.g. while DartBot finishes throwing)
    let kbContainer = document.querySelector('app-keyboard-score-input');
    for (let w = 0; w < 20 && !kbContainer; w++) {
      await sleep(200);
      kbContainer = document.querySelector('app-keyboard-score-input');
    }

    if (!kbContainer) {
      reportSubmitResult(
        visit.id,
        false,
        visit.score,
        'Waiting for your turn in DartCounter...'
      );
      return;
    }

    const scoreStr = String(Math.max(0, Math.min(180, Math.round(visit.score))));
    const submitBtn = kbContainer.querySelector('button.submit-button');

    // Strategy A: <app-keyboard-score-input> numeric text input (default keyboard="none" on Web!)
    const scoreInput = kbContainer.querySelector(
      'input[inputmode="numeric"], input[type="text"], input[type="number"]'
    );
    if (scoreInput) {
      rememberSubmittedVisit(visit.id);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(scoreInput, scoreStr);
      } else {
        scoreInput.value = scoreStr;
      }
      scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
      scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(50);

      if (submitBtn) {
        simulateClick(submitBtn);
      } else {
        scoreInput.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          })
        );
      }

      reportSubmitResult(
        visit.id,
        true,
        visit.score,
        `Submitted ${scoreStr} to DartCounter (${(visit.throws || []).join(' • ')})`
      );
      void autoHandlePostSubmitDialogsDom(visit);
      setTimeout(() => pushStateIfChanged(true), 350);
      setTimeout(() => pushStateIfChanged(true), 1200);
      return;
    }

    // Strategy B: <app-numbers-keyboard> on-screen 0-9 keypad + submit-button
    const numbersKb = document.querySelector('app-numbers-keyboard');
    if (numbersKb) {
      rememberSubmittedVisit(visit.id);
      const keyBtns = Array.from(numbersKb.querySelectorAll('button.key'));
      for (const ch of scoreStr) {
        const dBtn = keyBtns.find((b) => (b.textContent || '').trim() === ch);
        if (dBtn) {
          simulateClick(dBtn);
          await sleep(55);
        }
      }
      await sleep(60);
      if (submitBtn) {
        simulateClick(submitBtn);
      }
      reportSubmitResult(
        visit.id,
        true,
        visit.score,
        `Entered ${scoreStr} via DartCounter keypad`
      );
      void autoHandlePostSubmitDialogsDom(visit);
      setTimeout(() => pushStateIfChanged(true), 350);
      return;
    }

    reportSubmitResult(visit.id, false, visit.score, 'Could not locate DartCounter score input');
  }

  // =========================================================================
  // REMOTE IPAD CONTROLLER ACTIONS (DartBot, Online Friends, Invites, Undo)
  // =========================================================================
  function reportControlResult(action, ok, message) {
    lastSubmitMessage = message;
    renderHud();
    safeSendMessage({
      type: 'dc_control_result',
      result: {
        action,
        ok,
        message,
        timestamp: Date.now(),
      },
    });
  }

  function savePendingCommandForReload(cmd) {
    try {
      sessionStorage.setItem(
        PENDING_CMD_STORAGE_KEY,
        JSON.stringify({ cmd, savedAt: Date.now() })
      );
    } catch {
      // ignore
    }
  }

  function consumePendingCommandAfterReload() {
    try {
      const raw = sessionStorage.getItem(PENDING_CMD_STORAGE_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(PENDING_CMD_STORAGE_KEY);
      const parsed = JSON.parse(raw);
      if (parsed && parsed.cmd && Date.now() - (parsed.savedAt || 0) < 18000) {
        return parsed.cmd;
      }
    } catch {
      // ignore
    }
    return null;
  }

  async function executeDomStartDartBotFallback(cmd) {
    const startScore = cmd.startScore === 301 || cmd.startScore === 701 ? cmd.startScore : 501;
    const outRule = cmd.outRule === 'straight' ? 'straight' : 'double';
    const botLevel = Math.max(1, Math.min(20, Number(cmd.botLevel || 4)));

    if (!window.location.pathname.includes('/local-games/match')) {
      savePendingCommandForReload(cmd);
      window.location.href = 'https://app.dartcounter.net/local-games/match';
      return;
    }

    // Wait up to 3.5s for <app-match-new-game>
    for (let i = 0; i < 18; i++) {
      if (document.querySelector('app-match-new-game')) break;
      await sleep(200);
    }

    // Close explanation dialog if open
    const expClose = document.querySelector(
      'app-local-game-explanation-dialog button[dcbutton]'
    );
    if (expClose && isVisible(expClose)) {
      simulateClick(expClose);
      await sleep(200);
    }

    // Click "Play vs. DartBot" button if DartBot is not yet active
    const hasDartBotAvatar = Boolean(
      document.querySelector('app-games-local-add-player app-dartbot-profile-picture')
    );
    const playVsBotBtn = Array.from(
      document.querySelectorAll('app-new-local-game-layout button')
    ).find((b) => /play\s*vs\.?\s*dartbot/i.test((b.textContent || '').trim()));

    if (playVsBotBtn && !hasDartBotAvatar) {
      simulateClick(playVsBotBtn);
      await sleep(320);
      const botDlgConfirm = document.querySelector(
        'app-dartbot-settings-dialog button[type="submit"], app-dartbot-settings-dialog button[dcbutton]'
      );
      if (botDlgConfirm) {
        simulateClick(botDlgConfirm);
        await sleep(250);
      }
    }

    // Click startScore (301 / 501 / 701) button
    const scoreBtns = Array.from(
      document.querySelectorAll('app-match-new-game button[dclistswitch]')
    );
    const targetScoreBtn = scoreBtns.find(
      (b) => (b.textContent || '').trim() === String(startScore)
    );
    if (targetScoreBtn) {
      simulateClick(targetScoreBtn);
      await sleep(120);
    }

    // Click Finish Mode (Double out / Straight out)
    const outPattern = outRule === 'straight' ? /straight\s*out/i : /double\s*out/i;
    const outBtn = scoreBtns.find((b) => outPattern.test((b.textContent || '').trim()));
    if (outBtn) {
      simulateClick(outBtn);
      await sleep(120);
    }

    // Click "Start game" button at bottom of <app-new-local-game-layout>
    const startGameBtn = Array.from(
      document.querySelectorAll('app-new-local-game-layout button[dcbutton]')
    ).find((b) => /start\s*game/i.test((b.textContent || '').trim()));

    if (startGameBtn) {
      simulateClick(startGameBtn);
      for (let s = 0; s < 14; s++) {
        await sleep(240);
        if (window.location.pathname.includes('/game/match')) break;
        const skipBtn = Array.from(document.querySelectorAll('button')).find((b) =>
          /^(skip\s*and\s*start|skip|continue\s*anyway|ok)$/i.test(
            (b.textContent || '').trim()
          )
        );
        if (skipBtn && isVisible(skipBtn)) {
          simulateClick(skipBtn);
        }
      }
      reportControlResult(
        'start_dartbot',
        true,
        `Started DartBot Lv.${botLevel} • ${startScore}`
      );
      setTimeout(() => pushStateIfChanged(true), 800);
    } else {
      reportControlResult(
        'start_dartbot',
        false,
        'Opened DartCounter setup — tap Start Game if prompted'
      );
    }
  }

  async function executeControlCommand(cmd) {
    if (!cmd || !cmd.action) return;
    const action = cmd.action;

    try {
      // 1. Try MAIN-world Angular bridge first
      const ngRes = await sendPageBridgeCommand(
        action,
        { command: cmd },
        action === 'start_dartbot' ? 8500 : 4500
      );

      if (ngRes && ngRes.handled) {
        reportControlResult(action, Boolean(ngRes.ok), ngRes.message || `Executed ${action}`);
        setTimeout(() => pushStateIfChanged(true), 450);
        setTimeout(() => pushStateIfChanged(true), 1400);
        return;
      }

      if (ngRes && ngRes.needNavigate) {
        savePendingCommandForReload(cmd);
        window.location.href = `https://app.dartcounter.net${ngRes.needNavigate}`;
        return;
      }

      // 2. DOM Fallbacks
      if (action === 'start_dartbot') {
        await executeDomStartDartBotFallback(cmd);
        return;
      }

      if (action === 'open_friends' || action === 'refresh_friends') {
        if (
          action === 'open_friends' &&
          !window.location.pathname.includes('/friends-lobby')
        ) {
          window.location.href = 'https://app.dartcounter.net/friends-lobby';
          reportControlResult(action, true, 'Opening DartCounter Friends Lobby...');
          return;
        }
        pushStateIfChanged(true);
        reportControlResult(action, true, 'Refreshed DartCounter Friends');
        return;
      }

      if (action === 'open_online') {
        if (!window.location.pathname.includes('/online-games')) {
          window.location.href = 'https://app.dartcounter.net/online-games';
        }
        reportControlResult(action, true, 'Opened DartCounter Online Lobby');
        return;
      }

      if (action === 'invite_friend') {
        if (!window.location.pathname.includes('/friends-lobby')) {
          savePendingCommandForReload(cmd);
          window.location.href = 'https://app.dartcounter.net/friends-lobby';
          return;
        }
        const rows = Array.from(
          document.querySelectorAll('app-friends-lobby [role="listitem"], app-friends-lobby [friendrow]')
        );
        const needle = String(cmd.friendName || '').toLowerCase();
        const targetRow = rows.find((r) => (r.innerText || '').toLowerCase().includes(needle));
        const inviteBtn = targetRow
          ? Array.from(targetRow.querySelectorAll('button')).find((b) =>
              /invite/i.test((b.textContent || '').trim())
            )
          : null;
        if (inviteBtn) {
          simulateClick(inviteBtn);
          await sleep(350);
          const sendBtn = document.querySelector(
            'app-send-game-invite-dialog button[dcbutton]'
          );
          if (sendBtn) simulateClick(sendBtn);
          reportControlResult(action, true, `Invited ${cmd.friendName} to play!`);
        } else {
          reportControlResult(action, false, `Could not find Invite button for ${cmd.friendName}`);
        }
        return;
      }

      if (action === 'accept_invite' || action === 'decline_invite') {
        const isAccept = action === 'accept_invite';
        const rx = isAccept
          ? /^(accept|join|accept\s*invite|accept\s*challenge)$/i
          : /^(decline|reject|cancel|dismiss)$/i;
        const btn = getAllClickableButtons().find((b) =>
          rx.test((b.textContent || '').trim())
        );
        if (btn) {
          simulateClick(btn);
          reportControlResult(
            action,
            true,
            isAccept ? 'Accepted friend invite!' : 'Declined friend invite'
          );
        } else {
          reportControlResult(action, false, 'No active invite popup visible');
        }
        return;
      }

      if (action === 'undo_score') {
        const undoBtn =
          document.querySelector(
            'app-keyboard-score-input app-icon[icon="undo_outline"], app-numbers-keyboard app-icon[icon="undo_outline"]'
          )?.closest('button') ||
          getAllClickableButtons().find((b) => /^undo$/i.test((b.textContent || '').trim()));
        if (undoBtn) {
          simulateClick(undoBtn);
          reportControlResult(action, true, 'Undid last score in DartCounter');
        } else {
          reportControlResult(action, false, 'Undo button not available');
        }
        return;
      }

      if (action === 'rematch') {
        const rematchBtn = getAllClickableButtons().find((b) =>
          /^(rematch|play\s*again)$/i.test((b.textContent || '').trim())
        );
        if (rematchBtn) {
          simulateClick(rematchBtn);
          reportControlResult(action, true, 'Started Rematch in DartCounter');
        } else {
          reportControlResult(action, false, 'Rematch button not visible yet');
        }
        return;
      }

      if (action === 'leave_match') {
        window.location.href = 'https://app.dartcounter.net/local-games/match';
        reportControlResult(action, true, 'Left DartCounter match');
        return;
      }
    } catch (err) {
      reportControlResult(action, false, `Control error: ${err?.message || String(err)}`);
    }
  }

  // =========================================================================
  // MESSAGE LISTENERS + OBSERVERS
  // =========================================================================
  try {
    chrome.runtime?.onMessage?.addListener((msg) => {
      if (tornDown || !msg || typeof msg !== 'object') return;
      if (msg.type === 'bridge_status') {
        kioskConnected = Boolean(msg.kioskConnected);
        if (msg.settings) settings = { ...settings, ...msg.settings };
        renderHud();
      } else if (msg.type === 'submit_visit' && msg.visit) {
        if (msg.settings) settings = { ...settings, ...msg.settings };
        void submitVisitToDartCounter(msg.visit);
      } else if (msg.type === 'dc_control_command' && msg.command) {
        void executeControlCommand(msg.command);
      } else if (msg.type === 'force_scrape') {
        pushStateIfChanged(true);
      }
    });
  } catch {
    // ignore
  }

  window.addEventListener('ad-dc-ng-snapshot', onNgSnapshot);

  safeSendMessage({ type: 'content_heartbeat' }, (resp) => {
    if (resp) {
      kioskConnected = Boolean(resp.kioskConnected);
      if (resp.settings) settings = { ...settings, ...resp.settings };
      renderHud();
    }
    pushStateIfChanged(true);
  });

  // Resume any pending command that triggered a route navigation reload
  setTimeout(() => {
    if (tornDown) return;
    const pendingCmd = consumePendingCommandAfterReload();
    if (pendingCmd) {
      void executeControlCommand(pendingCmd);
    }
  }, 650);

  pollIntervalId = setInterval(() => {
    if (tornDown) return;
    ensureMainWorldPageBridge();
    pushStateIfChanged(false);
    safeSendMessage({ type: 'content_heartbeat' }, (resp) => {
      if (resp) {
        const changed =
          kioskConnected !== Boolean(resp.kioskConnected) ||
          (resp.settings &&
            (settings.mode !== resp.settings.mode || settings.paused !== resp.settings.paused));
        kioskConnected = Boolean(resp.kioskConnected);
        if (resp.settings) settings = { ...settings, ...resp.settings };
        if (changed) renderHud();
      }
    });
  }, 950);

  function isIgnoredMutation(m) {
    if (!m) return true;
    if (m.type === 'attributes' && m.attributeName === 'data-ad-ng-snapshot') {
      return true;
    }
    const target = m.target;
    if (!target) return true;
    if (hudEl) {
      if (target === hudEl) return true;
      if (target.nodeType === 1 && hudEl.contains(target)) return true;
      if (target.parentNode && hudEl.contains(target.parentNode)) return true;
    }
    if (
      target.nodeType === 1 &&
      (target.id === 'ad-dc-bridge-hud' || target.closest?.('#ad-dc-bridge-hud'))
    ) {
      return true;
    }
    return false;
  }

  observer = new MutationObserver((mutations) => {
    if (tornDown) return;
    const hasRelevant = mutations.some((m) => !isIgnoredMutation(m));
    if (!hasRelevant) return;
    if (mutTimer) return;
    mutTimer = setTimeout(() => {
      mutTimer = null;
      pushStateIfChanged(false);
    }, 150);
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  renderHud();
})();
