import { DartThrow } from '../../types/darts';
import {
  GameMatchConfig,
  GamePlayer,
  GameResult,
  GameStanding,
} from '../../types/games';
import { SEGMENT_ORDER } from '../../lib/geometry';
import {
  getDartNumber,
  isDouble,
  isInnerBull,
  isMiss,
  isOuterBull,
  isTreble,
} from '../utils/dartHelpers';
import {
  CalsQuestFeedback,
  CalsQuestState,
  DungeonBoss,
  MinionEntity,
  PathChoiceOption,
  PathChoicePair,
  QuestDamageMode,
  QuestDifficulty,
  RelicDefinition,
  RelicId,
  VisitDartOutcome,
} from './types';

export const LEFT_HALF_WEDGES = [11, 14, 9, 12, 5, 8, 16, 7, 19] as const;
export const RIGHT_HALF_WEDGES = [6, 13, 4, 18, 1, 10, 15, 2, 17] as const;

export const RELIC_CATALOG: Record<RelicId, RelicDefinition> = {
  'flame-edge': {
    id: 'flame-edge',
    name: 'Flame Edge',
    shortDescRpg: '+1 dmg on Doubles & Trebles',
    shortDescRaw: '+15 dmg on Doubles & Trebles',
    accent: 'amber',
  },
  vampiric: {
    id: 'vampiric',
    name: 'Vampiric Flights',
    shortDescRpg: 'Heal +1 Heart on any Treble',
    shortDescRaw: 'Heal +1 Heart on any Treble',
    accent: 'rose',
  },
  buckler: {
    id: 'buckler',
    name: 'Iron Buckler',
    shortDescRpg: 'Blocks 1st enemy strike each room',
    shortDescRaw: 'Blocks 1st enemy strike each room',
    accent: 'sky',
  },
  'sniper-scope': {
    id: 'sniper-scope',
    name: 'Sniper Scope',
    shortDescRpg: '+1 extra Boss target wedge',
    shortDescRaw: '+1 extra Boss target wedge',
    accent: 'emerald',
  },
  dragonbane: {
    id: 'dragonbane',
    name: 'Dragonbane',
    shortDescRpg: '+2 dmg on Bull & Weak Spot crits',
    shortDescRaw: '+30 dmg on Bull & Weak Spot crits',
    accent: 'purple',
  },
  phoenix: {
    id: 'phoenix',
    name: 'Phoenix Feather',
    shortDescRpg: 'Auto-revive once at 3 Hearts',
    shortDescRaw: 'Auto-revive once at 3 Hearts',
    accent: 'amber',
  },
};

const ALL_RELIC_IDS: RelicId[] = [
  'flame-edge',
  'vampiric',
  'buckler',
  'sniper-scope',
  'dragonbane',
  'phoenix',
];

/** Deterministic LCG PRNG so undo & mid-visit corrections never drift */
function nextRand(seed: number): { value: number; nextSeed: number } {
  const nextSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { value: nextSeed / 4294967296, nextSeed };
}

function shuffleWithSeed<T>(items: readonly T[], seed: number): { list: T[]; nextSeed: number } {
  const list = [...items];
  let curSeed = seed;
  for (let i = list.length - 1; i > 0; i--) {
    const r = nextRand(curSeed);
    curSeed = r.nextSeed;
    const j = Math.floor(r.value * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return { list, nextSeed: curSeed };
}

interface RoomBlueprint {
  roomNumber: number;
  name: string;
  title: string;
  rpgHp: number;
  rawHp: number;
  bossWedgesCount: number;
  armor: number;
  minions: Array<{ name: string; rpgHp: number; rawHp: number }>;
  cursedCount: number;
  hasWeakSpot: boolean;
  hasFireBreath: boolean;
}

const ROOM_BLUEPRINTS: RoomBlueprint[] = [
  {
    roomNumber: 1,
    name: 'Goblin Scout',
    title: 'Cavern Gatekeeper',
    rpgHp: 3,
    rawHp: 120,
    bossWedgesCount: 4,
    armor: 0,
    minions: [],
    cursedCount: 0,
    hasWeakSpot: false,
    hasFireBreath: false,
  },
  {
    roomNumber: 2,
    name: 'Crypt Skeleton',
    title: 'Lord of the Ossuary',
    rpgHp: 6,
    rawHp: 220,
    bossWedgesCount: 4,
    armor: 0,
    minions: [{ name: 'Bone Archer', rpgHp: 1, rawHp: 40 }],
    cursedCount: 0,
    hasWeakSpot: false,
    hasFireBreath: false,
  },
  {
    roomNumber: 3,
    name: 'Iron Golem',
    title: 'Armored Forge Titan',
    rpgHp: 10,
    rawHp: 320,
    bossWedgesCount: 4,
    armor: 3,
    minions: [],
    cursedCount: 0,
    hasWeakSpot: false,
    hasFireBreath: false,
  },
  {
    roomNumber: 4,
    name: 'Shadow Warlock',
    title: 'Hexweaver of the Abyss',
    rpgHp: 14,
    rawHp: 440,
    bossWedgesCount: 4,
    armor: 0,
    minions: [
      { name: 'Void Imp', rpgHp: 2, rawHp: 50 },
      { name: 'Shadow Wisp', rpgHp: 2, rawHp: 50 },
    ],
    cursedCount: 2,
    hasWeakSpot: false,
    hasFireBreath: false,
  },
  {
    roomNumber: 5,
    name: 'Elder Dragon Overlord',
    title: 'Sovereign of Embers',
    rpgHp: 20,
    rawHp: 600,
    bossWedgesCount: 4,
    armor: 0,
    minions: [{ name: 'Flame Whelp', rpgHp: 2, rawHp: 60 }],
    cursedCount: 0,
    hasWeakSpot: true,
    hasFireBreath: true,
  },
];

function scaleHp(base: number, difficulty: QuestDifficulty): number {
  return difficulty === 'heroic' ? Math.round(base * 1.25) : base;
}

function buildDungeonRoom(
  roomNumber: number,
  difficulty: QuestDifficulty,
  damageMode: QuestDamageMode,
  relics: RelicId[],
  seed: number
): {
  boss: DungeonBoss;
  minions: MinionEntity[];
  cursedWedges: number[];
  nextSeed: number;
} {
  const bp = ROOM_BLUEPRINTS[Math.min(Math.max(roomNumber - 1, 0), ROOM_BLUEPRINTS.length - 1)];
  const { list: shuffledNumbers, nextSeed } = shuffleWithSeed(SEGMENT_ORDER, seed);

  const hasSniperScope = relics.includes('sniper-scope');
  const bossWedgeCount = bp.bossWedgesCount + (hasSniperScope ? 1 : 0);

  let cursor = 0;
  const targetWedges = shuffledNumbers.slice(cursor, cursor + bossWedgeCount);
  cursor += bossWedgeCount;

  const minions: MinionEntity[] = bp.minions.map((m, idx) => {
    const wedge = shuffledNumbers[cursor++];
    const hp = damageMode === 'rpg' ? m.rpgHp : scaleHp(m.rawHp, difficulty);
    return {
      id: `room-${roomNumber}-minion-${idx}`,
      name: m.name,
      wedge,
      hp,
      maxHp: hp,
    };
  });

  const cursedWedges = shuffledNumbers.slice(cursor, cursor + bp.cursedCount);

  const rawOrRpgBase = damageMode === 'rpg' ? bp.rpgHp : bp.rawHp;
  const bossMaxHp = scaleHp(rawOrRpgBase, difficulty);

  const boss: DungeonBoss = {
    roomNumber: bp.roomNumber,
    name: bp.name,
    title: bp.title,
    hp: bossMaxHp,
    maxHp: bossMaxHp,
    targetWedges,
    armor: bp.armor,
    maxArmor: bp.armor,
    weakSpotWedge: bp.hasWeakSpot ? targetWedges[0] : null,
    hasFireBreath: bp.hasFireBreath,
  };

  return { boss, minions, cursedWedges, nextSeed };
}

function buildPathChoicePair(
  roomCleared: number,
  damageMode: QuestDamageMode,
  seed: number
): { pair: PathChoicePair; nextSeed: number } {
  const templates: Array<{ left: Omit<PathChoiceOption, 'side'>; right: Omit<PathChoiceOption, 'side'> }> = [
    {
      left: {
        kind: 'campfire',
        title: 'Campfire Rest',
        subtitle: 'Heal +3 Hearts & +1 Max Heart',
        accent: 'emerald',
      },
      right: {
        kind: 'relic-chest',
        title: 'Arcane Relic Chest',
        subtitle: 'Claim a random Roguelike Relic',
        accent: 'purple',
      },
    },
    {
      left: {
        kind: 'alchemist-shrine',
        title: 'Alchemist Shrine',
        subtitle: 'Full Heal + Next-Room Curse Ward',
        accent: 'sky',
      },
      right: {
        kind: 'shadow-armory',
        title: 'Shadow Armory',
        subtitle:
          damageMode === 'rpg'
            ? '+1 Permanent Dmg on Doubles & Trebles'
            : '+15 Permanent Dmg on Doubles & Trebles',
        accent: 'amber',
      },
    },
    {
      left: {
        kind: 'treasure-vault',
        title: 'Treasure Vault',
        subtitle: 'Random Relic + Heal +1 Heart',
        accent: 'emerald',
      },
      right: {
        kind: 'dragon-forge',
        title: 'Dragon Forge',
        subtitle: 'Claim Dragonbane or Vampiric Flights',
        accent: 'amber',
      },
    },
  ];

  // Pick pairing deterministically with variety across floors
  const r = nextRand(seed);
  const idx = (roomCleared - 1 + Math.floor(r.value * templates.length)) % templates.length;
  const chosen = templates[idx];

  return {
    pair: {
      left: { ...chosen.left, side: 'left' },
      right: { ...chosen.right, side: 'right' },
    },
    nextSeed: r.nextSeed,
  };
}

function appendLog(log: string[], entry: string): string[] {
  return [entry, ...log].slice(0, 6);
}

function parseDifficulty(raw: unknown): QuestDifficulty {
  return raw === 'heroic' ? 'heroic' : 'normal';
}

function parseDamageMode(raw: unknown): QuestDamageMode {
  return raw === 'raw' ? 'raw' : 'rpg';
}

export function createInitialCalsQuestState(
  players: GamePlayer[],
  config: GameMatchConfig
): CalsQuestState {
  const difficulty = parseDifficulty(config.difficulty);
  const damageMode = parseDamageMode(config.damageMode);
  const maxHearts = difficulty === 'heroic' ? 4 : 6;
  const initialSeed = (Date.now() ^ 0x5f3759df) >>> 0;

  const { boss, minions, cursedWedges, nextSeed } = buildDungeonRoom(
    1,
    difficulty,
    damageMode,
    [],
    initialSeed
  );

  return {
    difficulty,
    damageMode,
    phase: 'combat',
    roomNumber: 1,
    maxRooms: 5,
    hearts: maxHearts,
    maxHearts,
    boss,
    minions,
    cursedWedges,
    relics: [],
    bucklerUsedThisRoom: false,
    phoenixUsed: false,
    shadowArmoryStacks: 0,
    curseWardActive: false,
    activePlayerIndex: 0,
    players: players.map((player) => ({
      player,
      damageDealt: 0,
      critsLanded: 0,
      minionsSlain: 0,
      bossesSlain: 0,
      healsTriggered: 0,
      dartsThrown: 0,
    })),
    visitDarts: [],
    visitOutcomes: [],
    visitDamageDealt: 0,
    visitResolved: false,
    turnComplete: false,
    pendingPathChoice: false,
    activePathChoices: null,
    claimedPathSide: null,
    combatLog: [`Entered Room 1: ${boss.name} awaits!`],
    rngSeed: nextSeed,
    totalDartsThrown: 0,
    isFinished: false,
    victory: false,
  };
}

function applyHeartDamageWithPhoenix(
  state: CalsQuestState,
  heartLoss: number
): { nextState: CalsQuestState; phoenixTriggered: boolean; wiped: boolean } {
  if (heartLoss <= 0) {
    return { nextState: state, phoenixTriggered: false, wiped: false };
  }

  const remaining = Math.max(0, state.hearts - heartLoss);
  if (remaining > 0) {
    return {
      nextState: { ...state, hearts: remaining },
      phoenixTriggered: false,
      wiped: false,
    };
  }

  // Check Phoenix Feather auto-revive
  if (state.relics.includes('phoenix') && !state.phoenixUsed) {
    const reviveHearts = Math.min(3, Math.max(3, state.maxHearts));
    return {
      nextState: {
        ...state,
        hearts: reviveHearts,
        maxHearts: Math.max(state.maxHearts, reviveHearts),
        phoenixUsed: true,
        combatLog: appendLog(state.combatLog, 'Phoenix Feather revived the party with 3 Hearts!'),
      },
      phoenixTriggered: true,
      wiped: false,
    };
  }

  return {
    nextState: {
      ...state,
      hearts: 0,
      isFinished: true,
      victory: false,
      turnComplete: true,
      combatLog: appendLog(state.combatLog, `Party defeated in Room ${state.roomNumber}!`),
    },
    phoenixTriggered: false,
    wiped: true,
  };
}

function resolveEndOfVisitCounterattack(state: CalsQuestState): {
  nextState: CalsQuestState;
  counterMessage?: string;
  phoenixTriggered: boolean;
  wiped: boolean;
  blockedByBuckler: boolean;
} {
  if (state.phase !== 'combat' || state.visitResolved || state.boss.hp <= 0 || state.isFinished) {
    return {
      nextState: { ...state, visitResolved: true },
      phoenixTriggered: false,
      wiped: false,
      blockedByBuckler: false,
    };
  }

  const livingMinions = state.minions.filter((m) => m.hp > 0);
  const bossCounterattacks = state.visitDamageDealt === 0;
  const bossStrikeDmg = bossCounterattacks ? (state.boss.hasFireBreath ? 2 : 1) : 0;
  let totalIncoming = livingMinions.length + bossStrikeDmg;

  if (totalIncoming === 0) {
    return {
      nextState: { ...state, visitResolved: true },
      phoenixTriggered: false,
      wiped: false,
      blockedByBuckler: false,
    };
  }

  let nextState: CalsQuestState = { ...state, visitResolved: true };
  let blockedByBuckler = false;

  if (nextState.relics.includes('buckler') && !nextState.bucklerUsedThisRoom) {
    // Iron Buckler blocks the first enemy counterattack of the room (blocks 1 strike — boss strike prioritized)
    const blockedAmount = bossStrikeDmg > 0 ? bossStrikeDmg : 1;
    totalIncoming = Math.max(0, totalIncoming - blockedAmount);
    nextState = {
      ...nextState,
      bucklerUsedThisRoom: true,
      combatLog: appendLog(
        nextState.combatLog,
        `Iron Buckler blocked ${blockedAmount} Heart enemy strike!`
      ),
    };
    blockedByBuckler = true;
  }

  if (totalIncoming === 0) {
    return {
      nextState,
      counterMessage: '🛡️ IRON BUCKLER BLOCKED THE COUNTERATTACK!',
      phoenixTriggered: false,
      wiped: false,
      blockedByBuckler: true,
    };
  }

  const attackSources: string[] = [];
  if (livingMinions.length > 0) {
    attackSources.push(
      `${livingMinions.length} Minion${livingMinions.length > 1 ? 's' : ''}`
    );
  }
  if (bossCounterattacks) {
    attackSources.push(
      state.boss.hasFireBreath ? 'Dragon Fire Breath' : state.boss.name
    );
  }

  const damageResult = applyHeartDamageWithPhoenix(nextState, totalIncoming);
  const logEntry = `${attackSources.join(' + ')} struck for -${totalIncoming} Heart${
    totalIncoming > 1 ? 's' : ''
  }!`;

  return {
    nextState: {
      ...damageResult.nextState,
      combatLog: appendLog(damageResult.nextState.combatLog, logEntry),
    },
    counterMessage: damageResult.phoenixTriggered
      ? '🔥 PHOENIX FEATHER! PARTY REVIVED AT 3 ❤️!'
      : damageResult.wiped
      ? `💀 ${attackSources.join(' & ')} WIPED THE PARTY!`
      : `⚔️ ${attackSources.join(' + ')} STRUCK! -${totalIncoming} ❤️`,
    phoenixTriggered: damageResult.phoenixTriggered,
    wiped: damageResult.wiped,
    blockedByBuckler,
  };
}

function pickRandomUnownedRelic(
  owned: RelicId[],
  seed: number,
  preferred?: RelicId[]
): { relic: RelicId | null; nextSeed: number } {
  if (preferred) {
    const availablePreferred = preferred.filter((id) => !owned.includes(id));
    if (availablePreferred.length > 0) {
      const r = nextRand(seed);
      return {
        relic: availablePreferred[Math.floor(r.value * availablePreferred.length)],
        nextSeed: r.nextSeed,
      };
    }
  }

  const unowned = ALL_RELIC_IDS.filter((id) => !owned.includes(id));
  if (unowned.length === 0) {
    return { relic: null, nextSeed: seed };
  }
  const r = nextRand(seed);
  return {
    relic: unowned[Math.floor(r.value * unowned.length)],
    nextSeed: r.nextSeed,
  };
}

function applyPathChoiceDart(
  state: CalsQuestState,
  dart: DartThrow
): { nextState: CalsQuestState; feedback: CalsQuestFeedback } {
  const num = getDartNumber(dart);
  const isLeft = (LEFT_HALF_WEDGES as readonly number[]).includes(num);
  const isRight = (RIGHT_HALF_WEDGES as readonly number[]).includes(num);

  const activePlayer = state.players[state.activePlayerIndex];
  const nextPlayers = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, dartsThrown: p.dartsThrown + 1 } : p
  );

  if ((!isLeft && !isRight) || !state.activePathChoices) {
    const nextVisitDarts = [...state.visitDarts, dart];
    const outcome: VisitDartOutcome = { label: 'NEUTRAL', tone: 'slate' };
    const turnComplete = nextVisitDarts.length >= 3;
    return {
      nextState: {
        ...state,
        players: nextPlayers,
        visitDarts: nextVisitDarts,
        visitOutcomes: [...state.visitOutcomes, outcome],
        turnComplete,
        totalDartsThrown: state.totalDartsThrown + 1,
      },
      feedback: {
        title: '🧭 AIM LEFT OR RIGHT HALF!',
        subtitle: 'Hit the glowing Sky/Emerald Left Half or Amber/Purple Right Half to choose your path.',
        accent: 'sky',
        sound: 'dartHit',
      },
    };
  }

  const chosenSide: 'left' | 'right' = isLeft ? 'left' : 'right';
  const option = chosenSide === 'left' ? state.activePathChoices.left : state.activePathChoices.right;

  let hearts = state.hearts;
  let maxHearts = state.maxHearts;
  let relics = [...state.relics];
  let shadowArmoryStacks = state.shadowArmoryStacks;
  let curseWardActive = state.curseWardActive;
  let rngSeed = state.rngSeed;
  let rewardDetail = option.subtitle;

  if (option.kind === 'campfire') {
    maxHearts += 1;
    hearts = Math.min(maxHearts, hearts + 3);
    rewardDetail = `Restored +3 Hearts & +1 Max Heart (${hearts}/${maxHearts} ❤️)`;
  } else if (option.kind === 'relic-chest') {
    const pick = pickRandomUnownedRelic(relics, rngSeed);
    rngSeed = pick.nextSeed;
    if (pick.relic) {
      relics = [...relics, pick.relic];
      const def = RELIC_CATALOG[pick.relic];
      rewardDetail = `Gained ${def.name}: ${
        state.damageMode === 'rpg' ? def.shortDescRpg : def.shortDescRaw
      }`;
    } else {
      hearts = Math.min(maxHearts, hearts + 2);
      rewardDetail = 'All Relics Owned! Restored +2 Hearts instead.';
    }
  } else if (option.kind === 'alchemist-shrine') {
    hearts = maxHearts;
    curseWardActive = true;
    rewardDetail = `Full Heal (${hearts}/${maxHearts} ❤️) + Curses Warded!`;
  } else if (option.kind === 'shadow-armory') {
    shadowArmoryStacks += 1;
    rewardDetail =
      state.damageMode === 'rpg'
        ? `Weapons Honed! +${shadowArmoryStacks} Permanent Dmg on Doubles & Trebles`
        : `Weapons Honed! +${shadowArmoryStacks * 15} Permanent Dmg on Doubles & Trebles`;
  } else if (option.kind === 'treasure-vault') {
    const pick = pickRandomUnownedRelic(relics, rngSeed);
    rngSeed = pick.nextSeed;
    hearts = Math.min(maxHearts, hearts + 1);
    if (pick.relic) {
      relics = [...relics, pick.relic];
      const def = RELIC_CATALOG[pick.relic];
      rewardDetail = `Gained ${def.name} + Healed +1 Heart!`;
    } else {
      maxHearts += 1;
      hearts = Math.min(maxHearts, hearts + 1);
      rewardDetail = 'Vault Jackpot! +1 Max Heart & +2 Hearts!';
    }
  } else if (option.kind === 'dragon-forge') {
    const pick = pickRandomUnownedRelic(relics, rngSeed, ['dragonbane', 'vampiric']);
    rngSeed = pick.nextSeed;
    if (pick.relic) {
      relics = [...relics, pick.relic];
      const def = RELIC_CATALOG[pick.relic];
      rewardDetail = `Forged ${def.name}: ${
        state.damageMode === 'rpg' ? def.shortDescRpg : def.shortDescRaw
      }`;
    } else {
      shadowArmoryStacks += 1;
      rewardDetail = 'Dragon Steel! +1 Permanent Bonus Dmg on Doubles & Trebles!';
    }
  }

  const nextState: CalsQuestState = {
    ...state,
    hearts,
    maxHearts,
    relics,
    shadowArmoryStacks,
    curseWardActive,
    rngSeed,
    players: nextPlayers,
    visitDarts: [...state.visitDarts, dart],
    visitOutcomes: [
      ...state.visitOutcomes,
      {
        label: chosenSide === 'left' ? 'LEFT PATH' : 'RIGHT PATH',
        tone: chosenSide === 'left' ? 'emerald' : 'amber',
      },
    ],
    claimedPathSide: chosenSide,
    turnComplete: true,
    totalDartsThrown: state.totalDartsThrown + 1,
    combatLog: appendLog(
      state.combatLog,
      `${activePlayer?.player.name ?? 'Party'} chose ${option.title}!`
    ),
  };

  return {
    nextState,
    feedback: {
      title: `✨ ${option.title.toUpperCase()} CLAIMED!`,
      subtitle: `${rewardDetail} — Pull darts to enter Room ${state.roomNumber + 1}!`,
      accent: option.accent,
      sound: 'jackpot',
    },
  };
}

export function applyDartToCalsQuest(
  state: CalsQuestState,
  dart: DartThrow
): { nextState: CalsQuestState; feedback: CalsQuestFeedback } {
  if (state.isFinished || state.turnComplete) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  if (state.phase === 'path-choice') {
    return applyPathChoiceDart(state, dart);
  }

  const activePlayer = state.players[state.activePlayerIndex];
  const playerName = activePlayer?.player.name ?? 'Hero';
  const num = getDartNumber(dart);
  const miss = isMiss(dart);
  const innerBull = isInnerBull(dart);
  const outerBull = isOuterBull(dart);
  const dartIsDouble = !innerBull && isDouble(dart);
  const dartIsTreble = isTreble(dart);

  const hasFlameEdge = state.relics.includes('flame-edge');
  const hasVampiric = state.relics.includes('vampiric');
  const hasDragonbane = state.relics.includes('dragonbane');

  const doubleTrebleBonus =
    (dartIsDouble || dartIsTreble ? (hasFlameEdge ? (state.damageMode === 'rpg' ? 1 : 15) : 0) : 0) +
    (dartIsDouble || dartIsTreble
      ? state.shadowArmoryStacks * (state.damageMode === 'rpg' ? 1 : 15)
      : 0);

  let nextHearts = state.hearts;
  let nextBoss = { ...state.boss };
  let nextMinions = state.minions.map((m) => ({ ...m }));
  let nextCurseWard = state.curseWardActive;
  let damageThisDart = 0;
  let critsIncrement = 0;
  let minionsSlainIncrement = 0;
  let bossesSlainIncrement = 0;
  let healsIncrement = 0;
  let outcome: VisitDartOutcome = { label: 'MISS', tone: 'slate' };
  let feedback: CalsQuestFeedback = { sound: 'dartHit' };
  let logLine = `${playerName} missed (${dart.segment.name}).`;
  let curseHitHeartLoss = 0;

  // 1. Inner Bull = Greater Heal (+2 Hearts) + Boss Crit Damage!
  if (innerBull) {
    const healed = Math.min(state.maxHearts - nextHearts, 2);
    nextHearts = Math.min(state.maxHearts, nextHearts + 2);
    healsIncrement += 1;

    const baseCrit = state.damageMode === 'rpg' ? 2 : 50;
    const dragonBonus = hasDragonbane ? (state.damageMode === 'rpg' ? 2 : 30) : 0;
    damageThisDart = baseCrit + dragonBonus;
    critsIncrement += 1;

    let armorNote = '';
    if (nextBoss.armor > 0) {
      nextBoss.armor = Math.max(0, nextBoss.armor - 1);
      armorNote =
        nextBoss.armor === 0 ? ' • ARMOR SHATTERED!' : ` • Armor ${nextBoss.armor}/${nextBoss.maxArmor}`;
    }

    nextBoss.hp = Math.max(0, nextBoss.hp - damageThisDart);
    outcome = { label: `+${healed || 2}❤️ / -${damageThisDart}`, tone: 'purple' };
    logLine = `${playerName} hit Inner Bull! Greater Heal +${healed} ❤️ & ${damageThisDart} Crit dmg!`;
    feedback = {
      title: `✨ GREATER HEAL & BULL CRIT! (-${damageThisDart} HP)`,
      subtitle: `+2 Party Hearts${armorNote}`,
      accent: 'purple',
      sound: 'jackpot',
    };
  }
  // 2. Outer Bull = Health Potion (+1 Heart)
  else if (outerBull) {
    const prevHearts = nextHearts;
    nextHearts = Math.min(state.maxHearts, nextHearts + 1);
    healsIncrement += 1;
    const gained = nextHearts - prevHearts;
    outcome = { label: '+1 ❤️ POTION', tone: 'emerald' };
    logLine = `${playerName} drank a Health Potion (+${gained} ❤️).`;
    feedback = {
      title: '🧪 HEALTH POTION! (+1 ❤️)',
      subtitle:
        gained > 0
          ? `${playerName} restored party health to ${nextHearts}/${state.maxHearts} ❤️`
          : `Party already at full health (${nextHearts}/${state.maxHearts} ❤️)!`,
      accent: 'emerald',
      sound: 'bonusHit',
    };
  }
  // 3. Cursed Wedge Hazard (Room 4)
  else if (!miss && state.cursedWedges.includes(num)) {
    if (nextCurseWard) {
      nextCurseWard = false;
      outcome = { label: 'WARDED!', tone: 'sky' };
      logLine = `${playerName} hit Cursed #${num}, negated by Alchemist Ward!`;
      feedback = {
        title: '🛡️ ALCHEMIST WARD BLOCKED CURSE!',
        subtitle: `Cursed wedge #${num} was purified — 0 Hearts lost!`,
        accent: 'sky',
        sound: 'bonusHit',
      };
    } else {
      curseHitHeartLoss = 1;
      outcome = { label: 'CURSED -1❤️', tone: 'rose' };
      logLine = `${playerName} triggered Cursed Wedge #${num}! (-1 ❤️)`;
      feedback = {
        title: `☠️ CURSED WEDGE #${num}! (-1 ❤️)`,
        subtitle: 'Dark hex recoil damaged the party!',
        accent: 'rose',
        sound: 'hazard',
      };
    }
  }
  // 4. Minion Wedge Hit
  else if (!miss && nextMinions.some((m) => m.hp > 0 && m.wedge === num)) {
    const targetIdx = nextMinions.findIndex((m) => m.hp > 0 && m.wedge === num);
    const minion = nextMinions[targetIdx];
    const baseDmg =
      state.damageMode === 'rpg'
        ? dartIsTreble
          ? 3
          : dartIsDouble
          ? 2
          : 1
        : dart.score;
    damageThisDart = baseDmg + doubleTrebleBonus;
    if (dartIsTreble) critsIncrement += 1;

    const remainingHp = Math.max(0, minion.hp - damageThisDart);
    nextMinions[targetIdx] = { ...minion, hp: remainingHp };

    let vampNote = '';
    if (hasVampiric && dartIsTreble && nextHearts < state.maxHearts) {
      nextHearts += 1;
      healsIncrement += 1;
      vampNote = ' • Vampiric +1 ❤️';
    }

    if (remainingHp === 0) {
      minionsSlainIncrement += 1;
      outcome = { label: 'MINION KO!', tone: 'amber' };
      logLine = `${playerName} slew ${minion.name} on #${num}!`;
      feedback = {
        title: `⚔️ ${minion.name.toUpperCase()} SLAIN!`,
        subtitle: `${damageThisDart} dmg on ${dart.segment.name}${vampNote}`,
        accent: 'amber',
        sound: 'bonusHit',
      };
    } else {
      outcome = { label: `-${damageThisDart} MINION`, tone: 'amber' };
      logLine = `${playerName} hit ${minion.name} for ${damageThisDart} dmg.`;
      feedback = {
        title: `HIT ${minion.name.toUpperCase()}! (-${damageThisDart} HP)`,
        subtitle: `${remainingHp}/${minion.maxHp} HP left${vampNote}`,
        accent: 'amber',
        sound: dartIsDouble || dartIsTreble ? 'bonusHit' : 'dartHit',
      };
    }
  }
  // 5. Boss Target Wedge Hit
  else if (!miss && nextBoss.targetWedges.includes(num)) {
    const isWeakSpot = nextBoss.weakSpotWedge === num;
    const baseDmg =
      state.damageMode === 'rpg'
        ? dartIsTreble
          ? 3
          : dartIsDouble
          ? 2
          : 1
        : dart.score;

    let rawDmg = baseDmg + doubleTrebleBonus;
    if (isWeakSpot) {
      rawDmg = rawDmg * 2 + (hasDragonbane ? (state.damageMode === 'rpg' ? 2 : 30) : 0);
      critsIncrement += 1;
    } else if (dartIsTreble) {
      critsIncrement += 1;
    }

    let armorBrokenNow = false;
    let armorDeflected = false;

    if (nextBoss.armor > 0) {
      if (dartIsTreble) {
        nextBoss.armor = Math.max(0, nextBoss.armor - 2);
        armorBrokenNow = nextBoss.armor === 0;
        damageThisDart = rawDmg;
      } else if (dartIsDouble) {
        nextBoss.armor = Math.max(0, nextBoss.armor - 1);
        armorBrokenNow = nextBoss.armor === 0;
        damageThisDart = rawDmg;
      } else {
        // Single hit against Armor Shield is reduced
        armorDeflected = true;
        damageThisDart =
          state.damageMode === 'rpg' ? 0 : Math.max(1, Math.floor(rawDmg * 0.35));
      }
    } else {
      damageThisDart = rawDmg;
    }

    let vampNote = '';
    if (hasVampiric && dartIsTreble && nextHearts < state.maxHearts) {
      nextHearts += 1;
      healsIncrement += 1;
      vampNote = ' • Vampiric +1 ❤️';
    }

    nextBoss.hp = Math.max(0, nextBoss.hp - damageThisDart);

    if (armorDeflected && damageThisDart === 0) {
      outcome = { label: 'ARMORED!', tone: 'sky' };
      logLine = `${playerName}'s Single glanced off ${nextBoss.name}'s Iron Armor!`;
      feedback = {
        title: '🛡️ IRON ARMOR DEFLECTED SINGLE!',
        subtitle: `Hit a Double, Treble, or Bull to shatter ${nextBoss.armor} shield pip${
          nextBoss.armor > 1 ? 's' : ''
        }!`,
        accent: 'sky',
        sound: 'dartHit',
      };
    } else if (armorBrokenNow) {
      outcome = { label: `SHATTER -${damageThisDart}`, tone: 'amber' };
      logLine = `${playerName} shattered ${nextBoss.name}'s Armor for ${damageThisDart} dmg!`;
      feedback = {
        title: `💥 ARMOR SHATTERED! (-${damageThisDart} HP)`,
        subtitle: `${nextBoss.name} is now exposed to all attacks!${vampNote}`,
        accent: 'amber',
        sound: 'jackpot',
      };
    } else if (isWeakSpot) {
      outcome = { label: `2x CRIT -${damageThisDart}`, tone: 'purple' };
      logLine = `${playerName} struck Dragon Weak Spot #${num} for ${damageThisDart} CRIT dmg!`;
      feedback = {
        title: `🔥 WEAK SPOT 2x CRIT! (-${damageThisDart} HP)`,
        subtitle: `${playerName} blasted ${dart.segment.name}!${vampNote}`,
        accent: 'purple',
        sound: 'jackpot',
      };
    } else if (dartIsTreble) {
      outcome = { label: `CRIT -${damageThisDart}`, tone: 'amber' };
      logLine = `${playerName} landed Treble Crit ${dart.segment.name} (-${damageThisDart} HP)!`;
      feedback = {
        title: `⚡ CRITICAL HIT! (-${damageThisDart} HP)`,
        subtitle: `${playerName} nailed ${dart.segment.name}${vampNote}`,
        accent: 'amber',
        sound: 'jackpot',
      };
    } else if (dartIsDouble) {
      outcome = { label: `DBL -${damageThisDart}`, tone: 'emerald' };
      logLine = `${playerName} struck ${nextBoss.name} on ${dart.segment.name} (-${damageThisDart} HP).`;
      feedback = {
        title: `⚔️ HEAVY STRIKE! (-${damageThisDart} HP)`,
        subtitle:
          nextBoss.armor > 0
            ? `Cracked Iron Armor (${nextBoss.armor}/${nextBoss.maxArmor} left)`
            : `${nextBoss.name}: ${nextBoss.hp}/${nextBoss.maxHp} HP remaining`,
        accent: 'emerald',
        sound: 'bonusHit',
      };
    } else {
      outcome = { label: `-${damageThisDart} HP`, tone: 'emerald' };
      logLine = `${playerName} struck ${nextBoss.name} for ${damageThisDart} dmg.`;
      feedback = {
        title: armorDeflected
          ? `🛡️ GLANCING HIT (-${damageThisDart} HP)`
          : `⚔️ HIT! (-${damageThisDart} HP)`,
        subtitle: armorDeflected
          ? `Armor reduced damage — hit Doubles/Trebles to shatter!`
          : `${nextBoss.name}: ${nextBoss.hp}/${nextBoss.maxHp} HP remaining`,
        accent: armorDeflected ? 'sky' : 'emerald',
        sound: 'dartHit',
      };
    }
  }
  // 6. Miss / Non-Target Wedge
  else {
    let vampNote = '';
    if (hasVampiric && !miss && dartIsTreble && nextHearts < state.maxHearts) {
      nextHearts += 1;
      healsIncrement += 1;
      vampNote = ' (Vampiric +1 ❤️)';
      outcome = { label: 'VAMP +1❤️', tone: 'rose' };
      feedback = {
        title: '🩸 VAMPIRIC FLIGHTS! (+1 ❤️)',
        subtitle: `Treble ${dart.segment.name} drained +1 Heart for the party!`,
        accent: 'rose',
        sound: 'bonusHit',
      };
    } else {
      outcome = { label: 'MISS', tone: 'slate' };
      feedback = { sound: 'dartHit' };
    }
    logLine = `${playerName} missed target (${dart.segment.name})${vampNote}.`;
  }

  const bossSlain = nextBoss.hp <= 0;
  if (bossSlain) {
    bossesSlainIncrement += 1;
  }

  const nextPlayers = state.players.map((entry, idx) =>
    idx === state.activePlayerIndex
      ? {
          ...entry,
          damageDealt: entry.damageDealt + damageThisDart,
          critsLanded: entry.critsLanded + critsIncrement,
          minionsSlain: entry.minionsSlain + minionsSlainIncrement,
          bossesSlain: entry.bossesSlain + bossesSlainIncrement,
          healsTriggered: entry.healsTriggered + healsIncrement,
          dartsThrown: entry.dartsThrown + 1,
        }
      : entry
  );

  const nextVisitDarts = [...state.visitDarts, dart];
  const nextVisitOutcomes = [...state.visitOutcomes, outcome];
  const nextVisitDamage = state.visitDamageDealt + damageThisDart;

  let nextState: CalsQuestState = {
    ...state,
    hearts: nextHearts,
    boss: nextBoss,
    minions: nextMinions,
    curseWardActive: nextCurseWard,
    players: nextPlayers,
    visitDarts: nextVisitDarts,
    visitOutcomes: nextVisitOutcomes,
    visitDamageDealt: nextVisitDamage,
    totalDartsThrown: state.totalDartsThrown + 1,
    combatLog: appendLog(state.combatLog, logLine),
  };

  // Apply cursed wedge heart loss (with Phoenix check)
  if (curseHitHeartLoss > 0) {
    const curseRes = applyHeartDamageWithPhoenix(nextState, curseHitHeartLoss);
    nextState = curseRes.nextState;
    if (curseRes.phoenixTriggered) {
      feedback = {
        title: '🔥 PHOENIX FEATHER! PARTY REVIVED!',
        subtitle: 'Cursed recoil felled the party, but Phoenix Feather restored 3 ❤️!',
        accent: 'amber',
        sound: 'jackpot',
      };
    } else if (curseRes.wiped) {
      feedback = {
        title: `💀 PARTY FALLEN IN ROOM ${state.roomNumber}!`,
        subtitle: `Cursed wedge #${num} dealt the fatal blow!`,
        accent: 'rose',
        sound: 'elimination',
      };
      return { nextState, feedback };
    }
  }

  // Boss Slain!
  if (bossSlain) {
    if (state.roomNumber >= state.maxRooms) {
      // Room 5 Elder Dragon Overlord slain -> Instant Campaign Victory!
      nextState = {
        ...nextState,
        isFinished: true,
        victory: true,
        turnComplete: true,
        visitResolved: true,
        combatLog: appendLog(
          nextState.combatLog,
          `${playerName} slew the Elder Dragon Overlord! VICTORY!`
        ),
      };
      return {
        nextState,
        feedback: {
          title: '🐉 ELDER DRAGON SLAIN! VICTORY!',
          subtitle: `${playerName} struck the final blow — the Dungeon is conquered!`,
          accent: 'amber',
          sound: 'jackpot',
        },
      };
    }

    // Room 1–4 Boss Slain -> Transition to Roguelike Choose-Your-Path!
    const { pair, nextSeed } = buildPathChoicePair(
      state.roomNumber,
      state.damageMode,
      nextState.rngSeed
    );

    if (nextVisitDarts.length < 3) {
      // Still have darts in hand -> jump right into Choose-Your-Path so next dart picks Left/Right!
      nextState = {
        ...nextState,
        phase: 'path-choice',
        activePathChoices: pair,
        claimedPathSide: null,
        pendingPathChoice: false,
        visitResolved: true,
        turnComplete: false,
        rngSeed: nextSeed,
        combatLog: appendLog(
          nextState.combatLog,
          `Room ${state.roomNumber} Cleared! Throw LEFT or RIGHT half to pick your reward!`
        ),
      };
      return {
        nextState,
        feedback: {
          title: `🏆 ${nextBoss.name.toUpperCase()} SLAIN!`,
          subtitle: 'CHOOSE YOUR PATH: Throw Left Half or Right Half for your reward!',
          accent: 'amber',
          sound: 'jackpot',
        },
      };
    }

    // Slain on Dart 3 -> pull darts first, then enter Choose-Your-Path
    nextState = {
      ...nextState,
      pendingPathChoice: true,
      activePathChoices: pair,
      claimedPathSide: null,
      visitResolved: true,
      turnComplete: true,
      rngSeed: nextSeed,
      combatLog: appendLog(
        nextState.combatLog,
        `Room ${state.roomNumber} Cleared! Pull darts to choose your next path!`
      ),
    };
    return {
      nextState,
      feedback: {
        title: `🏆 ${nextBoss.name.toUpperCase()} SLAIN!`,
        subtitle: 'Pull darts to enter the Crossroads & pick your reward!',
        accent: 'amber',
        sound: 'jackpot',
      },
    };
  }

  // If 3rd dart landed in combat and boss is still alive -> resolve end-of-visit counterattack!
  if (nextVisitDarts.length >= 3) {
    const counter = resolveEndOfVisitCounterattack(nextState);
    nextState = {
      ...counter.nextState,
      turnComplete: true,
    };

    if (counter.wiped) {
      feedback = {
        title: counter.counterMessage || `💀 PARTY WIPED IN ROOM ${state.roomNumber}!`,
        subtitle: 'The dungeon claimed the party. Regroup and try again!',
        accent: 'rose',
        sound: 'elimination',
      };
    } else if (counter.phoenixTriggered) {
      feedback = {
        title: '🔥 PHOENIX FEATHER! PARTY REVIVED!',
        subtitle: 'Auto-revived with 3 Hearts — fight on!',
        accent: 'amber',
        sound: 'jackpot',
      };
    } else if (counter.counterMessage) {
      feedback = {
        title: counter.counterMessage,
        subtitle: counter.blockedByBuckler
          ? 'Iron Buckler absorbed the enemy strike!'
          : `Party Health: ${nextState.hearts}/${nextState.maxHearts} ❤️`,
        accent: counter.blockedByBuckler ? 'sky' : 'rose',
        sound: counter.blockedByBuckler ? 'bonusHit' : 'hazard',
      };
    }
  }

  return { nextState, feedback };
}

export function advanceCalsQuestTurn(state: CalsQuestState): {
  nextState: CalsQuestState;
  counterCallout?: CalsQuestFeedback;
} {
  if (state.isFinished) {
    return { nextState: state };
  }

  // Case 1: Boss was slain on Dart 3 -> now open the Choose-Your-Path crossroads!
  if (state.pendingPathChoice && state.activePathChoices) {
    const nextPlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
    return {
      nextState: {
        ...state,
        phase: 'path-choice',
        pendingPathChoice: false,
        claimedPathSide: null,
        activePlayerIndex: nextPlayerIndex,
        visitDarts: [],
        visitOutcomes: [],
        visitDamageDealt: 0,
        visitResolved: false,
        turnComplete: false,
      },
    };
  }

  // Case 2: In Choose-Your-Path phase
  if (state.phase === 'path-choice') {
    const nextPlayerIndex = (state.activePlayerIndex + 1) % state.players.length;

    // Reward was claimed -> load next Dungeon Room!
    if (state.claimedPathSide) {
      const nextRoomNumber = Math.min(state.maxRooms, state.roomNumber + 1);
      const built = buildDungeonRoom(
        nextRoomNumber,
        state.difficulty,
        state.damageMode,
        state.relics,
        state.rngSeed
      );

      return {
        nextState: {
          ...state,
          phase: 'combat',
          roomNumber: nextRoomNumber,
          boss: built.boss,
          minions: built.minions,
          cursedWedges: built.cursedWedges,
          bucklerUsedThisRoom: false,
          activePathChoices: null,
          claimedPathSide: null,
          pendingPathChoice: false,
          activePlayerIndex: nextPlayerIndex,
          visitDarts: [],
          visitOutcomes: [],
          visitDamageDealt: 0,
          visitResolved: false,
          turnComplete: false,
          rngSeed: built.nextSeed,
          combatLog: appendLog(
            state.combatLog,
            `Entered Room ${nextRoomNumber}: ${built.boss.name} (${built.boss.hp} HP)!`
          ),
        },
      };
    }

    // Neutral darts or early takeout before picking a side -> stay in path-choice cleanly
    return {
      nextState: {
        ...state,
        activePlayerIndex: nextPlayerIndex,
        visitDarts: [],
        visitOutcomes: [],
        turnComplete: false,
      },
    };
  }

  // Case 3: Combat phase takeout — if early takeout (<3 darts) before counterattack resolved, resolve now!
  let working = state;
  let counterCallout: CalsQuestFeedback | undefined;

  if (!working.visitResolved && working.visitDarts.length > 0) {
    const counter = resolveEndOfVisitCounterattack(working);
    working = counter.nextState;
    if (counter.wiped) {
      return {
        nextState: working,
        counterCallout: {
          title: counter.counterMessage || `💀 PARTY FALLEN IN ROOM ${working.roomNumber}!`,
          subtitle: 'The dungeon claimed the party.',
          accent: 'rose',
          sound: 'elimination',
        },
      };
    }
    if (counter.counterMessage) {
      counterCallout = {
        title: counter.counterMessage,
        subtitle: counter.phoenixTriggered
          ? 'Auto-revived with 3 Hearts!'
          : `Party Health: ${working.hearts}/${working.maxHearts} ❤️`,
        accent: counter.phoenixTriggered
          ? 'amber'
          : counter.blockedByBuckler
          ? 'sky'
          : 'rose',
        sound: counter.phoenixTriggered
          ? 'jackpot'
          : counter.blockedByBuckler
          ? 'bonusHit'
          : 'hazard',
      };
    }
  }

  // Rotate Elder Dragon's Weak Spot each turn in Room 5
  let nextBoss = working.boss;
  if (nextBoss.weakSpotWedge !== null && nextBoss.targetWedges.length > 1) {
    const currentIdx = nextBoss.targetWedges.indexOf(nextBoss.weakSpotWedge);
    const nextIdx = (currentIdx + 1) % nextBoss.targetWedges.length;
    nextBoss = {
      ...nextBoss,
      weakSpotWedge: nextBoss.targetWedges[nextIdx],
    };
  }

  const nextPlayerIndex = (working.activePlayerIndex + 1) % working.players.length;

  return {
    nextState: {
      ...working,
      boss: nextBoss,
      activePlayerIndex: nextPlayerIndex,
      visitDarts: [],
      visitOutcomes: [],
      visitDamageDealt: 0,
      visitResolved: false,
      turnComplete: false,
    },
    counterCallout,
  };
}

export function buildCalsQuestResult(state: CalsQuestState, startedAt: number): GameResult {
  const sorted = [...state.players].sort((a, b) => {
    if (b.damageDealt !== a.damageDealt) return b.damageDealt - a.damageDealt;
    if (b.bossesSlain !== a.bossesSlain) return b.bossesSlain - a.bossesSlain;
    return b.critsLanded - a.critsLanded;
  });

  const mvp = sorted[0];
  const isCoOp = state.players.length > 1;

  const standings: GameStanding[] = sorted.map((entry, idx) => ({
    playerId: entry.player.id,
    playerName: entry.player.name,
    colorHex: entry.player.colorHex,
    rank: idx + 1,
    primaryStatLabel: 'Damage',
    primaryStatValue: entry.damageDealt,
    secondaryStat: `${entry.critsLanded} Crits • ${entry.minionsSlain} Minions • ${entry.healsTriggered} Heals`,
  }));

  const relicNames = state.relics.map((id) => RELIC_CATALOG[id].name);
  const highlights: string[] = [
    state.victory
      ? `Cleared All 5 Rooms (${state.difficulty === 'heroic' ? 'Heroic' : 'Normal'})`
      : `Reached Room ${state.roomNumber} of 5 (${state.boss.name})`,
    `Party Health Remaining: ${state.hearts}/${state.maxHearts} ❤️`,
  ];
  if (relicNames.length > 0) {
    highlights.push(`Relics: ${relicNames.join(', ')}`);
  }

  if (state.victory) {
    return {
      gameId: 'cals-quest',
      winnerId: mvp?.player.id ?? null,
      winnerName: isCoOp ? `${mvp?.player.name ?? 'Hero'} & Party` : mvp?.player.name ?? 'Hero',
      headline: isCoOp
        ? `The Party conquered the Elder Dragon! (MVP: ${mvp?.player.name})`
        : `${mvp?.player.name ?? 'Hero'} conquered the Elder Dragon Overlord!`,
      standings,
      totalDartsThrown: state.totalDartsThrown,
      durationMs: Date.now() - startedAt,
      highlights,
      completedAt: Date.now(),
    };
  }

  return {
    gameId: 'cals-quest',
    winnerId: null,
    winnerName: 'The Dungeon',
    headline: `Party defeated in Room ${state.roomNumber} by ${state.boss.name}`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Date.now() - startedAt,
    highlights,
    completedAt: Date.now(),
  };
}
