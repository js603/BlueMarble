import React, { useState, useEffect, useCallback, useRef } from 'react';
import { IntroModal } from './components/IntroModal';
import { ActionModal } from './components/ActionModal';
import { Lobby } from './components/Lobby';
import { BoardCell, CellType, GameState, Player, ChatMessage, ModalState, P2PMessage, UserProfile, RoomInfo } from './types';
import { INITIAL_BOARD, INITIAL_MONEY, SALARY, GOLDEN_KEYS, PLAYER_COLORS } from './constants';
import { Dice } from './components/Dice';
import { Chat } from './components/Chat';
import { PlayerAvatar } from './components/PlayerAvatar';
import { BuildingIcon } from './components/BuildingIcon';
import {
  joinGameRoom,
  leaveGameRoom,
  broadcastGameState,
  broadcastGameChat,
  advertiseRoom,
  getGamePeers,
  joinLobby,
  leaveLobby,
  sendGameMessage,
  waitForPeerConnection,
} from './services/p2pService';
import { initAudio, startBGM, stopBGM, toggleMute as toggleAudioMute } from './services/audioService';

// --- Helpers from Reference ---

const createPlayers = (count: number, myProfile: UserProfile | null, isPVE: boolean): Player[] => {
  const players: Player[] = [];
  const aiNames = ['알파고', '왓슨', '자비스', '스카이넷', '할9000'];

  // Host Player (Me)
  players.push({
    id: 1,
    name: myProfile ? myProfile.name : '나',
    money: INITIAL_MONEY,
    position: 0,
    color: myProfile ? myProfile.color : PLAYER_COLORS[0],
    avatarId: myProfile ? myProfile.avatarId : 0,
    isBankrupt: false,
    isTrapped: 0,
    isComputer: false,
    hasEscapeCard: false
  });

  // AI Players (for PVE or placeholders)
  // In P2P, this might be adjusted, but we keep reference logic for PVE support
  for (let i = 2; i <= count; i++) {
    players.push({
      id: i,
      name: isPVE ? `${aiNames[(i - 2) % aiNames.length]}` : `플레이어 ${i}`,
      money: INITIAL_MONEY,
      position: 0,
      color: PLAYER_COLORS[(i - 1) % 5],
      avatarId: (i - 1) % 5,
      isBankrupt: false,
      isTrapped: 0,
      isComputer: isPVE,
      hasEscapeCard: false
    });
  }
  return players;
};

const createInitialState = (): GameState => ({
  players: [],
  currentPlayerIndex: 0,
  board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
  turnCount: 1,
  logs: ['세계 여행을 시작합니다!'],
  gameStatus: 'LOBBY', // Mapped from PLANNING
  winner: null,
  diceValue: [1, 1],
  isRolling: false,
  isMoving: false,
  isSelectingMoveTarget: false,
  waitingForNextTurn: false,
  consecutiveDoubles: 0,
  modal: null,
  pendingArrivalId: null,
  outstandingDebt: 0,
  creditorId: null,
  isMultiplayer: true,
  isConnected: false
});

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [gameState, setGameStateInternal] = useState<GameState>(createInitialState());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showIntro, setShowIntro] = useState(true);
  const [showLobby, setShowLobby] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
  const [fillAI, setFillAI] = useState(true);
  const [rooms, setRooms] = useState<RoomInfo[]>([]); // 로비 방 목록
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]); // 연결된 Peer ID 목록
  const [peerNicknames, setPeerNicknames] = useState<Record<string, string>>({}); // peerId -> nickname 매핑
  const [peerPlayerIds, setPeerPlayerIds] = useState<Record<string, number>>({}); // peerId -> playerId 매핑

  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const roomRef = useRef<ReturnType<typeof joinGameRoom> | null>(null); // ✅ High Fix #4: Proper typing

  // --- P2P & State Wrapper ---

  const updateStateAndBroadcast = useCallback((action: GameState | ((prev: GameState) => GameState)) => {
    let newState: GameState;
    if (typeof action === 'function') {
      newState = action(gameStateRef.current);
    } else {
      newState = action;
    }

    setGameStateInternal(newState);

    // ✅ Low Fix #9: Only Host broadcasts, and only for important game state changes
    if (isHost && newState.isMultiplayer) {
      // Only broadcast if game is actually playing or important state changed
      const shouldBroadcast =
        newState.gameStatus === 'PLAYING' ||
        newState.gameStatus === 'ENDED' ||
        newState.currentPlayerIndex !== gameStateRef.current.currentPlayerIndex ||
        newState.diceValue !== gameStateRef.current.diceValue;

      if (shouldBroadcast) {
        broadcastGameState(newState);
      }
    }
  }, [isHost]); // Medium Fix #7: Add isHost to dependency array

  // Alias for Reference Logic compatibility
  const setGameState = updateStateAndBroadcast;

  // --- Audio ---
  useEffect(() => {
    initAudio();
    return () => stopBGM();
  }, []);

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    toggleAudioMute(newState);
  };

  // --- Room Advertisement Logic (Host) ---
  useEffect(() => {
    if (!isHost || !currentRoom || gameState.gameStatus !== 'LOBBY') return;

    // Immediately advertise
    advertiseRoom(currentRoom);

    // Then advertise every 2 seconds
    const interval = setInterval(() => {
      advertiseRoom({
        ...currentRoom,
        lastUpdated: Date.now()
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isHost, currentRoom, gameState.gameStatus]);

  // --- Global Lobby Connection (Always Connected) ---
  useEffect(() => {
    if (showIntro) return; // Wait until intro is complete

    if (process.env.NODE_ENV === 'development') {
      console.log('[App] Connecting to global lobby...');
    }
    joinLobby((info: RoomInfo) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[App] Received room ad: ${info.name}`);
      }
      // 방 목록 업데이트
      setRooms(prev => {
        const existingIdx = prev.findIndex(r => r.id === info.id);
        if (existingIdx !== -1) {
          const newRooms = [...prev];
          newRooms[existingIdx] = { ...info, lastUpdated: Date.now() };
          return newRooms;
        } else {
          return [...prev, { ...info, lastUpdated: Date.now() }];
        }
      });
    });

    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[App] Disconnecting from lobby...');
      }
      leaveLobby();
    };
  }, [showIntro]);

  // Clean up old rooms
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRooms(prev => prev.filter(r => now - r.lastUpdated < 5000));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // --- Chat ---
  const addChatMessage = useCallback((senderId: number | 'SYSTEM' | 'AI', senderName: string, text: string, avatarId?: number) => {
    const newMsg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      senderId,
      senderName,
      text,
      timestamp: Date.now(),
      avatarId
    };
    setChatMessages(prev => [...prev, newMsg]);
    // P2P Chat Sync
    if (gameStateRef.current.isMultiplayer && senderId !== 'SYSTEM' && senderId !== 'AI') {
      broadcastGameChat(newMsg);
    }
  }, []);

  // --- Initialization ---
  const handleProfileComplete = (profile: UserProfile) => {
    setUserProfile(profile);
    setShowIntro(false);
    setShowLobby(true);
    initAudio();
  };

  const handleJoinOrCreateRoom = (roomId: string, mode: 'HOST' | 'GUEST', initialInfo?: RoomInfo, password?: string) => {
    const isHostMode = mode === 'HOST';
    setIsHost(isHostMode);
    setShowLobby(false);
    startBGM();

    if (initialInfo) {
      setCurrentRoom(initialInfo);
    }

    const room = joinGameRoom(roomId, (msg: P2PMessage, peerId: string) => {
      if (msg.type === 'STATE_SYNC') {
        const remoteState = msg.payload as GameState;
        if (process.env.NODE_ENV === 'development') {
          console.log('[P2P] Received STATE_SYNC from host');
        }

        // ✅ Critical Fix #3: Protect myPlayerId from being overwritten
        setGameStateInternal(prev => {
          const myId = prev.myPlayerId; // Preserve existing myPlayerId

          // Guest: Replace my player's name with my actual nickname
          if (!isHostMode && userProfile && myId) {
            const updatedPlayers = remoteState.players.map(p =>
              p.id === myId ? { ...p, name: userProfile.name } : p
            );
            return {
              ...remoteState,
              players: updatedPlayers,
              myPlayerId: myId // Always preserve myPlayerId
            };
          }

          return {
            ...remoteState,
            myPlayerId: myId || (isHostMode ? 1 : undefined) // Keep existing or set Host to 1
          };
        });
      } else if (msg.type === 'CHAT') {
        setChatMessages(prev => [...prev, msg.payload as ChatMessage]);
      } else if (msg.type === 'PLAYER_ID_ASSIGN' && !isHostMode) {
        // ✅ Critical Fix #1: Guest receives unique Player ID from Host
        const assignedId = msg.payload as number;
        if (process.env.NODE_ENV === 'development') {
          console.log('[Guest] Assigned Player ID:', assignedId);
        }
        setGameState(prev => ({
          ...prev,
          myPlayerId: assignedId
        }));
      } else if (msg.type === 'GUEST_NICKNAME' && isHostMode) {
        // Host: Store guest nickname
        if (process.env.NODE_ENV === 'development') {
          console.log('[Host] Received guest nickname:', msg.payload, 'from', peerId);
        }
        setPeerNicknames(prev => ({
          ...prev,
          [peerId]: msg.payload
        }));
      } else if (msg.type === 'HOST_MIGRATION') {
        // Another player became the new Host
        const { newHostPlayerId } = msg.payload;
        if (process.env.NODE_ENV === 'development') {
          console.log('[Host Migration] New Host is Player ID:', newHostPlayerId);
        }
        // If I'm not the new Host, ensure isHost is false
        if (gameStateRef.current.myPlayerId !== newHostPlayerId) {
          setIsHost(false);
        }
      } else if (msg.type === 'PLAYER_ACTION' && isHostMode) {
        // Host receives action from Guest
        const { action, playerId } = msg.payload;
        if (process.env.NODE_ENV === 'development') {
          console.log('[Host] Received PLAYER_ACTION:', action, 'from Player:', playerId);
        }

        // Verify the action is from the correct player (whose turn it is)
        const currentPlayer = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
        if (currentPlayer && currentPlayer.id === playerId) {
          if (action === 'NEXT_TURN') {
            // Process next turn on Host side
            setGameState(prev => {
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
        } else {
          console.warn('[Host] Ignoring PLAYER_ACTION - not from current player');
        }
      }
    }, (peerId) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('Peer joined:', peerId);
      }
      setConnectedPeers(prev => [...prev, peerId]);

      // ✅ Critical Fix #1: Host assigns unique Player ID to each Guest
      if (isHostMode) {
        waitForPeerConnection(peerId).then((connected) => {
          if (connected) {
            // Calculate next available Player ID
            const existingIds = Object.values(peerPlayerIds);
            let nextId = 2;
            while (existingIds.includes(nextId)) {
              nextId++;
            }

            // Store mapping
            setPeerPlayerIds(prev => ({
              ...prev,
              [peerId]: nextId
            }));

            // Send Player ID to Guest
            sendGameMessage({
              type: 'PLAYER_ID_ASSIGN',
              payload: nextId
            });
            console.log(`[Host] Assigned Player ID ${nextId} to peer:`, peerId);
          }
        });
      }

      // Guest: Send nickname when peer connection is established
      if (!isHostMode && userProfile) {
        waitForPeerConnection(peerId).then((connected) => {
          if (connected) {
            sendGameMessage({
              type: 'GUEST_NICKNAME',
              payload: userProfile.name
            });
            if (process.env.NODE_ENV === 'development') {
              console.log('[Guest] Sent nickname to host:', userProfile.name);
            }
          } else {
            console.error('[Guest] Failed to establish peer connection, nickname not sent');
          }
        });
      }
    }, (peerId) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('Peer left:', peerId);
      }

      // ✅ Critical Fix #2: Clean up all peer-related state
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

      // ✅ Host Migration: When Host leaves, lowest Player ID becomes new Host
      if (!isHostMode && connectedPeers.length === 1) {
        // Host just left - I need to become the new Host!
        const myId = gameStateRef.current.myPlayerId;

        // Find all remaining player IDs (excluding the one who left)
        const remainingPeerIds: number[] = Object.entries(peerPlayerIds)
          .filter(([pid]) => pid !== peerId)
          .map(([, playerId]) => playerId as number);

        // Add my own ID
        if (myId) remainingPeerIds.push(myId);

        // I'm the new Host if I have the lowest Player ID
        const lowestId = Math.min(...remainingPeerIds);

        if (myId === lowestId) {
          // I become the new Host!
          setIsHost(true);
          alert('호스트가 나갔습니다. 당신이 새로운 호스트가 되었습니다!');

          if (process.env.NODE_ENV === 'development') {
            console.log('[Host Migration] I am now the new Host! Player ID:', myId);
          }

          // Broadcast my new Host status to remaining peers
          sendGameMessage({
            type: 'HOST_MIGRATION',
            payload: { newHostPlayerId: myId }
          });
        } else {
          // Someone else became the new Host
          if (process.env.NODE_ENV === 'development') {
            console.log('[Host Migration] Player', lowestId, 'is the new Host');
          }
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[P2P] Cleaned up state for peer:', peerId);
      }
    });

    roomRef.current = room;
    // Host: 대기실에서 시작 버튼을 눌러 시작하도록 대기

    // Guest: myPlayerId will be assigned by Host via PLAYER_ID_ASSIGN message
    // No need to set it here anymore

    // Host: Set myPlayerId to 1
    if (isHostMode) {
      setGameState(prev => ({
        ...prev,
        myPlayerId: 1
      }));
    }

    if (isHostMode && userProfile) {
      // Host ready logic
    }
  };

  // Triggered by Lobby "Start Game" (Ref adapted)
  const handleGameStart = () => {
    if (!currentRoom || !isHost) {
      console.error('[handleGameStart] Cannot start:', { currentRoom, isHost });
      return;
    }

    console.log('=== GAME START DEBUG ===');
    console.log('[handleGameStart] Current room:', currentRoom);
    console.log('[handleGameStart] connectedPeers state:', connectedPeers);
    console.log('[handleGameStart] peerNicknames state:', peerNicknames); // 닉네임 상태 확인

    // 실제 접속된 Peer 수 계산
    const peersFromService = getGamePeers();
    console.log('[handleGameStart] getGamePeers():', peersFromService);
    console.log('[handleGameStart] Total connected:', connectedPeers.length, 'peers');
    const maxPlayers = currentRoom.maxPlayers;
    const connectedPlayerCount = 1 + connectedPeers.length; // Host + Peers

    let targetTotal = connectedPlayerCount;

    if (fillAI) {
      // 빈 자리를 AI로 채움
      targetTotal = maxPlayers;
    } else {
      // AI 채우기 해제 시 최소 2명 보장
      targetTotal = Math.max(2, connectedPlayerCount);
    }

    // Create players manually - DO NOT use createPlayers as it makes everyone AI
    const players: Player[] = [];
    const aiNames = ['알파고', '왓슨', '자비스', '스카이넷', 'HAL9000'];
    const realPlayerCount = 1 + connectedPeers.length;

    // 1. Host player (me) - REAL PLAYER
    players.push({
      id: 1,
      name: userProfile ? userProfile.name : '나',
      money: INITIAL_MONEY,
      position: 0,
      color: userProfile ? userProfile.color : PLAYER_COLORS[0],
      avatarId: userProfile ? userProfile.avatarId : 0,
      isBankrupt: false,
      isTrapped: 0,
      isComputer: false, // HOST = REAL PLAYER
      hasEscapeCard: false
    });

    // 2. Connected peers - REAL PLAYERS
    for (let i = 0; i < connectedPeers.length; i++) {
      const peerId = connectedPeers[i];
      const guestNickname = peerNicknames[peerId] || `플레이어 ${i + 2}`;

      players.push({
        id: i + 2,
        name: guestNickname,
        money: INITIAL_MONEY,
        position: 0,
        color: PLAYER_COLORS[(i + 1) % 5],
        avatarId: (i + 1) % 5,
        isBankrupt: false,
        isTrapped: 0,
        isComputer: false, // GUEST = REAL PLAYER
        hasEscapeCard: false
      });
    }

    // 3. Fill remaining slots with AI
    while (players.length < targetTotal) {
      const i = players.length;
      players.push({
        id: i + 1,
        name: aiNames[(i - realPlayerCount) % aiNames.length],
        money: INITIAL_MONEY,
        position: 0,
        color: PLAYER_COLORS[i % 5],
        avatarId: i % 5,
        isBankrupt: false,
        isTrapped: 0,
        isComputer: true, // AI PLAYER
        hasEscapeCard: false
      });
    }

    console.log('[Host] Created players:', players.map(p => ({ id: p.id, name: p.name, isComputer: p.isComputer })));

    const newState = {
      ...gameState,
      players,
      gameStatus: 'PLAYING' as const,
      myPlayerId: 1 // Host is always 1 in this simple logic
    };

    setGameState(newState);

    // Broadcast to all connected peers
    setTimeout(() => {
      broadcastGameState(newState);
      console.log('[Host] Broadcasted game start to all peers');
    }, 100);
  };

  // --- CORE GAME LOGIC (PORTED FROM REFERENCE) ---

  const calculateSellPrice = (cell: BoardCell) => {
    let buildingCost = 0;
    for (let i = 1; i <= cell.buildingLevel; i++) {
      buildingCost += (cell.buildingPrices[i] || 0);
    }
    return Math.floor((cell.price + buildingCost) * 0.5);
  };

  const sellLand = (index: number, price: number) => {
    setGameState(prev => {
      const player = prev.players[prev.currentPlayerIndex];
      const newPlayers = [...prev.players];
      const newBoard = [...prev.board];
      newPlayers[prev.currentPlayerIndex] = { ...player, money: player.money + price };
      newBoard[index] = { ...newBoard[index], ownerId: null, buildingLevel: 0 };
      addChatMessage('SYSTEM', '매각', `${player.name}님이 ${newBoard[index].name}을(를) 매각하여 ₩${price.toLocaleString()}을 확보했습니다.`);
      return { ...prev, players: newPlayers, board: newBoard, modal: null };
    });
  };

  const handlePayment = (amount: number, creditorId: number | null, reason: string) => {
    const currentState = gameStateRef.current;
    const player = currentState.players[currentState.currentPlayerIndex];
    if (!player) return false;

    if (player.money >= amount) {
      setGameState(prev => {
        let newPlayers = [...prev.players];
        let p = { ...newPlayers[prev.currentPlayerIndex] };
        p.money -= amount;
        if (creditorId) {
          const creditorIdx = newPlayers.findIndex(cp => cp.id === creditorId);
          if (creditorIdx !== -1) {
            newPlayers[creditorIdx] = { ...newPlayers[creditorIdx], money: newPlayers[creditorIdx].money + amount };
          }
        }
        addChatMessage('SYSTEM', '결제', `${p.name}님이 ${reason} ₩${amount.toLocaleString()}을(를) 지불했습니다.`);
        return {
          ...prev, players: newPlayers, outstandingDebt: 0, creditorId: null, modal: null,
          waitingForNextTurn: prev.pendingArrivalId ? false : !prev.isSelectingMoveTarget
        };
      });
      return true;
    }

    const ownedCells = currentState.board.filter(c => c.ownerId === player.id);
    const totalAssetValue = ownedCells.reduce((sum, cell) => sum + calculateSellPrice(cell), 0);

    if (player.money + totalAssetValue < amount) {
      setGameState(prev => {
        let newPlayers = [...prev.players];
        newPlayers[prev.currentPlayerIndex] = { ...newPlayers[prev.currentPlayerIndex], money: -1, isBankrupt: true };
        addChatMessage('SYSTEM', '파산', `⚠️ ${player.name}님은 자산을 모두 팔아도 빚을 갚을 수 없어 파산했습니다!`);
        return { ...prev, players: newPlayers, waitingForNextTurn: true, modal: null };
      });
      return false;
    }

    setGameState(prev => ({
      ...prev,
      outstandingDebt: amount,
      creditorId: creditorId,
      modal: {
        isOpen: true,
        type: 'DEBT',
        title: '자금 부족 경고',
        message: `${reason}을(를) 위한 자금이 부족합니다.\n(부족 금액: ₩${(amount - player.money).toLocaleString()})\n\n보유한 땅을 매각하여 자금을 확보하세요.`,
        isComputerAction: player.isComputer
      }
    }));
    return false;
  };

  const handleArrival = (playerId: number) => {
    setGameState(prev => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player) return prev;

      const cell = prev.board[player.position];
      let modal: ModalState | null = null;
      let newPlayers = [...prev.players];
      let updatedPlayer = { ...player };
      let pendingArrivalId: number | null = null;

      if (cell.type === CellType.CITY) {
        if (cell.ownerId === null) {
          if (updatedPlayer.money >= cell.price) {
            modal = {
              isOpen: true, type: 'BUY', title: `${cell.name} 도착`,
              message: `${cell.name}은(는) 주인이 없습니다.\n구매하시겠습니까?`, cost: cell.price
            };
          } else {
            addChatMessage('SYSTEM', 'System', `${player.name}님은 돈이 부족해 ${cell.name}을(를) 살 수 없습니다.`);
            return { ...prev, waitingForNextTurn: true, isRolling: false, isMoving: false };
          }
        } else if (cell.ownerId === updatedPlayer.id) {
          if (cell.buildingLevel < 4) {
            const upgradeCost = cell.buildingPrices[cell.buildingLevel + 1] || 0;
            if (upgradeCost > 0 && updatedPlayer.money >= upgradeCost) {
              const nextBuildName = ['별장', '빌딩', '호텔', '랜드마크'][cell.buildingLevel];
              modal = {
                isOpen: true, type: 'BUY', title: '건물 건설',
                message: `내 도시 ${cell.name}에\n[${nextBuildName}]을(를) 짓겠습니까?`, cost: upgradeCost
              };
            } else {
              return { ...prev, waitingForNextTurn: true, isRolling: false, isMoving: false };
            }
          } else {
            return { ...prev, waitingForNextTurn: true, isRolling: false, isMoving: false };
          }
        } else {
          const owner = newPlayers.find(p => p.id === cell.ownerId);
          if (owner) {
            let rent = cell.rent;
            if (cell.buildingLevel === 4) rent = cell.rent * 10;
            else rent = Math.floor(cell.rent * (1 + cell.buildingLevel * 2));

            if (updatedPlayer.money >= rent) {
              updatedPlayer.money -= rent;
              const ownerIdx = newPlayers.findIndex(p => p.id === owner.id);
              newPlayers[ownerIdx] = { ...owner, money: owner.money + rent };
              addChatMessage('SYSTEM', 'System', `${updatedPlayer.name}님이 ${owner.name}님의 ${cell.name} 통행료 ${rent}만원을 지불했습니다.`);
              if (cell.buildingLevel < 4) {
                const takeoverCost = cell.price * 2 + (cell.buildingPrices.slice(1, cell.buildingLevel + 1).reduce((a, b) => a + b, 0));
                if (updatedPlayer.money >= takeoverCost) {
                  modal = {
                    isOpen: true, type: 'TAKEOVER', title: '인수 공격 Power',
                    message: `${owner.name}님의 ${cell.name}을(를)\n강제로 인수하시겠습니까?`, cost: takeoverCost
                  };
                } else {
                  return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
                }
              } else {
                return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
              }
            } else {
              const ownedCells = prev.board.filter(c => c.ownerId === updatedPlayer.id);
              const totalAssetValue = ownedCells.reduce((sum, c) => sum + calculateSellPrice(c), 0);
              if (updatedPlayer.money + totalAssetValue < rent) {
                updatedPlayer.isBankrupt = true;
                updatedPlayer.money = -1;
                addChatMessage('SYSTEM', '파산', `⚠️ ${updatedPlayer.name}님은 통행료를 감당하지 못해 파산했습니다!`);
                return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
              } else {
                return {
                  ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
                  outstandingDebt: rent, creditorId: owner.id,
                  modal: { isOpen: true, type: 'DEBT', title: '통행료 부족', message: `통행료 ${rent.toLocaleString()}원이 필요합니다.\n보유 현금이 부족합니다.`, isComputerAction: player.isComputer },
                  isRolling: false, isMoving: false
                };
              }
            }
          }
        }
      } else if (cell.type === CellType.CHANCE) {
        const card = GOLDEN_KEYS[Math.floor(Math.random() * GOLDEN_KEYS.length)];
        const msg = `황금열쇠: ${card.name} - ${card.desc}`;
        addChatMessage('SYSTEM', '황금열쇠', msg);
        if (card.type === 'PAY') {
          const amount = card.amount!;
          const ownedCells = prev.board.filter(c => c.ownerId === updatedPlayer.id);
          const totalAssetValue = ownedCells.reduce((sum, c) => sum + calculateSellPrice(c), 0);
          if (updatedPlayer.money >= amount) {
            updatedPlayer.money -= amount;
            modal = { isOpen: true, type: 'INFO', title: '황금열쇠 (지불)', message: msg };
          } else if (updatedPlayer.money + totalAssetValue < amount) {
            updatedPlayer.isBankrupt = true;
            addChatMessage('SYSTEM', '파산', `⚠️ ${updatedPlayer.name} 파산!`);
            return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
          } else {
            return {
              ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
              outstandingDebt: amount, creditorId: null,
              modal: { isOpen: true, type: 'DEBT', title: '지불 능력 부족', message: `${card.name}: ${amount.toLocaleString()}원을 지불해야 합니다.`, isComputerAction: player.isComputer },
              isRolling: false, isMoving: false
            };
          }
        } else if (card.type === 'EARN') {
          updatedPlayer.money += card.amount!;
          modal = { isOpen: true, type: 'INFO', title: '황금열쇠', message: msg };
        } else if (card.type === 'ESCAPE') {
          updatedPlayer.hasEscapeCard = true;
          modal = { isOpen: true, type: 'INFO', title: '황금열쇠', message: msg };
        } else if (card.type === 'MOVE') {
          updatedPlayer.position = card.position!;
          pendingArrivalId = updatedPlayer.id;
          modal = { isOpen: true, type: 'INFO', title: '황금열쇠 이동', message: msg };
        }
      } else if (cell.type === CellType.ISLAND) {
        updatedPlayer.isTrapped = 3;
        addChatMessage('SYSTEM', '무인도', `${updatedPlayer.name}님이 무인도에 갇혔습니다! (3턴 대기)`);
        return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
      } else if (cell.type === CellType.OLYMPIC) {
        if (updatedPlayer.isComputer) {
          addChatMessage('SYSTEM', 'AI', '알파고가 이동할 도시를 고민중입니다...');
        } else {
          addChatMessage('SYSTEM', '콩코드', '🚀 콩코드 여객기 탑승! 이동할 도시를 지도에서 선택하세요.');
          return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: false, isRolling: false, isMoving: false, isSelectingMoveTarget: true };
        }
      } else if (cell.type === CellType.TAX) {
        const amount = 300;
        const ownedCells = prev.board.filter(c => c.ownerId === updatedPlayer.id);
        const totalAssetValue = ownedCells.reduce((sum, c) => sum + calculateSellPrice(c), 0);
        if (updatedPlayer.money >= amount) {
          updatedPlayer.money -= amount;
          addChatMessage('SYSTEM', '복지기금', '사회복지기금 300만원을 기부했습니다.');
          return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
        } else if (updatedPlayer.money + totalAssetValue < amount) {
          updatedPlayer.isBankrupt = true;
          addChatMessage('SYSTEM', '파산', `⚠️ ${updatedPlayer.name} 파산!`);
          return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
        } else {
          return {
            ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
            outstandingDebt: amount, creditorId: null,
            modal: { isOpen: true, type: 'DEBT', title: '세금 체납', message: `세금 ${amount}만원을 낼 돈이 부족합니다.`, isComputerAction: player.isComputer },
            isRolling: false, isMoving: false
          };
        }
      } else if (cell.type === CellType.START) {
        addChatMessage('SYSTEM', '출발지', `${updatedPlayer.name}님 출발지 도착! 보너스를 획득합니다.`);
        updatedPlayer.money += SALARY;
        return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
      }

      if (updatedPlayer.money < 0) {
        updatedPlayer.isBankrupt = true;
        addChatMessage('SYSTEM', '파산', `⚠️ ${updatedPlayer.name}님이 파산했습니다!`);
        return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
      }

      if (!modal) {
        return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
      }

      return {
        ...prev,
        players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
        modal: { ...modal, isComputerAction: player.isComputer },
        isRolling: false, isMoving: false,
        pendingArrivalId: pendingArrivalId
      };
    });
  };

  const handleTeleport = (targetIndex: number) => {
    const currentPlayer = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
    if (!currentPlayer) return;

    const targetName = gameStateRef.current.board[targetIndex].name;
    addChatMessage('SYSTEM', '비행', `✈️ ${currentPlayer.name}님이 ${targetName}(으)로 출발합니다!`);

    setGameState(prev => {
      let newPlayers = [...prev.players];
      newPlayers[prev.currentPlayerIndex] = { ...newPlayers[prev.currentPlayerIndex], position: targetIndex };
      return { ...prev, players: newPlayers, isSelectingMoveTarget: false };
    });

    setTimeout(() => {
      const pid = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]?.id;
      if (pid) handleArrival(pid);
    }, 800);
  };

  const movePlayerStepByStep = async (playerId: number, steps: number) => {
    let stepsRemaining = steps;
    setGameState(prev => ({ ...prev, isMoving: true }));

    // Use recursive setTimeout loop to ensure state updates propagate
    // Simplified to async/await with setGameState for this port
    for (let i = 0; i < steps; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setGameState(prev => {
        const pIdx = prev.players.findIndex(p => p.id === playerId);
        if (pIdx === -1) return prev;
        const player = prev.players[pIdx];
        let nextPos = player.position + 1;
        let money = player.money;
        if (nextPos >= prev.board.length) {
          nextPos = 0;
          money += SALARY;
        }
        const newPlayers = [...prev.players];
        newPlayers[pIdx] = { ...player, position: nextPos, money };
        return { ...prev, players: newPlayers };
      });
    }

    setTimeout(() => { handleArrival(playerId); }, 200);
  };

  const handleRollDice = useCallback(() => {
    const currentState = gameStateRef.current;
    if (currentState.isRolling || currentState.isMoving || currentState.modal || currentState.waitingForNextTurn || currentState.isSelectingMoveTarget || currentState.pendingArrivalId || currentState.outstandingDebt > 0) return;

    setGameState(prev => ({ ...prev, isRolling: true }));

    setTimeout(() => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const total = d1 + d2;
      const isDouble = d1 === d2;
      const p = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
      if (!p) return;

      let moveSteps = 0;
      let isTrapRelease = false;
      let isTrapStay = false;
      let toIsland = false;
      let newDoubles = isDouble ? gameStateRef.current.consecutiveDoubles + 1 : 0;

      if (newDoubles >= 3) toIsland = true;
      else if (p.isTrapped > 0) {
        if (isDouble || p.hasEscapeCard) {
          isTrapRelease = true;
          moveSteps = total;
        } else {
          isTrapStay = true;
        }
      } else {
        moveSteps = total;
      }

      setGameState(prev => {
        let newPlayers = [...prev.players];
        let currentPlayer = { ...newPlayers[prev.currentPlayerIndex] };

        if (toIsland) {
          currentPlayer.position = 5;
          currentPlayer.isTrapped = 3;
          addChatMessage('SYSTEM', '경찰', `${currentPlayer.name}님 과속으로 무인도 격리!`);
          newPlayers[prev.currentPlayerIndex] = currentPlayer;
          return { ...prev, diceValue: [d1, d2], players: newPlayers, consecutiveDoubles: 0, isRolling: false, waitingForNextTurn: true };
        }
        if (isTrapStay) {
          currentPlayer.isTrapped -= 1;
          addChatMessage('SYSTEM', '무인도', `탈출 실패.. (${currentPlayer.isTrapped}턴 남음)`);
          newPlayers[prev.currentPlayerIndex] = currentPlayer;
          return { ...prev, diceValue: [d1, d2], players: newPlayers, isRolling: false, waitingForNextTurn: true };
        }
        if (isTrapRelease) {
          currentPlayer.isTrapped = 0;
          if (currentPlayer.hasEscapeCard && !isDouble) {
            currentPlayer.hasEscapeCard = false;
            addChatMessage('SYSTEM', '탈출', `${currentPlayer.name}님 탈출권 사용!`);
          } else {
            addChatMessage('SYSTEM', '탈출', `${currentPlayer.name}님 더블로 탈출!`);
          }
        }
        if (moveSteps > 0) {
          if (isDouble && !isTrapRelease) addChatMessage('SYSTEM', '더블', '주사위 더블! 한 번 더 행동합니다.');
        }
        newPlayers[prev.currentPlayerIndex] = currentPlayer;
        return { ...prev, diceValue: [d1, d2], players: newPlayers, consecutiveDoubles: newDoubles, isRolling: false, waitingForNextTurn: moveSteps === 0 };
      });

      if (moveSteps > 0 && !toIsland) {
        setTimeout(() => { movePlayerStepByStep(p.id, moveSteps); }, 600);
      }
    }, 1000);
  }, [addChatMessage, setGameState]);

  const nextTurn = useCallback(() => {
    const s = gameStateRef.current;
    if (!s.players[s.currentPlayerIndex]) return;

    // Guest: Send action to Host instead of modifying state directly
    if (!isHost && s.isMultiplayer) {
      const myId = s.myPlayerId;
      const currentPlayer = s.players[s.currentPlayerIndex];
      if (currentPlayer && currentPlayer.id === myId) {
        sendGameMessage({
          type: 'PLAYER_ACTION',
          payload: { action: 'NEXT_TURN', playerId: myId }
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('[Guest] Sent NEXT_TURN action to Host');
        }
        return; // Don't modify local state - Host will broadcast new state
      }
    }

    // Host: Modify state directly
    setGameState(prev => {
      let nextIndex = prev.currentPlayerIndex;
      let nextTurnCount = prev.turnCount;
      let nextDoubles = prev.consecutiveDoubles;

      if (prev.consecutiveDoubles > 0 && prev.players[prev.currentPlayerIndex].isTrapped === 0) {
        addChatMessage('SYSTEM', 'System', `${prev.players[prev.currentPlayerIndex].name}님의 연속 턴!`);
      } else {
        nextIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
        let loopGuard = 0;
        while (prev.players[nextIndex].isBankrupt && loopGuard < prev.players.length) {
          nextIndex = (nextIndex + 1) % prev.players.length;
          loopGuard++;
        }
        nextTurnCount++;
        nextDoubles = 0;
      }
      const active = prev.players.filter(p => !p.isBankrupt);
      if (active.length === 1) return { ...prev, gameStatus: 'ENDED', winner: active[0].id };
      return { ...prev, currentPlayerIndex: nextIndex, turnCount: nextTurnCount, consecutiveDoubles: nextDoubles, waitingForNextTurn: false, isRolling: false, isMoving: false, isSelectingMoveTarget: false, modal: null, pendingArrivalId: null, outstandingDebt: 0 };
    });
  }, [addChatMessage, setGameState, isHost]);

  const handleModalAction = (confirmed: boolean) => {
    setGameState(prev => {
      if (!prev.modal) return prev;
      const currentPlayer = prev.players[prev.currentPlayerIndex];
      const currentCell = prev.board[currentPlayer.position];
      let newPlayers = [...prev.players];
      let newBoard = [...prev.board];
      let p = { ...currentPlayer };

      if (prev.modal.type === 'DEBT') return { ...prev, modal: null };

      if (confirmed) {
        if (prev.modal.type === 'BUY') {
          p.money -= (prev.modal.cost || 0);
          const newCell = { ...currentCell };
          if (newCell.ownerId === null) {
            newCell.ownerId = p.id;
            newCell.buildingLevel = 0;
            addChatMessage('SYSTEM', '부동산', `${p.name}님이 ${newCell.name}을(를) 구매했습니다.`);
          } else {
            newCell.buildingLevel += 1;
            const bTypes = ['토지', '별장', '빌딩', '호텔', '랜드마크'];
            const buildName = bTypes[newCell.buildingLevel] || '건물';
            addChatMessage('SYSTEM', '부동산', `${p.name}님이 ${newCell.name}에 ${buildName}을(를) 올렸습니다!`);
          }
          newBoard[p.position] = newCell;
        } else if (prev.modal.type === 'TAKEOVER') {
          p.money -= (prev.modal.cost || 0);
          const prevOwnerIdx = newPlayers.findIndex(op => op.id === currentCell.ownerId);
          if (prevOwnerIdx !== -1) {
            newPlayers[prevOwnerIdx] = { ...newPlayers[prevOwnerIdx], money: newPlayers[prevOwnerIdx].money + (prev.modal.cost || 0) };
          }
          const newCell = { ...currentCell, ownerId: p.id };
          newBoard[p.position] = newCell;
          addChatMessage('SYSTEM', '인수', `${p.name}님이 ${newCell.name}을(를) 강제 인수했습니다!`);
        }
      }
      newPlayers[prev.currentPlayerIndex] = p;
      const isDoubleTurn = prev.consecutiveDoubles > 0 && prev.consecutiveDoubles < 3;
      const shouldWait = prev.pendingArrivalId !== null ? false : !isDoubleTurn;
      return { ...prev, players: newPlayers, board: newBoard, modal: null, isRolling: false, isMoving: false, waitingForNextTurn: shouldWait };
    });
  };

  const handleModalActionWithLogic = (confirmed: boolean) => {
    const currentModal = gameStateRef.current.modal;
    if (!currentModal) return;
    if (currentModal.type === 'SELL') {
      if (confirmed && currentModal.targetIndex !== undefined && currentModal.cost !== undefined) {
        sellLand(currentModal.targetIndex, currentModal.cost);
      } else {
        setGameState(prev => ({ ...prev, modal: null }));
      }
      return;
    }
    handleModalAction(confirmed);
  };


  const handleCellClick = (index: number) => {
    const s = gameStateRef.current;
    if (!s.players[s.currentPlayerIndex]) return;

    if (gameState.isSelectingMoveTarget && !gameState.players[gameState.currentPlayerIndex].isComputer && gameState.outstandingDebt === 0) {
      handleTeleport(index);
      return;
    }

    if (gameState.outstandingDebt > 0 && !gameState.players[gameState.currentPlayerIndex].isComputer) {
      const cell = gameState.board[index];
      if (cell.ownerId === gameState.players[gameState.currentPlayerIndex].id) {
        const sellPrice = calculateSellPrice(cell);
        setGameState(prev => ({
          ...prev,
          modal: {
            isOpen: true, type: 'SELL', title: '자산 매각',
            message: `${cell.name}을(를) 매각하시겠습니까?\n매각 시 ₩${sellPrice.toLocaleString()}을 획득합니다.`,
            cost: sellPrice, targetIndex: index
          }
        }));
      }
    }
  };

  // --- Effects ---

  useEffect(() => {
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;
    if (s.outstandingDebt > 0 && p.money >= s.outstandingDebt) {
      const timer = setTimeout(() => {
        handlePayment(s.outstandingDebt, s.creditorId, '빚');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [gameState.players, gameState.outstandingDebt]);

  useEffect(() => {
    if (!gameState.modal && gameState.pendingArrivalId !== null) {
      const pid = gameState.pendingArrivalId;
      setGameState(prev => ({ ...prev, pendingArrivalId: null }));
      const timer = setTimeout(() => { handleArrival(pid); }, 200);
      return () => clearTimeout(timer);
    }
  }, [gameState.modal, gameState.pendingArrivalId]);

  // AI Effects
  useEffect(() => {
    if (!isHost) return; // Only Host runs AI
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;
    if (s.gameStatus === 'PLAYING' && p.isComputer && !s.isRolling && !s.isMoving && !s.waitingForNextTurn && !s.modal && !s.isSelectingMoveTarget && !s.pendingArrivalId && s.outstandingDebt === 0) {
      const timer = setTimeout(() => handleRollDice(), 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayerIndex, gameState.isRolling, gameState.isMoving, gameState.waitingForNextTurn, gameState.modal, gameState.gameStatus, gameState.isSelectingMoveTarget, gameState.pendingArrivalId, gameState.outstandingDebt, handleRollDice, isHost]);

  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    if (s.gameStatus === 'PLAYING' && s.modal && s.modal.isComputerAction) {
      const timer = setTimeout(() => {
        let decision = true;
        const cost = s.modal?.cost || 0;
        const currentPlayer = s.players[s.currentPlayerIndex];
        const currentMoney = currentPlayer?.money || 0;
        if (s.modal?.type === 'BUY' && currentMoney < cost) decision = false;
        else if (s.modal?.type === 'TAKEOVER' && currentMoney < cost + 300) decision = false;
        handleModalActionWithLogic(decision);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState.modal, isHost]);

  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;
    if (s.gameStatus === 'PLAYING' && s.isSelectingMoveTarget && p.isComputer) {
      const timer = setTimeout(() => {
        const availableCities = s.board.filter(c => c.type === CellType.CITY);
        const target = availableCities[Math.floor(Math.random() * availableCities.length)];
        handleTeleport(target.id);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [gameState.isSelectingMoveTarget, isHost]);

  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;
    if (s.gameStatus === 'PLAYING' && s.waitingForNextTurn && p.isComputer && !s.modal && !s.isSelectingMoveTarget && !s.pendingArrivalId && s.outstandingDebt === 0) {
      const timer = setTimeout(() => nextTurn(), 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.waitingForNextTurn, gameState.currentPlayerIndex, gameState.modal, gameState.isSelectingMoveTarget, gameState.pendingArrivalId, gameState.outstandingDebt, nextTurn, isHost]);

  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;
    if (s.gameStatus === 'PLAYING' && s.outstandingDebt > 0 && p.isComputer && !s.modal) {
      const timer = setTimeout(() => {
        const ownedCells = s.board.filter(c => c.ownerId === p.id);
        if (ownedCells.length > 0) {
          ownedCells.sort((a, b) => calculateSellPrice(b) - calculateSellPrice(a));
          const target = ownedCells[0];
          sellLand(s.board.findIndex(c => c.id === target.id), calculateSellPrice(target));
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.outstandingDebt, gameState.modal, isHost]);

  // --- Render ---

  const renderSpecialCell = (cell: BoardCell) => {
    switch (cell.type) {
      case CellType.START: return <div className="flex flex-col items-center justify-center h-full text-emerald-400 group-hover:scale-110 transition-transform"><span className="text-xl sm:text-3xl">🏁</span><span className="text-[10px] sm:text-xs font-bold mt-1">START</span></div>;
      case CellType.ISLAND: return <div className="flex flex-col items-center justify-center h-full text-slate-400 group-hover:scale-110 transition-transform"><span className="text-xl sm:text-3xl">🏝️</span><span className="text-[10px] sm:text-xs font-bold mt-1">무인도</span></div>;
      case CellType.CHANCE: return <div className="flex flex-col items-center justify-center h-full text-yellow-400 group-hover:scale-110 transition-transform"><span className="text-xl sm:text-3xl">🗝️</span><span className="text-[10px] sm:text-xs font-bold mt-1">KEY</span></div>;
      case CellType.OLYMPIC: return <div className="flex flex-col items-center justify-center h-full text-purple-400 group-hover:scale-110 transition-transform"><span className="text-xl sm:text-3xl">🚀</span><span className="text-[10px] sm:text-xs font-bold mt-1">여행</span></div>;
      case CellType.TAX: return <div className="flex flex-col items-center justify-center h-full text-red-400 group-hover:scale-110 transition-transform"><span className="text-xl sm:text-3xl">💸</span><span className="text-[10px] sm:text-xs font-bold mt-1">세금</span></div>;
      default: return null;
    }
  }

  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="relative h-[100dvh] w-full bg-slate-950 text-white overflow-hidden font-sans selection:bg-emerald-500 selection:text-white flex flex-col">
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-cover bg-center bg-no-repeat grayscale mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 via-transparent to-slate-950/80 pointer-events-none z-0"></div>

      {showIntro && <IntroModal onComplete={handleProfileComplete} />}
      {showLobby && userProfile && <Lobby userProfile={userProfile} onJoinRoom={handleJoinOrCreateRoom} rooms={rooms} />}

      {gameState.modal && <ActionModal modal={gameState.modal} onAction={handleModalActionWithLogic} />}

      {/* Waiting Room (Host Only) */}
      {showLobby === false && currentRoom && isHost && gameState.gameStatus === 'LOBBY' && (
        <div className="absolute inset-0 flex items-center justify-center text-white bg-slate-900 z-50">
          <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700">
            <h2 className="text-3xl font-bold mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">게임 대기실</h2>

            <div className="mb-6">
              <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">접속한 플레이어</h3>
              <div className="space-y-2">
                {/* Host (나) */}
                <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-emerald-500/30">
                  <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center bg-slate-800 overflow-hidden" style={{ borderColor: userProfile?.color }}>
                    <PlayerAvatar playerId={1} color={userProfile?.color || '#fff'} isActive={false} avatarId={userProfile?.avatarId || 0} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-lg">{userProfile?.name}</div>
                    <div className="text-xs text-emerald-400 font-mono flex items-center gap-2">
                      <span className="bg-emerald-500/20 px-2 py-0.5 rounded">🎖️ HOST</span>
                      <span>(나)</span>
                    </div>
                  </div>
                </div>

                {/* Connected Peers (Guests) */}
                {connectedPeers.map((peerId, idx) => {
                  const guestNickname = peerNicknames[peerId] || `플레이어 ${idx + 2}`;
                  return (
                    <div key={peerId} className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                      <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center bg-slate-800 overflow-hidden" style={{ borderColor: PLAYER_COLORS[(idx + 1) % 5] }}>
                        <PlayerAvatar playerId={idx + 2} color={PLAYER_COLORS[(idx + 1) % 5]} isActive={false} avatarId={(idx + 1) % 5} />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-lg">{guestNickname}</div>
                        <div className="text-xs text-cyan-400 font-mono">
                          <span className="bg-cyan-500/20 px-2 py-0.5 rounded">GUEST</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {isHost ? (
              <div className="flex flex-col gap-4">
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="flex justify-between text-slate-300 text-sm mb-2">
                    <span>현재 접속 인원</span>
                    <span className="font-bold text-white">{1 + connectedPeers.length} 명 / {currentRoom?.maxPlayers || 4} 명</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${((1 + connectedPeers.length) / (currentRoom?.maxPlayers || 4)) * 100}%` }}></div>
                  </div>
                </div>

                <label className="flex items-center gap-3 p-3 bg-slate-800/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={fillAI}
                    onChange={e => setFillAI(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                  />
                  <div className="flex flex-col text-left">
                    <span className="text-white font-bold text-sm">빈 자리 AI로 채우기</span>
                    <span className="text-slate-400 text-xs">부족한 인원을 AI 플레이어로 대체합니다.</span>
                  </div>
                </label>

                <button
                  onClick={handleGameStart}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <span className="text-2xl">🚀</span>
                  게임 시작 ({fillAI ? currentRoom?.maxPlayers : Math.max(2, 1)}인)
                </button>
              </div>
            ) : (
              <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700/50 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
                  <p className="text-slate-300 font-bold">방장이 게임을 시작하기를<br />기다리고 있습니다...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(gameState.gameStatus === 'PLAYING' || gameState.gameStatus === 'ENDED') && (
        <>
          {/* Top Bar: Status & Other Players */}
          <header className="relative z-30 pt-safe-top px-4 pb-2 bg-slate-900/80 backdrop-blur-md border-b border-white/5 flex flex-col gap-2 shrink-0">
            <div className="flex justify-between items-center h-12">
              <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">NEBULA</h1>
              <div className="flex gap-2">
                <button onClick={toggleMute} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 active:scale-95 transition-all">
                  {isMuted ? "🔇" : "🔊"}
                </button>
                <button onClick={() => setIsChatOpen(!isChatOpen)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 ${chatMessages.length > 0 ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50' : 'bg-slate-800 text-slate-400'}`}>
                  💬
                </button>
              </div>
            </div>

            {/* Players Scroll View */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 mask-linear-fade">
              {gameState.players.map(p => {
                const isActive = p.id === gameState.players[gameState.currentPlayerIndex]?.id;
                const isMe = p.id === userProfile?.id; // Assuming simple ID match or myPlayerId
                return (
                  <div key={p.id} className={`flex items-center gap-2 p-1.5 pr-4 rounded-full border shadow-sm transition-all min-w-fit shrink-0 ${isActive ? 'bg-slate-800 border-emerald-500 ring-1 ring-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-900/50 border-white/10'} ${p.isBankrupt ? 'grayscale opacity-50' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-slate-950 border-2 flex items-center justify-center relative" style={{ borderColor: p.color }}>
                      <PlayerAvatar playerId={p.id} color={p.color} isActive={isActive} size="sm" avatarId={p.avatarId} />
                      {isActive && <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse border-2 border-slate-900"></div>}
                    </div>
                    <div className="flex flex-col leading-none">
                      <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-slate-400'}`}>{p.name} {isMe && '(나)'}</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">₩{p.money.toLocaleString()}만</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </header>

          {/* Main Board Area - Centered & Responsive */}
          <main className="flex-1 relative flex items-center justify-center p-4 overflow-hidden z-10">

            {/* Board Container: Maintain Aspect Ratio */}
            <div className="w-full max-w-md aspect-square relative grid grid-cols-6 grid-rows-6 gap-1 p-1.5 bg-slate-900/90 rounded-2xl shadow-2xl ring-1 ring-white/10 backdrop-blur-sm">

              {/* Center Hub: Dice & Info */}
              <div className="col-start-2 col-end-6 row-start-2 row-end-6 bg-slate-950/50 rounded-xl relative overflow-hidden flex flex-col items-center justify-center p-4 border border-white/5">

                {/* Dynamic Island Notification */}
                {gameState.gameStatus === 'PLAYING' && (
                  <div className="absolute top-4 w-full px-4 z-20">
                    {gameState.waitingForNextTurn ? (
                      <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-4 py-2 rounded-full text-center text-xs font-bold animate-pulse">
                        다음 턴 준비 중...
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">CURRENT TURN</div>
                        <div className="text-lg font-black text-white px-6 py-1 bg-slate-800 rounded-full border border-slate-700 shadow-lg">
                          {gameState.players[gameState.currentPlayerIndex]?.name}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Dice Display */}
                <div className={`transform transition-all duration-500 ${gameState.isRolling ? 'scale-110' : 'scale-100'}`}>
                  <Dice value={gameState.diceValue} rolling={gameState.isRolling} />
                </div>

                {/* Result Text */}
                <div className="mt-4 h-8 flex items-center justify-center">
                  {gameState.consecutiveDoubles > 0 && (
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/50 rounded-full text-xs font-bold animate-bounce">
                      DOUBLE {gameState.consecutiveDoubles}
                    </span>
                  )}
                </div>
              </div>

              {/* Grid Cells */}
              {gameState.board.map((cell, idx) => {
                const playersHere = gameState.players.filter(p => !p.isBankrupt && p.position === idx);

                let gridArea = '';
                if (idx >= 0 && idx <= 5) gridArea = `6 / ${7 - (idx + 1)} / 7 / ${7 - idx}`;
                else if (idx >= 6 && idx <= 9) gridArea = `${6 - (idx - 5)} / 1 / ${7 - (idx - 5)} / 2`;
                else if (idx >= 10 && idx <= 15) gridArea = `1 / ${idx - 9} / 2 / ${idx - 8}`;
                else if (idx >= 16 && idx <= 19) gridArea = `${idx - 14} / 6 / ${idx - 13} / 7`;

                const currentPlayer = gameState.players[gameState.currentPlayerIndex];
                const canSelectTarget = currentPlayer && gameState.isSelectingMoveTarget && !currentPlayer.isComputer;
                const isSellable = currentPlayer && gameState.outstandingDebt > 0 && cell.ownerId === currentPlayer.id;

                const cellOwner = cell.ownerId ? gameState.players.find(p => p.id === cell.ownerId) : null;
                const ownerBorderStyle = cellOwner ? { borderColor: cellOwner.color, borderWidth: '3px' } : {};

                return (
                  <div
                    key={cell.id}
                    style={{ gridArea, ...ownerBorderStyle }}
                    onClick={() => handleCellClick(idx)}
                    className={`
                                    relative rounded-md sm:rounded-lg overflow-hidden border transition-all active:scale-95
                                    flex flex-col items-center justify-between p-0.5
                                    ${cell.type !== CellType.CITY ? 'bg-slate-800 border-slate-700' : (cellOwner ? '' : 'bg-slate-800/60 border-slate-700/50')}
                                    ${cellOwner ? 'bg-opacity-30' : ''}
                                    ${currentPlayer?.position === idx ? 'ring-2 ring-yellow-400 z-10 shadow-lg shadow-yellow-400/20' : ''}
                                    ${canSelectTarget ? 'animate-pulse ring-2 ring-purple-500 bg-purple-500/20 z-20 cursor-pointer' : ''}
                                    ${isSellable ? 'animate-pulse ring-2 ring-red-500 bg-red-500/20 z-20 cursor-pointer' : ''}
                                `}
                  >
                    {cell.type === CellType.CITY ? (
                      <>
                        <div className={`w-[80%] h-1 sm:h-1.5 rounded-full mt-1 ${cell.color}`}></div>
                        <div className="flex-1 flex flex-col items-center justify-center w-full">
                          <span className="text-[8px] sm:text-[10px] font-bold text-slate-200 leading-none text-center line-clamp-1 w-full px-0.5">{cell.name}</span>
                          {cell.buildingLevel > 0 && (
                            <div className="mt-0.5 transform scale-75 sm:scale-100">
                              <BuildingIcon level={cell.buildingLevel} color={gameState.players.find(p => p.id === cell.ownerId)?.color} />
                            </div>
                          )}
                        </div>
                        <div
                          className={`w-full text-center rounded-sm text-[7px] sm:text-[9px] font-mono ${cellOwner ? 'font-bold' : 'bg-black/20 text-slate-400'}`}
                          style={cellOwner ? { backgroundColor: cellOwner.color + '40', color: cellOwner.color } : {}}
                        >
                          {cellOwner ? cellOwner.name.substring(0, 3) : `₩${cell.price}`}
                        </div>
                      </>
                    ) : renderSpecialCell(cell)}

                    {/* Player Avatars on Cell */}
                    <div className="absolute inset-x-0 bottom-4 flex justify-center items-end -space-x-1 pointer-events-none">
                      {playersHere.map(p => (
                        <div key={p.id} className="relative z-10 transform translate-y-2">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white shadow-sm bg-slate-800 flex items-center justify-center overflow-hidden">
                            <PlayerAvatar playerId={p.id} color={p.color} isActive={false} avatarId={p.avatarId} size="sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </main>

          {/* Bottom Controls - Fixed "Thumb Zone" */}
          <footer className="relative z-40 bg-slate-900 border-t border-white/5 px-4 pb-safe-bottom pt-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
            <div className="max-w-md mx-auto flex flex-col gap-4 pb-4">

              {gameState.outstandingDebt > 0 && !gameState.players[gameState.currentPlayerIndex]?.isComputer && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between text-red-400 animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚨</span>
                    <span className="font-bold text-sm">빚 청산 필요!</span>
                  </div>
                  <span className="font-mono font-bold">-{gameState.outstandingDebt.toLocaleString()}</span>
                </div>
              )}

              {!gameState.waitingForNextTurn && !gameState.modal && !gameState.players[gameState.currentPlayerIndex]?.isComputer && !gameState.pendingArrivalId && gameState.outstandingDebt === 0 && !gameState.isSelectingMoveTarget && (
                <button
                  onClick={handleRollDice}
                  disabled={gameState.isRolling || gameState.isMoving || gameState.players[gameState.currentPlayerIndex]?.id !== gameState.myPlayerId}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-black text-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-2xl">🎲</span>
                  {gameState.players[gameState.currentPlayerIndex]?.id !== gameState.myPlayerId
                    ? `${gameState.players[gameState.currentPlayerIndex]?.name}의 차례`
                    : gameState.consecutiveDoubles > 0 ? 'DOUBLE ROLL!' : 'ROLL DICE'
                  }
                </button>
              )}

              {gameState.waitingForNextTurn && !gameState.players[gameState.currentPlayerIndex]?.isComputer && !gameState.pendingArrivalId && gameState.outstandingDebt === 0 && (
                <button
                  onClick={nextTurn}
                  disabled={gameState.players[gameState.currentPlayerIndex]?.id !== gameState.myPlayerId}
                  className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-2xl">⏭️</span>
                  {gameState.players[gameState.currentPlayerIndex]?.id !== gameState.myPlayerId
                    ? `${gameState.players[gameState.currentPlayerIndex]?.name}의 차례`
                    : 'TURN END'
                  }
                </button>
              )}

              {gameState.players[gameState.currentPlayerIndex]?.isComputer && !gameState.winner && (
                <div className="w-full py-4 rounded-2xl bg-slate-800 text-slate-500 font-bold text-center border border-slate-700 flex items-center justify-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full"></div>
                  {gameState.players[gameState.currentPlayerIndex].name} 생각 중...
                </div>
              )}
            </div>
          </footer>

          {/* Chat Overlay */}
          {isChatOpen && (
            <div className="absolute inset-x-0 bottom-[100px] top-20 mx-4 z-50 flex justify-end pointer-events-none">
              <div className="w-full max-w-sm bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto animate-slide-up">
                <div className="p-3 border-b border-white/10 flex justify-between items-center bg-slate-800/50">
                  <span className="font-bold text-sm text-slate-300">실시간 채팅</span>
                  <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Chat messages={chatMessages} onSendMessage={(text) => addChatMessage(gameState.myPlayerId || 1, userProfile?.name || '나', text, userProfile?.avatarId)} currentUserId={gameState.myPlayerId || 1} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

