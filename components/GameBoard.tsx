import { } from 'react';
import { BoardCell, CellType, GameState, Player } from '../types';
import { Dice } from './Dice';
import { PlayerAvatar } from './PlayerAvatar';
import { BuildingIcon } from './BuildingIcon';

interface GameBoardProps {
    gameState: GameState;
    onCellClick: (index: number) => void;
    onDiceRollComplete?: (d1: number, d2: number) => void;
    diceGauge?: number;
}

const renderSpecialCell = (cell: BoardCell) => {
    switch (cell.type) {
        case CellType.START:
            return (
                <div className="flex flex-col items-center justify-center h-full text-emerald-400 group-hover:scale-110 transition-transform">
                    <span className="text-xl sm:text-3xl">🏁</span>
                    <span className="text-[10px] sm:text-xs font-bold mt-1">START</span>
                </div>
            );
        case CellType.ISLAND:
            return (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 group-hover:scale-110 transition-transform">
                    <span className="text-xl sm:text-3xl">🏝️</span>
                    <span className="text-[10px] sm:text-xs font-bold mt-1">무인도</span>
                </div>
            );
        case CellType.CHANCE:
            return (
                <div className="flex flex-col items-center justify-center h-full text-yellow-400 group-hover:scale-110 transition-transform">
                    <span className="text-xl sm:text-3xl">🗝️</span>
                    <span className="text-[10px] sm:text-xs font-bold mt-1">KEY</span>
                </div>
            );
        case CellType.OLYMPIC:
            return (
                <div className="flex flex-col items-center justify-center h-full text-purple-400 group-hover:scale-110 transition-transform">
                    <span className="text-xl sm:text-3xl">🚀</span>
                    <span className="text-[10px] sm:text-xs font-bold mt-1">여행</span>
                </div>
            );
        case CellType.TAX:
            return (
                <div className="flex flex-col items-center justify-center h-full text-red-400 group-hover:scale-110 transition-transform">
                    <span className="text-xl sm:text-3xl">💸</span>
                    <span className="text-[10px] sm:text-xs font-bold mt-1">세금</span>
                </div>
            );
        default:
            return null;
    }
};

const getGridArea = (idx: number): string => {
    if (idx >= 0 && idx <= 5) return `6 / ${7 - (idx + 1)} / 7 / ${7 - idx}`;
    if (idx >= 6 && idx <= 9) return `${6 - (idx - 5)} / 1 / ${7 - (idx - 5)} / 2`;
    if (idx >= 10 && idx <= 15) return `1 / ${idx - 9} / 2 / ${idx - 8}`;
    if (idx >= 16 && idx <= 19) return `${idx - 14} / 6 / ${idx - 13} / 7`;
    return '';
};

export function GameBoard({ gameState, onCellClick, onDiceRollComplete, diceGauge = 0 }: GameBoardProps) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const myPlayerId = gameState.myPlayerId;

    return (
        <main className="flex-1 relative flex items-center justify-center p-2 sm:p-4 overflow-hidden z-10">
            <div className="w-[92vw] max-w-md aspect-square relative grid grid-cols-6 grid-rows-6 gap-1 p-1.5 bg-slate-900/90 rounded-2xl shadow-2xl ring-1 ring-white/10 backdrop-blur-sm">

                {/* Center Hub: Dice & Info */}
                <div className="col-start-2 col-end-6 row-start-2 row-end-6 bg-slate-950/50 rounded-xl relative overflow-hidden flex flex-col items-center justify-center p-4 border border-white/5">

                    {/* Turn Status */}
                    {gameState.gameStatus === 'PLAYING' && (
                        <div className="w-full px-4 mb-3 z-20">
                            {gameState.waitingForNextTurn ? (
                                <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-4 py-2 rounded-full text-center text-xs font-bold animate-pulse">
                                    다음 턴 준비 중...
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">CURRENT TURN</div>
                                    <div className="text-lg font-black text-white px-6 py-1 bg-slate-800 rounded-full border border-slate-700 shadow-lg">
                                        {currentPlayer?.name}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Dice Display */}
                    <div className={`transform transition-all duration-500 ${gameState.isRolling ? 'scale-110' : 'scale-100'}`}>
                        <Dice
                            value={gameState.diceValue}
                            rolling={gameState.isRolling}
                            onRollComplete={onDiceRollComplete}
                            rollId={gameState.rollId}
                            gauge={diceGauge}
                        />
                    </div>

                    {/* Result Text */}
                    <div className="mt-4 h-8 flex items-center justify-center">
                        {gameState.consecutiveDoubles > 0 && (
                            <span className="px-3 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/50 rounded-full text-xs font-bold animate-bounce">
                                DOUBLE {gameState.consecutiveDoubles}
                            </span>
                        )}
                    </div>

                    {currentPlayer?.hasEscapeCard && (
                        <div className="mt-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40">
                            🗝️ 무인도 탈출권 보유
                        </div>
                    )}
                </div>

                {/* Grid Cells */}
                {gameState.board.map((cell, idx) => {
                    const playersHere = gameState.players.filter(p => !p.isBankrupt && p.position === idx);
                    const gridArea = getGridArea(idx);

                    const canSelectTarget = currentPlayer && gameState.isSelectingMoveTarget && !currentPlayer.isComputer;
                    const isSellable = currentPlayer && gameState.outstandingDebt > 0 && cell.ownerId === currentPlayer.id;

                    const cellOwner = cell.ownerId ? gameState.players.find(p => p.id === cell.ownerId) : null;
                    const ownerBorderStyle = cellOwner ? { borderColor: cellOwner.color, borderWidth: '3px' } : {};
                    const isMyLand = cellOwner && myPlayerId && cellOwner.id === myPlayerId;

                    return (
                        <div
                            key={cell.id}
                            style={{ gridArea, ...ownerBorderStyle }}
                            onClick={() => onCellClick(idx)}
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
                                        {isMyLand && (
                                            <span className="mt-0.5 text-[7px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
                                                {cell.buildingLevel === 0 ? '내 땅' : `내 건물 Lv.${cell.buildingLevel}`}
                                            </span>
                                        )}
                                        {cell.buildingLevel > 0 && (
                                            <div className="mt-0.5 transform scale-75 sm:scale-100">
                                                <BuildingIcon level={cell.buildingLevel} color={cellOwner?.color} />
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
                                            <PlayerAvatar playerId={p.id} color={p.color} isActive={false} avatarId={p.avatarId} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </main>
    );
}
