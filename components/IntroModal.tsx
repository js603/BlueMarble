import { useState, type FC, type FormEvent } from 'react';
import { PLAYER_COLORS, AVATAR_LABELS } from '../constants';
import { PlayerAvatar } from './PlayerAvatar';
import { UserProfile } from '../types';

interface IntroModalProps {
  onComplete: (profile: UserProfile) => void;
}

export const IntroModal: FC<IntroModalProps> = ({ onComplete }) => {
  const [name, setName] = useState('');
  const [selectedAvatarIdx, setSelectedAvatarIdx] = useState(0);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onComplete({
      name: name.trim(),
      avatarId: selectedAvatarIdx,
      color: PLAYER_COLORS[selectedAvatarIdx],
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 animate-fade-in">
      <div className="w-full max-w-md bg-slate-800 border-2 border-emerald-500 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 p-6 text-center border-b border-emerald-500/30">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 mb-2">
            NEBULA MARBLE
          </h1>
          <p className="text-gray-400 text-sm">프로필을 설정하고 우주 여행을 떠나세요!</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-300 ml-1">닉네임</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={8}
              placeholder="최대 8글자"
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all text-center text-lg font-bold"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-300 ml-1 block text-center">캐릭터 선택</label>
            <div className="grid grid-cols-5 gap-2">
              {PLAYER_COLORS.map((color, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedAvatarIdx(idx)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center p-2 transition-all border-2 relative ${selectedAvatarIdx === idx
                    ? 'bg-emerald-900/50 border-emerald-400 scale-105 shadow-[0_0_15px_rgba(52,211,153,0.5)]'
                    : 'bg-slate-900 border-slate-700 hover:border-slate-500 opacity-60 hover:opacity-100'
                    }`}
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10">
                    <PlayerAvatar playerId={idx + 1} color={color} isActive={false} avatarId={idx} />
                  </div>
                  <span className="text-[9px] mt-1 text-gray-400">{AVATAR_LABELS[idx]}</span>

                  {selectedAvatarIdx === idx && (
                    <div className="absolute -top-2 -right-2 bg-emerald-500 text-black rounded-full p-0.5 shadow-sm">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-gray-500 text-white font-bold rounded-xl shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98] text-lg"
          >
            설정 완료 및 시작
          </button>
        </form>
      </div>
    </div>
  );
};