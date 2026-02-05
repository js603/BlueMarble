import { useState, useCallback, useRef, useEffect, MutableRefObject } from 'react';
import { GameState, ChatMessage, UserProfile, RoomInfo, P2PMessage } from '../types';
import {
    joinGameRoom,
    sendGameMessage,
    waitForPeerConnection,
    getGamePeers
} from '../services/p2pService';
import { startBGM } from '../services/audioService';
import { PLAYER_COLORS } from '../constants';

interface UseP2PConnectionProps {
    userProfile: UserProfile | null;
    gameStateRef: MutableRefObject<GameState>;
    setGameStateInternal: (action: GameState | ((prev: GameState) => GameState)) => void;
    setChatMessages: (action: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    setShowLobby: (show: boolean) => void;
    playerActionRef: MutableRefObject<(action: 'ROLL_DICE' | 'NEXT_TURN', playerId: number) => void>;
}

export function useP2PConnection({
    userProfile,
    gameStateRef,
    setGameStateInternal,
    setChatMessages,
    setShowLobby,
    playerActionRef
}: UseP2PConnectionProps) {
    const [isHost, setIsHost] = useState(false);
    const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
    const [connectedPeers, setConnectedPeers] = useState<string[]>([]); // Connected Peer ID list
    const [peerNicknames, setPeerNicknames] = useState<Record<string, string>>({}); // peerId -> nickname
    const peerPlayerIdsRef = useRef<Record<string, number>>({}); // peerId -> playerId (Ref for stable callbacks)

    const roomRef = useRef<any>(null); // Type returned from joinGameRoom

    const handleJoinOrCreateRoom = useCallback((roomId: string, mode: 'HOST' | 'GUEST', initialInfo?: RoomInfo) => {
        const isHostMode = mode === 'HOST';
        setIsHost(isHostMode);
        setShowLobby(false);
        startBGM();

        if (initialInfo) {
            setCurrentRoom(initialInfo);
        }

        const room = joinGameRoom(roomId, (msg: P2PMessage, peerId: string) => {
            // 1. STATE_SYNC
            if (msg.type === 'STATE_SYNC') {
                const remoteState = msg.payload as GameState;
                setGameStateInternal(prev => {
                    const myId = prev.myPlayerId;
                    // Guest: Replace my player's name with my actual nickname
                    if (!isHostMode && userProfile && myId) {
                        const updatedPlayers = remoteState.players.map(p =>
                            p.id === myId ? { ...p, name: userProfile.name } : p
                        );
                        return {
                            ...remoteState,
                            players: updatedPlayers,
                            myPlayerId: myId
                        };
                    }
                    return {
                        ...remoteState,
                        myPlayerId: myId || (isHostMode ? 1 : undefined)
                    };
                });
            }
            // 2. CHAT
            else if (msg.type === 'CHAT') {
                setChatMessages(prev => [...prev, msg.payload as ChatMessage]);
            }
            // 3. PLAYER_ID_ASSIGN
            else if (msg.type === 'PLAYER_ID_ASSIGN' && !isHostMode) {
                const assignedId = msg.payload as number;
                setGameStateInternal(prev => ({
                    ...prev,
                    myPlayerId: assignedId
                }));
            }
            // 4. GUEST_NICKNAME
            else if (msg.type === 'GUEST_NICKNAME' && isHostMode) {
                setPeerNicknames(prev => ({
                    ...prev,
                    [peerId]: msg.payload
                }));
            }
            // 5. HOST_MIGRATION
            else if (msg.type === 'HOST_MIGRATION') {
                const { newHostPlayerId } = msg.payload;
                if (gameStateRef.current.myPlayerId !== newHostPlayerId) {
                    setIsHost(false);
                }
            }
            // 6. ROOM_UPDATE
            else if (msg.type === 'ROOM_UPDATE') {
                const updatedRoom = msg.payload as RoomInfo;
                setCurrentRoom(prev => {
                    if (!prev || prev.id !== updatedRoom.id) return prev;
                    return { ...prev, ...updatedRoom };
                });
            }
            // 7. PLAYER_ACTION (Host Only)
            else if (msg.type === 'PLAYER_ACTION' && isHostMode) {
                const { action, playerId } = msg.payload;
                playerActionRef.current(action, playerId);
            }
        }, (peerId) => {
            // Peer Joined
            setConnectedPeers(prev => [...prev, peerId]);

            if (isHostMode) {
                setCurrentRoom(prev => {
                    if (!prev) return prev;
                    const updatedRoom = {
                        ...prev,
                        currentPlayers: Math.min(prev.maxPlayers, prev.currentPlayers + 1),
                        lastUpdated: Date.now()
                    };
                    sendGameMessage({ type: 'ROOM_UPDATE', payload: updatedRoom });
                    return updatedRoom;
                });
                waitForPeerConnection(peerId).then((connected) => {
                    if (connected) {
                        // Calculate next available Player ID
                        const existingIds = Object.values(peerPlayerIdsRef.current);
                        let nextId = 2;
                        while (existingIds.includes(nextId)) {
                            nextId++;
                        }
                        peerPlayerIdsRef.current[peerId] = nextId;
                        sendGameMessage({ type: 'PLAYER_ID_ASSIGN', payload: nextId });
                    }
                });
            }

            if (!isHostMode && userProfile) {
                waitForPeerConnection(peerId).then((connected) => {
                    if (connected) {
                        sendGameMessage({ type: 'GUEST_NICKNAME', payload: userProfile.name });
                    }
                });
            }
        }, (peerId) => {
            // Peer Left
            setConnectedPeers(prev => prev.filter(id => id !== peerId));
            setPeerNicknames(prev => {
                const updated = { ...prev };
                delete updated[peerId];
                return updated;
            });
            delete peerPlayerIdsRef.current[peerId];

            // Host Migration
            if (!isHostMode) {
                const myId = gameStateRef.current.myPlayerId;
                const remainingPeerIds: number[] = Object.entries(peerPlayerIdsRef.current)
                    .filter(([pid]) => pid !== peerId)
                    .map(([, playerId]) => playerId as number);

                if (myId) remainingPeerIds.push(myId);

                if (remainingPeerIds.length > 0) {
                    const lowestId = Math.min(...remainingPeerIds);
                    if (myId === lowestId) {
                        setIsHost(true);
                        alert('호스트가 나갔습니다. 당신이 새로운 호스트가 되었습니다!');
                        sendGameMessage({ type: 'HOST_MIGRATION', payload: { newHostPlayerId: myId } });
                    }
                }
            }

            if (isHostMode) {
                setCurrentRoom(prev => {
                    if (!prev) return prev;
                    const updatedRoom = {
                        ...prev,
                        currentPlayers: Math.max(1, prev.currentPlayers - 1),
                        lastUpdated: Date.now()
                    };
                    sendGameMessage({ type: 'ROOM_UPDATE', payload: updatedRoom });
                    return updatedRoom;
                });
            }
        });

        roomRef.current = room;

        if (isHostMode) {
            setGameStateInternal(prev => ({ ...prev, myPlayerId: 1 }));
        }
    }, [userProfile, gameStateRef, setGameStateInternal, setChatMessages, setShowLobby]);

    return {
        isHost,
        setIsHost,
        currentRoom,
        setCurrentRoom,
        connectedPeers,
        peerNicknames,
        peerPlayerIds: peerPlayerIdsRef.current,
        handleJoinOrCreateRoom
    };
}
