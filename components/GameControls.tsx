import React from 'react';
import { GameState } from '../types';

interface GameControlsProps {
    gameState: GameState;
    handleRollDice: () => void;
    nextTurn: () => void;
}

export function GameControls({ gameState, handleRollDice, nextTurn }: GameControlsProps) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === gameState.myPlayerId;
    const isComputerTurn = currentPlayer?.isComputer;

    return (
        <footer className="relative z-40 bg-slate-900 border-t border-white/5 px-3 sm:px-4 pb-safe-bottom pt-3 sm:pt-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
            <div className="max-w-md mx-auto flex flex-col gap-3 sm:gap-4 pb-4">

                {/* Debt Warning */}
                {gameState.outstandingDebt > 0 && !isComputerTurn && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between text-red-400 animate-pulse">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🚨</span>
                            <span className="font-bold text-sm">자금 확보 필요!</span>
                        </div>
                        <span className="font-mono font-bold">-{gameState.outstandingDebt.toLocaleString()}</span>
                    </div>
                )}

                {/* Roll Dice Button */}
                {!gameState.waitingForNextTurn && !gameState.modal && !isComputerTurn && !gameState.pendingArrivalId && gameState.outstandingDebt === 0 && !gameState.isSelectingMoveTarget && (
                    <button
                        onClick={handleRollDice}
                        disabled={gameState.isRolling || gameState.isMoving || !isMyTurn}
                        className="w-full py-3 sm:py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-black text-lg sm:text-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="text-2xl">🎲</span>
                        {!isMyTurn
                            ? `${currentPlayer?.name}의 차례`
                            : gameState.consecutiveDoubles > 0 ? 'DOUBLE ROLL!' : 'ROLL DICE'
                        }
                    </button>
                )}

                {/* Turn End Button */}
                {gameState.waitingForNextTurn && !isComputerTurn && !gameState.pendingArrivalId && gameState.outstandingDebt === 0 && (
                    <button
                        onClick={nextTurn}
                        disabled={!isMyTurn}
                        className="w-full py-3 sm:py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-lg sm:text-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="text-2xl">⏭️</span>
                        {!isMyTurn
                            ? `${currentPlayer?.name}의 차례`
                            : 'TURN END'
                        }
                    </button>
                )}

                {/* AI Thinking Placeholder */}
                {isComputerTurn && !gameState.winner && (
                    <div className="w-full py-4 rounded-2xl bg-slate-800 text-slate-500 font-bold text-center border border-slate-700 flex items-center justify-center gap-2">
                        <div className="animate-spin w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full"></div>
                        {currentPlayer.name} 생각 중...
                    </div>
                )}
            </div>
        </footer>
    );
}
