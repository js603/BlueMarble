import React, { useState } from 'react';

interface PlanModalProps {
  onConfirm: (mode: 'PVE' | 'PVP' | 'PVP_HOST' | 'PVP_JOIN', roomId?: string, playerCount?: number) => void;
}

export const PlanModal: React.FC<PlanModalProps> = ({ onConfirm }) => {
  const [activeTab, setActiveTab] = useState<'LOCAL' | 'ONLINE'>('LOCAL');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [generatedRoomId] = useState(() => Math.random().toString(36).substring(2, 8).toUpperCase());
  const [localPlayerCount, setLocalPlayerCount] = useState(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-emerald-500/50 rounded-2xl shadow-[0_0_50px_rgba(16,185,129,0.1)] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 mb-1">
              NEBULA MARBLE
            </h2>
            <p className="text-xs text-slate-400 font-mono tracking-wide">System v2.5 • WebTorrent P2P</p>
          </div>
          <div className="flex bg-slate-950 p-1.5 rounded-xl border border-white/5">
            <button 
              onClick={() => setActiveTab('LOCAL')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'LOCAL' ? 'bg-slate-800 text-white shadow-sm ring-1 ring-white/10' : 'text-slate-500 hover:text-slate-300'}`}
            >
              로컬 / AI
            </button>
            <button 
              onClick={() => setActiveTab('ONLINE')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'ONLINE' ? 'bg-purple-900/50 text-purple-200 shadow-sm ring-1 ring-purple-500/30' : 'text-slate-500 hover:text-slate-300'}`}
            >
              멀티플레이
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 text-sm leading-relaxed flex-1 scrollbar-thin scrollbar-thumb-slate-700">
          {activeTab === 'LOCAL' ? (
            <div className="space-y-8 animate-fade-in">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                    게임 설정
                  </h3>
                  <span className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded">오프라인 모드</span>
                </div>
                
                <div className="bg-slate-950/50 p-5 rounded-2xl border border-slate-800 space-y-3">
                   <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">플레이어 인원</label>
                   <div className="grid grid-cols-4 gap-3">
                     {[2, 3, 4, 5].map(num => (
                       <button
                         key={num}
                         onClick={() => setLocalPlayerCount(num)}
                         className={`py-3 rounded-xl font-bold transition-all border-2 flex flex-col items-center justify-center gap-1 ${
                           localPlayerCount === num 
                           ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                           : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600 hover:bg-slate-800'
                         }`}
                       >
                         <span className="text-lg">{num}</span>
                         <span className="text-[10px] opacity-70">PLAYERS</span>
                       </button>
                     ))}
                   </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => onConfirm('PVE', undefined, localPlayerCount)}
                  className="group relative px-6 py-8 bg-gradient-to-br from-slate-800 to-slate-900 border border-emerald-500/30 hover:border-emerald-500 text-white font-bold rounded-2xl shadow-lg transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors"></div>
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-900/50 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">🤖</div>
                    <div className="text-center">
                      <div className="text-lg mb-1">AI 대전</div>
                      <div className="text-xs text-emerald-400/70">혼자서 연습하기</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => onConfirm('PVP', undefined, localPlayerCount)}
                  className="group relative px-6 py-8 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 hover:border-slate-500 text-white font-bold rounded-2xl shadow-lg transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/5 group-hover:bg-white/10 transition-colors"></div>
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">👥</div>
                    <div className="text-center">
                      <div className="text-lg mb-1">로컬 대전</div>
                      <div className="text-xs text-slate-500">하나의 기기로 같이하기</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
             <div className="space-y-6 animate-fade-in">
               <div className="bg-purple-900/20 border border-purple-500/30 p-5 rounded-2xl">
                 <h3 className="text-purple-300 font-bold mb-2 flex items-center gap-2">
                   <span className="text-xl">🌐</span> WebTorrent P2P
                 </h3>
                 <p className="text-xs text-purple-200/60 leading-relaxed">
                   서버 없이 브라우저간 직접 연결로 통신합니다.<br/>
                   최대 5인까지 참여 가능하며, 같은 네트워크가 아니어도 됩니다.
                 </p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Create Room */}
                 <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 flex flex-col gap-4 group hover:border-emerald-500/30 transition-colors">
                   <h4 className="font-bold text-slate-200">방 만들기 (Host)</h4>
                   <div className="flex-1 flex flex-col justify-center items-center text-center gap-3 py-4">
                     <p className="text-slate-500 text-xs uppercase tracking-wider">Room Code</p>
                     <div className="text-4xl font-mono font-black text-emerald-400 tracking-widest bg-black/30 px-6 py-3 rounded-xl border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                       {generatedRoomId}
                     </div>
                   </div>
                   <button 
                     onClick={() => onConfirm('PVP_HOST', generatedRoomId)}
                     className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20"
                   >
                     방 생성하기
                   </button>
                 </div>

                 {/* Join Room */}
                 <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 flex flex-col gap-4 group hover:border-purple-500/30 transition-colors">
                   <h4 className="font-bold text-slate-200">입장하기 (Guest)</h4>
                   <div className="flex-1 flex flex-col justify-center gap-3 py-4">
                     <label className="text-xs text-slate-500 uppercase tracking-wider text-center">Enter Code</label>
                     <input 
                       type="text" 
                       value={joinRoomId}
                       onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                       placeholder="CODE"
                       className="w-full bg-black/30 border border-slate-700 rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all placeholder-slate-700"
                       maxLength={6}
                     />
                   </div>
                   <button 
                     onClick={() => joinRoomId && onConfirm('PVP_JOIN', joinRoomId)}
                     disabled={!joinRoomId}
                     className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-purple-500/20"
                   >
                     입장하기
                   </button>
                 </div>
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};