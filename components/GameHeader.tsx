import React from 'react';
import { GameState, UserProfile } from '../types';
import { PlayerAvatar } from './PlayerAvatar';

interface GameHeaderProps {
    gameState: GameState;
    userProfile: UserProfile | null;
    toggleMute: () => void;
    isMuted: boolean;
    setIsChatOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
    isChatOpen: boolean;
    chatMessagesLength: number;
}

export function GameHeader({
    gameState,
    userProfile,
    toggleMute,
    isMuted,
    setIsChatOpen,
    isChatOpen,
    chatMessagesLength
}: GameHeaderProps) {
    return (
        <header className="relative z-30 pt-safe-top px-4 pb-2 bg-slate-900/80 backdrop-blur-md border-b border-white/5 flex flex-col gap-2 shrink-0">
            <div className="flex justify-between items-center h-12">
                <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">NEBULA</h1>
                <div className="flex gap-2">
                    <button onClick={toggleMute} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 active:scale-95 transition-all">
                        {isMuted ? "🔇" : "🔊"}
                    </button>
                    <button onClick={() => setIsChatOpen(!isChatOpen)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 ${chatMessagesLength > 0 ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50' : 'bg-slate-800 text-slate-400'}`}>
                        💬
                    </button>
                </div>
            </div>

            {/* Players Scroll View */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 mask-linear-fade">
                {gameState.players.map(p => {
                    const isActive = p.id === gameState.players[gameState.currentPlayerIndex]?.id;
                    const isMe = p.id === gameState.myPlayerId;
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
    );
}
