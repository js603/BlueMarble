import React, { useState, useEffect, useRef } from 'react';
import { RoomInfo, UserProfile } from '../types';
import { joinLobby, leaveLobby, advertiseRoom } from '../services/p2pService';
import './Lobby.css'; // Assuming we will create a CSS file for Lobby

interface LobbyProps {
    userProfile: UserProfile;
    onJoinRoom: (roomId: string, mode: 'HOST' | 'GUEST') => void;
}

export const Lobby: React.FC<LobbyProps> = ({ userProfile, onJoinRoom }) => {
    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Create Room Form State
    const [newRoomName, setNewRoomName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [password, setPassword] = useState('');
    const [maxPlayers, setMaxPlayers] = useState(4);

    // Password Prompt State
    const [passwordPromptRoom, setPasswordPromptRoom] = useState<RoomInfo | null>(null);
    const [inputPassword, setInputPassword] = useState('');

    // To track advertisement interval if we are a host (not used in Lobby component actually, logic is in App or separate)
    // But wait, the HOST needs to advertise. The Lobby component is for FINDING rooms.
    // Once a room is created, this client becomes a HOST and enters the Game Room view.
    // The App component should handle the advertising loop if the gameStatus is 'LOBBY' (waiting for players).

    // Clean up rooms that haven't updated in a while (offline hosts)
    useEffect(() => {
        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            setRooms(prev => prev.filter(r => now - r.lastUpdated < 5000)); // Remove exceeding 5s silence
        }, 2000);

        return () => clearInterval(cleanupInterval);
    }, []);

    // Connect to P2P Lobby
    useEffect(() => {
        joinLobby((info: RoomInfo) => {
            setRooms(prev => {
                const existingIdx = prev.findIndex(r => r.id === info.id);
                if (existingIdx !== -1) {
                    // Update existing
                    const newRooms = [...prev];
                    newRooms[existingIdx] = { ...info, lastUpdated: Date.now() };
                    return newRooms;
                } else {
                    // Add new
                    return [...prev, { ...info, lastUpdated: Date.now() }];
                }
            });
        });

        return () => {
            leaveLobby();
        };
    }, []);

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
            lastUpdated: Date.now()
        };

        // We don't advertise HERE. We pass the room info up to App.tsx
        // App.tsx will switch state to 'LOBBY' (Host Mode) and start the advertise loop.
        // So we need to pass this info.

        // Check LobbyProps again... onJoinRoom takes roomId and mode.
        // We might need to pass the full RoomInfo or store it in App state.
        // Let's assume App will generate RoomInfo based on parameters or we refactor onJoinRoom.
        // For now, let's just pass roomId and handle the "Advertising" setup in App's handleCreateRoom logic?
        // Actually, Lobby should ideally just trigger "I want to create this room".

        // Let's modify the callback slightly in implementation or just pass parameters via a separate callback?
        // No, let's stick to simplicity. We will save the "pending created room info" in App or localStorage?
        // Better: onJoinRoom could take optional RoomInfo config for HOSts.
        // TypeScript limitation in Props... let's hack it or extend props.
        // Let's assume onJoinRoom handles the setup. OR we pass the config.

        // Wait, onJoinRoom signature is (roomId, mode). 
        // We will attach the room config to a global or pass it differently.
        // Let's emit a specific event for creation.

        // Using a Custom Event or just extending the prop is better.
        // Let's reuse onJoinRoom but maybe we need onCreateRoom prop?

        // FOR NOW: We will use a temporary storage or just pass it as second arg if we change type.
        // Let's use localStorage to pass the "Host Config" to App context? Dirty.
        // Let's assume App passes a specific `onCreateRoom` callback. 
        // Since I can't change App.tsx signature in this file write, I will assume I can edit App.tsx later.
        // I will add `onCreateRoom` to props.

        // Re-declare interface above? No I can just use `any` for now or better, update the prop signature.
        // Updating Main Code.

        // Actually let's just output the file assuming `onCreateRoom` exists.
        // I need to update App.tsx anyway.

        // For now, onCreateRoom(roomInfo)

        (onJoinRoom as any)(roomId, 'HOST', initialRoomInfo); // Passing extra arg
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
            onJoinRoom(room.id, 'GUEST');
        }
    };

    const handlePasswordSubmit = () => {
        if (!passwordPromptRoom) return;
        // Client-side password check? 
        // Wait, the host broadcasts "isPrivate: true" but NOT the password hopefully?
        // In p2pService, we broadcast the RoomInfo.
        // If we include password in RoomInfo, everyone sees it. -> INSECURE.
        // We must NOT broadcast the password field in payload if possible, OR
        // we use a challenge-response (too complex for now).
        // OR we rely on the Join Request containing the password and Host checking it.

        // Strategy:
        // 1. User enters password.
        // 2. We call onJoinRoom(roomId, 'GUEST', password).
        // 3. P2P Join Request includes the password.
        // 4. Host verifies. If wrong, Host kicks or sends "Auth Failed".

        onJoinRoom(passwordPromptRoom.id, 'GUEST', inputPassword as any);
        setPasswordPromptRoom(null);
    };

    return (
        <div className="lobby-container">
            <div className="lobby-header">
                <h2>대기실</h2>
                <div className="user-info">
                    <span className="user-badge" style={{ backgroundColor: userProfile.color }}>
                        {userProfile.name}
                    </span>
                    <button className="create-btn" onClick={() => setIsCreateModalOpen(true)}>방 만들기</button>
                </div>
            </div>

            <div className="room-list">
                {rooms.length === 0 ? (
                    <div className="no-rooms">
                        <p>현재 개설된 방이 없습니다.</p>
                        <p>새로운 방을 만들어보세요!</p>
                    </div>
                ) : (
                    rooms.map(room => (
                        <div key={room.id} className={`room-card ${room.status === 'PLAYING' ? 'playing' : ''}`} onClick={() => handleJoinClick(room)}>
                            <div className="room-info-top">
                                <span className="room-title">{room.name}</span>
                                {room.isPrivate && <span className="lock-icon">🔒</span>}
                            </div>
                            <div className="room-info-bottom">
                                <span className="host-name">Host: {room.hostName}</span>
                                <span className="player-count">{room.currentPlayers} / {room.maxPlayers}</span>
                                <span className={`status-badge ${room.status}`}>{room.status === 'WAITING' ? '대기중' : '게임중'}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Room Modal */}
            {isCreateModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>방 만들기</h3>
                        <div className="form-group">
                            <label>방 제목</label>
                            <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="즐거운 부루마불 한 판!" />
                        </div>
                        <div className="form-group">
                            <label>최대 인원</label>
                            <select value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}>
                                <option value={2}>2명</option>
                                <option value={3}>3명</option>
                                <option value={4}>4명</option>
                            </select>
                        </div>
                        <div className="form-group checkbox">
                            <label>
                                <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
                                비공개 방 (비밀번호 설정)
                            </label>
                        </div>
                        {isPrivate && (
                            <div className="form-group">
                                <label>비밀번호</label>
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
                            </div>
                        )}
                        <div className="modal-actions">
                            <button onClick={() => setIsCreateModalOpen(false)}>취소</button>
                            <button className="primary" onClick={handleCreateRoom}>확인</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Password Prompt Modal */}
            {passwordPromptRoom && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>비공개 방 입장</h3>
                        <p>{passwordPromptRoom.name}</p>
                        <div className="form-group">
                            <input type="password" placeholder="비밀번호 입력" value={inputPassword} onChange={e => setInputPassword(e.target.value)} />
                        </div>
                        <div className="modal-actions">
                            <button onClick={() => setPasswordPromptRoom(null)}>취소</button>
                            <button className="primary" onClick={handlePasswordSubmit}>입장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
