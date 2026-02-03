import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PlanModal } from './components/PlanModal';
import { IntroModal } from './components/IntroModal';
import { ActionModal } from './components/ActionModal';
import { BoardCell, CellType, GameState, Player, ChatMessage, ModalState, P2PMessage, UserProfile } from './types';
import { INITIAL_BOARD, INITIAL_MONEY, SALARY, GOLDEN_KEYS, PLAYER_COLORS } from './constants';
import { Dice } from './components/Dice';
import { Chat } from './components/Chat';
import { PlayerAvatar } from './components/PlayerAvatar';
import { BuildingIcon } from './components/BuildingIcon';
import { initP2PRoom, broadcastState, onP2PMessage, onPeerJoin, leaveP2PRoom, broadcastChat, sendGenericMessage } from './services/p2pService';
import { initAudio, startBGM, stopBGM, toggleMute as toggleAudioMute } from './services/audioService';

// Updated Helper to create dynamic players
const createPlayers = (count: number, myProfile: UserProfile | null, isPVE: boolean): Player[] => {
  const players: Player[] = [];
  const aiNames = ['알파고', '왓슨', '자비스', '스카이넷', '할9000'];

  // Create Player 1 (Me)
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

  // Create others
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

const createInitialState = (myProfile: UserProfile | null): GameState => ({
  players: [], // Will be populated based on mode
  currentPlayerIndex: 0,
  board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
  turnCount: 1,
  logs: ['세계 여행을 시작합니다!'],
  gameStatus: 'PLANNING',
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
  isMultiplayer: false,
  isConnected: false
});

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [gameState, setGameState] = useState<GameState>(createInitialState(null));
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showIntro, setShowIntro] = useState(true);
  const [showPlan, setShowPlan] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Sliding Tab State
  const [isMuted, setIsMuted] = useState(false);

  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  const userProfileRef = useRef(userProfile);
  useEffect(() => { userProfileRef.current = userProfile; }, [userProfile]);

  // --- Utility: Sound ---
  useEffect(() => {
    // Initialize Audio Context on mount (it will be suspended until user interaction)
    initAudio();
    return () => {
      stopBGM();
    };
  }, []);

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    toggleAudioMute(newState);
  };

  const playSound = (type: string) => {
    // Placeholder: In future, integrate SFX into audioService too
  };

  // --- Utility: P2P State Sync ---
  const updateStateAndBroadcast = (newStateFn: (prev: GameState) => GameState) => {
    setGameState(prev => {
      const newState = newStateFn(prev);
      if (newState.isMultiplayer) {
        broadcastState(newState);
      }
      return newState;
    });
  };

  // --- Utility: Chat & Logs ---
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

    // Broadcast user messages
    if (gameStateRef.current.isMultiplayer && senderId !== 'SYSTEM' && senderId !== 'AI') {
      broadcastChat(newMsg);
    }
  }, []);

  // --- Initialization Flow ---
  const handleProfileComplete = (profile: UserProfile) => {
    setUserProfile(profile);
    setShowIntro(false);
    setShowPlan(true);
    // Attempt to start audio context here (User gesture)
    initAudio();
  };

  // Helper to send custom message
  const sendCustomMessage = (msg: P2PMessage) => {
    sendGenericMessage(msg);
  }

  const handleGameStart = (mode: 'PVE' | 'PVP' | 'PVP_HOST' | 'PVP_JOIN', roomId?: string, playerCount: number = 2) => {
    setShowPlan(false);

    // Start Procedural BGM
    startBGM();

    // Local Game
    if (mode === 'PVE' || mode === 'PVP') {
      const players = createPlayers(playerCount, userProfile, mode === 'PVE');
      setGameState({
        ...gameState,
        players,
        gameStatus: 'PLAYING',
        myPlayerId: 1 // In local, I am player 1 usually
      });
      return;
    }

    // Multiplayer Game
    if (roomId && userProfile) {
      initP2PRoom(roomId);

      const isHost = mode === 'PVP_HOST';

      if (isHost) {
        // Host initializes with just themselves
        const me = createPlayers(1, userProfile, false)[0];
        setGameState({
          ...gameState,
          gameStatus: 'LOBBY', // Wait in lobby
          isMultiplayer: true,
          roomId: roomId,
          myPlayerId: 1,
          players: [me],
          isConnected: true
        });
        addChatMessage('SYSTEM', 'System', '방이 생성되었습니다. 다른 플레이어를 기다리는 중...');

        // Listen for joins
        onP2PMessage((msg: P2PMessage) => {
          if (msg.type === 'JOIN_REQ') {
            const guestProfile = msg.payload as UserProfile;
            updateStateAndBroadcast(prev => {
              if (prev.gameStatus !== 'LOBBY') return prev; // Too late
              const newId = prev.players.length + 1;
              if (newId > 5) return prev; // Max 5

              // Check if already joined
              if (prev.players.some(p => p.name === guestProfile.name && p.color === guestProfile.color)) return prev;

              const newPlayer: Player = {
                id: newId,
                name: guestProfile.name,
                money: INITIAL_MONEY,
                position: 0,
                color: guestProfile.color,
                avatarId: guestProfile.avatarId,
                isBankrupt: false,
                isTrapped: 0,
                isComputer: false,
                hasEscapeCard: false
              };

              addChatMessage('SYSTEM', 'System', `${guestProfile.name}님이 입장했습니다!`);
              return { ...prev, players: [...prev.players, newPlayer] };
            });
          } else if (msg.type === 'CHAT') {
            setChatMessages(prev => [...prev, msg.payload]);
          }
        });

      } else {
        // Joiner logic
        setGameState({
          ...gameState,
          gameStatus: 'LOBBY',
          isMultiplayer: true,
          roomId: roomId,
          myPlayerId: -1, // Temporary until synced
          players: [], // Will receive from host
          isConnected: true
        });

        // Send Join Request periodically until state synced
        const joinInterval = setInterval(() => {
          if (gameStateRef.current.myPlayerId !== -1) {
            clearInterval(joinInterval);
            return;
          }
          // Send JOIN_REQ
          if (userProfileRef.current) {
            sendGenericMessage({ type: 'JOIN_REQ', payload: userProfileRef.current });
          }
        }, 2000);

        // Connect Peer Event
        onPeerJoin((peerId) => {
          // Send my profile to host immediately on connect
          if (userProfileRef.current) {
            const msg: P2PMessage = { type: 'JOIN_REQ', payload: userProfileRef.current };
            sendCustomMessage(msg);
          }
        });

        onP2PMessage((msg: P2PMessage) => {
          if (msg.type === 'STATE_SYNC') {
            // Host sent state. Am I in it?
            const remoteState = msg.payload as GameState;
            const me = remoteState.players.find(p => p.name === userProfileRef.current?.name && p.color === userProfileRef.current?.color);

            setGameState(prev => {
              // Update local state completely to match host
              return {
                ...remoteState,
                myPlayerId: me ? me.id : prev.myPlayerId,
                isMultiplayer: true,
                roomId: roomId
              };
            });

            if (me && gameStateRef.current.myPlayerId === -1) {
              addChatMessage('SYSTEM', 'System', '방에 입장했습니다! 호스트가 시작하길 기다리세요.');
            }
          } else if (msg.type === 'START_GAME') {
            setGameState(prev => ({ ...prev, gameStatus: 'PLAYING' }));
            addChatMessage('SYSTEM', 'System', '게임이 시작되었습니다!');
          } else if (msg.type === 'CHAT') {
            setChatMessages(prev => [...prev, msg.payload]);
          }
        });
      }
    }
  };

  // --- Logic: Lobby Start Game ---
  const handleLobbyStart = () => {
    if (gameState.players.length < 2) {
      alert("최소 2명이 필요합니다.");
      return;
    }
    updateStateAndBroadcast(prev => ({ ...prev, gameStatus: 'PLAYING' }));
    sendCustomMessage({ type: 'START_GAME', payload: {} });
  };

  // --- Logic: Calculate Sell Price ---
  const calculateSellPrice = (cell: BoardCell) => {
    // 50% of Land Price + 50% of Building Cost
    let buildingCost = 0;
    for (let i = 1; i <= cell.buildingLevel; i++) {
      buildingCost += (cell.buildingPrices[i] || 0);
    }
    return Math.floor((cell.price + buildingCost) * 0.5);
  };

  // --- Logic: Sell Land ---
  const sellLand = (index: number, price: number) => {
    updateStateAndBroadcast(prev => {
      const player = prev.players[prev.currentPlayerIndex];
      const newPlayers = [...prev.players];
      const newBoard = [...prev.board];

      // Add money
      newPlayers[prev.currentPlayerIndex] = { ...player, money: player.money + price };

      // Reset Cell
      newBoard[index] = {
        ...newBoard[index],
        ownerId: null,
        buildingLevel: 0
      };

      addChatMessage('SYSTEM', '매각', `${player.name}님이 ${newBoard[index].name}을(를) 매각하여 ₩${price.toLocaleString()}을 확보했습니다.`);

      return {
        ...prev,
        players: newPlayers,
        board: newBoard,
        modal: null // Close any modal that triggered this
      };
    });
  };

  // --- Logic: Process Payment (Asset Liquidation Check) ---
  const handlePayment = (amount: number, creditorId: number | null, reason: string) => {
    const currentState = gameStateRef.current;

    // Permission Check: P2P
    if (currentState.isMultiplayer && currentState.players[currentState.currentPlayerIndex].id !== currentState.myPlayerId) {
      return false; // Should not happen as effect won't trigger, but safety
    }

    const player = currentState.players[currentState.currentPlayerIndex];

    // 1. If enough money, pay immediately
    if (player.money >= amount) {
      updateStateAndBroadcast(prev => {
        let newPlayers = [...prev.players];
        let p = { ...newPlayers[prev.currentPlayerIndex] };

        p.money -= amount;

        // If paying a player
        if (creditorId) {
          const creditorIdx = newPlayers.findIndex(cp => cp.id === creditorId);
          if (creditorIdx !== -1) {
            newPlayers[creditorIdx] = {
              ...newPlayers[creditorIdx],
              money: newPlayers[creditorIdx].money + amount
            };
          }
        }

        addChatMessage('SYSTEM', '결제', `${p.name}님이 ${reason} ₩${amount.toLocaleString()}을(를) 지불했습니다.`);

        return {
          ...prev,
          players: newPlayers,
          outstandingDebt: 0,
          creditorId: null,
          modal: null,
          waitingForNextTurn: prev.pendingArrivalId ? false : !prev.isSelectingMoveTarget // Don't end turn if pending arrival or selecting target
        };
      });
      return true; // Payment success
    }

    // 2. Not enough money: Check Total Assets
    const ownedCells = currentState.board.filter(c => c.ownerId === player.id);
    const totalAssetValue = ownedCells.reduce((sum, cell) => sum + calculateSellPrice(cell), 0);

    if (player.money + totalAssetValue < amount) {
      // Bankruptcy
      updateStateAndBroadcast(prev => {
        let newPlayers = [...prev.players];
        newPlayers[prev.currentPlayerIndex] = { ...newPlayers[prev.currentPlayerIndex], money: -1, isBankrupt: true }; // Force negative
        addChatMessage('SYSTEM', '파산', `⚠️ ${player.name}님은 자산을 모두 팔아도 빚을 갚을 수 없어 파산했습니다!`);
        return { ...prev, players: newPlayers, waitingForNextTurn: true, modal: null };
      });
      return false;
    }

    // 3. Recoverable: Enter Sell Mode
    updateStateAndBroadcast(prev => ({
      ...prev,
      outstandingDebt: amount,
      creditorId: creditorId,
      modal: {
        isOpen: true,
        type: 'DEBT',
        title: '자금 부족 경고',
        message: `${reason}을(를) 위한 자금이 부족합니다.\n(부족 금액: ₩${(amount - player.money).toLocaleString()})\n\n보유한 땅을 매각하여 자금을 확보하세요.\n확인을 누른 후 땅을 선택하면 매각됩니다.`,
        isComputerAction: player.isComputer
      }
    }));
    return false; // Payment deferred
  };

  // --- Logic: Teleport (World Travel) ---
  const handleTeleport = (targetIndex: number) => {
    // 1. Log the flight
    const currentPlayer = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
    const targetName = gameStateRef.current.board[targetIndex].name;
    addChatMessage('SYSTEM', '비행', `✈️ ${currentPlayer.name}님이 ${targetName}(으)로 출발합니다!`);

    // 2. Set State
    updateStateAndBroadcast(prev => {
      let newPlayers = [...prev.players];
      let p = { ...newPlayers[prev.currentPlayerIndex] };

      p.position = targetIndex;
      newPlayers[prev.currentPlayerIndex] = p;

      return {
        ...prev,
        players: newPlayers,
        isSelectingMoveTarget: false,
      };
    });

    // 3. Trigger Arrival after a short "flight" delay
    setTimeout(() => {
      handleArrival(gameStateRef.current.players[gameStateRef.current.currentPlayerIndex].id);
    }, 800);
  };

  // Clean up P2P on unmount
  useEffect(() => {
    return () => {
      leaveP2PRoom();
    };
  }, []);

  // --- Core Logic: Arrival Handler ---
  const handleArrival = (playerId: number) => {
    // Permission Check for P2P
    const s = gameStateRef.current;
    if (s.isMultiplayer && s.players.find(p => p.id === playerId)?.id !== s.myPlayerId) {
      return;
    }

    updateStateAndBroadcast(prev => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player) return prev;

      const cell = prev.board[player.position];
      let modal: ModalState | null = null;
      let newPlayers = [...prev.players];
      let updatedPlayer = { ...player };
      let pendingArrivalId: number | null = null;

      // 1. CITY Logic
      if (cell.type === CellType.CITY) {
        if (cell.ownerId === null) {
          // Empty Land -> Buy?
          if (updatedPlayer.money >= cell.price) {
            modal = {
              isOpen: true,
              type: 'BUY',
              title: `${cell.name} 도착`,
              message: `${cell.name}은(는) 주인이 없습니다.\n구매하시겠습니까?`,
              cost: cell.price
            };
          } else {
            addChatMessage('SYSTEM', 'System', `${player.name}님은 돈이 부족해 ${cell.name}을(를) 살 수 없습니다.`);
            return { ...prev, waitingForNextTurn: true, isRolling: false, isMoving: false };
          }
        } else if (cell.ownerId === updatedPlayer.id) {
          // My Land -> Upgrade?
          if (cell.buildingLevel < 4) {
            const upgradeCost = cell.buildingPrices[cell.buildingLevel + 1] || 0;
            if (upgradeCost > 0 && updatedPlayer.money >= upgradeCost) {
              const nextBuildName = ['별장', '빌딩', '호텔', '랜드마크'][cell.buildingLevel];
              modal = {
                isOpen: true,
                type: 'BUY',
                title: '건물 건설',
                message: `내 도시 ${cell.name}에\n[${nextBuildName}]을(를) 짓겠습니까?`,
                cost: upgradeCost
              };
            } else {
              return { ...prev, waitingForNextTurn: true, isRolling: false, isMoving: false };
            }
          } else {
            return { ...prev, waitingForNextTurn: true, isRolling: false, isMoving: false };
          }
        } else {
          // Opponent Land -> Pay Rent
          const owner = newPlayers.find(p => p.id === cell.ownerId);
          if (owner) {
            let rent = cell.rent;
            if (cell.buildingLevel === 4) rent = cell.rent * 10;
            else rent = Math.floor(cell.rent * (1 + cell.buildingLevel * 2));

            if (updatedPlayer.money >= rent) {
              // Affordable
              updatedPlayer.money -= rent;
              const ownerIdx = newPlayers.findIndex(p => p.id === owner.id);
              newPlayers[ownerIdx] = { ...owner, money: owner.money + rent };
              addChatMessage('SYSTEM', 'System', `${updatedPlayer.name}님이 ${owner.name}님의 ${cell.name} 통행료 ${rent}만원을 지불했습니다.`);

              // Takeover Logic (Only if affordable)
              if (cell.buildingLevel < 4) {
                const takeoverCost = cell.price * 2 + (cell.buildingPrices.slice(1, cell.buildingLevel + 1).reduce((a, b) => a + b, 0));
                if (updatedPlayer.money >= takeoverCost) {
                  modal = {
                    isOpen: true,
                    type: 'TAKEOVER',
                    title: '인수 공격',
                    message: `${owner.name}님의 ${cell.name}을(를)\n강제로 인수하시겠습니까?`,
                    cost: takeoverCost
                  };
                }
              }
            } else {
              // Debt Logic
              const ownedCells = prev.board.filter(c => c.ownerId === updatedPlayer.id);
              const totalAssetValue = ownedCells.reduce((sum, c) => sum + calculateSellPrice(c), 0);

              if (updatedPlayer.money + totalAssetValue < rent) {
                updatedPlayer.isBankrupt = true;
                updatedPlayer.money = -1;
                addChatMessage('SYSTEM', '파산', `⚠️ ${updatedPlayer.name}님은 통행료를 감당하지 못해 파산했습니다!`);
                return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
              } else {
                return {
                  ...prev,
                  players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
                  outstandingDebt: rent,
                  creditorId: owner.id,
                  modal: {
                    isOpen: true,
                    type: 'DEBT',
                    title: '통행료 부족',
                    message: `통행료 ${rent.toLocaleString()}원이 필요합니다.\n보유 현금이 부족합니다.\n\n땅을 매각하여 자금을 확보하세요.`,
                    isComputerAction: player.isComputer
                  },
                  isRolling: false,
                  isMoving: false
                };
              }
            }
          }
        }
      }
      // 2. CHANCE Logic
      else if (cell.type === CellType.CHANCE) {
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
              ...prev,
              players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
              outstandingDebt: amount,
              creditorId: null, // Bank
              modal: {
                isOpen: true,
                type: 'DEBT',
                title: '지불 능력 부족',
                message: `${card.name}: ${amount.toLocaleString()}원을 지불해야 합니다.\n땅을 매각하세요.`,
                isComputerAction: player.isComputer
              },
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
      }
      // 3. SPECIAL Logic
      else if (cell.type === CellType.ISLAND) {
        updatedPlayer.isTrapped = 3;
        addChatMessage('SYSTEM', '무인도', `${updatedPlayer.name}님이 무인도에 갇혔습니다! (3턴 대기)`);
        return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
      }
      else if (cell.type === CellType.OLYMPIC) { // Concorde
        if (updatedPlayer.isComputer) {
          addChatMessage('SYSTEM', 'AI', '알파고가 이동할 도시를 고민중입니다...');
        } else {
          addChatMessage('SYSTEM', '콩코드', '🚀 콩코드 여객기 탑승! 이동할 도시를 지도에서 선택하세요.');
          return {
            ...prev,
            players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
            waitingForNextTurn: false, isRolling: false, isMoving: false,
            isSelectingMoveTarget: true
          };
        }
      }
      else if (cell.type === CellType.TAX) {
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
            ...prev,
            players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
            outstandingDebt: amount,
            creditorId: null,
            modal: {
              isOpen: true,
              type: 'DEBT',
              title: '세금 체납',
              message: `세금 ${amount}만원을 낼 돈이 부족합니다.\n땅을 매각하세요.`,
              isComputerAction: player.isComputer
            },
            isRolling: false, isMoving: false
          };
        }
      }
      else if (cell.type === CellType.START) {
        addChatMessage('SYSTEM', '출발지', `${updatedPlayer.name}님 출발지 도착! 보너스를 획득합니다.`);
        updatedPlayer.money += SALARY;
        return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
      }

      // Check Bankruptcy General
      if (updatedPlayer.money < 0) {
        updatedPlayer.isBankrupt = true;
        addChatMessage('SYSTEM', '파산', `⚠️ ${updatedPlayer.name}님이 파산했습니다!`);
        return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
      }

      if (!modal) {
        return {
          ...prev,
          players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p),
          waitingForNextTurn: true, isRolling: false, isMoving: false
        };
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

  // --- Logic: Handle Click on Board Cell ---
  const handleCellClick = (index: number) => {
    // Permission Check
    const s = gameStateRef.current;
    if (s.isMultiplayer && s.players[s.currentPlayerIndex].id !== s.myPlayerId) return;

    // 1. World Travel Selection
    if (gameState.isSelectingMoveTarget && !gameState.players[gameState.currentPlayerIndex].isComputer && gameState.outstandingDebt === 0) {
      handleTeleport(index);
      return;
    }

    // 2. Asset Liquidation (Selling)
    if (gameState.outstandingDebt > 0 && !gameState.players[gameState.currentPlayerIndex].isComputer) {
      const cell = gameState.board[index];
      if (cell.ownerId === gameState.players[gameState.currentPlayerIndex].id) {
        // Open Sell Modal instead of using window.confirm
        const sellPrice = calculateSellPrice(cell);
        setGameState(prev => ({
          ...prev,
          modal: {
            isOpen: true,
            type: 'SELL',
            title: '자산 매각',
            message: `${cell.name}을(를) 매각하시겠습니까?\n매각 시 ₩${sellPrice.toLocaleString()}을 획득합니다.`,
            cost: sellPrice, // We use cost field to store the sell price
            targetIndex: index
          }
        }));
      }
    }
  };

  // --- Effect: Auto-Pay Debt if Money Sufficient ---
  useEffect(() => {
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];

    if (!p) return;

    // Only run if it's my turn/logic
    if (s.isMultiplayer && p.id !== s.myPlayerId) return;

    if (s.outstandingDebt > 0 && p.money >= s.outstandingDebt) {
      // Slight delay for visual
      const timer = setTimeout(() => {
        handlePayment(s.outstandingDebt, s.creditorId, '빚');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [gameState.players, gameState.outstandingDebt]);


  // --- Logic: Handle Modal Action ---
  const handleModalAction = (confirmed: boolean) => {
    // Permission Check: only active player can interact with modal
    // EXCEPT for Debt warning modal which might be just info, but for now strict check.
    const s = gameStateRef.current;
    if (s.isMultiplayer && s.players[s.currentPlayerIndex].id !== s.myPlayerId) return;

    updateStateAndBroadcast(prev => {
      if (!prev.modal) return prev;

      // Handle SELL modal separately logic handled in handleModalActionWithLogic wrapper mostly
      // But we need to handle non-SELL closures here

      const currentPlayer = prev.players[prev.currentPlayerIndex];
      const currentCell = prev.board[currentPlayer.position];
      let newPlayers = [...prev.players];
      let newBoard = [...prev.board];
      let p = { ...currentPlayer };

      // If closing Debt Warning Modal
      if (prev.modal.type === 'DEBT') {
        return { ...prev, modal: null };
      }

      if (confirmed) {
        if (prev.modal.type === 'BUY') {
          p.money -= (prev.modal.cost || 0);
          const newCell = { ...currentCell };
          if (newCell.ownerId === null) {
            newCell.ownerId = p.id;
            newCell.buildingLevel = 0; // Land bought (Flag)
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

      return {
        ...prev,
        players: newPlayers,
        board: newBoard,
        modal: null,
        isRolling: false,
        isMoving: false,
        waitingForNextTurn: shouldWait
      };
    });
  };

  const handleModalActionWithLogic = (confirmed: boolean) => {
    const currentModal = gameStateRef.current.modal;
    if (!currentModal) return;

    if (currentModal.type === 'SELL') {
      if (confirmed && currentModal.targetIndex !== undefined && currentModal.cost !== undefined) {
        sellLand(currentModal.targetIndex, currentModal.cost);
      } else {
        updateStateAndBroadcast(prev => ({ ...prev, modal: null }));
      }
      return;
    }

    handleModalAction(confirmed);
  };


  // --- Logic: Pending Arrival Processing (Golden Key Chain) ---
  useEffect(() => {
    const s = gameState;
    // P2P Check: Only Active Player processes recursive logic
    if (s.isMultiplayer && s.players[s.currentPlayerIndex]?.id !== s.myPlayerId) return;

    if (!gameState.modal && gameState.pendingArrivalId !== null) {
      const pid = gameState.pendingArrivalId;
      updateStateAndBroadcast(prev => ({ ...prev, pendingArrivalId: null }));

      const timer = setTimeout(() => {
        handleArrival(pid);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [gameState.modal, gameState.pendingArrivalId]);

  // --- Logic: Movement Animation (Step by Step) ---
  const movePlayerStepByStep = async (playerId: number, steps: number) => {
    let stepsRemaining = steps;

    // Broadcast "Moving" state
    updateStateAndBroadcast(prev => ({ ...prev, isMoving: true }));

    while (stepsRemaining > 0) {
      await new Promise(resolve => setTimeout(resolve, 300));
      updateStateAndBroadcast(prev => {
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
      stepsRemaining--;
    }

    setTimeout(() => {
      handleArrival(playerId);
    }, 200);
  };

  // --- Logic: Roll Dice ---
  const handleRollDice = useCallback(() => {
    const currentState = gameStateRef.current;

    // P2P Check: Turn
    if (currentState.isMultiplayer) {
      if (!currentState.isConnected) return; // Wait for opponent
      if (currentState.players[currentState.currentPlayerIndex].id !== currentState.myPlayerId) return;
    }

    if (currentState.isRolling || currentState.isMoving || currentState.modal || currentState.waitingForNextTurn || currentState.isSelectingMoveTarget || currentState.pendingArrivalId || currentState.outstandingDebt > 0) return;

    updateStateAndBroadcast(prev => ({ ...prev, isRolling: true }));
    playSound('roll');

    setTimeout(() => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const total = d1 + d2;
      const isDouble = d1 === d2;

      const p = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
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

      updateStateAndBroadcast(prev => {
        let newPlayers = [...prev.players];
        let currentPlayer = { ...newPlayers[prev.currentPlayerIndex] };

        if (toIsland) {
          currentPlayer.position = 5;
          currentPlayer.isTrapped = 3;
          addChatMessage('SYSTEM', '경찰', `${currentPlayer.name}님 과속으로 무인도 격리!`);
          newPlayers[prev.currentPlayerIndex] = currentPlayer;
          return {
            ...prev,
            diceValue: [d1, d2],
            players: newPlayers,
            consecutiveDoubles: 0,
            isRolling: false,
            waitingForNextTurn: true
          };
        }

        if (isTrapStay) {
          currentPlayer.isTrapped -= 1;
          addChatMessage('SYSTEM', '무인도', `탈출 실패.. (${currentPlayer.isTrapped}턴 남음)`);
          newPlayers[prev.currentPlayerIndex] = currentPlayer;
          return {
            ...prev,
            diceValue: [d1, d2],
            players: newPlayers,
            isRolling: false,
            waitingForNextTurn: true
          };
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

        return {
          ...prev,
          diceValue: [d1, d2],
          players: newPlayers,
          consecutiveDoubles: newDoubles,
          isRolling: false,
          waitingForNextTurn: moveSteps === 0
        };
      });

      if (moveSteps > 0 && !toIsland) {
        setTimeout(() => {
          movePlayerStepByStep(p.id, moveSteps);
        }, 600);
      }

    }, 1000);
  }, [addChatMessage]);

  const nextTurn = useCallback(() => {
    // P2P Check
    const s = gameStateRef.current;
    if (s.isMultiplayer && s.players[s.currentPlayerIndex].id !== s.myPlayerId) return;

    updateStateAndBroadcast(prev => {
      let nextIndex = prev.currentPlayerIndex;
      let nextTurnCount = prev.turnCount;
      let nextDoubles = prev.consecutiveDoubles;

      if (prev.consecutiveDoubles > 0 && prev.players[prev.currentPlayerIndex].isTrapped === 0) {
        addChatMessage('SYSTEM', 'System', `${prev.players[prev.currentPlayerIndex].name}님의 연속 턴!`);
      } else {
        nextIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
        let loopGuard = 0;
        // Skip Bankrupt
        while (prev.players[nextIndex].isBankrupt && loopGuard < prev.players.length) {
          nextIndex = (nextIndex + 1) % prev.players.length;
          loopGuard++;
        }
        nextTurnCount++;
        nextDoubles = 0;
      }

      const active = prev.players.filter(p => !p.isBankrupt);
      if (active.length === 1) return { ...prev, gameStatus: 'ENDED', winner: active[0].id };

      return {
        ...prev,
        currentPlayerIndex: nextIndex,
        turnCount: nextTurnCount,
        consecutiveDoubles: nextDoubles,
        waitingForNextTurn: false,
        isRolling: false,
        isMoving: false,
        isSelectingMoveTarget: false,
        modal: null,
        pendingArrivalId: null,
        outstandingDebt: 0
      };
    });
  }, [addChatMessage]);

  // --- AI Automation ---
  // 1. Roll Dice
  useEffect(() => {
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;

    if (s.gameStatus === 'PLAYING' && p.isComputer && !s.isRolling && !s.isMoving && !s.waitingForNextTurn && !s.modal && !s.isSelectingMoveTarget && !s.pendingArrivalId && s.outstandingDebt === 0) {
      // AI only runs if I am Player 1 (Local Host) in Single Player
      if (!s.isMultiplayer) {
        const timer = setTimeout(() => handleRollDice(), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.currentPlayerIndex, gameState.isRolling, gameState.isMoving, gameState.waitingForNextTurn, gameState.modal, gameState.gameStatus, gameState.isSelectingMoveTarget, gameState.pendingArrivalId, gameState.outstandingDebt, handleRollDice]);

  // 2. Handle Modal Decision
  useEffect(() => {
    const s = gameState;
    if (s.gameStatus === 'PLAYING' && s.modal && s.modal.isComputerAction) {
      // Only run if local single player
      if (!s.isMultiplayer) {
        const timer = setTimeout(() => {
          let decision = true;
          const cost = s.modal?.cost || 0;
          const currentMoney = s.players.find(p => p.isComputer)?.money || 0;

          if (s.modal?.type === 'BUY') {
            if (currentMoney < cost) decision = false;
          } else if (s.modal?.type === 'TAKEOVER') {
            if (currentMoney < cost + 300) decision = false;
          } else if (s.modal?.type === 'DEBT') {
            decision = true;
          }

          handleModalActionWithLogic(decision);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.modal]);

  // 3. AI World Travel Selection
  useEffect(() => {
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;

    if (s.gameStatus === 'PLAYING' && s.isSelectingMoveTarget && p.isComputer) {
      if (!s.isMultiplayer) {
        const timer = setTimeout(() => {
          const availableCities = s.board.filter(c => c.type === CellType.CITY);
          const target = availableCities[Math.floor(Math.random() * availableCities.length)];
          handleTeleport(target.id);
        }, 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.isSelectingMoveTarget]);

  // 4. End Turn
  useEffect(() => {
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;

    if (s.gameStatus === 'PLAYING' && s.waitingForNextTurn && p.isComputer && !s.modal && !s.isSelectingMoveTarget && !s.pendingArrivalId && s.outstandingDebt === 0) {
      if (!s.isMultiplayer) {
        const timer = setTimeout(() => nextTurn(), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.waitingForNextTurn, gameState.currentPlayerIndex, gameState.modal, gameState.isSelectingMoveTarget, gameState.pendingArrivalId, gameState.outstandingDebt, nextTurn]);

  // 5. AI Asset Selling (Debt Logic)
  useEffect(() => {
    const s = gameState;
    const p = s.players[s.currentPlayerIndex];
    if (!p) return;

    if (s.gameStatus === 'PLAYING' && s.outstandingDebt > 0 && p.isComputer && !s.modal) {
      if (!s.isMultiplayer) {
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
    }
  }, [gameState.outstandingDebt, gameState.modal]);


  // --- Helper: Render Special Cell Icon ---
  const renderSpecialCell = (cell: BoardCell) => {
    switch (cell.type) {
      case CellType.START:
        return (
          <div className="flex flex-col items-center justify-center h-full text-emerald-400">
            <span className="text-xl sm:text-2xl">🏁</span>
            <span className="text-[10px] font-bold mt-1">START</span>
          </div>
        );
      case CellType.ISLAND:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <span className="text-xl sm:text-2xl">🏝️</span>
            <span className="text-[10px] font-bold mt-1">ISLAND</span>
          </div>
        );
      case CellType.CHANCE:
        return (
          <div className="flex flex-col items-center justify-center h-full text-yellow-400">
            <span className="text-xl sm:text-2xl">🗝️</span>
            <span className="text-[10px] font-bold mt-1">KEY</span>
          </div>
        );
      case CellType.OLYMPIC:
        return (
          <div className="flex flex-col items-center justify-center h-full text-purple-400">
            <span className="text-xl sm:text-2xl">🚀</span>
            <span className="text-[10px] font-bold mt-1">TRAVEL</span>
          </div>
        );
      case CellType.TAX:
        return (
          <div className="flex flex-col items-center justify-center h-full text-red-400">
            <span className="text-xl sm:text-2xl">💸</span>
            <span className="text-[10px] font-bold mt-1">TAX</span>
          </div>
        );
      default:
        return null;
    }
  }

  // --- Render ---
  return (
    <div className="relative h-screen w-full bg-slate-950 text-white overflow-hidden font-sans selection:bg-emerald-500 selection:text-white">
      {/* Background World Map */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-cover bg-center bg-no-repeat grayscale mix-blend-overlay"></div>

      {showIntro && <IntroModal onComplete={handleProfileComplete} />}
      {showPlan && <PlanModal onConfirm={handleGameStart} />}

      {/* Action Modal */}
      {gameState.modal && <ActionModal modal={gameState.modal} onAction={handleModalActionWithLogic} />}

      {/* Lobby Overlay */}
      {gameState.isMultiplayer && gameState.gameStatus === 'LOBBY' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-sm animate-fade-in">
          {/* ... Lobby Content Same ... */}
          <div className="max-w-lg w-full bg-slate-900 p-8 rounded-3xl border border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.1)]">
            {/* ... existing lobby jsx ... */}
            <div className="flex items-center justify-center mb-6">
              <div className="bg-emerald-500/10 p-3 rounded-full animate-pulse">
                <span className="text-4xl">🚀</span>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 text-center tracking-tight">대기실 (Lobby)</h2>
            <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center font-mono text-emerald-400 mb-8 select-all text-xl tracking-widest shadow-inner">
              {gameState.roomId}
            </div>

            <div className="space-y-3 mb-8">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-3 pl-1">Connected Agents ({gameState.players.length}/5)</p>
              {gameState.players.map(p => (
                <div key={p.id} className="flex items-center gap-4 bg-slate-800 border border-slate-700 p-3 rounded-xl animate-slide-in hover:border-emerald-500/50 transition-colors">
                  <div className="w-10 h-10">
                    <PlayerAvatar playerId={p.id} color={p.color} isActive={false} avatarId={p.avatarId} />
                  </div>
                  <div className="flex-1">
                    <span className="font-bold text-gray-200 block">{p.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">Agent #{p.id}</span>
                  </div>
                  {p.id === gameState.myPlayerId && <span className="text-[10px] bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-lg font-bold">YOU</span>}
                </div>
              ))}
              {gameState.players.length === 0 && <p className="text-gray-500 italic text-center py-4">연결 대기 중...</p>}
            </div>

            {gameState.myPlayerId === 1 ? (
              <button
                onClick={handleLobbyStart}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold rounded-2xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                미션 시작 ({gameState.players.length}명)
              </button>
            ) : (
              <div className="text-center text-gray-400 bg-slate-800/50 py-4 rounded-2xl border border-slate-700 border-dashed animate-pulse">
                호스트가 게임을 시작하길 기다리고 있습니다...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Waiting for Connection Overlay */}
      {gameState.isMultiplayer && !gameState.isConnected && gameState.gameStatus !== 'LOBBY' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-bold text-emerald-400 mb-2 animate-pulse">위성 신호 수신 중...</h2>
          <p className="text-slate-500 text-sm">P2P 네트워크에 연결하고 있습니다.</p>
        </div>
      )}

      {/* --- HUD: Top Bar (All Players Money + Mute) --- */}
      <div className="absolute top-0 left-0 right-0 z-30 flex justify-between items-start pt-2 px-2 pointer-events-none">
        {/* Mute Button */}
        <button onClick={toggleMute} className="pointer-events-auto p-2 bg-slate-900/50 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mt-0.5">
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          )}
        </button>

        <div className="flex gap-2 overflow-x-auto max-w-full pointer-events-auto no-scrollbar pb-2 mx-auto">
          {gameState.players.map(p => {
            const isActive = p.id === gameState.players[gameState.currentPlayerIndex]?.id;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border shadow-sm transition-all min-w-fit ${isActive
                    ? 'bg-slate-800/90 border-emerald-500/50 ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/60 border-slate-700/50 opacity-80'
                  } ${p.isBankrupt ? 'grayscale opacity-50' : ''}`}
              >
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center overflow-hidden">
                  <PlayerAvatar playerId={p.id} color={p.color} isActive={false} avatarId={p.avatarId} />
                </div>
                <div className="flex flex-col leading-none">
                  <span className={`text-[9px] font-bold ${isActive ? 'text-white' : 'text-slate-400'}`}>
                    {p.name}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    ₩{p.money.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="w-9"></div> {/* Spacer for symmetry */}
      </div>

      {/* --- Main Game Board Area --- */}
      <div className="absolute inset-0 flex items-center justify-center p-2 pt-16 pb-36 z-10 overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950">

        {/* Alerts & Overlays */}
        {gameState.outstandingDebt > 0 && (
          <div className="absolute top-20 z-40 animate-bounce">
            <div className="bg-red-600/90 backdrop-blur-md text-white px-6 py-3 rounded-full font-bold shadow-[0_0_30px_rgba(220,38,38,0.6)] border border-red-400 flex items-center gap-4">
              <span className="text-2xl">🚨</span>
              <div className="flex flex-col items-start">
                <span className="text-xs text-red-200 font-normal uppercase tracking-wider">Warning</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm">부족액:</span>
                  <span className="text-yellow-300 font-mono text-lg">₩{(gameState.outstandingDebt - (gameState.players[gameState.currentPlayerIndex]?.money || 0)).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-[90vmin] aspect-square grid grid-cols-6 grid-rows-6 gap-1 bg-slate-900 p-2 rounded-[1.5rem] shadow-[0_0_60px_rgba(0,0,0,0.6)] border-[6px] border-slate-800 relative z-30 ring-1 ring-white/5">

          {/* Center Hub */}
          <div className="col-start-2 col-end-6 row-start-2 row-end-6 flex flex-col items-center justify-center p-2 sm:p-4 bg-slate-900/90 rounded-2xl border border-slate-800/50 z-10 overflow-hidden backdrop-blur-sm relative">
            <div className="absolute top-2 text-center w-full">
              <h1 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 via-cyan-400 to-purple-500 drop-shadow-[0_2px_10px_rgba(16,185,129,0.5)] tracking-tighter opacity-80">
                NEBULA
              </h1>
            </div>

            <div className="flex-1 flex items-center justify-center">
              <div className="transform scale-75 sm:scale-100">
                <Dice value={gameState.diceValue} rolling={gameState.isRolling} />
              </div>
            </div>

            <div className="w-full max-w-[200px] sm:max-w-xs flex flex-col gap-2 mb-2">
              {gameState.winner ? (
                <div className="text-xl sm:text-2xl font-bold text-yellow-400 animate-bounce text-center bg-yellow-400/10 py-2 rounded-xl border border-yellow-400/30">
                  🏆 승리: {gameState.players.find(p => p.id === gameState.winner)?.name}
                </div>
              ) : (
                <>
                  {gameState.players.length > 0 && (
                    <>
                      <div className="flex justify-between items-center px-4 py-2 bg-slate-800 rounded-lg border border-slate-700 shadow-inner">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Turn</span>
                        <span style={{ color: gameState.players[gameState.currentPlayerIndex].color }} className="font-bold text-sm sm:text-base flex items-center gap-2 drop-shadow-md">
                          {gameState.players[gameState.currentPlayerIndex].name}
                          {gameState.isMultiplayer && gameState.players[gameState.currentPlayerIndex].id === gameState.myPlayerId && <span className="text-[9px] bg-emerald-500 text-slate-900 px-1 py-0.5 rounded font-black">ME</span>}
                        </span>
                      </div>

                      {gameState.isSelectingMoveTarget ? (
                        <div className="w-full py-3 rounded-lg font-bold text-sm shadow-lg bg-slate-800 text-purple-400 text-center border border-purple-500/30 animate-pulse">
                          이동 도시 선택
                        </div>
                      ) : gameState.outstandingDebt > 0 ? (
                        <div className="w-full py-3 rounded-lg font-bold text-sm shadow-lg bg-red-900/30 text-red-400 text-center border border-red-500/30 animate-pulse">
                          자산 매각 필요
                        </div>
                      ) : !gameState.waitingForNextTurn && !gameState.modal ? (
                        <button
                          onClick={handleRollDice}
                          disabled={
                            (gameState.players[gameState.currentPlayerIndex].isComputer) ||
                            gameState.isRolling || gameState.isMoving || (gameState.pendingArrivalId !== null) ||
                            (gameState.isMultiplayer && gameState.players[gameState.currentPlayerIndex].id !== gameState.myPlayerId)
                          }
                          className={`w-full py-3 sm:py-4 rounded-xl font-black text-sm sm:text-lg shadow-lg transition-all transform hover:-translate-y-0.5 active:scale-95 ${(gameState.players[gameState.currentPlayerIndex].isComputer || gameState.isMoving || (gameState.isMultiplayer && gameState.players[gameState.currentPlayerIndex].id !== gameState.myPlayerId))
                              ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                              : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white shadow-emerald-500/20'
                            }`}
                        >
                          {gameState.isMultiplayer && gameState.players[gameState.currentPlayerIndex].id !== gameState.myPlayerId
                            ? `${gameState.players[gameState.currentPlayerIndex].name}...`
                            : gameState.isRolling ? '...' : gameState.isMoving ? 'Moving...' : gameState.consecutiveDoubles > 0 ? 'DOUBLE!' : 'ROLL'}
                        </button>
                      ) : null}

                      {gameState.waitingForNextTurn && !gameState.players[gameState.currentPlayerIndex].isComputer && !gameState.pendingArrivalId && gameState.outstandingDebt === 0 && (
                        <button
                          onClick={nextTurn}
                          disabled={gameState.isMultiplayer && gameState.players[gameState.currentPlayerIndex].id !== gameState.myPlayerId}
                          className={`w-full py-3 sm:py-4 font-bold rounded-xl animate-pulse shadow-lg text-sm sm:text-lg ${gameState.isMultiplayer && gameState.players[gameState.currentPlayerIndex].id !== gameState.myPlayerId
                              ? 'bg-slate-800 text-slate-500'
                              : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                            }`}
                        >
                          END TURN
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Render Board Cells */}
          {gameState.board.map((cell, idx) => {
            const playersHere = gameState.players.filter(p => p.position === idx && !p.isBankrupt);
            let gridArea = '';
            if (idx >= 0 && idx <= 5) gridArea = `6 / ${7 - (idx + 1)} / 7 / ${7 - idx}`;
            else if (idx >= 6 && idx <= 9) gridArea = `${6 - (idx - 5)} / 1 / ${7 - (idx - 5)} / 2`;
            else if (idx >= 10 && idx <= 15) gridArea = `1 / ${idx - 9} / 2 / ${idx - 8}`;
            else if (idx >= 16 && idx <= 19) gridArea = `${idx - 14} / 6 / ${idx - 13} / 7`;

            const ownerPlayer = cell.ownerId ? gameState.players.find(p => p.id === cell.ownerId) : null;
            const ownerColor = ownerPlayer ? ownerPlayer.color : 'transparent';

            const currentPlayer = gameState.players[gameState.currentPlayerIndex];
            const canSelectTarget = currentPlayer && gameState.isSelectingMoveTarget && !currentPlayer.isComputer;

            const isSellable = currentPlayer && gameState.outstandingDebt > 0 &&
              cell.ownerId === currentPlayer.id &&
              !currentPlayer.isComputer;

            const canInteract = canSelectTarget || isSellable;
            const isSpecial = cell.type !== CellType.CITY;

            return (
              <div
                key={cell.id}
                style={{ gridArea }}
                onClick={() => handleCellClick(idx)}
                className={`relative rounded-lg sm:rounded-xl flex flex-col items-center justify-between p-0.5 sm:p-1 overflow-hidden transition-all duration-300 border group
                   ${isSpecial ? 'bg-slate-800/80 border-slate-600 shadow-inner' : 'bg-slate-800/50 border-slate-700/50 backdrop-blur-sm'}
                   ${currentPlayer && currentPlayer.position === idx ? 'ring-1 sm:ring-2 ring-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)] z-20' : 'z-0'}
                   ${canInteract ? 'cursor-pointer hover:scale-105 hover:z-30 hover:brightness-110 hover:ring-2 hover:ring-emerald-400' : ''}
                   ${canSelectTarget ? 'hover:ring-2 hover:ring-purple-400 animate-pulse bg-purple-900/20' : ''}
                   ${isSellable ? 'ring-2 ring-red-500 animate-pulse hover:bg-red-900/30' : ''}
                   ${gameState.isSelectingMoveTarget && !canSelectTarget ? 'opacity-30 grayscale' : ''}
                 `}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 sm:h-1.5 opacity-80 ${cell.type === CellType.CITY ? '' : 'hidden'}`} style={{ backgroundColor: cell.color }}></div>

                {/* City Name or Special Icon */}
                {cell.type === CellType.CITY ? (
                  <div className="mt-1 sm:mt-2 z-10 font-bold text-[8px] sm:text-[10px] md:text-xs text-center leading-tight w-full truncate px-0.5 text-slate-200 group-hover:text-white transition-colors">
                    {cell.name}
                  </div>
                ) : null}

                {/* Special Cell Render */}
                {isSpecial && renderSpecialCell(cell)}

                {cell.type === CellType.CITY && cell.ownerId !== null && (
                  <div className="my-0.5 z-10 transform transition-transform group-hover:scale-110">
                    <BuildingIcon level={cell.buildingLevel} color={ownerColor} />
                  </div>
                )}

                {cell.type === CellType.CITY && (
                  <div className="z-10 text-[7px] sm:text-[9px] text-slate-400 font-mono mb-0.5">
                    {cell.ownerId ? `₩${cell.rent}` : `₩${cell.price}`}
                  </div>
                )}

                {/* Player Avatars */}
                <div className="absolute bottom-0 w-full flex justify-center items-end pointer-events-none pb-0.5 sm:pb-1">
                  <div className="flex -space-x-1 sm:-space-x-2 transform translate-y-0.5 sm:translate-y-1">
                    {playersHere.map(p => (
                      <PlayerAvatar
                        key={p.id}
                        playerId={p.id}
                        color={p.color}
                        avatarId={p.avatarId}
                        isActive={p.id === gameState.players[gameState.currentPlayerIndex]?.id && (gameState.isRolling || gameState.isMoving)}
                      />
                    ))}
                  </div>
                </div>

                {/* Owner Tint */}
                {cell.ownerId && (
                  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundColor: ownerColor }}></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Bottom Log & Chat Preview Bar --- */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-36 bg-gradient-to-t from-slate-950 via-slate-900/95 to-transparent flex flex-col justify-end pb-3 px-4 pointer-events-auto">
        {/* Toggle Chat Button - Floating in the bottom right corner */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className={`absolute bottom-6 right-4 bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-full shadow-lg border border-emerald-400 transition-all transform active:scale-95 group z-40 ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          aria-label="Open Chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
          {/* Notification indicator if new message */}
          {chatMessages.length > 0 && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-800 animate-pulse"></div>}
        </button>

        {/* Log List Container */}
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-1.5 pb-1 h-full justify-end overflow-hidden mask-image-linear-gradient">
          {chatMessages.slice(-10).map((msg) => {
            const isSystem = msg.senderId === 'SYSTEM';
            return (
              <div key={msg.id} className={`flex items-start text-xs sm:text-sm animate-fade-in-up w-full ${isSystem ? 'opacity-90' : 'opacity-100'}`}>
                {isSystem ? (
                  <div className="bg-slate-900/80 backdrop-blur-sm border-l-2 border-yellow-500 pl-2 pr-3 py-1 rounded-r-lg shadow-sm max-w-[90%] break-words">
                    <span className="text-yellow-500 font-bold mr-2 text-[10px]">LOG</span>
                    <span className="text-yellow-100/90">{msg.text}</span>
                  </div>
                ) : (
                  <div className="bg-slate-800/80 backdrop-blur-sm border-l-2 border-emerald-500 pl-2 pr-3 py-1 rounded-r-lg shadow-sm max-w-[85%] break-words">
                    <span className="text-emerald-400 font-bold mr-2 text-[10px] uppercase">{msg.senderName}</span>
                    <span className="text-white/90">{msg.text}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Sliding Sidebar (Right Drawer) --- */}
      <div
        className={`fixed inset-y-0 right-0 w-80 sm:w-96 bg-slate-950/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header Section: Player Status */}
        <div className="flex-shrink-0 bg-slate-900/50 border-b border-slate-800 p-4 relative">
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Crew Status ({gameState.players.length})</span>
          </h2>

          <div className="flex flex-col gap-2 max-h-[25vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {gameState.players.map(player => (
              <div key={player.id} className={`flex items-center justify-between p-2.5 rounded-xl border transition-all group ${player.id === gameState.players[gameState.currentPlayerIndex]?.id ? 'bg-slate-800 border-emerald-500/50 shadow-md' : 'bg-transparent border-transparent hover:bg-slate-800/50'} ${player.isBankrupt ? 'opacity-40 grayscale' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-800 border border-slate-700 shadow-inner overflow-hidden relative group-hover:scale-105 transition-transform">
                    <PlayerAvatar playerId={player.id} color={player.color} isActive={false} avatarId={player.avatarId} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-200 flex items-center gap-1.5">
                      {player.name}
                      {gameState.isMultiplayer && player.id === gameState.myPlayerId && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 rounded font-mono">YOU</span>}
                    </div>
                    <div className="text-[10px] flex gap-1 mt-0.5">
                      {player.isTrapped > 0 && <span className="bg-red-500/20 text-red-300 px-1.5 rounded border border-red-500/20">무인도 {player.isTrapped}턴</span>}
                      {player.hasEscapeCard && <span className="bg-yellow-500/20 text-yellow-300 px-1.5 rounded border border-yellow-500/20">Key</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-emerald-400 font-mono font-bold text-sm">₩ {player.money.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500">
                    Asset: {gameState.board.filter(c => c.ownerId === player.id).length}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Section (Fills remaining space) */}
        <div className="flex-1 overflow-hidden relative border-t border-slate-800/50">
          <Chat
            messages={chatMessages}
            onSendMessage={(text) => addChatMessage(gameState.myPlayerId ?? 1, userProfile?.name || '나', text, userProfile?.avatarId)}
            currentPlayerName={userProfile?.name || '나'}
            currentPlayerId={gameState.myPlayerId ?? 1}
          />
        </div>
      </div>

      {/* Overlay to close sidebar on click outside (Mobile) */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

    </div>
  );
}