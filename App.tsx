import React, { useState, useEffect, useCallback, useRef } from 'react';
import { IntroModal } from './components/IntroModal';
import { ActionModal } from './components/ActionModal';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';
import { GameControls } from './components/GameControls';
import { GameHeader } from './components/GameHeader';
import { WaitingRoom } from './components/WaitingRoom';
import { Chat } from './components/Chat';

import { GameState, ChatMessage, UserProfile, RoomInfo, Player, CellType } from './types';
import { INITIAL_BOARD, INITIAL_MONEY, SALARY, PLAYER_COLORS } from './constants';
import { AI_UX_DELAYS, ANIMATION_DELAYS } from './constants/aiDelays';
import {
  broadcastGameState,
  broadcastGameChat,
  advertiseRoom,
  joinLobby,
  leaveLobby
} from './services/p2pService';
import { initAudio, startBGM, stopBGM, toggleMute as toggleAudioMute } from './services/audioService';

import { useGameLogic } from './hooks/useGameLogic';
import { useP2PConnection } from './hooks/useP2PConnection';

// --- Helpers ---

const createInitialState = (): GameState => ({
  players: [],
  currentPlayerIndex: 0,
  board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
  turnCount: 1,
  logs: ['세계 여행을 시작합니다!'],
  gameStatus: 'LOBBY',
  winner: null,
  diceValue: [1, 1],
  isRolling: false,
  isMoving: false,
  isSelectingMoveTarget: false,
  waitingForNextTurn: false,
  consecutiveDoubles: 0,
  modal: null,
  pendingArrivalId: null,
  pendingMoveSteps: 0,
  outstandingDebt: 0,
  creditorId: null,
  isMultiplayer: true,
  isConnected: false
});

export default function App() {
  // 1. Basic UI States
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showIntro, setShowIntro] = useState(true);
  const [showLobby, setShowLobby] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [fillAI, setFillAI] = useState(true);

  // 2. Core Game State
  const [gameState, setGameStateInternal] = useState<GameState>(createInitialState());
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // 3. P2P Connection Hook
  const {
    isHost,
    setIsHost,
    currentRoom,
    setCurrentRoom,
    connectedPeers,
    peerNicknames,
    handleJoinOrCreateRoom
  } = useP2PConnection({
    userProfile,
    gameStateRef,
    setGameStateInternal,
    setChatMessages,
    setShowLobby
  });

  // 4. State Sync & Broadcast Wrapper
  const updateStateAndBroadcast = useCallback((action: GameState | ((prev: GameState) => GameState)) => {
    let newState: GameState;
    if (typeof action === 'function') {
      newState = action(gameStateRef.current);
    } else {
      newState = action;
    }

    setGameStateInternal(newState);

    if (isHost && newState.isMultiplayer) {
      const shouldBroadcast =
        newState.gameStatus === 'PLAYING' ||
        newState.gameStatus === 'ENDED' ||
        newState.currentPlayerIndex !== gameStateRef.current.currentPlayerIndex ||
        newState.diceValue !== gameStateRef.current.diceValue;

      if (shouldBroadcast) {
        broadcastGameState(newState);
      }
    }
  }, [isHost]);

  // 5. Chat Helper
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
    if (gameStateRef.current.isMultiplayer && senderId !== 'SYSTEM' && senderId !== 'AI') {
      broadcastGameChat(newMsg);
    }
  }, []);

  // 6. Game Logic Hook
  const gameLogic = useGameLogic({
    gameStateRef,
    setGameState: updateStateAndBroadcast,
    addChatMessage,
    isHost
  });

  // 7. Initialization & Audio
  useEffect(() => {
    initAudio();
    return () => stopBGM();
  }, []);

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    toggleAudioMute(newState);
  };

  const handleProfileComplete = (profile: UserProfile) => {
    setUserProfile(profile);
    setShowIntro(false);
    setShowLobby(true);
    initAudio();
  };

  // 8. Room Advertisement (Host)
  useEffect(() => {
    if (!isHost || !currentRoom || gameState.gameStatus !== 'LOBBY') return;
    advertiseRoom(currentRoom);
    const interval = setInterval(() => {
      advertiseRoom({ ...currentRoom, lastUpdated: Date.now() });
    }, 2000);
    return () => clearInterval(interval);
  }, [isHost, currentRoom, gameState.gameStatus]);

  // 9. Global Lobby Connection
  useEffect(() => {
    if (showIntro) return;
    joinLobby((info: RoomInfo) => {
      setRooms(prev => {
        const existingIdx = prev.findIndex(r => r.id === info.id);
        if (existingIdx !== -1) {
          const newRooms = [...prev];
          newRooms[existingIdx] = { ...info, lastUpdated: Date.now() };
          return newRooms;
        }
        return [...prev, { ...info, lastUpdated: Date.now() }];
      });
    });
    return () => leaveLobby();
  }, [showIntro]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRooms(prev => prev.filter(r => now - r.lastUpdated < 5000));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // 10. Game Start (Host)
  const handleGameStart = () => {
    if (!currentRoom || !isHost) return;

    const maxPlayers = currentRoom.maxPlayers;
    const connectedPlayerCount = 1 + connectedPeers.length;
    const targetTotal = fillAI ? maxPlayers : Math.max(2, connectedPlayerCount);

    const players: Player[] = [];
    const aiNames = ['알파고', '왓슨', '자비스', '스카이넷', 'HAL9000'];
    const realPlayerCount = 1 + connectedPeers.length;

    // Host
    players.push({
      id: 1, name: userProfile?.name || '나', money: INITIAL_MONEY, position: 0,
      color: userProfile?.color || PLAYER_COLORS[0], avatarId: userProfile?.avatarId || 0,
      isBankrupt: false, isTrapped: 0, isComputer: false, hasEscapeCard: false
    });

    // Guests
    connectedPeers.forEach((peerId, i) => {
      players.push({
        id: i + 2, name: peerNicknames[peerId] || `플레이어 ${i + 2}`, money: INITIAL_MONEY,
        position: 0, color: PLAYER_COLORS[(i + 1) % 5], avatarId: (i + 1) % 5,
        isBankrupt: false, isTrapped: 0, isComputer: false, hasEscapeCard: false
      });
    });

    // AI
    while (players.length < targetTotal) {
      const i = players.length;
      players.push({
        id: i + 1, name: aiNames[(i - realPlayerCount) % aiNames.length], money: INITIAL_MONEY,
        position: 0, color: PLAYER_COLORS[i % 5], avatarId: i % 5,
        isBankrupt: false, isTrapped: 0, isComputer: true, hasEscapeCard: false
      });
    }

    const newState = {
      ...gameState,
      players,
      gameStatus: 'PLAYING' as const,
      myPlayerId: 1
    };

    updateStateAndBroadcast(newState);
    setTimeout(() => broadcastGameState(newState), 100);
  };

  // 11. Orchestration Effects (AI, Modal, Pending Arrival)
  useEffect(() => {
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;
    if (s.outstandingDebt > 0 && p.money >= s.outstandingDebt) {
      const timer = setTimeout(() => {
        gameLogic.handlePayment(s.outstandingDebt, s.creditorId, '빚');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [gameState.players, gameState.outstandingDebt, gameLogic]);

  useEffect(() => {
    if (!gameState.modal && gameState.pendingArrivalId !== null) {
      const pid = gameState.pendingArrivalId;
      setGameStateInternal(prev => ({ ...prev, pendingArrivalId: null }));
      const timer = setTimeout(() => { gameLogic.handleArrival(pid); }, 200);
      return () => clearTimeout(timer);
    }
  }, [gameState.modal, gameState.pendingArrivalId, gameLogic]);

  // 주사위 애니메이션 완료 후 이동 처리 (상태 기반)
  useEffect(() => {
    if (gameState.isRolling) {
      // 주사위 애니메이션 시간 (UX용 지연)
      const timer = setTimeout(() => {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        const moveSteps = gameState.pendingMoveSteps;

        setGameStateInternal(prev => ({
          ...prev,
          isRolling: false,
          pendingMoveSteps: 0,
          waitingForNextTurn: moveSteps === 0
        }));

        // 이동할 칸이 있으면 이동 시작
        if (moveSteps > 0 && currentPlayer) {
          gameLogic.movePlayerStepByStep(currentPlayer.id, moveSteps);
        }
      }, 1000); // ANIMATION_DELAYS.DICE_ROLL

      return () => clearTimeout(timer);
    }
  }, [gameState.isRolling, gameState.pendingMoveSteps, gameState.players, gameState.currentPlayerIndex, gameLogic]);

  // AI Effects (Only Host runs AI)
  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;

    // AI 차례이고, 주사위를 굴릴 수 있는 상태일 때
    if (s.gameStatus === 'PLAYING' && p.isComputer && !s.isRolling && !s.isMoving && !s.waitingForNextTurn && !s.modal && !s.isSelectingMoveTarget && !s.pendingArrivalId && s.outstandingDebt === 0) {
      console.log('[AI] Ready to roll dice for:', p.name);
      const timer = setTimeout(() => {
        console.log('[AI] Rolling dice for:', p.name);
        gameLogic.handleRollDice();
      }, AI_UX_DELAYS.BEFORE_ROLL_DICE);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayerIndex, gameState.players, gameState.isRolling, gameState.isMoving, gameState.waitingForNextTurn, gameState.modal, gameState.gameStatus, gameState.isSelectingMoveTarget, gameState.pendingArrivalId, gameState.outstandingDebt, isHost, gameLogic.handleRollDice]);

  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    if (s.gameStatus === 'PLAYING' && s.modal && s.modal.isComputerAction) {
      console.log('[AI] Modal action for computer, type:', s.modal.type);
      const timer = setTimeout(() => {
        let decision = true;
        const cost = s.modal?.cost || 0;
        const currentPlayer = s.players[s.currentPlayerIndex];
        if (s.modal?.type === 'BUY' && (currentPlayer?.money || 0) < cost) decision = false;
        else if (s.modal?.type === 'TAKEOVER' && (currentPlayer?.money || 0) < cost + 300) decision = false;
        console.log('[AI] Making modal decision:', decision);
        gameLogic.handleModalActionWithLogic(decision);
      }, AI_UX_DELAYS.BEFORE_MODAL_DECISION);
      return () => clearTimeout(timer);
    }
  }, [gameState.modal, gameState.players, gameState.currentPlayerIndex, isHost, gameLogic.handleModalActionWithLogic]);

  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (s.gameStatus === 'PLAYING' && s.isSelectingMoveTarget && p?.isComputer) {
      console.log('[AI] Selecting teleport target for:', p.name);
      const timer = setTimeout(() => {
        const availableCities = s.board.filter(c => c.type === CellType.CITY);
        const target = availableCities[Math.floor(Math.random() * availableCities.length)];
        console.log('[AI] Teleporting to:', target.name);
        gameLogic.handleTeleport(target.id);
      }, AI_UX_DELAYS.BEFORE_TELEPORT);
      return () => clearTimeout(timer);
    }
  }, [gameState.isSelectingMoveTarget, gameState.players, gameState.currentPlayerIndex, isHost, gameLogic.handleTeleport]);

  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;
    if (s.gameStatus === 'PLAYING' && s.waitingForNextTurn && p.isComputer && !s.modal && !s.isSelectingMoveTarget && !s.pendingArrivalId && s.outstandingDebt === 0) {
      console.log('[AI] Waiting to end turn for:', p.name);
      const timer = setTimeout(() => {
        console.log('[AI] Ending turn for:', p.name);
        gameLogic.nextTurn();
      }, AI_UX_DELAYS.BEFORE_NEXT_TURN);
      return () => clearTimeout(timer);
    }
  }, [gameState.waitingForNextTurn, gameState.players, gameState.currentPlayerIndex, gameState.modal, gameState.isSelectingMoveTarget, gameState.pendingArrivalId, gameState.outstandingDebt, isHost, gameLogic.nextTurn]);

  useEffect(() => {
    if (!isHost) return;
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (s.gameStatus === 'PLAYING' && s.outstandingDebt > 0 && p?.isComputer && !s.modal) {
      const timer = setTimeout(() => {
        const ownedCells = s.board.filter(c => c.ownerId === p.id);
        if (ownedCells.length > 0) {
          ownedCells.sort((a, b) => gameLogic.calculateSellPrice(b) - gameLogic.calculateSellPrice(a));
          const target = ownedCells[0];
          gameLogic.sellLand(s.board.findIndex(c => c.id === target.id), gameLogic.calculateSellPrice(target));
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.outstandingDebt, gameState.modal, isHost, gameLogic]);

  // 12. Render
  return (
    <div className="relative h-[100dvh] w-full bg-slate-950 text-white overflow-hidden font-sans flex flex-col">
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-cover bg-center grayscale mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-950/80 pointer-events-none z-0"></div>

      {showIntro && <IntroModal onComplete={handleProfileComplete} />}
      {showLobby && userProfile && (
        <Lobby userProfile={userProfile} onJoinRoom={handleJoinOrCreateRoom} rooms={rooms} />
      )}

      {gameState.modal && (
        <ActionModal modal={gameState.modal} onAction={gameLogic.handleModalActionWithLogic} />
      )}

      {/* Waiting Room */}
      {!showLobby && currentRoom && gameState.gameStatus === 'LOBBY' && (
        <WaitingRoom
          userProfile={userProfile}
          connectedPeers={connectedPeers}
          peerNicknames={peerNicknames}
          isHost={isHost}
          currentRoom={currentRoom}
          fillAI={fillAI}
          setFillAI={setFillAI}
          handleGameStart={handleGameStart}
        />
      )}

      {(gameState.gameStatus === 'PLAYING' || gameState.gameStatus === 'ENDED') && (
        <>
          <GameHeader
            gameState={gameState}
            userProfile={userProfile}
            toggleMute={toggleMute}
            isMuted={isMuted}
            isChatOpen={isChatOpen}
            setIsChatOpen={setIsChatOpen}
            chatMessagesLength={chatMessages.length}
          />

          <GameBoard
            gameState={gameState}
            onCellClick={gameLogic.handleCellClick}
          />

          <GameControls
            gameState={gameState}
            handleRollDice={gameLogic.handleRollDice}
            nextTurn={gameLogic.nextTurn}
          />

          {isChatOpen && (
            <div className="absolute inset-x-0 bottom-[100px] top-20 mx-4 z-50 flex justify-end pointer-events-none">
              <div className="w-full max-w-sm bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto">
                <div className="p-3 border-b border-white/10 flex justify-between items-center bg-slate-800/50">
                  <span className="font-bold text-sm text-slate-300">실시간 채팅</span>
                  <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Chat
                    messages={chatMessages}
                    onSendMessage={(text) => addChatMessage(gameState.myPlayerId || 1, userProfile?.name || '나', text, userProfile?.avatarId)}
                    currentUserId={gameState.myPlayerId || 1}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
