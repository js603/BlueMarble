import { useState, useEffect, useRef, type FC } from 'react';
import { ChatMessage } from '../types';
import { PlayerAvatar } from './PlayerAvatar';
import { PLAYER_COLORS } from '../constants';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentPlayerName: string;
  currentPlayerId: number;
}

export const Chat: FC<ChatProps> = ({ messages, onSendMessage, currentPlayerName, currentPlayerId }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/50 backdrop-blur-sm relative">
      {/* Shadow overlay for depth */}
      <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-slate-900/50 to-transparent z-10 pointer-events-none"></div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-2 opacity-50">
            <span className="text-2xl">🪐</span>
            <p>우주 통신망 연결됨</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = typeof msg.senderId === 'number' && msg.senderId === currentPlayerId;
          const isSystem = msg.senderId === 'SYSTEM';
          const isAI = msg.senderId === 'AI';

          // System Message
          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-3">
                <div className="bg-slate-800/80 border border-slate-700/50 text-slate-300 text-[10px] px-3 py-1 rounded-full shadow-sm backdrop-blur-md">
                  {msg.text}
                </div>
              </div>
            );
          }

          // User / AI Message
          return (
            <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
              {!isMe && (
                <div className="flex flex-col items-center mr-2 mt-1">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-slate-700 shadow-md flex items-center justify-center p-1">
                    {isAI ? (
                      <span className="text-xl">🤖</span>
                    ) : (
                      <PlayerAvatar
                        playerId={typeof msg.senderId === 'number' ? msg.senderId : 99}
                        color={typeof msg.senderId === 'number' ? PLAYER_COLORS[(msg.senderId - 1) % 5] : '#ccc'}
                        avatarId={msg.avatarId}
                        isActive={false}
                      />
                    )}
                  </div>
                </div>
              )}

              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                {!isMe && <span className="text-[10px] text-slate-400 mb-1 ml-1 font-bold">{msg.senderName}</span>}

                <div className="flex items-end gap-1.5">
                  {isMe && <span className="text-[9px] text-slate-500 mb-1 font-mono">{formatTime(msg.timestamp)}</span>}

                  <div
                    className={`px-3.5 py-2.5 text-sm shadow-lg backdrop-blur-sm border relative leading-relaxed
                       ${isMe
                        ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-2xl rounded-tr-none border-emerald-500/30'
                        : isAI
                          ? 'bg-purple-900/60 text-purple-100 rounded-2xl rounded-tl-none border-purple-500/30'
                          : 'bg-slate-800 text-slate-200 rounded-2xl rounded-tl-none border-slate-700'
                      }
                     `}
                  >
                    {msg.text}
                  </div>

                  {!isMe && <span className="text-[9px] text-slate-500 mb-1 font-mono">{formatTime(msg.timestamp)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-slate-900 border-t border-slate-800">
        <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="메시지 전송..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-full pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all shadow-inner"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full flex items-center justify-center transition-all shadow-md transform active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-0.5">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};
