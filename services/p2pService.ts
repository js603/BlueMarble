// Switched to MQTT strategy for faster/reliable signaling
import { joinRoom } from 'trystero/mqtt';
import { GameState, ChatMessage, P2PMessage } from '../types';

const CONFIG = {
  appId: 'nebula-marble-v2',
  // Public MQTT Broker (Archives of reliability: test.mosquitto.org or broker.hivemq.com)
  // We use wss:// (Secure WebSocket) which is required for HTTPS pages.
  brokerUrl: 'wss://test.mosquitto.org:8081',
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

let room: any = null;
let sendAction: any = null;
let onActionReceive: any = null;

let currentRoomId: string | null = null;

export const initP2PRoom = (roomId: string) => {
  if (room) {
    if (currentRoomId === roomId) {
      console.log(`[P2P] Already in room: ${roomId}`);
      return room;
    }
    console.log(`[P2P] Switching room from ${currentRoomId} to ${roomId}`);
    leaveP2PRoom();
  }

  // Trystero (Torrent) uses these trackers by default, but we enforce them plus more
  // Note: Trystero's joinRoom config doesn't seemingly natively accept trackerUrls in the typed config
  // unless we cast or it's implicitly supported. 
  // Should check if we can pass it. 
  // If not, we rely on defaults. 
  // Let's stick to the typed config to avoid TS errors, but add more STUNs.
  // Actually, Trystero uses `tracker.openwebtorrent.com` etc.

  room = joinRoom(CONFIG, roomId);
  currentRoomId = roomId;

  // Debug: Log peer events immediately
  room.onPeerJoin((peerId: string) => console.log(`[P2P] Raw Peer Joined: ${peerId}`));
  room.onPeerLeave((peerId: string) => console.log(`[P2P] Raw Peer Left: ${peerId}`));

  const [send, get] = room.makeAction('gameAction');

  sendAction = send;
  onActionReceive = get;

  console.log(`[P2P] Joined room: ${roomId}`);
  return room;
};

export const getPeers = () => {
  if (!room) return [];
  return room.getPeers(); // Trystero returns simple map or list usually
};

export const broadcastState = (state: GameState) => {
  if (sendAction) {
    // Only send essential data to save bandwidth, but for simplicity we send full state here
    // In a production app, we would send deltas
    const msg: P2PMessage = {
      type: 'STATE_SYNC',
      payload: state
    };
    sendAction(msg);
  }
};

export const broadcastChat = (message: ChatMessage) => {
  if (sendAction) {
    const msg: P2PMessage = {
      type: 'CHAT',
      payload: message
    };
    sendAction(msg);
  }
};

// New Generic Sender
export const sendGenericMessage = (msg: P2PMessage) => {
  if (sendAction) {
    sendAction(msg);
  }
}

export const onP2PMessage = (callback: (msg: P2PMessage) => void) => {
  if (onActionReceive) {
    onActionReceive((data: P2PMessage, peerId: string) => {
      callback(data);
    });
  }
};

export const onPeerJoin = (callback: (peerId: string) => void) => {
  if (room) {
    room.onPeerJoin(callback);
  }
};

export const leaveP2PRoom = () => {
  if (room) {
    try {
      room.leave();
    } catch (e) {
      console.error('[P2P] Error leaving room:', e);
    }
    room = null;
    sendAction = null;
    onActionReceive = null;
    currentRoomId = null;
    console.log('[P2P] Left room');
  }
};