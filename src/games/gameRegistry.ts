import {
  Flame,
  Skull,
  CircleDot,
  Target,
  Crown,
  Dices,
  Scissors,
  Flag,
  Crosshair,
  TrendingUp,
  Award,
  Zap,
  Clock,
  Focus,
  Trophy,
  Radar,
  Grid3x3,
  LayoutGrid,
  Swords,
  Compass,
} from 'lucide-react';
import { GameDefinition, GameMatchConfig } from '../types/games';
import { BoardIsLavaGame } from './board-is-lava';
import { KillerGame } from './killer';
import { SnookerGame } from './snooker';
import { DemolitionGame } from './demolition';
import { ShanghaiGame } from './shanghai';
import { SnakesAndLaddersGame } from './snakes-and-ladders';
import { HalveItGame } from './halve-it';
import { DonkeyDerbyGame } from './donkey-derby';
import { DartsGolfGame } from './darts-golf';
import { CalsQuestGame } from './cals-quest';
import { BattleshipGame } from './battleship';
import { CricketGame } from './cricket';
import { SniperBingoGame } from './sniper-bingo';
import { Bobs27Game } from './bobs-27';
import { Checkout121Game } from './checkout-121';
import { JdcChallengeGame } from './jdc-challenge';
import { ScoringGauntletGame } from './scoring-gauntlet';
import { AroundTheClockGame } from './around-the-clock';
import { Catch40Game } from './catch-40';
import { PrecisionSniperGame } from './precision-sniper';

/**
 * Central Plug-In Registry for Modular Tech Darts Games.
 *
 * Inspired by Flight Club & Roxy Ballroom social tech darts.
 *
 * HOW TO PLUG IN A NEW GAME:
 * 1. Implement the game inside `src/games/<game-id>/` following `GAMES_DEVELOPMENT_GUIDE.md`.
 * 2. Import the game's root React component here.
 * 3. Change `status: 'coming_soon'` to `status: 'playable'` (or `'beta'`) and attach `component`.
 * 4. The GameHost socket, Lobby Card, Setup screen, Live Dart Bus, and Victory Podium work automatically!
 */
export const GAME_REGISTRY: GameDefinition[] = [
  {
    id: 'board-is-lava',
    title: 'The Board is Lava',
    tagline: 'Dodge erupting wedges. Survive the heat.',
    description:
      'High-voltage survival darts inspired by Roxy Ballroom. Each round, random board segments ignite into molten lava. Land safe hits to bank points and shields — hit the lava and lose a life as the board gets hotter every round!',
    category: 'Party',
    status: 'playable',
    component: BoardIsLavaGame,
    accent: 'rose',
    icon: Flame,
    minPlayers: 2,
    maxPlayers: 8,
    estimatedMinutes: '8–12 min',
    difficulty: 'Casual',
    tags: ['Survival', 'Dynamic Board', 'Party Favorite'],
    rules: [
      {
        title: '1. Watch the Eruption',
        description:
          'At the start of each round, glowing lava wedges spread across the dartboard. More wedges ignite as rounds progress.',
      },
      {
        title: '2. Hit Safe Zones',
        description:
          'Land darts in safe segments to score points. Doubles and Trebles in safe zones earn bonus multipliers; Bullseye cools down a lava wedge!',
      },
      {
        title: '3. Don’t Burn',
        description:
          'Landing in a glowing lava segment costs a life and scorches your turn score. Last survivor (or highest scorer after final round) wins!',
      },
    ],
    configOptions: [
      {
        key: 'startingLives',
        label: 'Starting Lives',
        description: 'Number of hearts before elimination',
        type: 'select',
        defaultValue: 3,
        options: [
          { label: '3 Lives (Standard)', value: 3 },
          { label: '5 Lives (Extended)', value: 5 },
          { label: '1 Life (Sudden Death)', value: 1 },
        ],
      },
      {
        key: 'heatEscalation',
        label: 'Lava Intensity',
        description: 'How quickly lava spreads across the board',
        type: 'select',
        defaultValue: 'normal',
        options: [
          { label: 'Simmer (Easy)', value: 'easy' },
          { label: 'Eruption (Standard)', value: 'normal' },
          { label: 'Inferno (Chaos)', value: 'hard' },
        ],
      },
      {
        key: 'bullCoolsLava',
        label: 'Bullseye Cools Lava',
        description: 'Hitting Bull or 25 extinguishes 1 active lava wedge',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'killer',
    title: 'Killer',
    tagline: 'Claim your number. Become the Killer. Hunt rivals.',
    description:
      'The ultimate Flight Club social classic. Claim your home wedge, charge up your lives to unlock Killer status, then target your opponents’ numbers to wipe them off the board. Expect chaos and alliances.',
    category: 'Elimination',
    status: 'playable',
    component: KillerGame,
    accent: 'amber',
    icon: Skull,
    minPlayers: 3,
    maxPlayers: 8,
    estimatedMinutes: '12–18 min',
    difficulty: 'Balanced',
    tags: ['Elimination', 'Multiplayer', 'Flight Club Classic'],
    rules: [
      {
        title: '1. Claim Your Segment',
        description:
          'Players are assigned unique numbers around the board (or throw blind with their non-dominant hand to claim one).',
      },
      {
        title: '2. Unlock Killer Status',
        description:
          'Hit your own number to build lives up to the maximum (Single = 1, Double = 2, Treble = 3). Once full, you become a KILLER!',
      },
      {
        title: '3. Hunt & Survive',
        description:
          'Killers hit rival numbers to strip their lives. Lose all lives and you’re eliminated — last player standing takes the crown!',
      },
    ],
    configOptions: [
      {
        key: 'maxLives',
        label: 'Lives to Become Killer',
        type: 'select',
        defaultValue: 3,
        options: [
          { label: '3 Lives (Fast)', value: 3 },
          { label: '5 Lives (Standard)', value: 5 },
        ],
      },
      {
        key: 'numberAssignment',
        label: 'Number Assignment',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { label: 'Auto-Assigned (Balanced Spacing)', value: 'auto' },
          { label: 'Throw to Claim', value: 'throw' },
        ],
      },
      {
        key: 'suicideRule',
        label: 'Self-Hit Penalty',
        description: 'Hitting your own number while Killer deducts your own life',
        type: 'toggle',
        defaultValue: false,
      },
    ],
  },
  {
    id: 'snooker',
    title: 'Snooker',
    tagline: 'Pot Reds, nominate Colours, chase the 147 break.',
    description:
      'Tactical precision darts styled like a championship snooker table. Alternate potting Reds and high-value Colours to build massive breaks, rack up fouls on misses, and clear the final colours in order to clinch the frame.',
    category: 'Precision',
    status: 'playable',
    component: SnookerGame,
    accent: 'emerald',
    icon: CircleDot,
    minPlayers: 1,
    maxPlayers: 4,
    estimatedMinutes: '12–20 min',
    difficulty: 'Skill',
    tags: ['Precision', '147 Break', 'Tactical'],
    rules: [
      {
        title: '1. Pot a Red (1 pt)',
        description:
          'Start every break by hitting one of the glowing Red segments on the dartboard. Doubles/Trebles pot multiple reds or award bonus break points depending on mode.',
      },
      {
        title: '2. Nominate a Colour',
        description:
          'After a Red, hit a Colour segment: Yellow (2), Green (3), Brown (4), Blue (5), Pink (6), or Black (7) to extend your break.',
      },
      {
        title: '3. Clear the Colours',
        description:
          'Once all Reds are cleared, pot Yellow → Black in strict sequence. Highest frame score wins — track your all-time Highest Break!',
      },
    ],
    configOptions: [
      {
        key: 'redCount',
        label: 'Reds on Table',
        type: 'select',
        defaultValue: 10,
        options: [
          { label: '6 Reds (Quick Frame)', value: 6 },
          { label: '10 Reds (Arcade)', value: 10 },
          { label: '15 Reds (Full 147)', value: 15 },
        ],
      },
      {
        key: 'foulPenalty',
        label: 'Miss Foul Points',
        description: 'Award 4 foul points to opponent on full visit miss',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'demolition',
    title: 'Demolition 501',
    tagline: 'High-energy X01 with live checkout callouts.',
    description:
      'Flight Club’s electric arcade twist on classic 501/301/180. Race to demolish your score tower down to zero with animated checkout routes, bust warnings, and instant party-friendly Straight-Out or pro Double-Out modes.',
    category: 'Classic',
    status: 'playable',
    component: DemolitionGame,
    accent: 'sky',
    icon: Target,
    minPlayers: 1,
    maxPlayers: 6,
    estimatedMinutes: '8–15 min',
    difficulty: 'Balanced',
    tags: ['X01', 'Checkout Guide', 'Classic'],
    rules: [
      {
        title: '1. Single In, Race to Zero',
        description:
          'Every player starts on 501 (or 301 / 180) with standard Single-In scoring — every dart counts straight away.',
      },
      {
        title: '2. Live Double-Out Checkout Guides',
        description:
          'When in finish range (≤170), the display calculates the exact Double/Bull checkout route for your remaining darts and highlights the next target bed on the board.',
      },
      {
        title: '3. Double or Bullseye to Finish (No Busting!)',
        description:
          'Standard X01 requires checking out on a Double (D1–D20) or Bullseye (50). Going below 0, leaving 1, or hitting 0 on a Single/Treble/25 triggers a BUST and restores your turn score.',
      },
    ],
    configOptions: [
      {
        key: 'startScore',
        label: 'Starting Score',
        type: 'select',
        defaultValue: 501,
        options: [
          { label: '501 (Standard)', value: 501 },
          { label: '301 (Quick)', value: 301 },
          { label: '180 (Turbo)', value: 180 },
        ],
      },
      {
        key: 'outRule',
        label: 'In / Out Rules',
        type: 'select',
        defaultValue: 'double',
        options: [
          { label: 'Single In • Double Out (Standard)', value: 'double' },
          { label: 'Single In • Straight Out (Casual)', value: 'straight' },
        ],
      },
    ],
  },
  {
    id: 'shanghai',
    title: 'Shanghai',
    tagline: 'One target per round. Nail S+D+T for instant KO.',
    description:
      'Pure escalating adrenaline. Every round locks onto a single number from 1 up to 7 (or 20). Score big on the active slice — or land a Single, Double, AND Treble in one visit to shout SHANGHAI and win on the spot!',
    category: 'Arcade',
    status: 'playable',
    component: ShanghaiGame,
    accent: 'purple',
    icon: Crown,
    minPlayers: 2,
    maxPlayers: 8,
    estimatedMinutes: '10–12 min',
    difficulty: 'Balanced',
    tags: ['Instant Win', 'Round-Based', 'Crowd Pleaser'],
    rules: [
      {
        title: '1. Target the Active Round Number',
        description:
          'Round 1 targets the 1 segment, Round 2 targets the 2, and so on. Only hits inside the glowing active number score points.',
      },
      {
        title: '2. Stack Multipliers',
        description:
          'Singles score 1× the round number, Doubles score 2×, and Trebles score 3×. Big points escalate fast in the final rounds!',
      },
      {
        title: '3. Hit the SHANGHAI',
        description:
          'Hit a Single, Double, and Treble of the active number in the same 3-dart visit to trigger an instant-victory SHANGHAI!',
      },
    ],
    configOptions: [
      {
        key: 'rounds',
        label: 'Number of Rounds',
        type: 'select',
        defaultValue: 7,
        options: [
          { label: '7 Rounds (Flight Club Fast)', value: 7 },
          { label: '10 Rounds (Medium)', value: 10 },
          { label: '20 Rounds (Full Board)', value: 20 },
        ],
      },
      {
        key: 'instantWin',
        label: 'Instant Shanghai Win',
        description: 'Hitting S + D + T in one visit immediately wins the match',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'snakes-and-ladders',
    title: 'Snakes & Ladders',
    tagline: 'Climb neon ladders. Dodge venomous drop zones.',
    description:
      'A Flight Club crowd-pleaser built for big screens! Your dart scores propel your token across a glowing 100-tile grid. Hit Doubles for turbo ladders, avoid snake heads, and be first to land on Square 100.',
    category: 'Party',
    status: 'playable',
    component: SnakesAndLaddersGame,
    accent: 'emerald',
    icon: Dices,
    minPlayers: 2,
    maxPlayers: 6,
    estimatedMinutes: '10–15 min',
    difficulty: 'Casual',
    tags: ['Board Game', 'Comebacks', 'Group Fun'],
    rules: [
      {
        title: '1. Throw to Advance',
        description:
          'Each dart moves your player token forward along the 100-square neon game board.',
      },
      {
        title: '2. Ride the Ladders',
        description:
          'Land at the base of a glowing emerald ladder to vault up multiple rows in an instant!',
      },
      {
        title: '3. Beware the Snakes',
        description:
          'Stop on a crimson snake head and slide down the board. Exact or overshoot rules configurable for Square 100!',
      },
    ],
    configOptions: [
      {
        key: 'boardSize',
        label: 'Board Length',
        type: 'select',
        defaultValue: 100,
        options: [
          { label: '64 Squares (Quick)', value: 64 },
          { label: '100 Squares (Classic)', value: 100 },
        ],
      },
      {
        key: 'exactFinish',
        label: 'Bounce Back on 100',
        description: 'Overshooting the final square bounces your token backwards',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'halve-it',
    title: 'Halve It',
    tagline: 'Hit the challenge target — or watch your score cut in half!',
    description:
      'Maximum jeopardy every single visit. Players face a gauntlet of escalating targets (Any Double, Any Treble, 20s, 15s, Bullseye). Miss the target with all three darts and your entire total gets brutally sliced in half!',
    category: 'Arcade',
    status: 'playable',
    component: HalveItGame,
    accent: 'amber',
    icon: Scissors,
    minPlayers: 2,
    maxPlayers: 8,
    estimatedMinutes: '10–14 min',
    difficulty: 'Skill',
    tags: ['High Stakes', 'Risk & Reward', 'Clutch'],
    rules: [
      {
        title: '1. Follow the Round Challenge',
        description:
          'Every round sets a specific goal: e.g., 20s, 16s, Any Double, 19s, Any Treble, 14s, and the final Bullseye showdown.',
      },
      {
        title: '2. Bank Points on Hits',
        description:
          'Every dart matching the round challenge adds its score directly to your bank.',
      },
      {
        title: '3. Miss All 3 = HALVE IT!',
        description:
          'Fail to hit the round’s target in 3 darts and your score is slashed in half (rounded down). No lead is ever safe!',
      },
    ],
    configOptions: [
      {
        key: 'preset',
        label: 'Challenge Gauntlet',
        type: 'select',
        defaultValue: 'classic',
        options: [
          { label: 'Classic 7 Rounds', value: 'classic' },
          { label: 'Extended 10 Rounds', value: 'extended' },
        ],
      },
      {
        key: 'startingBank',
        label: 'Starting Points',
        type: 'select',
        defaultValue: 40,
        options: [
          { label: '40 pts (Standard)', value: 40 },
          { label: '0 pts (Hardcore)', value: 0 },
        ],
      },
    ],
  },
  {
    id: 'donkey-derby',
    title: 'Donkey Derby',
    tagline: 'Sprint down the track! Hit your lane to gallop ahead.',
    description:
      'Pure arcade race-day energy inspired by Flight Club’s Quackshot & Derby games! Every player gets their own racing lane and assigned target number. Hammer your target (Doubles = 2× gallop, Trebles = 3× turbo) to cross the finish line first!',
    category: 'Party',
    status: 'playable',
    component: DonkeyDerbyGame,
    accent: 'sky',
    icon: Flag,
    minPlayers: 2,
    maxPlayers: 6,
    estimatedMinutes: '6–10 min',
    difficulty: 'Casual',
    tags: ['Racing', 'Fast-Paced', 'Spectator Friendly'],
    rules: [
      {
        title: '1. Assigned Racing Lanes',
        description:
          'Each player’s racer lines up on a glowing neon track with a designated target wedge on the board.',
      },
      {
        title: '2. Gallop Forward',
        description:
          'Hit your target wedge to surge forward: Single = +1 step, Double = +2 steps, Treble = +3 steps! Bullseye triggers a +2 boost for you.',
      },
      {
        title: '3. Photo Finish',
        description:
          'Watch out — accidentally hitting a rival’s wedge pushes THEM forward! First racer across the checkered line wins!',
      },
    ],
    configOptions: [
      {
        key: 'trackLength',
        label: 'Track Distance',
        type: 'select',
        defaultValue: 12,
        options: [
          { label: '8 Furlongs (Sprint)', value: 8 },
          { label: '12 Furlongs (Standard)', value: 12 },
          { label: '20 Furlongs (Grand National)', value: 20 },
        ],
      },
      {
        key: 'helpRivals',
        label: 'Rival Wedge Boosts Them',
        description: 'Accidentally hitting another racer’s number advances their lane',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'cals-quest',
    title: "Cal's Quest",
    tagline: 'D&D Roguelike Boss Rush! Slay 5 bosses, loot relics & choose your path.',
    description:
      'Step into the dungeon solo or co-op (1–6P)! Battle through 5 escalating D&D bosses — from a 3 HP Goblin Scout to the 20 HP Elder Dragon Overlord. Shatter Armor Shields, clear Minions, heal with Bullseyes, collect game-changing Roguelike Relics, and choose your path between rooms by throwing at the LEFT or RIGHT half of the dartboard!',
    category: 'Arcade',
    status: 'playable',
    component: CalsQuestGame,
    accent: 'purple',
    icon: Swords,
    minPlayers: 1,
    maxPlayers: 6,
    estimatedMinutes: '12–20 min',
    difficulty: 'Balanced',
    tags: ['Roguelike RPG', 'Co-Op Boss Rush', 'Choose Your Path'],
    rules: [
      {
        title: '1. Attack Bosses & Clear Minions',
        description:
          'Hit glowing Boss target wedges to deal damage (Single = 1, Double = 2, Treble = 3 in RPG Mode; doubles/trebles shatter Armor Shields). Clear Minion wedges before end-of-visit or each living Minion strikes for -1 Heart!',
      },
      {
        title: '2. Heal With Bullseyes & Dodge Curses',
        description:
          'Outer Bull (25) drinks a Health Potion (+1 Heart). Inner Bull (50) triggers a Greater Heal (+2 Hearts + Crit Damage!). Avoid glowing Cursed wedges, and deal at least 1 damage per visit or the Boss counterattacks!',
      },
      {
        title: '3. Choose Your Path (Left vs Right Board)',
        description:
          'Between every dungeon room, the board splits in two! Throw 1 dart at the LEFT HALF (Sky/Emerald) or RIGHT HALF (Amber/Purple) to pick between Campfire Rests, Arcane Relic Chests, Alchemist Shrines, Shadow Armories, and Dragon Forges!',
      },
      {
        title: '4. Stack Roguelike Relics & Slay the Dragon',
        description:
          'Build wild combos with Flame Edge, Vampiric Flights, Iron Buckler, Sniper Scope, Dragonbane, and Phoenix Feather. Defeat all 5 bosses including Room 5’s Elder Dragon Overlord before Party Hearts hit 0!',
      },
    ],
    configOptions: [
      {
        key: 'difficulty',
        label: 'Dungeon Difficulty',
        description: 'Heroic gives bosses +25% HP and lowers starting Party Hearts (4 vs 6)',
        type: 'select',
        defaultValue: 'normal',
        options: [
          { label: 'Adventurer (Normal • 6 Hearts)', value: 'normal' },
          { label: 'Heroic (Hard • 4 Hearts, +25% Boss HP)', value: 'heroic' },
        ],
      },
      {
        key: 'damageMode',
        label: 'Damage Calculation',
        description: 'RPG hits (1/2/3 dmg) or Raw dart points against scaled HP pools',
        type: 'select',
        defaultValue: 'rpg',
        options: [
          { label: 'RPG Mode (S=1, D=2, T=3 Damage)', value: 'rpg' },
          { label: 'Raw Score Mode (Big HP Pools)', value: 'raw' },
        ],
      },
    ],
  },
  {
    id: 'darts-golf',
    title: 'Darts Golf',
    tagline: 'Play 9 or 20 randomised holes against Par. Chase Birdies & Eagles!',
    description:
      'Championship Masters-style darts golf for 1 to 6 players! Choose a 9-Hole sprint or Full 20-Hole round — every single match shuffles a fresh random order of dartboard numbers (1–20) so no two courses play the same. Nail Trebles for Eagles (-2) and Doubles for Birdies (-1), or gamble on the Last-Dart rule!',
    category: 'Precision',
    status: 'playable',
    component: DartsGolfGame,
    accent: 'emerald',
    icon: Compass,
    minPlayers: 1,
    maxPlayers: 6,
    estimatedMinutes: '10–18 min',
    difficulty: 'Balanced',
    tags: ['Golf Scorecard', 'Random Course', '1–6 Players'],
    rules: [
      {
        title: '1. Randomised Target Every Hole (9 or 20 Holes)',
        description:
          'Every match shuffles unique random dartboard numbers (1–20) across 9 holes or all 20 holes. Watch the glowing emerald target segment on the board for each new hole!',
      },
      {
        title: '2. Hole Scoring vs Par',
        description:
          'Treble = Eagle (-2), Double = Birdie (-1), Any Single (Inner or Outer) = Par (E), Miss on the Board (wrong number) = Bogey (+1), Miss Off the Board = Double Bogey (+2).',
      },
      {
        title: '3. Last-Dart Risk vs Best-Dart + Gimme Bull',
        description:
          'In Last-Dart mode, your FINAL dart thrown counts — hit a Birdie on Dart 1 and pull darts early to bank it, or risk throwing again for Eagle! With Gimme Bull ON, Inner Bull (50) rescues any hole to Par (E). Lowest score wins!',
      },
    ],
    configOptions: [
      {
        key: 'course',
        label: 'Course Length',
        description: 'Shuffles a fresh random sequence of dartboard segments each match',
        type: 'select',
        defaultValue: '9hole',
        options: [
          { label: '9 Holes (Random Challenge)', value: '9hole' },
          { label: '20 Holes (Full Board Random)', value: '20hole' },
        ],
      },
      {
        key: 'scoringRule',
        label: 'Hole Scoring Rule',
        description: 'Classic Last-Dart risk/reward or forgiving Best-Dart of visit',
        type: 'select',
        defaultValue: 'lastDart',
        options: [
          { label: 'Last Dart Counts (Classic Risk/Reward)', value: 'lastDart' },
          { label: 'Best Dart of 3 (Casual)', value: 'bestDart' },
        ],
      },
      {
        key: 'gimmeBull',
        label: 'Bullseye Par Rescue ("Gimme")',
        description: 'Hitting Inner Bull (50) saves any hole for an instant Par (E)',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'battleship',
    title: 'Battleship Darts',
    tagline: 'Hunt hidden rival fleets across the dartboard. Trigger Sonar Pings!',
    description:
      'Tactical naval warfare mapped straight onto the dartboard. Every player’s secret fleet is hidden across adjacent wedges. Fire salvos to score direct Hits, sink Carriers, Cruisers & Submarines, and land Doubles, Trebles or Bullseye for Radar Sonar Pings!',
    category: 'Arcade',
    status: 'playable',
    component: BattleshipGame,
    accent: 'sky',
    icon: Radar,
    minPlayers: 2,
    maxPlayers: 4,
    estimatedMinutes: '10–15 min',
    difficulty: 'Balanced',
    tags: ['Tactical', 'Hidden Fleet', 'Sonar Ping'],
    rules: [
      {
        title: '1. Secret Fleets on the Board',
        description:
          'Each player has a hidden fleet (Carrier 3, Cruiser 2, Sub 2 — or Blitz 2+2) arranged across adjacent dartboard wedges.',
      },
      {
        title: '2. Fire & Track Hits / Misses',
        description:
          'Throw at any wedge to fire on your rival’s waters. Crimson flashes mark direct HITS, dark rose marks SUNK vessels, and slate marks SPLASH misses.',
      },
      {
        title: '3. Sonar Pings & Victory',
        description:
          'Hit a Double, Treble, or Bullseye to pulse Amber Sonar on an adjacent hidden ship wedge. First commander to sink their rival’s entire fleet wins!',
      },
    ],
    configOptions: [
      {
        key: 'fleetSize',
        label: 'Fleet Size',
        type: 'select',
        defaultValue: 'standard',
        options: [
          { label: 'Standard Fleet (Carrier 3 + Cruiser 2 + Sub 2)', value: 'standard' },
          { label: 'Blitz Fleet (Cruiser 2 + Sub 2)', value: 'blitz' },
        ],
      },
      {
        key: 'sonarOnMulti',
        label: 'Sonar Ping on Doubles / Trebles',
        description: 'Multipliers & Bull reveal an adjacent hidden enemy ship wedge',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'cricket',
    title: 'Cricket',
    tagline: 'Close 20 → 15 & Bull. Rack up points or punish rivals in Cut-Throat!',
    description:
      'The world’s premier tactical pub & tournament darts battle. Score 3 marks on each target (20, 19, 18, 17, 16, 15, Bull) to close it. Once closed, extra hits pile points onto your score — or dump penalty points onto open rivals in Cut-Throat!',
    category: 'Classic',
    status: 'playable',
    component: CricketGame,
    accent: 'emerald',
    icon: Grid3x3,
    minPlayers: 2,
    maxPlayers: 4,
    estimatedMinutes: '10–18 min',
    difficulty: 'Skill',
    tags: ['Classic', 'Tactical', 'Cut-Throat'],
    rules: [
      {
        title: '1. Mark 20, 19, 18, 17, 16, 15 & Bull',
        description:
          'Singles add 1 mark (/), Doubles add 2 marks (X), and Trebles add 3 marks (⊗). Outer Bull = 1 mark, Inner Bull = 2 marks.',
      },
      {
        title: '2. Close to Open Scoring',
        description:
          'Reach 3 marks to CLOSE a number. Extra hits on your closed number score points as long as at least one rival hasn’t closed it yet.',
      },
      {
        title: '3. Standard vs Cut-Throat',
        description:
          'In Standard, close all 7 targets with the HIGHEST score to win. In Cut-Throat, overflow points are dumped onto open rivals — lowest score wins!',
      },
    ],
    configOptions: [
      {
        key: 'variant',
        label: 'Cricket Variant',
        type: 'select',
        defaultValue: 'standard',
        options: [
          { label: 'Standard (Highest Score Wins)', value: 'standard' },
          { label: 'Cut-Throat (Dump Points on Rivals)', value: 'cutthroat' },
        ],
      },
      {
        key: 'targets',
        label: 'Target Set',
        type: 'select',
        defaultValue: 'classic',
        options: [{ label: 'Classic (20–15 & Bull)', value: 'classic' }],
      },
    ],
  },
  {
    id: 'sniper-bingo',
    title: 'Sniper Bingo',
    tagline: 'Shuffled 3×3 neon Bingo cards. Complete a line or Blackout!',
    description:
      'Fast, chaotic social precision for 2 to 6 players! Every player gets a freshly shuffled 3×3 Bingo grid centered on Bullseye. Nail your glowing targets on the dartboard to stamp squares and shout BINGO before anyone else!',
    category: 'Party',
    status: 'playable',
    component: SniperBingoGame,
    accent: 'purple',
    icon: LayoutGrid,
    minPlayers: 2,
    maxPlayers: 6,
    estimatedMinutes: '8–14 min',
    difficulty: 'Casual',
    tags: ['Bingo', 'Party Hit', 'Multi-Player'],
    rules: [
      {
        title: '1. Your Unique 3×3 Neon Card',
        description:
          'Every player receives a unique 3×3 grid of targets with Bullseye anchored in the center. Only your remaining card targets light up on your turn.',
      },
      {
        title: '2. Classic or Pro Doubles/Trebles',
        description:
          'Play Classic mode (any bed on your 8 numbers + Bull) or Pro Sniper mode (4 exact Doubles + 4 exact Trebles + Bull).',
      },
      {
        title: '3. Line or Full Blackout',
        description:
          'Watch pulsing amber Match-Point tiles when 1 square away! First player to finish any 3-in-a-row line (or all 9 in Blackout) wins instantly.',
      },
    ],
    configOptions: [
      {
        key: 'cardMode',
        label: 'Card Difficulty',
        type: 'select',
        defaultValue: 'classic',
        options: [
          { label: 'Classic (Any Bed Numbers + Bull)', value: 'classic' },
          { label: 'Pro Sniper (Exact Doubles & Trebles + Bull)', value: 'pro' },
        ],
      },
      {
        key: 'winPattern',
        label: 'Winning Pattern',
        type: 'select',
        defaultValue: 'line',
        options: [
          { label: 'Any 3-in-a-Row Line (Fast)', value: 'line' },
          { label: 'Full Blackout (All 9 Squares)', value: 'blackout' },
        ],
      },
    ],
  },
  // =========================================================================
  // SOLO TRAINING MODE — PRO PRACTICE DRILLS
  // =========================================================================
  {
    id: 'bobs-27',
    title: "Bob's 27",
    tagline: 'Start on 27. Hit every double D1 → Bull or lose points.',
    description:
      'The gold-standard PDC doubles drill. Throw 3 darts at every double from D1 through D20 and Bullseye. Each hit adds the double value; missing all 3 deducts it. Stay above zero to conquer the board!',
    category: 'Practice',
    mode: 'practice',
    status: 'playable',
    component: Bobs27Game,
    accent: 'emerald',
    icon: Crosshair,
    minPlayers: 1,
    maxPlayers: 1,
    estimatedMinutes: '6–10 min',
    difficulty: 'Skill',
    tags: ['Solo Drill', 'Doubles', 'PDC Classic'],
    rules: [
      {
        title: '1. Start on 27 Points',
        description: 'Throw 3 darts at Double 1, then Double 2, all the way up to D20 and Bull.',
      },
      {
        title: '2. Hit to Add, Miss All 3 to Deduct',
        description:
          'Every hit adds the double value (+2 on D1 up to +50 on Bull). Missing all 3 subtracts that double from your score.',
      },
      {
        title: '3. Stay Above Zero',
        description: 'Drop below 0 in Standard mode and the drill ends. Beat your personal high score!',
      },
    ],
    configOptions: [
      {
        key: 'includeBull',
        label: 'Include Bullseye Finale',
        description: 'Finish with 3 darts at Inner Bull (+50 / -50)',
        type: 'toggle',
        defaultValue: true,
      },
      {
        key: 'failOnNegative',
        label: 'Knockout Below Zero',
        description: 'End drill immediately if score drops below 0 (off = Survival Practice)',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'checkout-121',
    title: '121 Checkout Ladder',
    tagline: '9 darts to check out. Succeed to climb +1 up the ladder.',
    description:
      'Build real match-finishing nerve. You get 9 darts (3 visits) to check out 121 on a Double or Bull with live PDC checkout highlights. Finish it to climb to 122, 123, 124+ — fail and step back 1.',
    category: 'Practice',
    mode: 'practice',
    status: 'playable',
    component: Checkout121Game,
    accent: 'sky',
    icon: TrendingUp,
    minPlayers: 1,
    maxPlayers: 1,
    estimatedMinutes: '8–12 min',
    difficulty: 'Skill',
    tags: ['Solo Drill', 'Checkouts', 'Clutch'],
    rules: [
      {
        title: '1. 9 Darts Per Finish',
        description: 'You have 3 visits to check out the active target using standard Double-Out rules.',
      },
      {
        title: '2. Climb on Checkout',
        description: 'Hit the winning double and immediately move up +1 (121 → 122 → 123...).',
      },
      {
        title: '3. Live Board Routes',
        description: 'Optimal PDC checkout beds pulse right on the dartboard after every dart.',
      },
    ],
    configOptions: [
      {
        key: 'startTarget',
        label: 'Starting Checkout',
        type: 'select',
        defaultValue: 121,
        options: [
          { label: '121 (Pro Standard)', value: 121 },
          { label: '101 (Intermediate)', value: 101 },
          { label: '81 (Warm-Up)', value: 81 },
          { label: '61 (2-Dart Finishes)', value: 61 },
        ],
      },
      {
        key: 'maxTargets',
        label: 'Session Length',
        type: 'select',
        defaultValue: 10,
        options: [
          { label: '5 Targets (Quick)', value: 5 },
          { label: '10 Targets (Standard)', value: 10 },
          { label: '15 Targets (Deep Grind)', value: 15 },
        ],
      },
      {
        key: 'safeFloor',
        label: 'Safe Starting Floor',
        description: 'Never drop below your starting target on misses',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'jdc-challenge',
    title: 'JDC Challenge',
    tagline: 'Official 3-stage scored routine. Earn your JDC Belt rank.',
    description:
      'The official Junior Darts Corporation training benchmark: Shanghai 10–15, Around-the-World Doubles (D1–D20 + Bull), and Shanghai 15–20. Earn +100 Shanghai bonuses and climb from White Belt to Black Belt!',
    category: 'Practice',
    mode: 'practice',
    status: 'playable',
    component: JdcChallengeGame,
    accent: 'purple',
    icon: Award,
    minPlayers: 1,
    maxPlayers: 1,
    estimatedMinutes: '10–14 min',
    difficulty: 'Balanced',
    tags: ['Solo Drill', 'Belt Rating', 'All-Round'],
    rules: [
      {
        title: '1. Stage 1 — Shanghai 10 to 15',
        description: '3 darts per number (10→15). S/D/T count; hitting all three in one visit adds +100!',
      },
      {
        title: '2. Stage 2 — Doubles Gauntlet',
        description: '1 dart at every double from D1 to D20 (+50 each) plus Bullseye (+100).',
      },
      {
        title: '3. Stage 3 — Shanghai 15 to 20',
        description: 'Finish strong on 15→20 to lock in your official JDC Belt colour.',
      },
    ],
    configOptions: [],
  },
  {
    id: 'scoring-gauntlet',
    title: '99-Dart Scoring Gauntlet',
    tagline: 'Pure power scoring benchmark. Track live 3DA & Ton+ pace.',
    description:
      'Lock onto T20, T19, Bullseye, or Free Scoring for a fixed dart count (30, 60, or 99 darts). Measures exact 3-Dart Average, target hit percentage, and Ton+ bursts without distraction.',
    category: 'Practice',
    mode: 'practice',
    status: 'playable',
    component: ScoringGauntletGame,
    accent: 'amber',
    icon: Zap,
    minPlayers: 1,
    maxPlayers: 1,
    estimatedMinutes: '5–10 min',
    difficulty: 'Casual',
    tags: ['Solo Drill', '3DA Benchmark', 'Heavy Scoring'],
    rules: [
      {
        title: '1. Pick Your Focus Bed',
        description: 'Highlight T20, T19, Bullseye, or throw Free Scoring across the full board.',
      },
      {
        title: '2. Hammer Every Visit',
        description: 'Track live 3-Dart Average, Target Hit %, and 60+/100+/140+/180 bursts.',
      },
    ],
    configOptions: [
      {
        key: 'dartCount',
        label: 'Total Darts',
        type: 'select',
        defaultValue: 99,
        options: [
          { label: '30 Darts (Quick Warmup)', value: 30 },
          { label: '60 Darts (Club Set)', value: 60 },
          { label: '99 Darts (Classic Benchmark)', value: 99 },
        ],
      },
      {
        key: 'focus',
        label: 'Target Focus',
        type: 'select',
        defaultValue: 'T20',
        options: [
          { label: 'Treble 20 Focus', value: 'T20' },
          { label: 'Treble 19 Focus', value: 'T19' },
          { label: 'Bullseye Focus', value: 'Bull' },
          { label: 'Free Scoring', value: 'free' },
        ],
      },
    ],
  },
  {
    id: 'around-the-clock',
    title: 'Around the Clock Pro',
    tagline: 'Sprint 1 → 20 → Bull in strict order. Doubles & Trebles skip ahead!',
    description:
      'The ultimate board-coverage warmup and precision benchmark. Hit every number from 1 to 20 and finish on the Bullseye. Crank up the difficulty with Doubles-Only or Trebles-Only rings, or enable Turbo Skip to vault +2/+3 numbers on big hits!',
    category: 'Practice',
    mode: 'practice',
    status: 'playable',
    component: AroundTheClockGame,
    accent: 'emerald',
    icon: Clock,
    minPlayers: 1,
    maxPlayers: 1,
    estimatedMinutes: '4–8 min',
    difficulty: 'Casual',
    tags: ['Solo Drill', 'Board Coverage', 'Speedrun'],
    rules: [
      {
        title: '1. Climb 1 Through 20',
        description:
          'Hit the glowing active target number in order from 1 up to 20. Your current target pulses bright emerald on the board.',
      },
      {
        title: '2. Turbo Skip Multiplier',
        description:
          'When Turbo Skip is ON in Any-Ring mode, hitting a Double leaps ahead +2 numbers and a Treble vaults +3 numbers!',
      },
      {
        title: '3. Bullseye Finale',
        description:
          'Clear 20 and nail the Bullseye to stop the clock in as few darts as possible and chase a new personal record.',
      },
    ],
    configOptions: [
      {
        key: 'ringMode',
        label: 'Ring Mode',
        description: 'Require any bed, Doubles only, or Trebles only',
        type: 'select',
        defaultValue: 'any',
        options: [
          { label: 'Any Bed (Classic)', value: 'any' },
          { label: 'Doubles Only (Pro)', value: 'doubles' },
          { label: 'Trebles Only (Elite)', value: 'trebles' },
        ],
      },
      {
        key: 'turboSkip',
        label: 'Turbo Skip (D=+2, T=+3)',
        description: 'Doubles advance 2 numbers & Trebles advance 3 in Any-Bed mode',
        type: 'toggle',
        defaultValue: true,
      },
      {
        key: 'includeBull',
        label: 'Finish on Bullseye',
        description: 'Require Bull after 20 to complete the clock',
        type: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'catch-40',
    title: 'Catch 40',
    tagline: 'PDC finishing mastery: 61 → 100 in 6 darts per target.',
    description:
      'Used by world champions to sharpen clutch two-dart and three-dart checkouts. You get 6 darts (2 visits) on every finish from 61 through 100 with live PDC Double-Out route highlights on the board. Finish faster to earn maximum points!',
    category: 'Practice',
    mode: 'practice',
    status: 'playable',
    component: Catch40Game,
    accent: 'sky',
    icon: Trophy,
    minPlayers: 1,
    maxPlayers: 1,
    estimatedMinutes: '12–18 min',
    difficulty: 'Skill',
    tags: ['Solo Drill', 'Checkouts', 'PDC Pro'],
    rules: [
      {
        title: '1. 6 Darts Per Checkout (61 → 100)',
        description:
          'Attempt every finish from 61 up to 100 (or 61–80 in Quick 20) using strict Double-Out rules across 2 visits.',
      },
      {
        title: '2. Speed-Scored Points',
        description:
          'Check out in 2 darts = +3 pts (Gold), 3 darts = +2 pts (Emerald), 4–6 darts = +1 pt (Sky), fail or bust Visit 2 = 0 pts.',
      },
      {
        title: '3. Follow Live PDC Routes',
        description:
          'Optimal checkout paths update after every dart and pulse directly on the dartboard to train pro finishing habits.',
      },
    ],
    configOptions: [
      {
        key: 'length',
        label: 'Gauntlet Length',
        type: 'select',
        defaultValue: 40,
        options: [
          { label: 'Full Catch 40 (61 → 100)', value: 40 },
          { label: 'Quick 20 (61 → 80)', value: 20 },
        ],
      },
    ],
  },
  {
    id: 'precision-sniper',
    title: 'Precision Sniper',
    tagline: 'Lock onto elite Treble & Double circuits. Chase low Darts-Per-Hit.',
    description:
      'Pure surgical target grouping. Work through curated pro circuits — Trebles Down (T20→T10), Finishing Doubles (D20, D16, D8, D4, D10, D12, D18, Bull), or Power Core (T20, T19, T18, Bull) — nailing your required hits on each bed before advancing.',
    category: 'Practice',
    mode: 'practice',
    status: 'playable',
    component: PrecisionSniperGame,
    accent: 'purple',
    icon: Focus,
    minPlayers: 1,
    maxPlayers: 1,
    estimatedMinutes: '6–12 min',
    difficulty: 'Skill',
    tags: ['Solo Drill', 'Grouping', 'Surgical'],
    rules: [
      {
        title: '1. Exact Bed Required',
        description:
          'Only direct hits inside the pulsing target ring (e.g., T20, D16, or Inner Bull) light up a target pip.',
      },
      {
        title: '2. Complete Every Target',
        description:
          'Fill all required hit pips on the active target to automatically lock onto the next bed in the circuit.',
      },
      {
        title: '3. Minimize Darts-Per-Hit',
        description:
          'Clear the full circuit in the fewest total darts to drive down your Darts-Per-Hit ratio and boost accuracy %.',
      },
    ],
    configOptions: [
      {
        key: 'circuit',
        label: 'Target Circuit',
        type: 'select',
        defaultValue: 'trebles',
        options: [
          { label: 'Trebles Down (T20 → T10)', value: 'trebles' },
          { label: 'Pro Doubles (D20, D16, D8... Bull)', value: 'doubles' },
          { label: 'Power Core (T20, T19, T18, Bull)', value: 'power' },
        ],
      },
      {
        key: 'hitsPerTarget',
        label: 'Hits Per Target',
        type: 'select',
        defaultValue: 2,
        options: [
          { label: '1 Hit (Fast)', value: 1 },
          { label: '2 Hits (Standard)', value: 2 },
          { label: '3 Hits (Pro Grouping)', value: 3 },
        ],
      },
    ],
  },
];

export function getGameDefinition(id: string): GameDefinition | undefined {
  return GAME_REGISTRY.find((g) => g.id === id);
}

export function getArcadeGames(): GameDefinition[] {
  return GAME_REGISTRY.filter((g) => g.mode !== 'practice');
}

export function getPracticeDrills(): GameDefinition[] {
  return GAME_REGISTRY.filter((g) => g.mode === 'practice');
}

export function getDefaultConfigForGame(game: GameDefinition): GameMatchConfig {
  const config: GameMatchConfig = {};
  for (const opt of game.configOptions) {
    config[opt.key] = opt.defaultValue;
  }
  return config;
}

export function getPlayableGames(): GameDefinition[] {
  return GAME_REGISTRY.filter((g) => g.status !== 'coming_soon' && Boolean(g.component));
}
