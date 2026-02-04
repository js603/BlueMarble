import React from 'react';
import { RoomInfo, UserProfile } from '../types';
import { PlayerAvatar } from './PlayerAvatar';
import { PLAYER_COLORS } from '../constants';

interface WaitingRoomProps {
    userProfile: UserProfile | null;
    connectedPeers: string[];
    peerNicknames: Record<string, string>;
    isHost: boolean;
    currentRoom: RoomInfo | null;
    fillAI: boolean;
    setFillAI: (value: boolean) => void;
    handleGameStart: () => void;
}

export function WaitingRoom({
    userProfile,
    connectedPeers,
    peerNicknames,
    isHost,
    currentRoom,
    fillAI,
    setFillAI,
    handleGameStart
}: WaitingRoomProps) {
    return (
        <div className="absolute inset-0 flex items-center justify-center text-white bg-slate-900 z-50">
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700">
                <h2 className="text-3xl font-bold mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">게임 대기실</h2>

                <div className="mb-6">
                    <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">접속한 플레이어</h3>
                    <div className="space-y-2">
                        {/* Host (나 or 방장) */}
                        <div className={`flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border ${isHost ? 'border-emerald-500/30' : 'border-slate-700/50'}`}>
                            <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center bg-slate-800 overflow-hidden" style={{ borderColor: isHost ? userProfile?.color : PLAYER_COLORS[0] }}>
                                <PlayerAvatar playerId={1} color={isHost ? (userProfile?.color || '#fff') : PLAYER_COLORS[0]} isActive={false} avatarId={isHost ? (userProfile?.avatarId || 0) : 0} />
                            </div>
                            <div className="flex-1">
                                <div className="font-bold text-lg">{isHost ? userProfile?.name : currentRoom?.hostName}</div>
                                <div className="text-xs text-emerald-400 font-mono flex items-center gap-2">
                                    <span className="bg-emerald-500/20 px-2 py-0.5 rounded">🎖️ HOST</span>
                                    {isHost && <span>(나)</span>}
                                </div>
                            </div>
                        </div>


                        {/* Connected Peers (Guests) - 호스트 뷰 */}
                        {isHost && connectedPeers.map((peerId, idx) => {
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

                        {/* 게스트 자신 표시 - 게스트 뷰 */}
                        {!isHost && userProfile && (
                            <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-cyan-500/30">
                                <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center bg-slate-800 overflow-hidden" style={{ borderColor: userProfile.color }}>
                                    <PlayerAvatar playerId={2} color={userProfile.color} isActive={false} avatarId={userProfile.avatarId} />
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-lg">{userProfile.name}</div>
                                    <div className="text-xs text-cyan-400 font-mono flex items-center gap-2">
                                        <span className="bg-cyan-500/20 px-2 py-0.5 rounded">GUEST</span>
                                        <span>(나)</span>
                                    </div>
                                </div>
                            </div>
                        )}
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
                            게임 시작 ({fillAI ? currentRoom?.maxPlayers : Math.max(2, 1 + connectedPeers.length)}인)
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
    );
}
