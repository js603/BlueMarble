import { useCallback, useRef, MutableRefObject } from 'react';
import { BoardCell, CellType, GameState, ModalState, ChatMessage, Player } from '../types';
import { GOLDEN_KEYS, SALARY } from '../constants';
import { sendGameMessage } from '../services/p2pService';
import { playSfx } from '../services/audioService';

export interface UseGameLogicProps {
    gameStateRef: MutableRefObject<GameState>;
    setGameState: (action: GameState | ((prev: GameState) => GameState)) => void;
    addChatMessage: (senderId: number | 'SYSTEM' | 'AI', senderName: string, text: string, avatarId?: number) => void;
    isHost: boolean;
}

export interface UseGameLogicReturn {
    calculateSellPrice: (cell: BoardCell) => number;
    sellLand: (index: number, price: number) => void;
    handlePayment: (amount: number, creditorId: number | null, reason: string) => boolean;
    handleArrival: (playerId: number) => void;
    handleTeleport: (targetIndex: number) => void;
    movePlayerStepByStep: (playerId: number, steps: number, alreadyMoving?: boolean) => Promise<void>;
    handleRollDice: () => void;
    handleDiceResult: (d1: number, d2: number) => void;
    nextTurn: () => void;
    handleModalAction: (confirmed: boolean) => void;
    handleModalActionWithLogic: (confirmed: boolean) => void;
    handleCellClick: (index: number) => void;
}

export function useGameLogic({
    gameStateRef,
    setGameState,
    addChatMessage,
    isHost
}: UseGameLogicProps): UseGameLogicReturn {

    // --- PURE STATE CREATOR FOR BANKRUPTCY ---
    // This helper returns a NEW state object representing the post-bankruptcy state.
    // It DOES NOT call setGameState directly, avoiding nested updates and race conditions.
    const getBankruptcyState = (prevState: GameState, playerIdx: number, creditorId: number | null): GameState => {
        const player = prevState.players[playerIdx];
        if (!player) return prevState;

        let newPlayers = [...prevState.players];
        const remainingMoney = Math.max(0, player.money);

        // 1. Mark as Bankrupt
        newPlayers[playerIdx] = { ...player, money: -1, isBankrupt: true };

        // 2. Clear all Assets (Lands) owned by the bankrupt player
        const newBoard = prevState.board.map(cell => {
            if (cell.ownerId === player.id) {
                return { ...cell, ownerId: null, buildingLevel: 0 };
            }
            return cell;
        });

        // 3. Transfer remaining funds to the creditor
        if (creditorId) {
            const cIdx = newPlayers.findIndex(p => p.id === creditorId);
            if (cIdx !== -1) {
                newPlayers[cIdx] = { ...newPlayers[cIdx], money: newPlayers[cIdx].money + remainingMoney };
                // Side-Effect: Logging remains within the logic but outside the return object for clarity
                addChatMessage('SYSTEM', '양도', `${player.name}님의 남은 자금 ₩${remainingMoney.toLocaleString()}이 ${newPlayers[cIdx].name}님에게 양도되었습니다.`);
            }
        }

        addChatMessage('SYSTEM', '파산', `⚠️ ${player.name}님이 파산했습니다! 모든 자산이 국고로 환수됩니다.`);

        // 4. Return new clean state (Next turn flag ON, Modal/Debt OFF, Movement OFF)
        return {
            ...prevState,
            players: newPlayers,
            board: newBoard,
            outstandingDebt: 0,
            creditorId: null,
            modal: null,  // CRITICAL: Ensure modal is closed
            waitingForNextTurn: true,
            isRolling: false,
            isMoving: false,
            isSelectingMoveTarget: false,
            pendingArrivalId: null
        };
    };

    const calculateSellPrice = useCallback((cell: BoardCell): number => {
        let buildingCost = 0;
        for (let i = 1; i <= cell.buildingLevel; i++) {
            buildingCost += (cell.buildingPrices[i] || 0);
        }
        return Math.floor((cell.price + buildingCost) * 0.5);
    }, []);

    const sellLand = useCallback((index: number, price: number) => {
        setGameState(prev => {
            const player = prev.players[prev.currentPlayerIndex];
            const newPlayers = [...prev.players];
            const newBoard = [...prev.board];
            newPlayers[prev.currentPlayerIndex] = { ...player, money: player.money + price };
            newBoard[index] = { ...newBoard[index], ownerId: null, buildingLevel: 0 };
            addChatMessage('SYSTEM', '매각', `${player.name}님이 ${newBoard[index].name}을(를) 매각하여 ₩${price.toLocaleString()}을 확보했습니다.`);
            return { ...prev, players: newPlayers, board: newBoard, modal: null };
        });
    }, [setGameState, addChatMessage]);

    const handlePayment = useCallback((amount: number, creditorId: number | null, reason: string): boolean => {
        const currentState = gameStateRef.current;
        const pIdx = currentState.currentPlayerIndex;
        const player = currentState.players[pIdx];
        if (!player) return false;

        if (player.money >= amount) {
            setGameState(prev => {
                let newPlayers = [...prev.players];
                let p = { ...newPlayers[pIdx] };
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

        if (ownedCells.length === 0 && player.money < amount) {
            setGameState(prev => getBankruptcyState(prev, pIdx, creditorId));
            return false;
        }

        // Cash is low but has lands -> Show DEBT modal
        setGameState(prev => ({
            ...prev,
            outstandingDebt: amount,
            creditorId: creditorId,
            modal: {
                isOpen: true,
                type: 'DEBT',
                title: '매각 권유',
                message: `${reason} 납부를 위한 자금이 부족합니다.\n(부족 금액: ₩${(amount - player.money).toLocaleString()})\n\n보유한 땅을 매각하여 자금을 확보하세요.`,
                isComputerAction: player.isComputer
            }
        }));
        return false;
    }, [gameStateRef, setGameState, addChatMessage]);

    const handleArrival = useCallback((playerId: number) => {
        setGameState(prev => {
            const pIdx = prev.players.findIndex(p => p.id === playerId);
            if (pIdx === -1) return prev;
            const player = prev.players[pIdx];

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
                            const shouldShowRentInfo = !player.isComputer;
                            if (cell.buildingLevel < 4) {
                                const takeoverCost = cell.price * 2 + (cell.buildingPrices.slice(1, cell.buildingLevel + 1).reduce((a, b) => a + b, 0));
                                if (updatedPlayer.money >= takeoverCost) {
                                    modal = {
                                        isOpen: true, type: 'TAKEOVER', title: '인수 공격 Power',
                                        message: `통행료 ₩${rent.toLocaleString()}을(를) 지불했습니다.\n${owner.name}님의 ${cell.name}을(를)\n강제로 인수하시겠습니까?`, cost: takeoverCost
                                    };
                                } else if (shouldShowRentInfo) {
                                    modal = {
                                        isOpen: true,
                                        type: 'INFO',
                                        title: '통행료 안내',
                                        message: `${owner.name}님의 ${cell.name}에 도착했습니다.\n통행료 ₩${rent.toLocaleString()}을(를) 지불했습니다.`,
                                        cost: rent
                                    };
                                } else {
                                    return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
                                }
                            } else {
                                if (shouldShowRentInfo) {
                                    modal = {
                                        isOpen: true,
                                        type: 'INFO',
                                        title: '통행료 안내',
                                        message: `${owner.name}님의 ${cell.name}에 도착했습니다.\n통행료 ₩${rent.toLocaleString()}을(를) 지불했습니다.`,
                                        cost: rent
                                    };
                                } else {
                                    return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
                                }
                            }
                        } else {
                            const ownedCells = prev.board.filter(c => c.ownerId === updatedPlayer.id);
                            const totalAssetValue = ownedCells.reduce((sum, c) => sum + calculateSellPrice(c), 0);

                            if (updatedPlayer.money + totalAssetValue < rent) {
                                // DEAD ON ARRIVAL -> Return the bankruptcy state immediately
                                return getBankruptcyState(prev, pIdx, owner.id);
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
                playSfx('key');
                if (card.type === 'PAY') {
                    const amount = card.amount!;
                    const ownedCells = prev.board.filter(c => c.ownerId === updatedPlayer.id);
                    const totalAssetValue = ownedCells.reduce((sum, c) => sum + calculateSellPrice(c), 0);
                    if (updatedPlayer.money >= amount) {
                        updatedPlayer.money -= amount;
                        modal = { isOpen: true, type: 'INFO', title: '황금열쇠 (지불)', message: msg };
                    } else if (updatedPlayer.money + totalAssetValue < amount) {
                        return getBankruptcyState(prev, pIdx, null);
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
                    playSfx('escape');
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
                    return { ...prev, players: newPlayers.map(p => p.id === playerId ? updatedPlayer : p), waitingForNextTurn: true, isRolling: false, isMoving: false };
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
                    return getBankruptcyState(prev, pIdx, null);
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
                return getBankruptcyState(prev, pIdx, null);
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
    }, [setGameState, addChatMessage, calculateSellPrice]);

    const handleTeleport = useCallback((targetIndex: number) => {
        const currentPlayer = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
        if (!currentPlayer) return;

        const targetName = gameStateRef.current.board[targetIndex].name;
        addChatMessage('SYSTEM', '비행', `✈️ ${currentPlayer.name}님이 ${targetName}(으)로 출발합니다!`);

        setGameState(prev => {
            let newPlayers = [...prev.players];
            newPlayers[prev.currentPlayerIndex] = { ...newPlayers[prev.currentPlayerIndex], position: targetIndex };
            return { ...prev, players: newPlayers, isSelectingMoveTarget: false };
        });

        // This timeout is for UI animation sequence, not for state sync hack.
        setTimeout(() => {
            const pid = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]?.id;
            if (pid) handleArrival(pid);
        }, 800);
    }, [gameStateRef, setGameState, addChatMessage, handleArrival]);

    const movePlayerStepByStep = useCallback(async (playerId: number, steps: number, alreadyMoving?: boolean) => {
        if (!alreadyMoving) {
            setGameState(prev => ({ ...prev, isMoving: true }));
        }

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
    }, [setGameState, handleArrival]);

    const handleRollDice = useCallback(() => {
        const currentState = gameStateRef.current;
        if (currentState.isRolling || currentState.isMoving || currentState.modal || currentState.waitingForNextTurn || currentState.isSelectingMoveTarget || currentState.pendingArrivalId || currentState.outstandingDebt > 0 || currentState.gameStatus !== 'PLAYING') return;

        const p = currentState.players[currentState.currentPlayerIndex];
        if (!p) return;

        if (!isHost && currentState.isMultiplayer) {
            const myId = currentState.myPlayerId;
            if (myId && p.id === myId) {
                sendGameMessage({
                    type: 'PLAYER_ACTION',
                    payload: { action: 'ROLL_DICE', playerId: myId }
                });
            }
            return;
        }

        setGameState(prev => ({
            ...prev,
            isRolling: true,
            isMoving: false,
            diceValue: [0, 0],
            pendingMoveSteps: 0,
            waitingForNextTurn: false
        }));
    }, [gameStateRef, setGameState, isHost]);

    const handleDiceResult = useCallback((d1: number, d2: number) => {
        const currentState = gameStateRef.current;
        if (!currentState.isRolling || currentState.gameStatus !== 'PLAYING') return;

        const total = d1 + d2;
        const isDouble = d1 === d2;
        const p = currentState.players[currentState.currentPlayerIndex];
        if (!p) return;

        addChatMessage('SYSTEM', '주사위', `결과: ${d1} + ${d2} = ${total}`);

        let moveSteps = 0;
        let isTrapRelease = false;
        let isTrapStay = false;
        let newDoubles = isDouble ? currentState.consecutiveDoubles + 1 : 0;
        let toIsland = false;

        if (p.isTrapped > 0) {
            newDoubles = 0;
            if (isDouble || p.hasEscapeCard) {
                isTrapRelease = true;
                moveSteps = total;
            } else {
                isTrapStay = true;
            }
        } else if (newDoubles >= 3) {
            toIsland = true;
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
                return {
                    ...prev,
                    diceValue: [d1, d2],
                    players: newPlayers,
                    consecutiveDoubles: 0,
                    isRolling: false,
                    isMoving: false,
                    pendingMoveSteps: 0,
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
                    isMoving: false,
                    pendingMoveSteps: 0,
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
                isMoving: moveSteps > 0,
                pendingMoveSteps: 0,
                waitingForNextTurn: moveSteps === 0
            };
        });

        if (moveSteps > 0) {
            setTimeout(() => {
                const currentPlayer = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
                if (currentPlayer) {
                    movePlayerStepByStep(currentPlayer.id, moveSteps, true);
                }
            }, 200);
        }
    }, [gameStateRef, setGameState, addChatMessage, movePlayerStepByStep]);

    const nextTurn = useCallback(() => {
        const s = gameStateRef.current;
        if (!s.players[s.currentPlayerIndex]) return;

        if (!isHost && s.isMultiplayer) {
            const myId = s.myPlayerId;
            const currentPlayer = s.players[s.currentPlayerIndex];
            if (currentPlayer && currentPlayer.id === myId) {
                sendGameMessage({
                    type: 'PLAYER_ACTION',
                    payload: { action: 'NEXT_TURN', playerId: myId }
                });
                return;
            }
        }

        setGameState(prev => {
            let nextIndex = prev.currentPlayerIndex;
            let nextTurnCount = prev.turnCount;
            let nextDoubles = prev.consecutiveDoubles;

            if (prev.consecutiveDoubles > 0 && prev.players[prev.currentPlayerIndex].isTrapped === 0 && !prev.players[prev.currentPlayerIndex].isBankrupt) {
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
    }, [gameStateRef, setGameState, addChatMessage, isHost]);

    const handleModalAction = useCallback((confirmed: boolean) => {
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
                        playSfx('buy');
                    } else {
                        newCell.buildingLevel += 1;
                        const bTypes = ['토지', '별장', '빌딩', '호텔', '랜드마크'];
                        const buildName = bTypes[newCell.buildingLevel] || '건물';
                        addChatMessage('SYSTEM', '부동산', `${p.name}님이 ${newCell.name}에 ${buildName}을(를) 올렸습니다!`);
                        playSfx('build');
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
                    playSfx('buy');
                }
            }
            newPlayers[prev.currentPlayerIndex] = p;
            const isDoubleTurn = prev.consecutiveDoubles > 0 && prev.consecutiveDoubles < 3;
            const shouldWait = prev.pendingArrivalId !== null ? false : !isDoubleTurn;
            return { ...prev, players: newPlayers, board: newBoard, modal: null, isRolling: false, isMoving: false, waitingForNextTurn: shouldWait };
        });
    }, [setGameState, addChatMessage]);

    const handleModalActionWithLogic = useCallback((confirmed: boolean) => {
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
    }, [gameStateRef, setGameState, sellLand, handleModalAction]);

    const handleCellClick = useCallback((index: number) => {
        const s = gameStateRef.current;
        if (!s.players[s.currentPlayerIndex]) return;
        const currentPlayer = s.players[s.currentPlayerIndex];

        if (s.isSelectingMoveTarget && !currentPlayer.isComputer && s.outstandingDebt === 0) {
            handleTeleport(index);
            return;
        }

        if (s.outstandingDebt > 0 && !currentPlayer.isComputer) {
            const cell = s.board[index];
            if (cell.ownerId === currentPlayer.id) {
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
    }, [gameStateRef, setGameState, calculateSellPrice, handleTeleport]);

    return {
        calculateSellPrice,
        sellLand,
        handlePayment,
        handleArrival,
        handleTeleport,
        movePlayerStepByStep,
        handleRollDice,
        handleDiceResult,
        nextTurn,
        handleModalAction,
        handleModalActionWithLogic,
        handleCellClick
    };
}
