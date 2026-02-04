import React, { useState, useEffect, useRef } from 'react';
import { RoomInfo, UserProfile, ChatMessage } from '../types';
import { Chat } from './Chat';

interface LobbyProps {
    userProfile: UserProfile;
    onJoinRoom: (roomId: string, mode: 'HOST' | 'GUEST', initialInfo?: RoomInfo, password?: string) => void;
    rooms: RoomInfo[]; // App에서 전달받은 방 목록
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ userProfile, onJoinRoom, rooms: receivedRooms, messages, onSendMessage }) => {
    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Sync received rooms from App
    useEffect(() => {
        setRooms(receivedRooms);
    }, [receivedRooms]);

    // Create Room Form State
    const [newRoomName, setNewRoomName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [password, setPassword] = useState('');
    const [maxPlayers, setMaxPlayers] = useState(4);

    // Password Prompt State
    const [passwordPromptRoom, setPasswordPromptRoom] = useState<RoomInfo | null>(null);
    const [inputPassword, setInputPassword] = useState('');

    const handleCreateRoom = () => {
        if (!newRoomName.trim()) {
            alert('방 제목을 입력해주세요.');
            return;
        }

        const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const initialRoomInfo: RoomInfo = {
            id: roomId,
            name: newRoomName,
            hostName: userProfile.name,
            currentPlayers: 1,
            maxPlayers: maxPlayers,
            isPrivate: isPrivate,
            password: isPrivate ? password : undefined,
            status: 'WAITING',
            lastUpdated: Date.now(),
            aiCount: 0 // Default
        };

        onJoinRoom(roomId, 'HOST', initialRoomInfo);
    };

    const handleJoinClick = (room: RoomInfo) => {
        if (room.status === 'PLAYING') {
            alert('이미 게임이 진행 중입니다.');
            return;
        }
        if (room.currentPlayers >= room.maxPlayers) {
            alert('방이 꽉 찼습니다.');
            return;
        }

        if (room.isPrivate) {
            setPasswordPromptRoom(room);
            setInputPassword('');
        } else {
            // 게스트에게 방 정보를 전달하여 대기실 화면이 정상 표시되도록 함
            onJoinRoom(room.id, 'GUEST', room);
        }
    };

    const handlePasswordSubmit = () => {
        if (!passwordPromptRoom) return;
        onJoinRoom(passwordPromptRoom.id, 'GUEST', passwordPromptRoom, inputPassword);
        setPasswordPromptRoom(null);
    };

    return (
        <div className="relative h-screen w-full flex flex-col bg-slate-900 overflow-hidden text-white font-sans">
            {/* Header */}
            <div className="flex justify-between items-center p-6 bg-slate-900/80 z-10 border-b border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 tracking-tight">
                        Blue Marble Lobby
                    </h2>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 bg-slate-800 rounded-full pl-2 pr-4 py-1.5 border border-white/10 shadow-lg">
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-inner"
                            style={{ backgroundColor: userProfile.color }}
                        >
                            {/* Simple Avatar Representation */}
                            <span className="text-xs">P{userProfile.avatarId + 1}</span>
                        </div>
                        <span className="font-bold text-sm text-slate-200">{userProfile.name}</span>
                    </div>

                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-sm flex items-center gap-2"
                    >
                        <span>✨</span> 방 만들기
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-h-0 relative z-0">
                {/* Room List (Top Half - Horizontal Scroll) */}
                <div className="flex-1 min-h-0 flex flex-col relative">
                    <div className="px-6 py-4 flex justify-between items-end">
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                            Live Rooms ({rooms.length})
                        </h3>
                    </div>

                    {/* Horizontal Scroll Container */}
                    <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-8 flex items-center gap-6 snap-x scroll-pl-6 scrollbar-thin scrollbar-track-slate-800/20 scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500 transition-colors">
                        {rooms.length === 0 ? (
                            <div className="w-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-700/50 rounded-3xl bg-slate-800/20 text-slate-500 animate-pulse">
                                <span className="text-4xl mb-4">🛸</span>
                                <p className="text-lg font-medium">현재 개설된 방이 없습니다.</p>
                                <p className="text-sm">친구들을 위해 새로운 방을 만들어보세요!</p>
                            </div>
                        ) : (
                            rooms.map(room => (
                                <div
                                    key={room.id}
                                    onClick={() => handleJoinClick(room)}
                                    className={`
                                        flex-shrink-0 w-80 h-52 snap-start
                                        relative group cursor-pointer 
                                        bg-slate-800 rounded-3xl border border-white/5 
                                        hover:border-cyan-500/50 hover:bg-slate-800/90 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-cyan-500/20
                                        overflow-hidden
                                        ${room.status === 'PLAYING' ? 'opacity-60 grayscale-[0.8] cursor-not-allowed hover:translate-y-0' : ''}
                                    `}
                                >
                                    {/* Card Background Gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/40 pointer-events-none" />
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                    <div className="p-6 flex flex-col h-full justify-between relative z-10">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-start">
                                                <span className={`
                                                    px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-sm
                                                    ${room.status === 'WAITING'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}
                                                `}>
                                                    {room.status === 'WAITING' ? 'WAITING' : 'PLAYING'}
                                                </span>
                                                {room.isPrivate && <span className="text-lg drop-shadow-lg">🔒</span>}
                                            </div>
                                            <h4 className="font-bold text-white text-xl leading-snug line-clamp-2 group-hover:text-cyan-300 transition-colors">
                                                {room.name}
                                            </h4>
                                        </div>

                                        <div>
                                            <p className="text-slate-400 text-xs mb-3 flex items-center gap-1">
                                                <span className="w-1 h-1 rounded-full bg-slate-500"></span>
                                                Host: <span className="text-slate-300 font-semibold">{room.hostName}</span>
                                            </p>

                                            <div className="flex justify-between items-end border-t border-white/5 pt-3">
                                                <div className="flex -space-x-2">
                                                    {[...Array(Math.min(4, room.currentPlayers))].map((_, i) => (
                                                        <div key={i} className="w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-800 shadow-sm" />
                                                    ))}
                                                    {room.currentPlayers > 4 && (
                                                        <div className="w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-800 flex items-center justify-center text-[10px] text-slate-300 font-bold">
                                                            +{room.currentPlayers - 4}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-2xl font-bold font-mono text-cyan-400">{room.currentPlayers}</span>
                                                    <span className="text-slate-500 text-sm font-mono font-medium">/{room.maxPlayers}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Area (Bottom Section) */}
                <div className="h-[350px] bg-slate-900 border-t border-white/10 flex flex-col relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                    <div className="px-6 py-3 bg-slate-800/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Global Lobby Chat</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                            모든 대기실 유저와 대화할 수 있습니다.
                        </div>
                    </div>
                    <div className="flex-1 relative bg-slate-900/50">
                        {/* We reuse the Chat component but ensure it fits the container */}
                        <div className="absolute inset-0">
                            <Chat
                                messages={messages}
                                onSendMessage={onSendMessage}
                                currentUserId={99999} // Lobby treats everyone as 'external' except self, handled by Chat internals
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Create Room Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden transform transition-all scale-100 animate-slideUp">
                        <div className="p-8">
                            <h3 className="text-2xl font-bold text-white mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                                새로운 방 만들기
                            </h3>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-400 block ml-1">방 제목</label>
                                    <input
                                        type="text"
                                        value={newRoomName}
                                        onChange={e => setNewRoomName(e.target.value)}
                                        placeholder="즐거운 부루마불 한 판!"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-medium"
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-400 block ml-1">최대 인원</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[2, 3, 4, 5].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => setMaxPlayers(num)}
                                                className={`py-3 rounded-xl font-bold transition-all border ${maxPlayers === num
                                                    ? 'bg-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-500/25 scale-105'
                                                    : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600 hover:border-slate-500'
                                                    }`}
                                            >
                                                {num}명
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <label className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-700/50 cursor-pointer transition-colors border border-transparent hover:border-slate-600 group">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={isPrivate}
                                                onChange={e => setIsPrivate(e.target.checked)}
                                                className="peer w-5 h-5 rounded border-slate-600 text-cyan-500 focus:ring-offset-0 focus:ring-cyan-500 bg-slate-900"
                                            />
                                        </div>
                                        <span className="text-slate-300 font-medium group-hover:text-white transition-colors">비공개 방으로 만들기</span>
                                    </label>

                                    {isPrivate && (
                                        <div className="mt-3 pl-2 animate-fadeIn">
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                placeholder="비밀번호 설정"
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-900/50 flex gap-3 border-t border-white/5 backdrop-blur-sm">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="flex-1 py-3.5 text-slate-400 font-bold hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                            >
                                취소
                            </button>
                            <button
                                className="flex-[2] py-3.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/20 active:scale-95 hover:shadow-cyan-500/40 transition-all"
                                onClick={handleCreateRoom}
                            >
                                방 만들기 완료
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Password Modal */}
            {passwordPromptRoom && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-slate-800 w-full max-w-sm rounded-2xl shadow-2xl border border-white/10 p-8 transform scale-100">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                                🔒
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">비공개 방 입장</h3>
                            <p className="text-slate-400 text-sm font-medium px-4 py-1 bg-slate-700/50 rounded-full inline-block">
                                {passwordPromptRoom.name}
                            </p>
                        </div>

                        <input
                            type="password"
                            placeholder="비밀번호를 입력하세요"
                            value={inputPassword}
                            onChange={e => setInputPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 mb-6 text-center tracking-widest"
                            autoFocus
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => setPasswordPromptRoom(null)}
                                className="flex-1 py-3 rounded-xl bg-slate-700 text-slate-300 font-bold hover:bg-slate-600 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-bold hover:bg-cyan-400 shadow-lg shadow-cyan-500/20 transition-colors"
                                onClick={handlePasswordSubmit}
                            >
                                입장하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
