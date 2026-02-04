export enum CellType {
  START = 'START',
  CITY = 'CITY',
  ISLAND = 'ISLAND', // Desert Island
  CHANCE = 'CHANCE', // Golden Key
  OLYMPIC = 'OLYMPIC', // Formerly Space Travel -> Now Olympic/World Tour
  TAX = 'TAX', // Social Welfare Fund
}

export interface BoardCell {
  id: number;
  name: string;
  type: CellType;
  price: number; // Base Land Price
  rent: number; // Base Rent
  ownerId: number | null;
  color: string;
  buildingLevel: number; // 0: Land, 1: Villa, 2: Building, 3: Hotel, 4: Landmark
  buildingPrices: number[]; // Cost for each level
}

export interface Player {
  id: number;
  name: string;
  money: number;
  position: number;
  color: string;
  avatarId: number; // 0:Rocket, 1:Horse, 2:Car, 3:UFO, 4:Robot
  isBankrupt: boolean;
  isTrapped: number;
  isComputer: boolean;
  hasEscapeCard: boolean; // Golden key keep item
}

export interface ModalState {
  isOpen: boolean;
  type: 'BUY' | 'TAKEOVER' | 'CHANCE' | 'INFO' | 'DEBT' | 'SELL';
  title: string;
  message: string;
  cost?: number;
  targetIndex?: number; // Index of the board cell for action
  onConfirm?: () => void;
  onCancel?: () => void;
  isComputerAction?: boolean; // To visualize AI thinking
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  board: BoardCell[];
  turnCount: number;
  logs: string[];
  gameStatus: 'PLANNING' | 'LOBBY' | 'PLAYING' | 'ENDED';
  winner: number | null;
  diceValue: [number, number];
  isRolling: boolean;
  isMoving: boolean; // New state to track movement animation
  isSelectingMoveTarget: boolean; // New state for Concorde selection
  waitingForNextTurn: boolean;
  consecutiveDoubles: number; // Track doubles
  modal: ModalState | null; // Current active modal
  pendingArrivalId: number | null; // Player ID waiting for arrival processing (e.g., after Golden Key move)
  outstandingDebt: number; // Amount needed to proceed
  creditorId: number | null; // Who needs to be paid (null for bank)

  // P2P Multiplayer Fields
  isMultiplayer: boolean;
  roomId?: string;
  myPlayerId?: number;
  isConnected?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: number | 'SYSTEM' | 'AI';
  senderName: string;
  avatarId?: number; // For chat UI
  text: string;
  timestamp: number;
}

export interface GameEventContext {
  eventName: 'MOVE' | 'BUY' | 'BUILD' | 'TAKEOVER' | 'PAY_RENT' | 'TRAPPED' | 'CHANCE' | 'GAME_OVER' | 'DOUBLE' | 'TRAVEL';
  playerName: string;
  detail: string;
}

// Lobby & Room Types
export interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  password?: string; // Only used for Join Request verification, not broadcasted
  status: 'WAITING' | 'PLAYING';
  lastUpdated: number;
}

export interface P2PMessage {
  type: 'STATE_SYNC' | 'CHAT' | 'JOIN_REQ' | 'START_GAME' | 'ROOM_ADVERTISE' | 'ROOM_REQUEST' | 'GUEST_NICKNAME' | 'PLAYER_ID_ASSIGN' | 'HOST_MIGRATION' | 'PLAYER_ACTION';
  payload: any;
}

export interface UserProfile {
  name: string;
  avatarId: number;
  color: string;
}