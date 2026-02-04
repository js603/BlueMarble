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
}

export function useP2PConnection({
    userProfile,
    gameStateRef,
    setGameStateInternal,
    setChatMessages,
    setShowLobby
}: UseP2PConnectionProps) {
    const [isHost, setIsHost] = useState(false);
    const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
    const [connectedPeers, setConnectedPeers] = useState<string[]>([]); // Connected Peer ID list
    const [peerNicknames, setPeerNicknames] = useState<Record<string, string>>({}); // peerId -> nickname
    const [peerPlayerIds, setPeerPlayerIds] = useState<Record<string, number>>({}); // peerId -> playerId

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
            // 6. PLAYER_ACTION (Host Only)
            else if (msg.type === 'PLAYER_ACTION' && isHostMode) {
                const { action, playerId } = msg.payload;
                const s = gameStateRef.current;
                const currentPlayer = s.players[s.currentPlayerIndex];

                if (currentPlayer && currentPlayer.id === playerId) {
                    if (action === 'NEXT_TURN') {
                        // Process next turn (We'll let App handle the actual turn logic broadscast via Hook)
                        // But for now, we keep the logic here as translated from App.tsx
                        setGameStateInternal(prev => {
                            let nextIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
                            let loopGuard = 0;
                            while (prev.players[nextIndex].isBankrupt && loopGuard < prev.players.length) {
                                nextIndex = (nextIndex + 1) % prev.players.length;
                                loopGuard++;
                            }
                            const active = prev.players.filter(p => !p.isBankrupt);
                            if (active.length === 1) return { ...prev, gameStatus: 'ENDED', winner: active[0].id };
                            return {
                                ...prev,
                                currentPlayerIndex: nextIndex,
                                turnCount: prev.turnCount + 1,
                                consecutiveDoubles: 0,
                                waitingForNextTurn: false,
                                isRolling: false,
                                isMoving: false,
                                isSelectingMoveTarget: false,
                                modal: null,
                                pendingArrivalId: null,
                                outstandingDebt: 0
                            };
                        });
                    }
                }
            }
        }, (peerId) => {
            // Peer Joined
            setConnectedPeers(prev => [...prev, peerId]);

            if (isHostMode) {
                waitForPeerConnection(peerId).then((connected) => {
                    if (connected) {
                        // Calculate next available Player ID
                        const existingIds = Object.values(peerPlayerIds);
                        let nextId = 2;
                        while (existingIds.includes(nextId)) {
                            nextId++;
                        }
                        setPeerPlayerIds(prev => ({ ...prev, [peerId]: nextId }));
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
            setPeerPlayerIds(prev => {
                const updated = { ...prev };
                delete updated[peerId];
                return updated;
            });

            // Host Migration
            if (!isHostMode) {
                const myId = gameStateRef.current.myPlayerId;
                const remainingPeerIds: number[] = Object.entries(peerPlayerIds)
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
        });

        roomRef.current = room;

        if (isHostMode) {
            setGameStateInternal(prev => ({ ...prev, myPlayerId: 1 }));
        }
    }, [userProfile, gameStateRef, setGameStateInternal, setChatMessages, setShowLobby, peerPlayerIds]);

    return {
        isHost,
        setIsHost,
        currentRoom,
        setCurrentRoom,
        connectedPeers,
        peerNicknames,
        peerPlayerIds,
        handleJoinOrCreateRoom
    };
}
