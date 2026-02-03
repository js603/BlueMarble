import { joinRoom } from 'trystero/nostr';
import { GameState, ChatMessage, P2PMessage, RoomInfo } from '../types';

const CONFIG = {
  appId: 'nebula-marble-v2-global', // Unique App ID for Nostr
  relayUrls: [
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.nostr.wirednet.jp',
    'wss://nostr.fmt.wiz.biz',
    'wss://relay.orangepill.dev'
  ],
  rtcConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  }
};

const LOBBY_ROOM_ID = 'nebula-marble-lobby-v2-global';



// --- Global State ---
let lobbyRoom: any = null;
let gameRoom: any = null;

let lobbyActions: { send: any, get: any } | null = null;
let gameActions: { send: any, get: any } | null = null;

// --- Lobby Functions ---

export const joinLobby = (onRoomListUpdate: (info: RoomInfo) => void) => {
  if (lobbyRoom) return;

  console.log('[P2P] Joining Lobby (Nostr)...');
  lobbyRoom = joinRoom(CONFIG, LOBBY_ROOM_ID);

  const [send, get] = lobbyRoom.makeAction('lobbyAction');
  lobbyActions = { send, get };

  // Listen for room advertisements
  get((msg: P2PMessage, peerId: string) => {
    if (msg.type === 'ROOM_ADVERTISE') {
      const info = msg.payload as RoomInfo;
      console.log(`[Lobby] Received room ad: ${info.name} from ${peerId}`);
      onRoomListUpdate(info);
    }
  });

  console.log('[P2P] Lobby joined successfully via Nostr relays');
};

export const leaveLobby = () => {
  if (lobbyRoom) {
    lobbyRoom.leave();
    lobbyRoom = null;
    lobbyActions = null;
    console.log('[P2P] Left Lobby');
  }
};

export const advertiseRoom = (roomInfo: RoomInfo) => {
  if (lobbyActions) {
    const msg: P2PMessage = {
      type: 'ROOM_ADVERTISE',
      payload: roomInfo
    };
    lobbyActions.send(msg);
    console.log(`[P2P] Broadcasting room: ${roomInfo.name}`);
  }
};


// --- Game Room Functions ---

export const joinGameRoom = (roomId: string, onMessage: (msg: P2PMessage, peerId: string) => void, onPeerJoin: (peerId: string) => void, onPeerLeave: (peerId: string) => void) => {
  if (gameRoom) {
    console.warn('[P2P] Already in a game room, leaving first...');
    leaveGameRoom();
  }

  console.log(`[P2P] Joining Game Room (Nostr): ${roomId}`);
  gameRoom = joinRoom(CONFIG, roomId);

  const [send, get] = gameRoom.makeAction('gameAction');
  gameActions = { send, get };

  // Setup Event Listeners
  gameRoom.onPeerJoin((peerId: string) => {
    console.log(`[P2P] ✅ Peer Joined Game: ${peerId}`);
    onPeerJoin(peerId);
  });

  gameRoom.onPeerLeave((peerId: string) => {
    console.log(`[P2P] ❌ Peer Left Game: ${peerId}`);
    onPeerLeave(peerId);
  });

  get((msg: P2PMessage, peerId: string) => {
    onMessage(msg, peerId);
  });

  console.log(`[P2P] Game room joined successfully`);
  return gameRoom;
};

export const leaveGameRoom = () => {
  if (gameRoom) {
    try {
      gameRoom.leave();
    } catch (e) {
      console.error('[P2P] Error leaving game room:', e);
    }
    gameRoom = null;
    gameActions = null;
    console.log('[P2P] Left Game Room');
  }
};

export const broadcastGameState = (state: GameState) => {
  if (gameActions) {
    const msg: P2PMessage = {
      type: 'STATE_SYNC',
      payload: state
    };
    gameActions.send(msg);
  }
};

export const broadcastGameChat = (chatMsg: ChatMessage) => {
  if (gameActions) {
    const msg: P2PMessage = {
      type: 'CHAT',
      payload: chatMsg
    };
    gameActions.send(msg);
  }
};

export const sendGameMessage = (msg: P2PMessage) => {
  if (gameActions) {
    gameActions.send(msg);
  }
};


export const getGamePeers = () => {
  if (!gameRoom) return [];
  const peers = gameRoom.getPeers();
  return Object.keys(peers); // Convert object to array of peer IDs
};

// Check if a specific peer is connected
export const isPeerConnected = (peerId: string): boolean => {
  if (!gameRoom) return false;
  const peers = gameRoom.getPeers();
  const peer = peers[peerId];
  if (!peer) return false;

  // Check RTCPeerConnection state
  const pc = peer as RTCPeerConnection;
  return pc.connectionState === 'connected' || pc.iceConnectionState === 'connected';
};

// Wait for peer connection to be established
export const waitForPeerConnection = (peerId: string, timeoutMs = 5000): Promise<boolean> => {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const checkConnection = () => {
      if (isPeerConnected(peerId)) {
        resolve(true);
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        console.warn(`[P2P] Peer connection timeout for ${peerId}`);
        resolve(false);
        return;
      }

      setTimeout(checkConnection, 100); // Check every 100ms
    };

    checkConnection();
  });
};