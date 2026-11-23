import { DartThrow } from '../../types/darts';
import { GameAccent, GamePlayer } from '../../types/games';

export type QuestDifficulty = 'normal' | 'heroic';
export type QuestDamageMode = 'rpg' | 'raw';
export type QuestPhase = 'combat' | 'path-choice';

export type RelicId =
  | 'flame-edge'
  | 'vampiric'
  | 'buckler'
  | 'sniper-scope'
  | 'dragonbane'
  | 'phoenix';

export interface RelicDefinition {
  id: RelicId;
  name: string;
  shortDescRpg: string;
  shortDescRaw: string;
  accent: GameAccent;
}

export interface MinionEntity {
  id: string;
  name: string;
  wedge: number;
  hp: number;
  maxHp: number;
}

export interface DungeonBoss {
  roomNumber: number; // 1..5
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  targetWedges: number[];
  armor: number;
  maxArmor: number;
  weakSpotWedge: number | null; // Room 5 rotating Weak Spot (2x damage)
  hasFireBreath: boolean;
}

export type PathRewardKind =
  | 'campfire'
  | 'relic-chest'
  | 'alchemist-shrine'
  | 'shadow-armory'
  | 'treasure-vault'
  | 'dragon-forge';

export interface PathChoiceOption {
  side: 'left' | 'right';
  kind: PathRewardKind;
  title: string;
  subtitle: string;
  accent: GameAccent;
}

export interface PathChoicePair {
  left: PathChoiceOption;
  right: PathChoiceOption;
}

export interface QuestPlayerStats {
  player: GamePlayer;
  damageDealt: number;
  critsLanded: number;
  minionsSlain: number;
  bossesSlain: number;
  healsTriggered: number;
  dartsThrown: number;
}

export interface VisitDartOutcome {
  label: string;
  tone: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';
}

export interface CalsQuestState {
  difficulty: QuestDifficulty;
  damageMode: QuestDamageMode;
  phase: QuestPhase;
  roomNumber: number; // 1..5
  maxRooms: number; // 5
  hearts: number;
  maxHearts: number;
  boss: DungeonBoss;
  minions: MinionEntity[];
  cursedWedges: number[];
  relics: RelicId[];
  bucklerUsedThisRoom: boolean;
  phoenixUsed: boolean;
  shadowArmoryStacks: number;
  curseWardActive: boolean;
  activePlayerIndex: number;
  players: QuestPlayerStats[];
  visitDarts: DartThrow[];
  visitOutcomes: VisitDartOutcome[];
  visitDamageDealt: number;
  visitResolved: boolean;
  turnComplete: boolean;
  pendingPathChoice: boolean;
  activePathChoices: PathChoicePair | null;
  claimedPathSide: 'left' | 'right' | null;
  combatLog: string[];
  rngSeed: number;
  totalDartsThrown: number;
  isFinished: boolean;
  victory: boolean;
}

export interface CalsQuestFeedback {
  title?: string;
  subtitle?: string;
  accent?: GameAccent;
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard' | 'elimination';
}
