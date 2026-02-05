import React from 'react';
import { RoomInfo, UserProfile, ChatMessage } from '../types';
import { PlayerAvatar } from './PlayerAvatar';
import { PLAYER_COLORS } from '../constants';
import { Chat } from './Chat';

interface WaitingRoomProps {
    userProfile: UserProfile | null;
    connectedPeers: string[];
    peerNicknames: Record<string, string>;
    isHost: boolean;
    currentRoom: RoomInfo | null;
    myPlayerId?: number;
    aiCount: number;
    setAiCount: (count: number) => void;
    handleGameStart: () => void;
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
}

export function WaitingRoom({
    userProfile,
    connectedPeers,
    peerNicknames,
    isHost,
    currentRoom,
    myPlayerId,
    aiCount,
    setAiCount,
    handleGameStart,
    messages,
    onSendMessage
}: WaitingRoomProps) {
    const maxPlayers = currentRoom?.maxPlayers || 4;
    const currentRealPlayers = 1 + connectedPeers.length; // Host + Guests
    // Remaining slots logic
    // We want to render total 'maxPlayers' slots.
    // Slots are filled in order: Host -> Guests -> AI -> Empty

    // However, the visual order should prob correspond to turn order (Host=1, Guest=2..).

    // Slot Generators
    const renderSlots = () => {
        const slots = [];

        // 1. Host (Owner)
        slots.push({
            type: 'HOST',
            name: isHost ? userProfile?.name : currentRoom?.hostName,
            color: isHost ? userProfile?.color : PLAYER_COLORS[0],
            avatarId: isHost ? userProfile?.avatarId : 0,
            isMe: isHost,
            id: 'host'
        });

        // 2. Guests
        connectedPeers.forEach((peerId, idx) => {
            const isMe = !isHost && idx === 0; // Simplified assumption for guest view self-check? 
            // Actually guest view logic: userProfile is me. connectedPeers contains OTHER guests (if fully connected mesh) or just Host connection?
            // In typical P2P Star topology (Host is hub), Guest only sees Host. Host sees all Guests.
            // But we pass 'connectedPeers' from App. 
            // App logic:
            // - Host: connectedPeers = [Guest1, Guest2...]
            // - Guest: connectedPeers = [Host] (id=1) usually?
            // Actually 'connectedPeers' in App is managed by useP2PConnection. 
            // If I am Guest, I connect to Host. Host is in connectedPeers.
            // The Waiting Room Logic in App.tsx needs to be robust for Guest view too.
            // For now, let's trust the props passed are correct for rendering "Other Players".

            // Wait, if I am Guest, userProfile is me. Host is remote.
            // If I am Host, userProfile is me. Guests are remote.

            // Let's rely on standardizing the list:
            // We need a unified list of "Players currently in room".
            // Since we don't have a unified list prop, we construct it.
        });

        // Re-thinking Slot Rendering to be pure UI based on Slots 1..Max
        const renderedCards = [];

        // Slot 1: Host
        renderedCards.push(
            <div key="slot-host" className="relative group">
                <div className="w-full aspect-[3/4] bg-slate-800 rounded-2xl border-2 border-emerald-500/50 flex flex-col items-center justify-center p-4 shadow-lg shadow-emerald-500/10">
                    <div className="absolute top-3 right-3 text-2xl">👑</div>
                    <div className="w-20 h-20 rounded-full bg-slate-700 mb-4 border-2 border-white/10 flex items-center justify-center overflow-hidden">
                        <PlayerAvatar
                            playerId={1}
                            color={isHost ? (userProfile?.color || '#fff') : PLAYER_COLORS[0]}
                            avatarId={isHost ? (userProfile?.avatarId || 0) : 0}
                            isActive={false}
                        />
                    </div>
                    <div className="font-bold text-lg text-white mb-1 truncate w-full text-center">
                        {isHost ? userProfile?.name : currentRoom?.hostName}
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded font-bold">HOST</span>
                </div>
            </div>
        );

        // Slots 2..Max
        // We need to fill these slots with Guests -> AI -> Empty
        // We need to know WHO the guests are.
        // If I am Host: Guests are in `connectedPeers`.
        // If I am Guest: `connectedPeers` has Host usually? Or maybe simple P2P service syncs all peers?
        // Note: current implementation might only show "connectedPeers" as list.
        // Let's stick to the props we have.

        let guestList: { name: string, color: string, avatarId: number, isMe: boolean }[] = [];

        if (isHost) {
            // I am Host (Slot 1). Guests are peers.
            guestList = connectedPeers.map((pid, idx) => ({
                name: peerNicknames[pid] || `Guest ${idx + 1}`,
                color: PLAYER_COLORS[(idx + 1) % 5],
                avatarId: (idx + 1) % 5,
                isMe: false
            }));
        } else {
            // I am Guest. 
            // My slot is... ? We don't know our slot index easily without syncing.
            // But we know "I" am present.
            // And "Host" is present.
            // Other guests? If topology is star, I might not know them unless Host broadcasts "Room State".
            // Current P2P service broadcasts "RoomInfo" but not full player list in waiting room?
            // Actually `ROOM_ADVERTISE` has `currentPlayers` count.
            // `GUEST_NICKNAME` is sent to Host.
            // We probably need a proper `RoomMember` sync. 
            // FOR NOW: simple visualization.
            // If I am Guest, I show Host, Myself, and maybe "Other Guest" placeholders?
            // Let's assume for MVP: Host shows full state. Guest just shows Host + Self + placeholders.

            // To make it robust:
            // Guest View:
            // Slot 1: Host (from currentRoom info)
            // Slot 2: Me (userProfile)
            // Slot 3..: Unknown (Question mark?)

            guestList.push({
                name: userProfile?.name || 'Me',
                color: userProfile?.color || '#fff',
                avatarId: userProfile?.avatarId || 0,
                isMe: true
            });

            // We can't easily show other guests in Star topology without extra sync message.
            // Let's rely on `connectedPeers` if it includes other guests (Mesh) or just ignore for now.
        }

        // Fill Guest Cards
        guestList.forEach((guest, i) => {
            renderedCards.push(
                <div key={`slot-guest-${i}`} className="relative group animate-fadeIn">
                    <div className={`w-full aspect-[3/4] bg-slate-800 rounded-2xl border-2 ${guest.isMe ? 'border-cyan-500 shadow-lg shadow-cyan-500/20' : 'border-slate-600'} flex flex-col items-center justify-center p-4`}>
                        <div className="w-20 h-20 rounded-full bg-slate-700 mb-4 border-2 border-white/10 flex items-center justify-center overflow-hidden">
                            <PlayerAvatar
                                playerId={2 + i}
                                color={guest.color}
                                avatarId={guest.avatarId}
                                isActive={false}
                            />
                        </div>
                        <div className="font-bold text-lg text-white mb-1 truncate w-full text-center">
                            {guest.name}
                        </div>
                        <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded font-bold">
                            {guest.isMe ? 'ME' : 'GUEST'}
                        </span>
                    </div>
                </div>
            );
        });

        const usedSlots = 1 + guestList.length; // Host + Guests
        let remainingSlots = maxPlayers - usedSlots;

        // AI Cards
        // Only render AI cards if Host? Or sync AI count?
        // App needs to sync AI count. For now assume passed prop implies synced or local host decision.
        // If I am Guest, I might not see AI cards until game start unless synced.
        // Let's assume `aiCount` is passed correctly.

        for (let i = 0; i < aiCount && remainingSlots > 0; i++) {
            renderedCards.push(
                <div key={`slot-ai-${i}`}
                    onClick={() => isHost && setAiCount(aiCount - 1)}
                    className={`relative group animate-fadeIn ${isHost ? 'cursor-pointer hover:-translate-y-1 transition-transform' : ''}`}
                >
                    <div className="w-full aspect-[3/4] bg-slate-800/80 rounded-2xl border-2 border-purple-500/30 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                        {isHost && (
                            <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <span className="font-bold text-red-400 text-sm">제거</span>
                            </div>
                        )}
                        <div className="text-4xl mb-4">🤖</div>
                        <div className="font-bold text-lg text-purple-200 mb-1">AI 봇</div>
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded font-bold">COMPUTER</span>
                    </div>
                </div>
            );
            remainingSlots--;
        }

        // Empty Cards
        for (let i = 0; i < remainingSlots; i++) {
            renderedCards.push(
                <div key={`slot-empty-${i}`}
                    onClick={() => isHost && setAiCount(aiCount + 1)}
                    className={`relative group ${isHost ? 'cursor-pointer' : 'cursor-default'}`}
                >
                    <div className="w-full aspect-[3/4] bg-slate-800/30 rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center p-4 hover:bg-slate-800/50 transition-colors">
                        {isHost ? (
                            <>
                                <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mb-2 text-slate-500 group-hover:text-emerald-400 group-hover:scale-110 transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                </div>
                                <span className="text-sm font-bold text-slate-500 group-hover:text-emerald-400">AI 추가</span>
                            </>
                        ) : (
                            <span className="text-slate-600 text-sm font-bold">빈 슬롯</span>
                        )}
                    </div>
                </div>
            );
        }

        return renderedCards;
    };

    return (
        <div className="absolute inset-0 flex flex-col text-white bg-slate-900 z-50 font-sans">
            {/* Header */}
            <div className="p-6 bg-slate-900/90 backdrop-blur-md border-b border-white/5 flex justify-between items-center shadow-md z-10">
                <div>
                    <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 tracking-tight">
                        {currentRoom?.name || '게임 대기실'}
                    </h2>
                    <p className="text-slate-400 text-xs mt-1 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-800 rounded text-slate-300 font-mono text-[10px] border border-slate-700">ID: {currentRoom?.id}</span>
                    </p>
                </div>

                {isHost && (
                    <button
                        onClick={handleGameStart}
                        className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center gap-2 animate-bounce-subtle"
                    >
                        <span className="text-xl">🚀</span>
                        게임 시작
                    </button>
                )}
                {!isHost && (
                    <div className="px-6 py-2 bg-slate-800/50 rounded-xl border border-white/5 animate-pulse">
                        <span className="text-emerald-400 text-sm font-bold">방장이 곧 게임을 시작합니다...</span>
                    </div>
                )}
            </div>

            {/* Main Content: Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Visual Room Area (Top/Left) */}
                <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
                    <div className="w-full max-w-5xl">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                            {renderSlots()}
                        </div>
                    </div>
                </div>

                {/* Chat Area (Right Side or Bottom? User asked for bottom in prompt "하단에는 채팅영역이 존재". 
                   But vertical split might be better for wide screens. 
                   Let's stick to user request: "하단에는 채팅영역이 존재" 
                   Wait, "대기실에서는 카드형태... 하단에는 채팅영역". 
                   Okay, I will put chat at the bottom to follow instructions strictly. 
                */}
            </div>

            {/* Chat Area (Bottom Fixed) */}
            <div className="h-64 bg-slate-900 border-t border-white/10 flex flex-col shadow-[0_-10px_50px_rgba(0,0,0,0.5)] z-20">
                <div className="px-6 py-2 bg-slate-800/80 border-b border-white/5 flex items-center justify-between backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Room Chat</span>
                    </div>
                </div>
                <div className="flex-1 relative">
                    <Chat
                        messages={messages}
                        onSendMessage={onSendMessage}
                        currentPlayerId={myPlayerId ?? (isHost ? 1 : -1)}
                        currentPlayerName={userProfile?.name || 'Me'}
                    />
                </div>
            </div>
        </div>
    );
}

// Add simple CSS animation for fadeIn if needed, or rely on Tailwind utility usage
