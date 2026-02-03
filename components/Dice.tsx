import React, { useEffect, useState } from 'react';

interface DiceProps {
  value: [number, number];
  rolling: boolean;
}

export const Dice: React.FC<DiceProps> = ({ value, rolling }) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (rolling) {
      const interval = setInterval(() => {
        setDisplayValue([
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1
        ]);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setDisplayValue(value);
    }
  }, [rolling, value]);

  const DiceCube = ({ val }: { val: number }) => (
    <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg shadow-[0_0_10px_rgba(255,255,255,0.5)] flex items-center justify-center text-2xl font-bold text-nebula-bg transition-transform duration-100 ${rolling ? 'animate-bounce-short' : ''}`}>
      {val}
    </div>
  );

  return (
    <div className="flex gap-4 p-4 bg-nebula-card/50 rounded-xl border border-white/10 backdrop-blur-sm">
      <DiceCube val={displayValue[0]} />
      <DiceCube val={displayValue[1]} />
    </div>
  );
};