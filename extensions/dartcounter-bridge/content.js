// Autodarts <-> Target DartCounter Web Content Script
// Runs on https://app.dartcounter.net/*
// - Option A: Scrapes live match state (scores, opponent, legs, turn) -> streams to Kiosk TV
// - Option B: Receives Autodarts visit totals -> enters them via DartCounter's keypad / input

(() => {
  if (window.__AUTODARTS_DC_BRIDGE_LOADED__) return;
  window.__AUTODARTS_DC_BRIDGE_LOADED__ = true;

  let kioskConnected = false;
  let settings = {
    kioskUrl: 'http://127.0.0.1:5173',
    playerName: 'Callum',
    mode: 'auto',
    paused: false,
  };

  let lastStateHash = '';
  let lastScrapedState = null;
  let lastSubmitMessage = '';
  let sessionStartScore = 501;
  let lastMatchUrl = '';
  const submittedVisitIds = new Set();

  // =========================================================================
  // COMPACT FLOATING HUD PILL (Bottom-Right of DartCounter Web)
  // =========================================================================
  let hudEl = null;
  let hudCollapsed = false;

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
      border: '1px solid rgba(16, 185, 129, 0.45)',
      borderRadius: '14px',
      padding: '8px 12px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: '11px',
      lineHeight: '1.35',
      boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
      backdropFilter: 'blur(8px)',
      maxWidth: '300px',
      userSelect: 'none',
    });
    document.body.appendChild(el);
    hudEl = el;
    return el;
  }

  function renderHud() {
    if (!document.body) return;
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

    if (hudCollapsed) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;cursor:pointer;" id="ad-hud-toggle">
          <span style="width:8px;height:8px;border-radius:999px;background:${dotColor};display:inline-block;"></span>
          <strong style="letter-spacing:0.04em;">AD BRIDGE</strong>
          <span style="color:#94A3B8;">${modeLabel}</span>
        </div>
      `;
      el.querySelector('#ad-hud-toggle')?.addEventListener('click', () => {
        hudCollapsed = false;
        renderHud();
      });
      return;
    }

    const matchLine = lastScrapedState?.isMatchActive
      ? `${lastScrapedState.playerName}: <strong>${lastScrapedState.playerRemaining}</strong> vs ${lastScrapedState.opponentName}: <strong>${lastScrapedState.opponentRemaining ?? '—'}</strong> (${lastScrapedState.playerLegs}-${lastScrapedState.opponentLegs})`
      : 'Waiting for DartCounter match...';

    const turnBadge = lastScrapedState?.isMatchActive
      ? lastScrapedState.isPlayerTurn
        ? '<span style="color:#34D399;font-weight:700;">YOUR TURN</span>'
        : '<span style="color:#FBBF24;font-weight:700;">OPP TURN</span>'
      : '';

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="width:8px;height:8px;border-radius:999px;background:${dotColor};display:inline-block;"></span>
          <strong style="font-size:11px;letter-spacing:0.05em;">AUTODARTS BRIDGE</strong>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="padding:1px 6px;border-radius:6px;background:rgba(16,185,129,0.16);border:1px solid rgba(16,185,129,0.35);color:#6EE7B7;font-size:10px;font-weight:700;">${modeLabel}</span>
          <button id="ad-hud-pause" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#E2E8F0;border-radius:6px;padding:1px 6px;cursor:pointer;font-size:10px;">${settings.paused ? 'Resume' : 'Pause'}</button>
          <button id="ad-hud-min" style="background:transparent;border:none;color:#94A3B8;cursor:pointer;font-size:12px;padding:0 2px;">–</button>
        </div>
      </div>
      <div style="color:#CBD5E1;font-size:10.5px;">${matchLine} ${turnBadge}</div>
      ${
        lastSubmitMessage
          ? `<div style="color:#38BDF8;font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lastSubmitMessage}</div>`
          : ''
      }
    `;

    el.querySelector('#ad-hud-min')?.addEventListener('click', () => {
      hudCollapsed = true;
      renderHud();
    });
    el.querySelector('#ad-hud-pause')?.addEventListener('click', () => {
      settings.paused = !settings.paused;
      chrome.runtime.sendMessage({
        type: 'popup_update_settings',
        partial: { paused: settings.paused },
      });
      renderHud();
    });
  }

  // =========================================================================
  // DOM HELPERS
  // =========================================================================
  const STAT_LABEL_REGEX =
    /^(3[-\s]?dart\s*avg\.?|avg\.?|average|3da|first\s*9.*|legs?|sets?|darts?(\s*thrown)?|last\s*(score|visit)?|score|checkout|turn|bust|match|double\s*out|straight\s*out|best\s*of.*|first\s*to.*|undo|submit|enter|clear|ok|miss|no\s*score|ton\+?)$/i;

  function isVisible(el) {
    if (!el || el.id === 'ad-dc-bridge-hud' || el.closest('#ad-dc-bridge-hud')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0.05
    );
  }

  function isStatValueElement(el) {
    // Check immediate parent / sibling labels so we never mistake "3-dart avg: 0" or "Darts: 0" for remaining score
    const parentText = (el.parentElement?.innerText || '').trim().toLowerCase();
    const numText = (el.textContent || '').trim();
    if (parentText.length <= 45) {
      const withoutNum = parentText.replace(numText, '').trim();
      if (
        /(3[-\s]?dart|avg|average|first\s*9|darts\s*thrown|last\s*score|last\s*visit|legs?|sets?|checkout|highest)/i.test(
          withoutNum
        )
      ) {
        return true;
      }
    }
    const prevText = (el.previousElementSibling?.textContent || '').trim().toLowerCase();
    const nextText = (el.nextElementSibling?.textContent || '').trim().toLowerCase();
    const nearText = `${prevText} ${nextText}`;
    if (/(3[-\s]?dart|avg|average|first\s*9|darts\s*thrown|last\s*score|legs?|sets?)/i.test(nearText)) {
      return true;
    }
    return false;
  }

  // =========================================================================
  // KEYPAD & SUBMIT BUTTON FINDER (Handles text buttons AND SVG-icon buttons!)
  // =========================================================================
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
      'button, [role="button"], ion-button, a.button, [class*="key" i], [class*="btn" i]'
    ).filter((el) => {
      if (!isVisible(el)) return false;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      // Avoid picking giant outer wrapper divs that happen to have "btn" in className
      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.65 || rect.height > 180) return false;
      return true;
    });
  }

  function findKeypadContext() {
    const clickables = getAllClickableButtons();
    const digitMap = new Map();

    // Prefer actual <button> / [role="button"] / ion-button with exact single digit 0-9
    for (const el of clickables) {
      const txt = (el.textContent || '').trim();
      if (/^[0-9]$/.test(txt)) {
        const existing = digitMap.get(txt);
        // Prefer lower-half / smaller keypad button over any random header badge
        if (!existing || el.getBoundingClientRect().top > existing.getBoundingClientRect().top) {
          digitMap.set(txt, el);
        }
      }
    }

    if (digitMap.size < 8) {
      return { digitMap, keypadRoot: null, submitBtn: null, clearBtn: null, submitHint: 'no-keypad' };
    }

    // Find lowest common ancestor containing digits '1', '5', '9', '0'
    const sampleBtns = ['1', '5', '9', '0'].map((d) => digitMap.get(d)).filter(Boolean);
    let keypadRoot = sampleBtns[0]?.parentElement || document.body;
    while (keypadRoot && keypadRoot !== document.body) {
      if (sampleBtns.every((b) => keypadRoot.contains(b))) break;
      keypadRoot = keypadRoot.parentElement;
    }

    const keypadButtons = Array.from(
      (keypadRoot || document).querySelectorAll('button, [role="button"], ion-button')
    ).filter((b) => isVisible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');

    const digitBtnSet = new Set(digitMap.values());
    const nonDigitKeypadBtns = keypadButtons.filter((b) => !digitBtnSet.has(b));

    // Find Clear / Backspace button inside keypad
    let clearBtn = null;
    for (const btn of nonDigitKeypadBtns) {
      const txt = (btn.textContent || '').trim().toLowerCase();
      const aria = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`.toLowerCase();
      if (
        /^(c|clr|clear|del|delete|back|undo|⌫|←|✕|×|x)$/.test(txt) ||
        /(clear|backspace|delete|erase)/.test(aria)
      ) {
        clearBtn = btn;
        break;
      }
    }

    // Find Submit / Enter button inside keypad (4 layered strategies!)
    let submitBtn = null;
    let submitHint = 'none';

    // Strategy 1: Explicit text or aria-label match anywhere in keypad or page
    const allSubmitPool = [...nonDigitKeypadBtns, ...clickables.filter((b) => !digitBtnSet.has(b))];
    for (const btn of allSubmitPool) {
      if (btn === clearBtn) continue;
      const txt = (btn.textContent || '').trim().toLowerCase();
      const aria = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`.toLowerCase();
      if (
        /^(enter|submit|ok|confirm|✓|✔|score|done|go|send|next|no\s*score)$/.test(txt) ||
        /(enter|submit|confirm|check|send|score)/.test(aria)
      ) {
        submitBtn = btn;
        submitHint = `text:${txt || aria}`;
        break;
      }
    }

    // Strategy 2: Accent green/emerald/teal/blue submit button inside keypad
    if (!submitBtn) {
      for (const btn of nonDigitKeypadBtns) {
        if (btn === clearBtn) continue;
        const style = window.getComputedStyle(btn);
        const bg = style.backgroundColor || '';
        const cls = String(btn.className || '').toLowerCase();
        const m = bg.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
        const isGreenish = m && Number(m[2]) > 110 && Number(m[2]) > Number(m[1]) + 25;
        if (isGreenish || /(submit|enter|confirm|success|green|emerald|primary|ok)/.test(cls)) {
          submitBtn = btn;
          submitHint = `accent:${bg || cls.slice(0, 24)}`;
          break;
        }
      }
    }

    // Strategy 3: Positional — bottom-right non-digit button in the keypad (right of '0'!)
    if (!submitBtn) {
      const zeroBtn = digitMap.get('0');
      const zeroRect = zeroBtn ? zeroBtn.getBoundingClientRect() : null;
      const candidates = nonDigitKeypadBtns
        .filter((b) => b !== clearBtn)
        .map((b) => ({ btn: b, rect: b.getBoundingClientRect() }))
        .filter(({ rect }) => {
          if (!zeroRect) return true;
          // Same bottom row as '0' and to the right of '0', OR full-width submit bar below '0'
          const rightOfZero =
            rect.left >= zeroRect.right - 12 &&
            Math.abs(rect.top - zeroRect.top) <= Math.max(55, zeroRect.height);
          const belowZero = rect.top >= zeroRect.bottom - 10 && rect.width >= zeroRect.width;
          return rightOfZero || belowZero;
        })
        .sort((a, b) => b.rect.bottom - a.rect.bottom || b.rect.right - a.rect.right);

      if (candidates.length > 0) {
        submitBtn = candidates[0].btn;
        submitHint = `pos:${(submitBtn.textContent || 'icon').trim().slice(0, 14)}`;
      }
    }

    // Strategy 4: Last non-digit button in keypad (excluding clear/undo)
    if (!submitBtn && nonDigitKeypadBtns.length > 0) {
      const fallback = nonDigitKeypadBtns.filter((b) => b !== clearBtn);
      if (fallback.length > 0) {
        submitBtn = fallback[fallback.length - 1];
        submitHint = `fallback:${(submitBtn.textContent || 'icon').trim().slice(0, 14)}`;
      }
    }

    return { digitMap, keypadRoot, submitBtn, clearBtn, submitHint };
  }

  // =========================================================================
  // OPTION A: RESILIENT DARTCOUNTER LIVE MATCH DOM SCRAPER
  // =========================================================================
  function extractCardMeta(scoreEl) {
    const scoreNum = parseInt((scoreEl.textContent || '').trim(), 10);

    // Walk up 1–5 levels to find the enclosing single-player scoreboard card
    let card = scoreEl.parentElement;
    let bestCard = card;
    for (let depth = 0; depth < 5 && card && card.parentElement; depth++) {
      const rect = card.getBoundingClientRect();
      // Single-player card on DartCounter is typically 15%–55% of viewport width and <= 45% height
      if (
        rect.width >= 100 &&
        rect.width <= window.innerWidth * 0.62 &&
        rect.height >= 65 &&
        rect.height <= window.innerHeight * 0.55
      ) {
        bestCard = card;
        // If this container already contains a non-stat player name, we found the card!
        const lines = (card.innerText || '')
          .split(/\n+/)
          .map((l) => l.trim())
          .filter(Boolean);
        const hasName = lines.some(
          (l) =>
            /[a-zA-Z]{2,}/.test(l) &&
            !STAT_LABEL_REGEX.test(l) &&
            !/^\d+(\.\d+)?$/.test(l)
        );
        if (hasName) break;
      }
      card = card.parentElement;
    }

    const container = bestCard || scoreEl.parentElement || scoreEl;
    const rawLines = (container.innerText || '')
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Extract player name (strictly skipping stat labels like "3-dart avg.")
    let name = '';
    for (const line of rawLines) {
      const clean = line.replace(/\s+/g, ' ').trim();
      if (
        /[a-zA-Z]{2,}/.test(clean) &&
        !STAT_LABEL_REGEX.test(clean) &&
        !/3[-\s]?dart/i.test(clean) &&
        !/avg/i.test(clean) &&
        !/first\s*9/i.test(clean) &&
        !/darts?\s*thrown/i.test(clean) &&
        !/last\s*score/i.test(clean) &&
        !/^\d+(\.\d+)?$/.test(clean)
      ) {
        name = clean.slice(0, 28);
        break;
      }
    }

    // Extract 3-dart average (prefer decimals like 48.50 or value right next to "3-dart avg.")
    let avg = null;
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (/3[-\s]?dart\s*avg|average|3da/i.test(line)) {
        const inlineMatch = line.match(/(\d{1,3}(?:\.\d{1,2})?)/);
        const nextLine = rawLines[i + 1] || '';
        const prevLine = rawLines[i - 1] || '';
        const candidateStr =
          (inlineMatch && !/^3$/.test(inlineMatch[1]) ? inlineMatch[1] : null) ||
          (/^\d{1,3}(?:\.\d{1,2})?$/.test(nextLine) ? nextLine : null) ||
          (/^\d{1,3}(?:\.\d{1,2})?$/.test(prevLine) ? prevLine : null);
        if (candidateStr) {
          const val = parseFloat(candidateStr);
          if (val >= 0 && val <= 180) {
            avg = val;
            break;
          }
        }
      }
    }
    if (avg === null) {
      for (const line of rawLines) {
        const decMatch = line.match(/^(\d{1,3}\.\d{1,2})$/);
        if (decMatch) {
          const val = parseFloat(decMatch[1]);
          if (val >= 0 && val <= 180) {
            avg = val;
            break;
          }
        }
      }
    }

    // Extract legs won (0..25)
    let legs = 0;
    const legEl = container.querySelector('[class*="leg" i], [data-testid*="leg" i]');
    if (legEl && /^\d{1,2}$/.test((legEl.textContent || '').trim())) {
      legs = parseInt((legEl.textContent || '').trim(), 10);
    } else {
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const m = line.match(/^legs?\s*[:=]?\s*(\d{1,2})$/i);
        if (m) {
          legs = parseInt(m[1], 10);
          break;
        }
        if (/^legs?$/i.test(line) && /^\d{1,2}$/.test(rawLines[i + 1] || '')) {
          legs = parseInt(rawLines[i + 1], 10);
          break;
        }
      }
    }

    // Detect active turn visual cues
    const classStr = `${container.className || ''} ${scoreEl.className || ''}`.toLowerCase();
    const style = window.getComputedStyle(container);
    const borderColor = (style.borderColor || '').toLowerCase();
    const bgColor = (style.backgroundColor || '').toLowerCase();

    let turnScore = 0;
    if (/(active|current|throwing|turn|highlight|selected)/.test(classStr)) turnScore += 4;
    if (container.querySelector('[class*="active" i], [class*="turn" i], [class*="arrow" i]')) {
      turnScore += 2;
    }
    const checkGreenAccent = (colorStr) => {
      const m = colorStr.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
      return Boolean(m && Number(m[2]) > 130 && Number(m[2]) > Number(m[1]) + 20);
    };
    if (checkGreenAccent(borderColor)) turnScore += 3;
    if (checkGreenAccent(bgColor)) turnScore += 2;

    const rect = scoreEl.getBoundingClientRect();
    return {
      score: scoreNum,
      name: name || '',
      legs,
      avg,
      turnScore,
      left: rect.left,
      top: rect.top,
      fontSize: parseFloat(window.getComputedStyle(scoreEl).fontSize || '0'),
    };
  }

  function isSetupOrNonX01Screen(url) {
    // 1. Explicitly exclude setup, lobby, local-game creation, profile, and non-X01 routes
    if (
      /\/(local-games|create|setup|settings|lobby|home|dashboard|profile|stats|friends|tournaments|shop|login|register|cricket|bobs|clock|around|shanghai|training|practice)/i.test(
        url
      )
    ) {
      return { blocked: true, reason: 'non-match-url' };
    }

    // 2. Check visible buttons for match-creation / setup CTAs (e.g. "Start Game", "Start Match", "Play")
    const visibleButtons = Array.from(
      document.querySelectorAll('button, [role="button"], ion-button')
    ).filter(isVisible);

    let has301Btn = false;
    let has701Btn = false;
    for (const btn of visibleButtons) {
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (/^(start\s*(game|match)|create\s*(game|match)|play\s*game|begin\s*match|find\s*opponent)$/.test(txt)) {
        return { blocked: true, reason: `setup-cta:${txt}` };
      }
      if (txt === '301') has301Btn = true;
      if (txt === '701') has701Btn = true;
    }
    // If both 301 and 701 selector buttons are visible, we are on the X01 match setup screen
    if (has301Btn && has701Btn) {
      return { blocked: true, reason: 'x01-setup-picker' };
    }

    // 3. Check page header/top text for non-X01 games (Cricket, Bob's 27, Around the Clock, etc.)
    const topText = (document.body.innerText || '').slice(0, 700).toLowerCase();
    if (
      /\b(cricket|bob'?s\s*27|around\s*the\s*clock|shanghai|single\s*training|doubles?\s*training|trebles?\s*training|killer|halve\s*it|catch\s*40)\b/.test(
        topText
      )
    ) {
      return { blocked: true, reason: 'non-x01-game' };
    }

    return { blocked: false, reason: 'ok' };
  }

  // =========================================================================
  // INCOMING FRIEND INVITE DETECTOR (Streams live invites to iPad Controller!)
  // =========================================================================
  function scrapePendingInvites() {
    const invites = [];
    const seenKeys = new Set();
    const acceptBtns = getAllClickableButtons().filter((b) => {
      const t = (b.textContent || '').trim().toLowerCase();
      return /^(accept|join|play|accept\s*invite|accept\s*challenge)$/.test(t);
    });

    for (const btn of acceptBtns) {
      let card = btn.parentElement;
      for (let d = 0; d < 5 && card && card.parentElement; d++) {
        const txt = (card.innerText || '').trim();
        if (txt.length >= 10 && txt.length <= 280) {
          if (/(invite|challenge|wants\s*to\s*play|501|301|701|online|friend|decline|reject)/i.test(txt)) {
            break;
          }
        }
        card = card.parentElement;
      }
      if (!card) continue;
      const rawText = (card.innerText || '').replace(/\s+/g, ' ').trim();
      if (!/(invite|challenge|wants\s*to\s*play|decline|reject)/i.test(rawText)) continue;

      // Extract sender name heuristically
      const invMatch = rawText.match(/^(.{2,28}?)\s+(?:invited\s+you|challenges?\s+you|wants\s+to\s+play)/i);
      const fromName = invMatch
        ? invMatch[1].trim()
        : rawText.split(/\s+/)[0]?.slice(0, 24) || 'Friend';

      const gameMatch = rawText.match(/(501|301|701)[^.\n]{0,36}/i);
      const summary = gameMatch ? gameMatch[0].trim() : 'Online Match Invite';
      const key = `${fromName.toLowerCase()}::${summary.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      invites.push({
        id: `inv-${key.replace(/[^a-z0-9]/g, '').slice(0, 20)}`,
        fromName,
        summary,
        detectedAt: Date.now(),
      });
    }
    return invites;
  }

  function makeInactiveState(url, reason, extraDebug = {}) {
    return {
      isMatchActive: false,
      startScore: 501,
      outRule: 'double',
      legsToWin: 3,
      playerName: settings.playerName || 'Callum',
      opponentName: 'DartCounter Opponent',
      playerRemaining: 501,
      opponentRemaining: null,
      playerLegs: 0,
      opponentLegs: 0,
      playerAvg: null,
      opponentAvg: null,
      isPlayerTurn: true,
      pendingInvites: scrapePendingInvites(),
      url,
      debug: {
        inactiveReason: reason,
        ...extraDebug,
      },
      updatedAt: Date.now(),
    };
  }

  function scrapeDartCounterDom() {
    const url = window.location.href;
    const screenCheck = isSetupOrNonX01Screen(url);
    if (screenCheck.blocked) {
      return makeInactiveState(url, screenCheck.reason);
    }

    const isExactMatchUrl = /\/game\/match|\/online\/match|\/match\/\d+|\/play\/x01/i.test(url);
    const keypad = findKeypadContext();
    const hasKeypad = keypad.digitMap.size >= 8;

    // Reset inferred session start score when navigating to a new match URL
    if (url !== lastMatchUrl) {
      lastMatchUrl = url;
      if (isExactMatchUrl) {
        sessionStartScore = 501;
      }
    }

    // Require an active match URL (or active X01 keypad on a live game screen)
    if (!isExactMatchUrl && !hasKeypad) {
      return makeInactiveState(url, 'not-on-match-screen', {
        keypadDigitsCount: keypad.digitMap.size,
      });
    }

    // Scan visible numeric elements across Light DOM + Shadow DOM (excluding keypad, buttons, inputs, and stat labels)
    const rawCandidates = [];
    const nodes = queryAllDeep('h1, h2, h3, h4, p, span, div, strong');
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      if (el.closest('button, [role="button"], input, nav, header')) continue;
      if (keypad.keypadRoot && keypad.keypadRoot !== document.body && keypad.keypadRoot.contains(el)) {
        continue;
      }

      // Check leaf text OR shallow wrapper whose textContent is strictly a 1-3 digit integer
      const txt = (el.textContent || '').trim();
      if (!/^\d{1,3}$/.test(txt)) continue;
      if (el.children.length > 0) {
        // Only allow if no child itself carries the exact same text (avoid duplicate parent+child hits)
        const childHasSame = Array.from(el.children).some(
          (ch) => (ch.textContent || '').trim() === txt
        );
        if (childHasSame) continue;
      }

      const num = parseInt(txt, 10);
      if (num < 0 || num > 701) continue;
      if (isStatValueElement(el)) continue;

      const rect = el.getBoundingClientRect();
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize || '0');
      if (fontSize < 22) continue;

      // Priority scoring:
      // - Larger font size wins strongly
      // - Upper 60% of viewport (scoreboard area) wins over lower entry box
      // - Real X01 remaining scores (2..701) beat '0' or '1' (legs / empty input / 0 avg)
      let priority = fontSize * 2.5;
      if (rect.top < window.innerHeight * 0.58) priority += 40;
      if (num >= 2 && num <= 701) priority += 55;
      if (num === 501 || num === 301 || num === 701) priority += 20;
      if (num === 0 || num === 1) priority -= 35;

      rawCandidates.push({ el, num, fontSize, rect, priority });
    }

    // Deduplicate overlapping boxes (keep highest priority)
    rawCandidates.sort((a, b) => b.priority - a.priority || b.fontSize - a.fontSize);
    const uniqueCandidates = [];
    for (const c of rawCandidates) {
      const overlaps = uniqueCandidates.some(
        (u) => Math.abs(u.rect.left - c.rect.left) < 35 && Math.abs(u.rect.top - c.rect.top) < 35
      );
      if (!overlaps) uniqueCandidates.push(c);
    }

    // Best strategy: look for a MATCHING PAIR of scores (same font size ± 3px, aligned on same row ± 40px)
    let chosenScores = [];
    for (let i = 0; i < Math.min(uniqueCandidates.length, 8); i++) {
      for (let j = i + 1; j < Math.min(uniqueCandidates.length, 8); j++) {
        const a = uniqueCandidates[i];
        const b = uniqueCandidates[j];
        const sameFont = Math.abs(a.fontSize - b.fontSize) <= 3;
        const sameRow = Math.abs(a.rect.top - b.rect.top) <= 45;
        const spacedApart = Math.abs(a.rect.left - b.rect.left) >= 60;
        const atLeastOneNonZero = a.num >= 2 || b.num >= 2;
        if (sameFont && sameRow && spacedApart && atLeastOneNonZero) {
          chosenScores = [a, b];
          break;
        }
      }
      if (chosenScores.length === 2) break;
    }

    // Fallback: top 2 highest-priority candidates
    if (chosenScores.length === 0) {
      chosenScores = uniqueCandidates.slice(0, 2);
    }

    if (chosenScores.length === 0) {
      return {
        isMatchActive: false,
        startScore: 501,
        outRule: 'double',
        legsToWin: 3,
        playerName: settings.playerName || 'Callum',
        opponentName: 'DartCounter Opponent',
        playerRemaining: 501,
        opponentRemaining: null,
        playerLegs: 0,
        opponentLegs: 0,
        playerAvg: null,
        opponentAvg: null,
        isPlayerTurn: true,
        pendingInvites: scrapePendingInvites(),
        url,
        debug: {
          keypadDigitsCount: keypad.digitMap.size,
          hasSubmitBtn: Boolean(keypad.submitBtn),
          submitHint: keypad.submitHint,
          candidates: [],
        },
        updatedAt: Date.now(),
      };
    }

    // Left-to-right ordering
    chosenScores.sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
    const cards = chosenScores.map((s) => extractCardMeta(s.el));

    // Match user's configured DartCounter name (falls back to Player 1 on left)
    const desiredName = (settings.playerName || 'Callum').trim().toLowerCase();
    let playerIdx = 0;
    if (cards.length >= 2 && desiredName) {
      const exactIdx = cards.findIndex((c) => c.name.toLowerCase().includes(desiredName));
      if (exactIdx !== -1) playerIdx = exactIdx;
    }

    const me = cards[playerIdx];
    const opp = cards.length >= 2 ? cards[1 - playerIdx] : null;

    // Infer startScore accurately ONLY from actual remaining scores (NEVER from setup menu text!)
    if (me.score > 501 || (opp && opp.score > 501)) {
      sessionStartScore = 701;
    } else if (me.score === 501 || (opp && opp.score === 501) || me.score > 301 || (opp && opp.score > 301)) {
      sessionStartScore = 501;
    } else if (me.score === 301 && (!opp || opp.score === 301)) {
      sessionStartScore = 301;
    }

    const headerText = (document.body.innerText || '').slice(0, 600);
    const outRule = /straight\s*out/i.test(headerText) ? 'straight' : 'double';
    let legsToWin = 3;
    const firstToMatch = headerText.match(/first\s*to\s*(\d+)/i);
    const bestOfMatch = headerText.match(/best\s*of\s*(\d+)/i);
    if (firstToMatch) {
      legsToWin = parseInt(firstToMatch[1], 10);
    } else if (bestOfMatch) {
      legsToWin = Math.ceil(parseInt(bestOfMatch[1], 10) / 2);
    }

    let isPlayerTurn = true;
    if (opp) {
      if (me.turnScore > opp.turnScore) isPlayerTurn = true;
      else if (opp.turnScore > me.turnScore) isPlayerTurn = false;
      else isPlayerTurn = hasKeypad;
    }

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
      pendingInvites: scrapePendingInvites(),
      url,
      debug: {
        keypadDigitsCount: keypad.digitMap.size,
        hasSubmitBtn: Boolean(keypad.submitBtn),
        submitHint: keypad.submitHint,
        candidates: uniqueCandidates.slice(0, 6).map((c) => `${c.num}@${Math.round(c.fontSize)}px`),
      },
      updatedAt: Date.now(),
    };
  }

  function pushStateIfChanged(force = false) {
    const state = scrapeDartCounterDom();
    lastScrapedState = state;
    const { updatedAt: _omit, ...comparable } = state;
    const hash = JSON.stringify(comparable);
    if (force || hash !== lastStateHash) {
      lastStateHash = hash;
      chrome.runtime.sendMessage({ type: 'dc_state_update', state }, (resp) => {
        if (chrome.runtime.lastError) return;
        if (resp) {
          kioskConnected = Boolean(resp.kioskConnected);
          if (resp.settings) settings = { ...settings, ...resp.settings };
          renderHud();
        }
      });
    }
    renderHud();
  }

  // =========================================================================
  // OPTION B: SMART AUTO-SCORE ENTRY INTO DARTCOUNTER WEB
  // =========================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function simulateClick(el) {
    if (!el) return;
    try {
      el.focus?.();
    } catch {
      // ignore
    }
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();
  }

  function dispatchKey(key) {
    const target = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : document.body;
    const code = /^[0-9]$/.test(key) ? `Digit${key}` : key;
    const keyCode = key === 'Enter' ? 13 : key.charCodeAt(0);
    target.dispatchEvent(new KeyboardEvent('keydown', { key, code, keyCode, which: keyCode, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent('keypress', { key, code, keyCode, which: keyCode, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key, code, keyCode, which: keyCode, bubbles: true }));
  }

  function reportSubmitResult(visitId, ok, score, message) {
    lastSubmitMessage = message;
    renderHud();
    chrome.runtime.sendMessage({
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

  async function maybeHandleCheckoutDartPrompt(dartsUsed) {
    if (!dartsUsed || dartsUsed < 1 || dartsUsed > 3) return;
    for (let i = 0; i < 10; i++) {
      await sleep(220);
      const modalText = (document.body.innerText || '').toLowerCase();
      if (/(darts?\s*(used|thrown|at\s*double)|checkout\s*darts|how\s*many\s*darts)/i.test(modalText)) {
        const dialogButtons = Array.from(
          document.querySelectorAll('[role="dialog"] button, .modal button, ion-modal button, button')
        ).filter((b) => isVisible(b) && (b.textContent || '').trim() === String(dartsUsed));
        if (dialogButtons.length > 0) {
          simulateClick(dialogButtons[0]);
          return;
        }
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

    const freshState = scrapeDartCounterDom();
    const keypad = findKeypadContext();
    const keypadEnabled =
      keypad.digitMap.size >= 8 &&
      Array.from(keypad.digitMap.values()).some((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true');

    if (!freshState.isMatchActive && !keypadEnabled) {
      reportSubmitResult(visit.id, false, visit.score, 'No active DartCounter match screen');
      return;
    }
    // Fail-open when keypad is clearly active/enabled so auto-scoring never silently drops
    // because of a subtle DOM turn-highlight mismatch or background tab focus state!
    if (!freshState.isPlayerTurn && !keypadEnabled) {
      reportSubmitResult(visit.id, false, visit.score, 'Skipped — opponent turn in DartCounter');
      return;
    }

    const scoreStr = String(Math.max(0, Math.min(180, Math.round(visit.score))));
    submittedVisitIds.add(visit.id);

    // Strategy 1: On-screen Numeric Keypad (standard app.dartcounter.net flow)
    if (keypad.digitMap.size >= 10) {
      if (keypad.clearBtn) {
        simulateClick(keypad.clearBtn);
        await sleep(45);
      }

      for (const ch of scoreStr) {
        const btn = keypad.digitMap.get(ch);
        if (!btn) {
          reportSubmitResult(visit.id, false, visit.score, `Keypad digit '${ch}' missing`);
          return;
        }
        simulateClick(btn);
        await sleep(65);
      }

      await sleep(75);
      if (keypad.submitBtn) {
        simulateClick(keypad.submitBtn);
      } else {
        dispatchKey('Enter');
      }

      reportSubmitResult(
        visit.id,
        true,
        visit.score,
        `Submitted ${scoreStr} to DartCounter (${(visit.throws || []).join(' • ')})`
      );

      if (visit.isCheckout) {
        void maybeHandleCheckoutDartPrompt(visit.dartsUsed);
      }
      setTimeout(() => pushStateIfChanged(true), 500);
      return;
    }

    // Strategy 2: Direct numeric <input> fallback
    const input = Array.from(
      document.querySelectorAll('input[type="number"], input[inputmode="numeric"], input[type="text"]')
    ).find((el) => isVisible(el) && !el.disabled && !el.readOnly);

    if (input) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(input, scoreStr);
      } else {
        input.value = scoreStr;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(60);

      if (keypad.submitBtn) {
        simulateClick(keypad.submitBtn);
      } else {
        dispatchKey('Enter');
      }

      reportSubmitResult(visit.id, true, visit.score, `Entered ${scoreStr} via score input`);
      if (visit.isCheckout) {
        void maybeHandleCheckoutDartPrompt(visit.dartsUsed);
      }
      setTimeout(() => pushStateIfChanged(true), 500);
      return;
    }

    // Strategy 3: Global keyboard digit typing + Enter (DartCounter Web supports keyboard shortcuts!)
    for (const ch of scoreStr) {
      dispatchKey(ch);
      await sleep(55);
    }
    await sleep(60);
    dispatchKey('Enter');

    reportSubmitResult(
      visit.id,
      true,
      visit.score,
      `Typed ${scoreStr} + Enter into DartCounter`
    );
    if (visit.isCheckout) {
      void maybeHandleCheckoutDartPrompt(visit.dartsUsed);
    }
    setTimeout(() => pushStateIfChanged(true), 500);
  }

  // =========================================================================
  // REMOTE IPAD CONTROLLER ACTIONS (DartBot, Online, Friends, Invites, Undo)
  // =========================================================================
  function reportControlResult(action, ok, message) {
    lastSubmitMessage = message;
    renderHud();
    chrome.runtime.sendMessage({
      type: 'dc_control_result',
      result: {
        action,
        ok,
        message,
        timestamp: Date.now(),
      },
    });
  }

  function findClickableByPatterns(patterns, preferExact = true) {
    const candidates = getAllClickableButtons().filter(
      (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true'
    );
    if (preferExact) {
      for (const rx of patterns) {
        const exact = candidates.find((b) => rx.test((b.textContent || '').replace(/\s+/g, ' ').trim()));
        if (exact) return exact;
      }
    }
    for (const rx of patterns) {
      const hit = candidates.find((b) => {
        const label = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`
          .replace(/\s+/g, ' ')
          .trim();
        return rx.test(label);
      });
      if (hit) return hit;
    }
    return null;
  }

  async function waitForButton(patterns, timeoutMs = 4200, intervalMs = 200) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = findClickableByPatterns(patterns, true);
      if (found) return found;
      await sleep(intervalMs);
    }
    return null;
  }

  async function clickIfPresent(patterns, waitMs = 150) {
    const btn = findClickableByPatterns(patterns, true);
    if (!btn) return false;
    simulateClick(btn);
    await sleep(waitMs);
    return true;
  }

  async function executeControlCommand(cmd) {
    if (!cmd || !cmd.action) return;
    const action = cmd.action;

    try {
      if (action === 'open_online') {
        const clicked = await clickIfPresent([
          /^online(\s*play|\s*lobby|\s*match)?$/i,
          /play\s*online/i,
          /online\s*game/i,
        ], 250);
        if (!clicked) {
          const link = queryAllDeep('a[href]').find(
            (a) => isVisible(a) && /online|lobby/i.test(a.getAttribute('href') || '')
          );
          if (link) {
            simulateClick(link);
          } else {
            window.location.href = 'https://app.dartcounter.net/online';
          }
        }
        reportControlResult(action, true, 'Opened DartCounter Online Lobby');
        setTimeout(() => pushStateIfChanged(true), 600);
        return;
      }

      if (action === 'open_friends') {
        const clicked = await clickIfPresent([
          /^friends?$/i,
          /invites?|challenges?|notifications?/i,
        ], 250);
        if (!clicked) {
          const link = queryAllDeep('a[href]').find(
            (a) => isVisible(a) && /friend|invite|challenge/i.test(a.getAttribute('href') || '')
          );
          if (link) {
            simulateClick(link);
          } else {
            window.location.href = 'https://app.dartcounter.net/friends';
          }
        }
        reportControlResult(action, true, 'Opened DartCounter Friends & Invites');
        setTimeout(() => pushStateIfChanged(true), 600);
        return;
      }

      if (action === 'accept_invite' || action === 'decline_invite') {
        const isAccept = action === 'accept_invite';
        const btnPatterns = isAccept
          ? [/^(accept|join|accept\s*invite|accept\s*challenge|play)$/i]
          : [/^(decline|reject|cancel|ignore|dismiss)$/i];

        let targetBtn = null;
        if (cmd.fromName) {
          const needle = String(cmd.fromName).toLowerCase();
          const allBtns = getAllClickableButtons().filter((b) =>
            btnPatterns.some((rx) => rx.test((b.textContent || '').trim()))
          );
          for (const b of allBtns) {
            let parent = b.parentElement;
            for (let d = 0; d < 5 && parent; d++) {
              if ((parent.innerText || '').toLowerCase().includes(needle)) {
                targetBtn = b;
                break;
              }
              parent = parent.parentElement;
            }
            if (targetBtn) break;
          }
        }
        if (!targetBtn) {
          targetBtn = findClickableByPatterns(btnPatterns, true);
        }

        if (targetBtn) {
          simulateClick(targetBtn);
          reportControlResult(
            action,
            true,
            isAccept
              ? `Accepted invite${cmd.fromName ? ` from ${cmd.fromName}` : ''}!`
              : `Declined invite${cmd.fromName ? ` from ${cmd.fromName}` : ''}`
          );
          setTimeout(() => pushStateIfChanged(true), 800);
        } else {
          reportControlResult(
            action,
            false,
            'Invite button not visible on current screen — tap Friends & Invites first'
          );
        }
        return;
      }

      if (action === 'undo_score') {
        const undoBtn = findClickableByPatterns(
          [/^undo$/i, /undo\s*(last|score|turn|visit)?/i, /revert/i],
          true
        );
        if (undoBtn) {
          simulateClick(undoBtn);
          reportControlResult(action, true, 'Undid last score in DartCounter');
          setTimeout(() => pushStateIfChanged(true), 450);
        } else {
          reportControlResult(action, false, 'Undo button not found on DartCounter screen');
        }
        return;
      }

      if (action === 'rematch') {
        const rematchBtn = findClickableByPatterns(
          [/^(rematch|play\s*again|new\s*match|restart)$/i, /rematch|play\s*again/i],
          true
        );
        if (rematchBtn) {
          simulateClick(rematchBtn);
          reportControlResult(action, true, 'Started Rematch in DartCounter');
          setTimeout(() => pushStateIfChanged(true), 700);
        } else {
          reportControlResult(action, false, 'Rematch button not visible yet');
        }
        return;
      }

      if (action === 'leave_match') {
        const leaveBtn = findClickableByPatterns(
          [/^(leave|exit|quit|abandon|end\s*game|end\s*match|back\s*to\s*lobby)$/i, /leave\s*match|exit\s*game/i],
          true
        );
        if (leaveBtn) {
          simulateClick(leaveBtn);
          await sleep(320);
          // Confirm modal if DartCounter asks "Are you sure?"
          await clickIfPresent([/^(yes|confirm|leave|exit|ok)$/i], 200);
          reportControlResult(action, true, 'Left DartCounter match');
        } else {
          window.location.href = 'https://app.dartcounter.net/';
          reportControlResult(action, true, 'Returned to DartCounter Home');
        }
        setTimeout(() => pushStateIfChanged(true), 700);
        return;
      }

      if (action === 'start_dartbot') {
        const startScore = cmd.startScore || 501;
        const outRule = cmd.outRule === 'straight' ? 'straight' : 'double';
        const legsToWin = cmd.legsToWin || 3;
        const botLevel = cmd.botLevel || 4;

        // Step 1: If already on setup screen with Start Game button, skip navigation
        let startBtn = findClickableByPatterns([
          /^(start\s*(game|match)|play\s*game|begin\s*match)$/i,
        ]);

        if (!startBtn) {
          // Try clicking DartBot / Play vs Bot / Local Game / Play X01 CTA on home screen
          const navClicked = await clickIfPresent(
            [
              /dart\s*bot/i,
              /play\s*(vs\.?|against)\s*(dart)?bot/i,
              /vs\.?\s*bot/i,
              /local\s*game/i,
              /new\s*game/i,
              /^play$/i,
            ],
            500
          );

          if (!navClicked) {
            // Try matching an <a href> to local-games or play
            const link = queryAllDeep('a[href]').find(
              (a) => isVisible(a) && /(local-game|dartbot|bot|x01|play)/i.test(a.getAttribute('href') || '')
            );
            if (link) {
              simulateClick(link);
              await sleep(600);
            }
          }

          // If a "Play vs DartBot" toggle/tab appears inside Local Game setup, click it
          await clickIfPresent([/dart\s*bot/i, /vs\.?\s*bot/i, /add\s*dart\s*bot/i], 350);
          startBtn = await waitForButton(
            [/^(start\s*(game|match)|play\s*game|begin\s*match)$/i],
            3000
          );
        }

        // Step 2: Configure X01 Starting Score (501 / 301 / 701)
        await clickIfPresent([new RegExp(`^${startScore}$`)], 180);

        // Step 3: Configure Out Rule (Double Out / Straight Out)
        if (outRule === 'straight') {
          await clickIfPresent([/^straight(\s*out)?$/i, /straight\s*out/i], 180);
        } else {
          await clickIfPresent([/^double(\s*out)?$/i, /double\s*out/i], 180);
        }

        // Step 4: Configure Legs (best-effort match for "First to N" or numeric legs select)
        const selects = queryAllDeep('select').filter(isVisible);
        for (const sel of selects) {
          const contextText = (sel.parentElement?.innerText || sel.getAttribute('aria-label') || '').toLowerCase();
          if (/leg/i.test(contextText)) {
            const opt = Array.from(sel.options).find(
              (o) => o.value === String(legsToWin) || new RegExp(`\\b${legsToWin}\\b`).test(o.text)
            );
            if (opt) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else if (/bot|level|avg|skill/i.test(contextText)) {
            const opt = Array.from(sel.options).find(
              (o) => o.value === String(botLevel) || new RegExp(`level\\s*${botLevel}\\b|\\b${botLevel}\\b`, 'i').test(o.text)
            );
            if (opt) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }

        // Also check range slider for DartBot level
        const sliders = queryAllDeep('input[type="range"]').filter(isVisible);
        for (const slider of sliders) {
          const ctx = (slider.parentElement?.innerText || '').toLowerCase();
          if (/bot|level|avg|skill/i.test(ctx) || sliders.length === 1) {
            const nativeSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            )?.set;
            if (nativeSetter) nativeSetter.call(slider, String(botLevel));
            else slider.value = String(botLevel);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        await sleep(220);

        // Step 5: Click Start Game!
        const finalStart =
          findClickableByPatterns([/^(start\s*(game|match)|play\s*game|begin\s*match)$/i]) ||
          startBtn;
        if (finalStart) {
          simulateClick(finalStart);
          reportControlResult(
            action,
            true,
            `Starting DartBot Lvl ${botLevel} • ${startScore} ${outRule === 'double' ? 'DO' : 'SO'}`
          );
          setTimeout(() => pushStateIfChanged(true), 1200);
          setTimeout(() => pushStateIfChanged(true), 2400);
        } else {
          reportControlResult(
            action,
            false,
            'Opened DartCounter setup — tap Start Game in Brave if prompted'
          );
        }
        return;
      }
    } catch (err) {
      reportControlResult(action, false, `Control error: ${err?.message || String(err)}`);
    }
  }

  // =========================================================================
  // MESSAGE LISTENERS + OBSERVERS
  // =========================================================================
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return;
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

  chrome.runtime.sendMessage({ type: 'content_heartbeat' }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp) {
      kioskConnected = Boolean(resp.kioskConnected);
      if (resp.settings) settings = { ...settings, ...resp.settings };
      renderHud();
    }
    pushStateIfChanged(true);
  });

  setInterval(() => {
    pushStateIfChanged(false);
    chrome.runtime.sendMessage({ type: 'content_heartbeat' }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp) {
        const changed = kioskConnected !== Boolean(resp.kioskConnected);
        kioskConnected = Boolean(resp.kioskConnected);
        if (resp.settings) settings = { ...settings, ...resp.settings };
        if (changed) renderHud();
      }
    });
  }, 1100);

  let mutTimer = null;
  const observer = new MutationObserver(() => {
    if (mutTimer) return;
    mutTimer = setTimeout(() => {
      mutTimer = null;
      pushStateIfChanged(false);
    }, 180);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener('pagehide', () => {
    chrome.runtime.sendMessage({
      type: 'dc_state_update',
      state: makeInactiveState(window.location.href, 'tab-unloaded'),
    });
  });

  renderHud();
})();
