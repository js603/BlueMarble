import { type FC } from 'react';

interface PlayerAvatarProps {
  playerId: number;
  color: string;
  isActive: boolean;
  avatarId?: number; // Optional, defaults to mapping via playerId-1 if not provided
}

export const PlayerAvatar: FC<PlayerAvatarProps> = ({ playerId, color, isActive, avatarId }) => {
  // If avatarId is passed, use it. Otherwise, fallback to (playerId - 1) % 5
  // Note: playerId starts at 1, so we subtract 1 for 0-based index.
  const typeIndex = avatarId !== undefined ? avatarId : (playerId - 1) % 5;

  const getIcon = () => {
    switch (typeIndex) {
      case 0: // Rocket
        return (
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" style={{ color: color }}>
            <path d="M12 2.5C12 2.5 15.5 8 16.5 13C17.3 17 16 21 16 21L12 19L8 21C8 21 6.7 17 7.5 13C8.5 8 12 2.5 12 2.5Z" fill="currentColor" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M12 14C12 14 13 15 13 16C13 17 12 18 12 18C12 18 11 17 11 16C11 15 12 14 12 14Z" fill="white" />
            <path d="M7.5 15L4 19M16.5 15L20 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );
      case 1: // Horse (Unicorn)
        return (
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" style={{ color: color }}>
            <path d="M19 16C19 16 20.5 5 15 3C9.5 1 5 6 5 6L6 9H4L3 12C3 12 6 12 6 14C6 16 3 17 3 21H16L19 16Z" fill="currentColor" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M14 6C14 6 14.5 7 13.5 7C12.5 7 12 6 12 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 2: // Car
        return (
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" style={{ color: color }}>
            <path d="M3 12L5 8H19L21 12V18H3V12Z" fill="currentColor" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="7" cy="18" r="3" fill="black" stroke="white" strokeWidth="1" />
            <circle cx="17" cy="18" r="3" fill="black" stroke="white" strokeWidth="1" />
            <path d="M6 12H18" stroke="white" strokeWidth="1" strokeOpacity="0.5" />
          </svg>
        );
      case 3: // UFO
        return (
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" style={{ color: color }}>
            <ellipse cx="12" cy="14" rx="10" ry="4" fill="currentColor" stroke="white" strokeWidth="1.5" />
            <path d="M7 11C7 8 9 5 12 5C15 5 17 8 17 11" fill="white" fillOpacity="0.5" stroke="white" strokeWidth="1.5" />
            <line x1="12" y1="5" x2="12" y2="2" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="2" r="1.5" fill="red" />
          </svg>
        );
      case 4: // Robot
        return (
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" style={{ color: color }}>
            <rect x="5" y="4" width="14" height="10" rx="2" fill="currentColor" stroke="white" strokeWidth="1.5" />
            <rect x="8" y="14" width="8" height="6" fill="currentColor" stroke="white" strokeWidth="1.5" />
            <circle cx="9" cy="9" r="2" fill="white" />
            <circle cx="15" cy="9" r="2" fill="white" />
            <path d="M3 8H5M19 8H21" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="4" x2="12" y2="2" stroke="white" strokeWidth="2" />
            <circle cx="12" cy="1" r="1" fill="lime" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`relative flex items-center justify-center transition-all duration-300 w-6 h-6 sm:w-8 sm:h-8 filter drop-shadow-md ${isActive ? 'z-20 scale-125 -translate-y-2 drop-shadow-xl' : 'z-10 scale-100'}`}
    >
      {/* Glow Effect for Active Player */}
      {isActive && (
        <div className="absolute inset-0 bg-white/30 rounded-full blur-md animate-pulse"></div>
      )}

      {getIcon()}

      {/* Base/Pedestal */}
      <div
        className="absolute -bottom-1 w-4 h-1.5 rounded-full bg-black/40 blur-[1px]"
      ></div>
    </div>
  );
};