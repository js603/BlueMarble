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

  const faceTransforms = [
    'rotateY(0deg) translateZ(18px)',
    'rotateY(90deg) translateZ(18px)',
    'rotateY(180deg) translateZ(18px)',
    'rotateY(-90deg) translateZ(18px)',
    'rotateX(90deg) translateZ(18px)',
    'rotateX(-90deg) translateZ(18px)'
  ];

  const valueRotation: Record<number, string> = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(0deg) rotateY(-90deg)',
    3: 'rotateX(0deg) rotateY(90deg)',
    4: 'rotateX(0deg) rotateY(180deg)',
    5: 'rotateX(-90deg) rotateY(0deg)',
    6: 'rotateX(90deg) rotateY(0deg)'
  };

  const DiceCube = ({ val, isRolling }: { val: number; isRolling: boolean }) => (
    <div className="dice-scene">
      <div
        className={`dice-cube ${isRolling ? 'dice-rolling' : ''}`}
        style={{ transform: isRolling ? undefined : valueRotation[val] }}
      >
        {[1, 2, 3, 4, 5, 6].map((face, idx) => (
          <div
            key={face}
            className="dice-face"
            style={{ transform: faceTransforms[idx] }}
          >
            {face}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 bg-nebula-card/50 rounded-xl border border-white/10 backdrop-blur-sm">
      <DiceCube val={displayValue[0]} isRolling={rolling} />
      <DiceCube val={displayValue[1]} isRolling={rolling} />
    </div>
  );
};
