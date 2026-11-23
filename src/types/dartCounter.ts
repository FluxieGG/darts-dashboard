export type DartCounterBridgeMode = 'auto' | 'confirm' | 'read-only';

export interface DartCounterPendingInvite {
  id: string;
  fromName: string;
  summary: string;
  detectedAt: number;
}

export interface DartCounterOnlineFriend {
  userId: number | string;
  name: string;
  status:
    | 'online'
    | 'in_lobby'
    | 'in_queue'
    | 'spectating'
    | 'busy'
    | 'online_game'
    | 'local_game'
    | 'offline'
    | string;
  avg?: number | null;
  country?: string | null;
}

export interface DartCounterLiveMatchState {
  isMatchActive: boolean;
  startScore: 501 | 301 | 701;
  outRule: 'double' | 'straight';
  legsToWin: number;
  playerName: string;
  opponentName: string;
  playerRemaining: number;
  opponentRemaining: number | null;
  playerLegs: number;
  opponentLegs: number;
  playerAvg: number | null;
  opponentAvg: number | null;
  isPlayerTurn: boolean;
  pendingInvites?: DartCounterPendingInvite[];
  onlineFriends?: DartCounterOnlineFriend[];
  outgoingInviteTo?: string | null;
  url?: string;
  updatedAt: number;
}

export interface DartCounterPendingVisit {
  id: string;
  score: number;
  throws: string[];
  dartsUsed: number;
  dartsAtDouble?: number;
  isBust: boolean;
  isCheckout: boolean;
  createdAt: number;
}

export interface DartCounterSubmitResult {
  visitId: string;
  ok: boolean;
  score: number;
  message: string;
  timestamp: number;
}

export interface DartCounterBridgeConfig {
  mode: DartCounterBridgeMode;
  submitOnTakeout: boolean;
}

export type DartCounterControlCommand =
  | {
      action: 'start_dartbot';
      startScore: 501 | 301 | 701;
      outRule: 'double' | 'straight';
      legsToWin: number;
      botLevel: number;
    }
  | { action: 'open_online' }
  | { action: 'open_friends' }
  | { action: 'refresh_friends' }
  | {
      action: 'invite_friend';
      userId?: number | string;
      friendName: string;
      startScore?: 501 | 301 | 701;
      outRule?: 'double' | 'straight';
      legsToWin?: number;
    }
  | { action: 'cancel_invite' }
  | { action: 'accept_invite'; inviteId?: string; fromName?: string }
  | { action: 'decline_invite'; inviteId?: string; fromName?: string }
  | { action: 'undo_score' }
  | { action: 'rematch' }
  | { action: 'leave_match' };

export interface DartCounterControlResult {
  action: string;
  ok: boolean;
  message: string;
  timestamp: number;
}
