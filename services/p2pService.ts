import { joinRoom } from 'trystero';
import { GameState, ChatMessage, P2PMessage } from '../types';

// Use torrent strategy (WebTorrent technology)
const CONFIG = {
  appId: 'nebula-marble-v2',
  rtcConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
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

  // Trystero uses BitTorrent trackers over WebRTC
  room = joinRoom(CONFIG, roomId);
  currentRoomId = roomId;

  const [send, get] = room.makeAction('gameAction');

  sendAction = send;
  onActionReceive = get;

  console.log(`[P2P] Joined room: ${roomId}`);
  return room;
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