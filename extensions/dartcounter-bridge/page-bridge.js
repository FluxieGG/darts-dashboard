// Autodarts <-> Target DartCounter MAIN-World Angular Ivy Bridge (page-bridge.js)
// Runs in the MAIN world of https://app.dartcounter.net/*
// - Hooks Angular's internal LView registry Map (ch) to inspect live component instances & EnvironmentInjector
// - Reads exact match state from <app-match-local-game> and <app-match-online-gameplay>
// - Reads & refreshes live Online Friends & Game Invites from OnlinePlayStateService / OnlinePlayGameInviteService
// - Executes remote iPad commands (Start DartBot 1..20, Submit Visit Score, Auto-Confirm Darts-on-Double, Challenge Friend, Accept Invite)

(() => {
  if (window.__AUTODARTS_DC_PAGE_BRIDGE__) return;

  function markPageBridgeReady() {
    if (document.documentElement?.dataset) {
      document.documentElement.dataset.adPageBridgeReady = '1';
    }
  }
  markPageBridgeReady();
  if (!document.documentElement?.dataset) {
    document.addEventListener('DOMContentLoaded', markPageBridgeReady, { once: true });
  }

  let chMap = null;
  const lViewCache = new Map();
  let dcCoreMod = null;
  let ionicCoreMod = null;
  let dcCoreLoadAttempted = 0;
  let dcCoreLastAttemptAt = 0;
  let ionicCoreLoadAttempted = 0;
  let ionicCoreLastAttemptAt = 0;
  const CHUNK_RETRY_COOLDOWN_MS = 60000;
  const CHUNK_MAX_RETRIES = 3;

  let cachedServices = null;
  let cachedServicesRoute = '';
  let lastServicesMissRefreshAt = 0;
  let isPublishing = false;
  let lastFriendsLoadAt = 0;

  const origMapSet = Map.prototype.set;
  const origMapGet = Map.prototype.get;
  const origMapDelete = Map.prototype.delete;

  function isLikelyLView(k, v) {
    return (
      typeof k === 'number' &&
      Array.isArray(v) &&
      v.length >= 20 &&
      v[19] === k &&
      v[1] !== null &&
      typeof v[1] === 'object'
    );
  }

  Map.prototype.set = function (k, v) {
    if (this !== lViewCache && isLikelyLView(k, v)) {
      chMap = this;
      if (lViewCache.size > 0) lViewCache.clear();
    }
    return origMapSet.call(this, k, v);
  };

  Map.prototype.get = function (k) {
    const res = origMapGet.call(this, k);
    if (this !== lViewCache && isLikelyLView(k, res)) {
      if (!chMap) chMap = this;
      if (lViewCache.size > 0) lViewCache.clear();
    }
    return res;
  };

  Map.prototype.delete = function (k) {
    if (this !== lViewCache && typeof k === 'number' && this === chMap) {
      origMapDelete.call(lViewCache, k);
    }
    return origMapDelete.call(this, k);
  };

  async function ensureCoreModules() {
    const origin = window.location.origin;
    const now = Date.now();
    if (
      !dcCoreMod &&
      dcCoreLoadAttempted < CHUNK_MAX_RETRIES &&
      (dcCoreLastAttemptAt === 0 || now - dcCoreLastAttemptAt >= CHUNK_RETRY_COOLDOWN_MS)
    ) {
      dcCoreLoadAttempted++;
      dcCoreLastAttemptAt = now;
      try {
        dcCoreMod = await import(`${origin}/chunk-DNB4GH5K.js`);
      } catch {
        // ignore if chunk hash ever changes
      }
    }
    if (
      !ionicCoreMod &&
      ionicCoreLoadAttempted < CHUNK_MAX_RETRIES &&
      (ionicCoreLastAttemptAt === 0 || now - ionicCoreLastAttemptAt >= CHUNK_RETRY_COOLDOWN_MS)
    ) {
      ionicCoreLoadAttempted++;
      ionicCoreLastAttemptAt = now;
      try {
        ionicCoreMod = await import(`${origin}/chunk-PA3TTISV.js`);
      } catch {
        // ignore
      }
    }
    return { dcCoreMod, ionicCoreMod };
  }

  function isViewConnected(lv) {
    if (!Array.isArray(lv)) return false;
    if (lv[0] instanceof Node && !lv[0].isConnected) return false;
    return true;
  }

  function pruneLViewCache() {
    if (chMap) {
      if (lViewCache.size > 0) lViewCache.clear();
      return;
    }
    for (const [k, lv] of lViewCache.entries()) {
      if (!isViewConnected(lv)) {
        origMapDelete.call(lViewCache, k);
      }
    }
  }

  function getAllLViews() {
    pruneLViewCache();
    const views = [];
    const seen = new Set();
    if (chMap && typeof chMap.values === 'function') {
      for (const v of chMap.values()) {
        if (isViewConnected(v) && !seen.has(v)) {
          seen.add(v);
          views.push(v);
        }
      }
    } else {
      for (const v of lViewCache.values()) {
        if (isViewConnected(v) && !seen.has(v)) {
          seen.add(v);
          views.push(v);
        }
      }
    }
    return views;
  }

  function getComponentForElement(el, viewsOverride) {
    if (!el) return null;
    const views = viewsOverride || getAllLViews();
    for (const lv of views) {
      if (lv[0] === el && lv[8] && typeof lv[8] === 'object') {
        return lv[8];
      }
    }
    const ctxId = el.__ngContext__;
    if (typeof ctxId === 'number') {
      const lv =
        (chMap && origMapGet.call(chMap, ctxId)) || origMapGet.call(lViewCache, ctxId);
      if (lv) {
        if (lv[8] && typeof lv[8] === 'object') return lv[8];
        // Search child LViews referencing this host
        for (const sub of views) {
          if (sub[0] === el && sub[8] && typeof sub[8] === 'object') {
            return sub[8];
          }
        }
      }
    } else if (Array.isArray(ctxId) && ctxId[8] && typeof ctxId[8] === 'object') {
      return ctxId[8];
    }
    return null;
  }

  function getAllComponents(viewsOverride) {
    const views = viewsOverride || getAllLViews();
    const comps = [];
    const seen = new Set();
    for (const lv of views) {
      const c = lv[8];
      if (c && typeof c === 'object' && !seen.has(c)) {
        seen.add(c);
        comps.push(c);
      }
    }
    return comps;
  }

  function getAnyInjector(viewsOverride, compsOverride) {
    const views = viewsOverride || getAllLViews();
    for (const lv of views) {
      const inj = lv[9];
      if (inj && typeof inj.get === 'function') {
        return inj;
      }
    }
    const comps = compsOverride || getAllComponents(views);
    for (const c of comps) {
      if (c.injector && typeof c.injector.get === 'function') {
        return c.injector;
      }
    }
    return null;
  }

  /**
   * Finds a service either by unminified property name on any live component
   * (e.g. 'authService', 'onlinePlayStateService', 'navController') OR via injector.get(token).
   */
  function getService(propName, token, comps, inj) {
    for (const c of comps) {
      if (c && c[propName] && typeof c[propName] === 'object') {
        return c[propName];
      }
    }
    if (token && inj) {
      try {
        const svc = inj.get(token, null);
        if (svc) return svc;
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function getCoreServices(viewsOverride, forceRefresh = false) {
    const currentRoute = window.location.pathname;
    const now = Date.now();
    const hasCoreCached = Boolean(
      cachedServices &&
        cachedServices.authService &&
        cachedServices.onlinePlayStateService &&
        cachedServices.navController
    );

    if (
      !forceRefresh &&
      cachedServices &&
      cachedServicesRoute === currentRoute &&
      (hasCoreCached || now - lastServicesMissRefreshAt < 2500)
    ) {
      return cachedServices;
    }

    const { dcCoreMod: dc, ionicCoreMod: ionic } = await ensureCoreModules();
    const views = viewsOverride || getAllLViews();
    const comps = getAllComponents(views);
    const inj = getAnyInjector(views, comps);
    const prev = cachedServices || {};

    cachedServices = {
      dc,
      ionic,
      authService: prev.authService || getService('authService', dc?.dh, comps, inj),
      onlinePlayStateService:
        prev.onlinePlayStateService || getService('onlinePlayStateService', dc?.sg, comps, inj),
      onlinePlayGameInviteService:
        prev.onlinePlayGameInviteService ||
        getService('onlinePlayGameInviteService', dc?.xf, comps, inj),
      onlinePlayGameSettingsStateService:
        prev.onlinePlayGameSettingsStateService ||
        getService('onlinePlayGameSettingsStateService', dc?.wd, comps, inj),
      onlinePlayPreGameService:
        prev.onlinePlayPreGameService || getService('onlinePlayPreGameService', dc?.Jg, comps, inj),
      newLocalGameStateService:
        prev.newLocalGameStateService || getService('newLocalGameStateService', dc?.Tc, comps, inj),
      dartBotSettingsService:
        prev.dartBotSettingsService || getService('dartBotSettingsService', dc?.fb, comps, inj),
      preferenceService:
        prev.preferenceService || getService('preferenceService', dc?.B, comps, inj),
      modalService: prev.modalService || getService('modalService', dc?.X, comps, inj),
      localGamesRoutingService:
        prev.localGamesRoutingService || getService('localGamesRoutingService', dc?.Df, comps, inj),
      navController: prev.navController || getService('navController', ionic?.P, comps, inj),
    };
    cachedServicesRoute = currentRoute;
    lastServicesMissRefreshAt = now;
    return cachedServices;
  }

  function seedDartCounterLocalStorage(opts = {}) {
    try {
      // 1. Mark all local game explanations viewed so first-time "How to Play?" modals never block
      const viewedKey = 'viewedLocalGameExplanations';
      const allModes = [
        'match',
        'cricket_tactics',
        'around_the_clock',
        'bobs_27',
        'shanghai',
        'checkout_121',
        'halve_it',
        'killer',
        'doubles_training',
        'singles_training',
        'score_training',
        'random_checkout',
      ];
      localStorage.setItem(viewedKey, JSON.stringify(allModes));

      // 2. Enable skipDartBotWhoThrowsFirst & skipDartBotHeadToHead in preferences
      const rawPref = localStorage.getItem('preferences');
      const pref = rawPref ? JSON.parse(rawPref) : {};
      pref.skipDartBotWhoThrowsFirst = true;
      pref.skipDartBotHeadToHead = true;
      pref.showConfirmThrowout = false;
      pref.autocompleteDartBot = true;
      localStorage.setItem('preferences', JSON.stringify(pref));

      // 3. If match settings provided, pre-seed localMatchSettings
      if (opts.startScore) {
        const rawMatch = localStorage.getItem('localMatchSettings');
        const ms = rawMatch ? JSON.parse(rawMatch) : {};
        ms.startWith = String(opts.startScore);
        ms.customStartWith = 170;
        ms.bestOfFirstTo = 'first_to';
        ms.goalAmount = Number(opts.legsToWin || 3);
        ms.setOrLeg = 'legs';
        ms.entryMode = 'straight_in';
        ms.finishMode = opts.outRule === 'straight' ? 'straight_out' : 'double_out';
        ms.checkoutPercentage = false;
        ms.checkoutPercentageDisabled = opts.outRule === 'straight';
        ms.twoLegsDifference = false;
        ms.suddenDeath = false;
        ms.playerType = 'players';
        localStorage.setItem('localMatchSettings', JSON.stringify(ms));
      }
    } catch {
      // ignore storage errors
    }
  }

  function extractNgMatchState(svcs, viewsOverride) {
    const localEl = document.querySelector('app-match-local-game');
    const onlineEl = document.querySelector('app-match-online-gameplay');
    const layoutEl = document.querySelector(
      'app-match-local-large-layout, app-games-local-teams-page-layout, app-online-gameplay-default-match-layout'
    );

    const comp =
      getComponentForElement(localEl, viewsOverride) ||
      getComponentForElement(onlineEl, viewsOverride) ||
      getComponentForElement(layoutEl, viewsOverride);

    if (!comp) return null;

    const match =
      comp.match ||
      (typeof comp.currentGame === 'function' ? comp.currentGame() : null) ||
      (typeof comp.currentGameAsMatch === 'function' ? comp.currentGameAsMatch() : null);

    if (!match || !Array.isArray(match.teams) || match.teams.length === 0) {
      return null;
    }

    const startScore =
      match.start_score === 301 || match.start_score === 701 ? match.start_score : 501;
    const outRule = match.end_with === 'straight_out' ? 'straight' : 'double';
    const rawGoal = Number(match.goal_amount || 3);
    const legsToWin = match.is_best_of ? Math.ceil(rawGoal / 2) : rawGoal;

    const authUserId =
      (typeof comp.authenticatedUserId === 'function' ? comp.authenticatedUserId() : null) ??
      svcs.authService?.user?.id ??
      null;

    const teams = match.teams;
    let meIdx = 0;
    if (teams.length >= 2) {
      if (authUserId !== null) {
        const idx = teams.findIndex((t) =>
          (t.users || []).some((u) => u.user_id === authUserId || u.user?.id === authUserId)
        );
        if (idx !== -1) meIdx = idx;
      }
      if (meIdx === 0 && teams[0]?.users?.[0]?.is_cpu && !teams[1]?.users?.[0]?.is_cpu) {
        meIdx = 1;
      }
    }

    const meTeam = teams[meIdx] || teams[0];
    const oppTeam = teams.length >= 2 ? teams[1 - meIdx] : null;

    const meUser = meTeam?.users?.[0] || {};
    const oppUser = oppTeam?.users?.[0] || null;

    const playerName =
      meUser.name ||
      meUser.user?.first_name ||
      meUser.user?.full_name ||
      svcs.authService?.user?.first_name ||
      'Callum';

    let opponentName = 'DartBot';
    if (oppUser) {
      if (oppUser.is_cpu || oppUser.user?.is_cpu) {
        const lvl = oppUser.cpu_level || oppUser.user?.cpu_level;
        opponentName = lvl ? `DartBot (Lv.${lvl})` : 'DartBot';
      } else {
        opponentName =
          oppUser.name ||
          oppUser.user?.first_name ||
          oppUser.user?.full_name ||
          oppTeam?.team_name ||
          'Opponent';
      }
    }

    const getRem = (team) => {
      if (!team) return null;
      if (
        typeof team.temp_remaining === 'number' &&
        team.allow_temp_scores &&
        !team.busted
      ) {
        return team.temp_remaining;
      }
      return typeof team.remaining === 'number' ? team.remaining : startScore;
    };

    const playerRemaining = getRem(meTeam) ?? startScore;
    const opponentRemaining = oppTeam ? getRem(oppTeam) : null;

    const playerLegs = Number(
      meTeam?.total_score_legs ?? meTeam?.total_legs_won_this_set ?? 0
    );
    const opponentLegs = Number(
      oppTeam?.total_score_legs ?? oppTeam?.total_legs_won_this_set ?? 0
    );

    const playerAvg =
      typeof meTeam?.three_dart_average === 'number'
        ? Number(meTeam.three_dart_average.toFixed(1))
        : null;
    const opponentAvg =
      oppTeam && typeof oppTeam.three_dart_average === 'number'
        ? Number(oppTeam.three_dart_average.toFixed(1))
        : null;

    const curTeam = typeof comp.currentTeam === 'function' ? comp.currentTeam() : null;
    const curUser = typeof comp.currentUser === 'function' ? comp.currentUser() : null;
    const hasScoreInputDom = Boolean(document.querySelector('app-keyboard-score-input'));

    let isPlayerTurn = hasScoreInputDom;
    if (typeof comp.isYourTurn === 'function') {
      isPlayerTurn = Boolean(comp.isYourTurn());
    } else if (curTeam && meTeam) {
      isPlayerTurn = curTeam.id === meTeam.id && !curUser?.is_cpu;
    }

    return {
      isMatchActive: true,
      startScore,
      outRule,
      legsToWin,
      playerName,
      opponentName,
      playerRemaining,
      opponentRemaining,
      playerLegs,
      opponentLegs,
      playerAvg,
      opponentAvg,
      isPlayerTurn,
    };
  }

  function extractFriendsAndInvites(svcs) {
    const onlineFriends = [];
    const pendingInvites = [];
    let outgoingInviteTo = null;

    const ops = svcs.onlinePlayStateService;
    if (ops) {
      const rawFriends = typeof ops.friends === 'function' ? ops.friends() : null;
      const now = Date.now();
      if ((rawFriends === null || rawFriends === undefined) && now - lastFriendsLoadAt > 8000) {
        lastFriendsLoadAt = now;
        try {
          ops.loadFriends?.();
        } catch {
          // ignore
        }
      } else if (now - lastFriendsLoadAt > 30000) {
        lastFriendsLoadAt = now;
        try {
          ops.loadFriends?.();
        } catch {
          // ignore
        }
      }

      const listOnline = (typeof ops.onlineFriends === 'function' ? ops.onlineFriends() : null) || [];
      const listInGame = (typeof ops.inGameFriends === 'function' ? ops.inGameFriends() : null) || [];
      const listOffline = (typeof ops.offlineFriends === 'function' ? ops.offlineFriends() : null) || [];

      const combined = [...listOnline, ...listInGame, ...listOffline.slice(0, 12)];
      const seenIds = new Set();

      for (const f of combined) {
        if (!f) continue;
        const uid = f.user_id ?? f.id;
        if (uid === undefined || uid === null || seenIds.has(String(uid))) continue;
        seenIds.add(String(uid));

        const name = (
          f.full_name ||
          `${f.first_name || ''} ${f.last_name || ''}`
        ).trim();
        if (!name) continue;

        const rawAvg = f.three_dart_average ?? f.two_month_average ?? null;
        onlineFriends.push({
          userId: uid,
          name,
          status: f.status || 'online',
          avg: typeof rawAvg === 'number' && rawAvg > 0 ? Number(rawAvg.toFixed(1)) : null,
          country: f.country_flag || f.country || null,
        });
      }
    }

    const invSvc = svcs.onlinePlayGameInviteService;
    if (invSvc && typeof invSvc.currentGameInvite === 'function') {
      const inv = invSvc.currentGameInvite();
      if (inv) {
        const isReceiver =
          typeof invSvc.isReceiver === 'function' ? Boolean(invSvc.isReceiver()) : false;
        const isSender =
          typeof invSvc.isSender === 'function' ? Boolean(invSvc.isSender()) : false;
        const timerStr =
          typeof invSvc.gameInviteTimer === 'function' ? invSvc.gameInviteTimer() : '';

        const allFriends =
          (typeof ops?.friends === 'function' ? ops.friends() : null) || [];

        if (isReceiver) {
          const senderFriend = allFriends.find((f) => f.user_id === inv.sender_id);
          const fromName =
            inv.sender?.full_name ||
            inv.sender?.first_name ||
            senderFriend?.full_name ||
            senderFriend?.first_name ||
            'Friend';
          const gm = inv.gameplay_settings?.game;
          const summary = gm
            ? `${gm.start_score || 501} • ${gm.is_best_of ? 'Best of' : 'First to'} ${gm.goal_amount || 3} legs${timerStr ? ` (${timerStr})` : ''}`
            : `Online Match Invite${timerStr ? ` (${timerStr})` : ''}`;

          pendingInvites.push({
            id: String(inv.id || 'ng-invite'),
            fromName,
            summary,
            detectedAt: Date.now(),
          });
        } else if (isSender) {
          const recvFriend = allFriends.find((f) => f.user_id === inv.receiver_id);
          const toName =
            inv.receiver?.full_name ||
            inv.receiver?.first_name ||
            recvFriend?.full_name ||
            recvFriend?.first_name ||
            'Friend';
          outgoingInviteTo = `${toName}${timerStr ? ` (${timerStr})` : ''}`;
        }
      }
    }

    return { onlineFriends, pendingInvites, outgoingInviteTo };
  }

  /**
   * Automatically handles intermediate pre-game or throwout dialogs when appropriate
   */
  async function autoAdvanceIntermediateScreens(viewsOverride) {
    // 1. If <app-pre-game> is active and user hasn't readied up yet, ready up automatically!
    const preGameEl = document.querySelector('app-pre-game');
    if (preGameEl) {
      const preComp = getComponentForElement(preGameEl, viewsOverride);
      if (preComp) {
        try {
          const hasReadied =
            typeof preComp.hasReadiedUp === 'function' ? preComp.hasReadiedUp() : true;
          const canReady =
            typeof preComp.canReadyUp === 'function' ? preComp.canReadyUp() : false;
          if (!hasReadied && canReady) {
            preComp.readyUp?.();
          } else if (
            typeof preComp.allReady === 'function' &&
            preComp.allReady() &&
            typeof preComp.isOwner === 'function' &&
            preComp.isOwner() &&
            !preComp.isChoosingWhoThrowsFirst
          ) {
            preComp.chooseOnlineWhoThrowsFirst?.();
          }
        } catch {
          // ignore
        }
      }
    }
  }

  async function publishSnapshot() {
    if (isPublishing) return;
    isPublishing = true;
    try {
      const views = getAllLViews();
      const svcs = await getCoreServices(views, false);
      await autoAdvanceIntermediateScreens(views);

      const matchState = extractNgMatchState(svcs, views);
      const { onlineFriends, pendingInvites, outgoingInviteTo } = extractFriendsAndInvites(svcs);

      const snapshot = {
        hasChMap: Boolean(chMap || lViewCache.size > 0),
        authUserName: svcs.authService?.user?.first_name || null,
        matchState,
        onlineFriends,
        pendingInvites,
        outgoingInviteTo,
        updatedAt: Date.now(),
      };

      if (document.documentElement?.dataset) {
        document.documentElement.dataset.adNgSnapshot = JSON.stringify(snapshot);
      }
      window.dispatchEvent(new CustomEvent('ad-dc-ng-snapshot'));
    } catch {
      // ignore transient errors during route transitions
    } finally {
      isPublishing = false;
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function handleConfirmThrowoutDialogs(visit = {}) {
    for (let attempt = 0; attempt < 14; attempt++) {
      await sleep(160);

      // 1. <app-darts-for-throwout-dialog> ("Darts used on a double" / "Darts used for checkout")
      const throwoutEl = document.querySelector('app-darts-for-throwout-dialog');
      if (throwoutEl) {
        const dlg = getComponentForElement(throwoutEl);
        if (dlg && typeof dlg.confirm === 'function') {
          try {
            const possDouble =
              (typeof dlg.possibleDartsAtDouble === 'function'
                ? dlg.possibleDartsAtDouble()
                : []) || [];
            const possCheckout =
              (typeof dlg.possibleDarts === 'function' ? dlg.possibleDarts() : []) || [];

            if (possDouble.length > 0) {
              const desiredDouble =
                typeof visit.dartsAtDouble === 'number'
                  ? visit.dartsAtDouble
                  : visit.isCheckout
                  ? 1
                  : 0;
              const chosenD = possDouble.includes(desiredDouble)
                ? desiredDouble
                : possDouble[0];
              dlg.setSelectedDartAtDouble?.(chosenD);
            }
            if (possCheckout.length > 0) {
              const desiredFinish = visit.dartsUsed || 3;
              const chosenF = possCheckout.includes(desiredFinish)
                ? desiredFinish
                : possCheckout[possCheckout.length - 1];
              dlg.setSelectedDart?.(chosenF);
            }
            dlg.confirm();
            return true;
          } catch {
            // fall through to DOM click
          }
        }
      }

      // 2. <app-match-confirm-throwout-dialog> ("Confirm checkout" in online matches)
      const confirmOnlineEl = document.querySelector('app-match-confirm-throwout-dialog');
      if (confirmOnlineEl) {
        const dlg = getComponentForElement(confirmOnlineEl);
        if (dlg && typeof dlg.confirm === 'function') {
          try {
            dlg.confirm();
            return true;
          } catch {
            // ignore
          }
        }
      }
    }
    return false;
  }

  // Listen for commands from content.js
  window.addEventListener('ad-dc-page-cmd', async (ev) => {
    const detail = ev.detail || {};
    const reqId = detail.reqId;
    const type = detail.type;

    const reply = (payload) => {
      window.dispatchEvent(
        new CustomEvent('ad-dc-page-cmd-result', {
          detail: { reqId, ...payload },
        })
      );
    };

    try {
      const cmdViews = getAllLViews();
      const svcs = await getCoreServices(cmdViews, true);

      // =======================================================================
      // 1. SUBMIT VISIT SCORE VIA ANGULAR COMPONENT
      // =======================================================================
      if (type === 'submit_visit') {
        const visit = detail.visit || {};
        const score = Math.max(0, Math.min(180, Math.round(Number(visit.score || 0))));

        // Wait up to 3.5s (strictly below content.js's 6s timeout) if DartBot is finishing its throw
        const waitDeadline = Date.now() + 3500;
        while (Date.now() < waitDeadline) {
          const localComp = getComponentForElement(
            document.querySelector('app-match-local-game')
          );
          const curUser =
            typeof localComp?.currentUser === 'function' ? localComp.currentUser() : null;
          const kbEl = document.querySelector('app-keyboard-score-input');
          if (kbEl || (localComp && curUser && !curUser.is_cpu)) {
            break;
          }
          const remainingMs = waitDeadline - Date.now();
          if (remainingMs <= 0) break;
          await sleep(Math.min(175, remainingMs));
        }

        const latestViews = getAllLViews();
        const matchEl = document.querySelector(
          'app-match-local-game, app-match-online-gameplay'
        );
        const matchComp = getComponentForElement(matchEl, latestViews);
        const kbEl = document.querySelector('app-keyboard-score-input');
        const kbComp = getComponentForElement(kbEl, latestViews);

        if (matchComp && typeof matchComp.submitScore === 'function') {
          matchComp.submitScore(score);
          void handleConfirmThrowoutDialogs(visit);
          setTimeout(() => void publishSnapshot(), 250);
          reply({
            handled: true,
            ok: true,
            message: `Submitted ${score} to DartCounter (${(visit.throws || []).join(' • ')})`,
          });
          return;
        }

        if (kbComp && kbComp.customScore && typeof kbComp.sendCustomScore === 'function') {
          kbComp.customScore.setValue(String(score));
          kbComp.sendCustomScore();
          void handleConfirmThrowoutDialogs(visit);
          setTimeout(() => void publishSnapshot(), 250);
          reply({
            handled: true,
            ok: true,
            message: `Submitted ${score} via DartCounter input`,
          });
          return;
        }

        reply({ handled: false });
        return;
      }

      // =======================================================================
      // 2. START DARTBOT MATCH (1..20)
      // =======================================================================
      if (type === 'start_dartbot') {
        const cmd = detail.command || {};
        const startScore = cmd.startScore === 301 || cmd.startScore === 701 ? cmd.startScore : 501;
        const outRule = cmd.outRule === 'straight' ? 'straight' : 'double';
        const legsToWin = Math.max(1, Math.min(21, Number(cmd.legsToWin || 3)));
        const botLevel = Math.max(1, Math.min(20, Number(cmd.botLevel || 4)));

        seedDartCounterLocalStorage({ startScore, outRule, legsToWin, botLevel });

        if (svcs.preferenceService) {
          try {
            svcs.preferenceService.skipDartBotWhoThrowsFirst?.set?.(true);
            svcs.preferenceService.skipDartBotHeadToHead?.set?.(true);
            svcs.preferenceService.showConfirmThrowout?.set?.(false);
            svcs.preferenceService.autocompleteDartBot?.set?.(true);
            svcs.preferenceService.savePreferences?.();
          } catch {
            // ignore
          }
        }

        // Pre-configure DartBot level 1..20 directly in DartBotSettingsService!
        if (svcs.dartBotSettingsService && svcs.ionic?.za) {
          try {
            const botConfig = svcs.ionic.za('match', botLevel);
            svcs.dartBotSettingsService.savePresetDraft?.(botConfig);
            const existingBot = svcs.dartBotSettingsService.getBotByGamemode?.('match');
            if (existingBot && typeof existingBot.setConfig === 'function') {
              existingBot.setConfig(botConfig);
            } else {
              svcs.dartBotSettingsService.createNewBot?.(botConfig);
            }
          } catch {
            // ignore
          }
        }

        // Navigate to /local-games/match via Angular NavController if not already there
        if (!window.location.pathname.includes('/local-games/match')) {
          if (svcs.navController && typeof svcs.navController.navigateRoot === 'function') {
            await svcs.navController.navigateRoot('/local-games/match');
          } else {
            reply({ handled: false, needNavigate: '/local-games/match' });
            return;
          }
        }

        // Wait up to 3.5s for <app-match-new-game> and <app-new-local-game-layout> to mount
        let matchNewComp = null;
        let layoutComp = null;
        for (let i = 0; i < 20; i++) {
          matchNewComp = getComponentForElement(
            document.querySelector('app-match-new-game')
          );
          layoutComp = getComponentForElement(
            document.querySelector('app-new-local-game-layout')
          );
          if (matchNewComp && layoutComp) break;
          await sleep(175);
        }

        if (!matchNewComp || !layoutComp) {
          reply({ handled: false });
          return;
        }

        // Close any explanation modal if open
        try {
          layoutComp.explanationStorageService?.markExplanationAsViewed?.('match');
          if (document.querySelector('app-local-game-explanation-dialog')) {
            svcs.modalService?.dismiss?.();
            await sleep(150);
          }
        } catch {
          // ignore
        }

        const nlgState =
          matchNewComp.newLocalGameStateService || svcs.newLocalGameStateService;
        const settingsSvc = matchNewComp.matchLocalGameSettingsService;
        const botSvc = layoutComp.dartBotSettingsService || svcs.dartBotSettingsService;

        if (nlgState) {
          try {
            nlgState.changePlayerType?.('players');
            if (svcs.authService?.user && !nlgState.hasOwnUser?.()) {
              nlgState.setUser?.(svcs.authService.user);
            }
            if (botSvc && svcs.ionic?.za) {
              const botConfig = svcs.ionic.za('match', botLevel);
              botSvc.savePresetDraft?.(botConfig);
              const existingBot = botSvc.getBotByGamemode?.('match');
              if (existingBot) existingBot.setConfig(botConfig);
              else botSvc.createNewBot?.(botConfig);
            }
            nlgState.vsDartBotChangedWithUser?.(true);
          } catch {
            // ignore
          }
        }

        if (settingsSvc) {
          try {
            settingsSvc.changeStartWith?.(String(startScore));
            settingsSvc.changeFinishMode?.(
              outRule === 'straight' ? 'straight_out' : 'double_out'
            );
            settingsSvc.changeBestOfFirstTo?.('first_to');
            settingsSvc.changeSetOrLeg?.('legs');
            settingsSvc.changeEntryMode?.('straight_in');
            settingsSvc.changeCheckoutPercentage?.(false);
            if (typeof settingsSvc.goalAmount?.set === 'function') {
              settingsSvc.goalAmount.set(legsToWin);
            }
          } catch {
            // ignore
          }
        }

        await sleep(140);

        // Start game!
        if (typeof layoutComp.initStartGame === 'function') {
          void layoutComp.initStartGame();
        } else if (typeof matchNewComp.startGame === 'function') {
          void matchNewComp.startGame();
        }

        // Poll briefly to auto-advance any intermediate dialog (OwnAccountWarning, WhoThrowsFirst, HeadToHead)
        for (let step = 0; step < 18; step++) {
          await sleep(220);
          if (window.location.pathname.includes('/game/match')) break;

          const ownWarn = getComponentForElement(
            document.querySelector('app-own-account-warning-dialog')
          );
          if (ownWarn) {
            try {
              ownWarn.linkOwn?.(0, 0);
              ownWarn.continue?.();
            } catch {
              // ignore
            }
          }

          const wtfType = getComponentForElement(
            document.querySelector('app-who-throws-first-choose-type-dialog')
          );
          if (wtfType) {
            try {
              wtfType.skipAndStart?.();
            } catch {
              // ignore
            }
          }

          const wtfPlayer = getComponentForElement(
            document.querySelector(
              'app-who-throws-first-choose-local-player-dialog, app-who-throws-first-choose-player-dialog'
            )
          );
          if (wtfPlayer) {
            try {
              wtfPlayer.close?.(0);
            } catch {
              // ignore
            }
          }

          const h2h = getComponentForElement(
            document.querySelector('app-head-to-head-dialog')
          );
          if (h2h) {
            try {
              h2h.endHeadToHead?.();
            } catch {
              // ignore
            }
          }
        }

        setTimeout(() => void publishSnapshot(), 600);
        setTimeout(() => void publishSnapshot(), 1500);

        reply({
          handled: true,
          ok: true,
          message: `Started DartBot Lv.${botLevel} • ${startScore} ${outRule === 'double' ? 'DO' : 'SO'} (First to ${legsToWin})`,
        });
        return;
      }

      // =======================================================================
      // 3. ONLINE FRIENDS & INVITES COMMANDS
      // =======================================================================
      if (type === 'open_friends' || type === 'refresh_friends') {
        if (svcs.onlinePlayStateService) {
          lastFriendsLoadAt = Date.now();
          svcs.onlinePlayStateService.loadFriends?.();
        }
        if (
          type === 'open_friends' &&
          !window.location.pathname.includes('/friends-lobby')
        ) {
          if (svcs.navController?.navigateForward) {
            await svcs.navController.navigateForward('friends-lobby');
          } else {
            reply({ handled: false, needNavigate: '/friends-lobby' });
            return;
          }
        }
        setTimeout(() => void publishSnapshot(), 500);
        setTimeout(() => void publishSnapshot(), 1400);
        reply({
          handled: true,
          ok: true,
          message: 'Synced DartCounter Online Friends & Invites',
        });
        return;
      }

      if (type === 'open_online') {
        if (svcs.onlinePlayStateService) {
          svcs.onlinePlayStateService.loadFriends?.();
        }
        if (svcs.navController?.navigateForward) {
          await svcs.navController.navigateForward('online-games');
          setTimeout(() => void publishSnapshot(), 600);
          reply({
            handled: true,
            ok: true,
            message: 'Opened DartCounter Online Lobby',
          });
          return;
        }
        reply({ handled: false, needNavigate: '/online-games' });
        return;
      }

      if (type === 'invite_friend') {
        const cmd = detail.command || {};
        const startScore = cmd.startScore === 301 || cmd.startScore === 701 ? cmd.startScore : 501;
        const outRule = cmd.outRule === 'straight' ? 'straight' : 'double';
        const legsToWin = Math.max(1, Math.min(21, Number(cmd.legsToWin || 3)));

        if (svcs.onlinePlayGameSettingsStateService) {
          const gameplaySettings = {
            game_mode: 'match',
            game: {
              has_teams: false,
              start_score: startScore,
              is_best_of: false,
              has_sets: false,
              goal_amount: legsToWin,
              vs_cpu: false,
              has_checkout_rate: false,
              two_legs_difference: false,
              enable_sudden_death: false,
              start_with: 'straight_in',
              end_with: outRule === 'straight' ? 'straight_out' : 'double_out',
              sets: [],
              legs: [],
              is_online: true,
              teams: [],
            },
            in_game_timer: 60,
            fast_scoring: true,
          };
          svcs.onlinePlayGameSettingsStateService.setOnlineGameplaySettings?.(
            gameplaySettings
          );
        }

        const allFriends =
          (typeof svcs.onlinePlayStateService?.friends === 'function'
            ? svcs.onlinePlayStateService.friends()
            : null) || [];

        let targetFriend = null;
        if (cmd.userId !== undefined && cmd.userId !== null) {
          targetFriend = allFriends.find(
            (f) => String(f.user_id ?? f.id) === String(cmd.userId)
          );
        }
        if (!targetFriend && cmd.friendName) {
          const needle = String(cmd.friendName).toLowerCase();
          targetFriend = allFriends.find((f) =>
            `${f.full_name || ''} ${f.first_name || ''} ${f.last_name || ''}`
              .toLowerCase()
              .includes(needle)
          );
        }
        if (!targetFriend && cmd.userId !== undefined) {
          targetFriend = { user_id: Number(cmd.userId), full_name: cmd.friendName || 'Friend' };
        }

        if (targetFriend && svcs.onlinePlayGameInviteService?.inviteUser) {
          await svcs.onlinePlayGameInviteService.inviteUser(targetFriend);
          setTimeout(() => void publishSnapshot(), 500);
          reply({
            handled: true,
            ok: true,
            message: `Sent ${startScore} match invite to ${cmd.friendName || targetFriend.full_name || 'Friend'}!`,
          });
          return;
        }

        reply({ handled: false });
        return;
      }

      if (type === 'cancel_invite') {
        if (svcs.onlinePlayGameInviteService?.cancelInvite) {
          svcs.onlinePlayGameInviteService.cancelInvite();
          setTimeout(() => void publishSnapshot(), 400);
          reply({
            handled: true,
            ok: true,
            message: 'Cancelled outgoing friend invite',
          });
          return;
        }
        reply({ handled: false });
        return;
      }

      if (type === 'accept_invite' || type === 'decline_invite') {
        const isAccept = type === 'accept_invite';
        if (svcs.onlinePlayGameInviteService) {
          const curInv = svcs.onlinePlayGameInviteService.currentGameInvite?.();
          if (curInv) {
            if (isAccept) {
              svcs.onlinePlayGameInviteService.acceptInvite?.();
            } else {
              svcs.onlinePlayGameInviteService.declineInvite?.();
            }
            svcs.onlinePlayGameInviteService.closeIncomingGameInviteDialog?.();
            setTimeout(() => void publishSnapshot(), 600);
            reply({
              handled: true,
              ok: true,
              message: isAccept ? 'Accepted friend match invite!' : 'Declined friend match invite',
            });
            return;
          }
        }
        reply({ handled: false });
        return;
      }

      // =======================================================================
      // 4. IN-MATCH CONTROLS (UNDO, REMATCH, LEAVE)
      // =======================================================================
      if (type === 'undo_score') {
        const matchComp = getComponentForElement(
          document.querySelector('app-match-local-game, app-match-online-gameplay')
        );
        if (matchComp && typeof matchComp.undo === 'function') {
          matchComp.undo();
          setTimeout(() => void publishSnapshot(), 300);
          reply({
            handled: true,
            ok: true,
            message: 'Undid last score in DartCounter',
          });
          return;
        }
        if (matchComp && typeof matchComp.undoScore === 'function') {
          matchComp.undoScore();
          setTimeout(() => void publishSnapshot(), 300);
          reply({
            handled: true,
            ok: true,
            message: 'Undid last score in DartCounter',
          });
          return;
        }
        reply({ handled: false });
        return;
      }

      if (type === 'rematch') {
        const endScreenComp = getComponentForElement(
          document.querySelector('app-local-end-screen, app-match-local-end-screen-dialog')
        );
        if (endScreenComp && typeof endScreenComp.rematchInitialGame === 'function') {
          endScreenComp.rematchInitialGame();
          setTimeout(() => void publishSnapshot(), 600);
          reply({
            handled: true,
            ok: true,
            message: 'Started Rematch in DartCounter',
          });
          return;
        }
        reply({ handled: false });
        return;
      }

      if (type === 'leave_match') {
        const localComp = getComponentForElement(
          document.querySelector('app-match-local-game')
        );
        if (localComp && typeof localComp.storeLocalGame === 'function') {
          localComp.storeLocalGame(false);
        }
        if (svcs.modalService?.dismiss) {
          try {
            svcs.modalService.dismiss();
          } catch {
            // ignore
          }
        }
        if (svcs.navController?.navigateRoot) {
          await svcs.navController.navigateRoot('/local-games/match');
          setTimeout(() => void publishSnapshot(), 500);
          reply({
            handled: true,
            ok: true,
            message: 'Left match — ready on DartCounter setup',
          });
          return;
        }
        reply({ handled: false });
        return;
      }

      reply({ handled: false });
    } catch (err) {
      reply({
        handled: false,
        error: err?.message || String(err),
      });
    }
  });

  setInterval(() => {
    void publishSnapshot();
  }, 450);

  setTimeout(() => {
    void publishSnapshot();
  }, 100);

  window.__AUTODARTS_DC_PAGE_BRIDGE__ = true;
})();
