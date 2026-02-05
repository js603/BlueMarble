import { type FC } from 'react';

interface BuildingIconProps {
  level: number; // 0: Land(Flag), 1: Villa, 2: Building, 3: Hotel, 4: Landmark
  color: string;
}

export const BuildingIcon: FC<BuildingIconProps> = ({ level, color }) => {
  const styleClass = "drop-shadow-md transition-all duration-300";

  // Level 4: Landmark (Crown/Star Tower)
  if (level === 4) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={`w-5 h-5 sm:w-6 sm:h-6 ${styleClass} animate-pulse`}>
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#fbbf24" stroke="white" strokeWidth="1.5" />
        <path d="M12 12C12 12 13 13 13 14" stroke="white" strokeWidth="1" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1" fill="white" />
      </svg>
    );
  }

  // Level 3: Hotel (Large Complex)
  if (level === 3) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={`w-4 h-4 sm:w-5 sm:h-5 ${styleClass}`}>
        <path d="M4 22H20" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <rect x="5" y="8" width="14" height="14" rx="2" fill={color} stroke="white" strokeWidth="1.5" />
        {/* Windows */}
        <rect x="7" y="11" width="3" height="3" fill="white" fillOpacity="0.8" />
        <rect x="14" y="11" width="3" height="3" fill="white" fillOpacity="0.8" />
        <rect x="7" y="16" width="3" height="3" fill="white" fillOpacity="0.8" />
        <rect x="14" y="16" width="3" height="3" fill="white" fillOpacity="0.8" />
        {/* Roof */}
        <path d="M3 8L12 3L21 8" stroke="white" strokeWidth="1.5" fill={color} />
      </svg>
    );
  }

  // Level 2: Building (Office)
  if (level === 2) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${styleClass}`}>
        <rect x="8" y="6" width="8" height="16" rx="1" fill={color} stroke="white" strokeWidth="1.5" />
        <line x1="8" y1="10" x2="16" y2="10" stroke="white" strokeWidth="1" strokeOpacity="0.6" />
        <line x1="8" y1="14" x2="16" y2="14" stroke="white" strokeWidth="1" strokeOpacity="0.6" />
        <line x1="8" y1="18" x2="16" y2="18" stroke="white" strokeWidth="1" strokeOpacity="0.6" />
        <rect x="10" y="2" width="4" height="4" fill={color} stroke="white" strokeWidth="1.5" />
      </svg>
    );
  }

  // Level 1: Villa (House)
  if (level === 1) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${styleClass}`}>
        <path d="M3 12L12 4L21 12V20C21 21.1 20.1 22 19 22H5C3.9 22 3 21.1 3 20V12Z" fill={color} stroke="white" strokeWidth="1.5" />
        <rect x="9" y="15" width="6" height="7" fill="white" fillOpacity="0.5" />
        <circle cx="12" cy="9" r="2" fill="white" fillOpacity="0.8" />
      </svg>
    );
  }

  // Level 0: Land (Flag) - Improved visibility
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`w-3 h-3 sm:w-4 sm:h-4 ${styleClass} -rotate-6`}>
      <path d="M5 21V5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 5H18L15 10L18 15H5" fill={color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};