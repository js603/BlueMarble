import { useEffect, useMemo, useRef, Suspense, Component, type ErrorInfo, type ReactNode, type FC, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, useBox, usePlane } from '@react-three/cannon';
import { useGLTF, Environment, ContactShadows, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

interface DiceProps {
  value: [number, number];
  rolling: boolean;
  onRollComplete?: (d1: number, d2: number) => void;
  rollId?: number;
  gauge?: number;
}

// Global constant for dice size
// Global constant for dice size
const DIE_SIZE = 0.45;
const ROLL_AREA_HALF = 4.5;
const WALL_THICKNESS = 1.2;
const WALL_INSET = 0.4;
const WALL_HEIGHT = 8.0;
const WALL_FRICTION = 0.2;
const WALL_RESTITUTION = 0.7;
const ROLL_START_Y = 1.2;

// Dice positions constants to prevent re-renders in Die component
const DICE_START_POSITIONS: [number, number, number][] = [
  [-0.8, 5, 0],
  [0.8, 5, 0]
];

// Error Boundary for R3F components
class DiceErrorBoundary extends Component<{ children: ReactNode, fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode, fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Dice model failed to load, falling back to procedural box:", error.message);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const getDiceModelUrl = () => {
  if (typeof document === 'undefined') return '/dice/scene.gltf';
  return new URL('dice/scene.gltf', document.baseURI).toString();
};

const DieModel = () => {
  const { scene } = useGLTF(getDiceModelUrl()) as any;

  const model = useMemo(() => {
    if (!scene) return null;
    const clone = scene.clone();

    // Calculate bounding box and scale to fit DIE_SIZE
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxSide = Math.max(size.x, size.y, size.z);

    if (maxSide > 0) {
      const scale = DIE_SIZE / maxSide;
      clone.scale.set(scale, scale, scale);

      // Center the clone within its local space
      const center = new THREE.Vector3();
      box.getCenter(center);
      clone.position.sub(center.multiplyScalar(scale));
    }

    return clone;
  }, [scene]);

  if (!model) return null;
  return <primitive object={model} />;
};

const DieFallback = () => {
  const textures = useMemo(() => {
    return [2, 5, 1, 6, 3, 4].map(label => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      // @ts-ignore
      if (ctx.roundRect) ctx.roundRect(10, 10, 236, 236, 40);
      else ctx.rect(10, 10, 236, 236);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#1e1b4b';
      ctx.font = 'bold 150px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;
      ctx.fillText(label.toString(), 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 8;
      return tex;
    });
  }, []);

  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} />
      {textures.map((tex, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} map={tex} roughness={0.1} metalness={0.1} />
      ))}
    </mesh>
  );
};

// Face normals and mapping based on donggeonstory example
// Index: [Front, Back, Right, Left, Top, Bottom]
const FACE_NORMALS = [
  new THREE.Vector3(0, 0, 1),   // Front
  new THREE.Vector3(0, 0, -1),  // Back
  new THREE.Vector3(1, 0, 0),   // Right
  new THREE.Vector3(-1, 0, 0),  // Left
  new THREE.Vector3(0, 1, 0),   // Top
  new THREE.Vector3(0, -1, 0)   // Bottom
];

const DICE_SCALE: { [key: number]: number } = {
  0: 1,
  1: 6,
  2: 2,
  3: 5,
  4: 4,
  5: 3
};

const getTopFaceValue = (quaternion: THREE.Quaternion) => {
  let maxY = -Infinity;
  let maxIndex = -1;

  FACE_NORMALS.forEach((vector, index) => {
    const rotatedVector = vector.clone().applyQuaternion(quaternion);
    if (rotatedVector.y > maxY) {
      maxY = rotatedVector.y;
      maxIndex = index;
    }
  });

  return DICE_SCALE[maxIndex] || 1;
};

/**
 * Calculates a quaternion that makes the target face normal point world UP (0,1,0)
 */
const Die = ({
  position,
  rolling,
  targetValue,
  gauge,
  onSettled
}: {
  position: [number, number, number];
  rolling: boolean;
  targetValue: number;
  gauge: number;
  onSettled?: (value: number) => void;
}) => {
  const [ref, api] = useBox(() => ({
    mass: 18,
    position,
    args: [DIE_SIZE, DIE_SIZE, DIE_SIZE],
    friction: 0.2,
    restitution: 0.7,
    linearDamping: 0.08,
    angularDamping: 0.08,
    allowSleep: true,
    sleepSpeedLimit: 0.12,
    sleepTimeLimit: 0.25,
  }));

  const innerGroupRef = useRef<THREE.Group>(null);
  const rollApplied = useRef(false);
  const settledRef = useRef(false);
  const settleTimerRef = useRef(0);
  const safetyTimeoutRef = useRef(0); // Safety guard for infinite physics
  const rollElapsedRef = useRef(0);
  const velocityRef = useRef(new THREE.Vector3());
  const angularVelocityRef = useRef(new THREE.Vector3());
  const quaternionRef = useRef(new THREE.Quaternion());
  const motionStartedRef = useRef(false);
  const edgeNudgeCooldownRef = useRef(0);

  useEffect(() => {
    const unsubVelocity = api.velocity.subscribe(([x, y, z]) => {
      velocityRef.current.set(x, y, z);
    });
    const unsubAngular = api.angularVelocity.subscribe(([x, y, z]) => {
      angularVelocityRef.current.set(x, y, z);
    });
    const unsubQuaternion = api.quaternion.subscribe(([x, y, z, w]) => {
      quaternionRef.current.set(x, y, z, w);
    });
    return () => {
      unsubVelocity();
      unsubAngular();
      unsubQuaternion();
    };
  }, [api.angularVelocity, api.velocity, api.quaternion]);

  useEffect(() => {
    if (rolling) {
      rollApplied.current = false;
      settledRef.current = false;
      settleTimerRef.current = 0;
      safetyTimeoutRef.current = 0;
      rollElapsedRef.current = 0;
      motionStartedRef.current = false;
      edgeNudgeCooldownRef.current = 0;
      if (innerGroupRef.current) innerGroupRef.current.quaternion.set(0, 0, 0, 1);
      api.wakeUp();
      api.linearDamping.set(0.08);
      api.angularDamping.set(0.08);

      // Reset to a fixed start position every roll
      api.position.set(position[0], ROLL_START_Y, position[2]);
      api.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);

      // Controlled initial roll force (gauge-based random impulse)
      api.velocity.set(0, 0, 0);

      // Apply a strong off-center impulse for torque (spin)
      const rad = Math.random() * Math.PI * 2;
      const gaugeStrength = Math.max(12, Math.min(30, gauge * 0.4));
      const x = Math.cos(rad) * gaugeStrength;
      const z = Math.sin(rad) * gaugeStrength;
      const impulse: [number, number, number] = [-x, 0.0, z];
      // Point of offset is critical for torque. Max offset is DIE_SIZE/2.
      const point: [number, number, number] = [
        (Math.random() - 0.5) * (DIE_SIZE / 2),
        DIE_SIZE / 3,
        (Math.random() - 0.5) * (DIE_SIZE / 2)
      ];
      api.applyImpulse(impulse, point);
    } else if (!rolling && !rollApplied.current) {
      api.linearDamping.set(0.18);
      api.angularDamping.set(0.16);
      rollApplied.current = true;
    }
  }, [rolling, api, position]);

  const snapVisualToValue = useCallback((value: number) => {
    if (!innerGroupRef.current) return;
    const targetIndex = Object.keys(DICE_SCALE).find(key => DICE_SCALE[parseInt(key)] === value);
    if (targetIndex === undefined) return;
    const worldUp = new THREE.Vector3(0, 1, 0);
    const localUp = worldUp.clone().applyQuaternion(quaternionRef.current.clone().invert());
    const targetNormal = FACE_NORMALS[parseInt(targetIndex)].clone();
    innerGroupRef.current.quaternion.setFromUnitVectors(targetNormal, localUp);
  }, []);

  useFrame((_, delta) => {
    if (!rolling || settledRef.current) return;

    const speed = velocityRef.current.length();
    const spin = angularVelocityRef.current.length();
    // Safety timeout: avoid early results while still rolling
    safetyTimeoutRef.current += delta;
    rollElapsedRef.current += delta;
    edgeNudgeCooldownRef.current = Math.max(0, edgeNudgeCooldownRef.current - delta);
    if (safetyTimeoutRef.current > 6.0 && speed < 0.2 && spin < 0.6) {
      console.warn(`[Dice] Safety timeout triggered for targetValue: ${targetValue}`);
      settledRef.current = true;

      const finalValue = getTopFaceValue(quaternionRef.current);
      snapVisualToValue(finalValue);

      api.sleep();
      onSettled?.(finalValue);
      return;
    }
    if (safetyTimeoutRef.current > 10.0) {
      console.warn(`[Dice] Hard timeout triggered for targetValue: ${targetValue}`);
      settledRef.current = true;
      const finalValue = getTopFaceValue(quaternionRef.current);
      snapVisualToValue(finalValue);
      api.sleep();
      onSettled?.(finalValue);
      return;
    }

    if (!motionStartedRef.current && (speed > 0.4 || spin > 0.8)) {
      motionStartedRef.current = true;
    }

    if (motionStartedRef.current && speed < 0.32 && spin < 1.2) {
      settleTimerRef.current += delta;

      let topIndex = 0;
      let secondIndex = 0;
      let topY = -Infinity;
      let secondY = -Infinity;
      FACE_NORMALS.forEach((vector, index) => {
        const rotated = vector.clone().applyQuaternion(quaternionRef.current);
        if (rotated.y > topY) {
          secondY = topY;
          secondIndex = topIndex;
          topY = rotated.y;
          topIndex = index;
        } else if (rotated.y > secondY) {
          secondY = rotated.y;
          secondIndex = index;
        }
      });

      const faceDiff = topY - secondY;

      if (faceDiff < 0.2 && edgeNudgeCooldownRef.current <= 0) {
        const topNormalWorld = FACE_NORMALS[topIndex].clone().applyQuaternion(quaternionRef.current);
        const axis = new THREE.Vector3().crossVectors(topNormalWorld, new THREE.Vector3(0, 1, 0));
        if (axis.lengthSq() > 0.0001) {
          axis.normalize();
          const nudge = axis.multiplyScalar(1.3);
          api.angularVelocity.set(
            angularVelocityRef.current.x + nudge.x,
            angularVelocityRef.current.y + nudge.y,
            angularVelocityRef.current.z + nudge.z
          );
          edgeNudgeCooldownRef.current = 0.2;
        }
      }

      if (settleTimerRef.current > 0.9 && faceDiff >= 0.2 && !settledRef.current) {
        settledRef.current = true;

        const finalValue = getTopFaceValue(quaternionRef.current);
        snapVisualToValue(finalValue);
        api.sleep();
        if (innerGroupRef.current) {
          const worldUp = new THREE.Vector3(0, 1, 0);
          const localUp = worldUp.clone().applyQuaternion(quaternionRef.current.clone().invert());
          console.log(`[Dice] Settled. Result: ${finalValue}, Logic Face Mapping:`, getTopFaceValue(quaternionRef.current), `Raw LocalUp:`, localUp);
        }
        onSettled?.(finalValue);
      }
    } else {
      settleTimerRef.current = 0;
    }

    if (!settledRef.current && rollElapsedRef.current > 3.2 && targetValue > 0) {
      settledRef.current = true;
      const finalValue = getTopFaceValue(quaternionRef.current);
      snapVisualToValue(finalValue);
      api.sleep();
      onSettled?.(finalValue);
    }
  });

  useEffect(() => {
    if (rolling || targetValue === 0) return;
    snapVisualToValue(targetValue);
  }, [rolling, targetValue, snapVisualToValue]);

  return (
    <group ref={ref as any}>
      <group ref={innerGroupRef}>
        <DiceErrorBoundary fallback={<DieFallback />}>
          <Suspense fallback={<DieFallback />}>
            <DieModel />
          </Suspense>
        </DiceErrorBoundary>
      </group>
    </group>
  );
};

const Ground = () => {
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
  }));

  return (
    <mesh ref={ref as any} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <shadowMaterial transparent opacity={0.4} />
    </mesh>
  );
};

const Ceiling = () => {
  const [ref] = usePlane(() => ({
    rotation: [Math.PI / 2, 0, 0],
    position: [0, WALL_HEIGHT, 0],
  }));

  return (
    <mesh ref={ref as any} visible={false}>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial transparent opacity={0} />
    </mesh>
  );
};

const Wall = ({ position, args }: { position: [number, number, number]; args: [number, number, number] }) => {
  const [ref] = useBox(() => ({
    args,
    position,
    type: 'Static',
    material: { friction: WALL_FRICTION, restitution: WALL_RESTITUTION }
  }));
  return (
    <mesh ref={ref as any} visible={false}>
      <boxGeometry args={args} />
      <meshStandardMaterial transparent opacity={0} />
    </mesh>
  );
};

const InvisibleWalls = () => {
  const wallPos = ROLL_AREA_HALF - WALL_INSET - WALL_THICKNESS / 2;
  const wallLength = (ROLL_AREA_HALF - WALL_INSET) * 2;
  return (
    <group>
      <Wall position={[0, WALL_HEIGHT / 2, -wallPos]} args={[wallLength, WALL_HEIGHT, WALL_THICKNESS]} />
      <Wall position={[0, WALL_HEIGHT / 2, wallPos]} args={[wallLength, WALL_HEIGHT, WALL_THICKNESS]} />
      <Wall position={[-wallPos, WALL_HEIGHT / 2, 0]} args={[WALL_THICKNESS, WALL_HEIGHT, wallLength]} />
      <Wall position={[wallPos, WALL_HEIGHT / 2, 0]} args={[WALL_THICKNESS, WALL_HEIGHT, wallLength]} />
      <Ceiling />
    </group>
  );
};

export const Dice: FC<DiceProps> = ({ value, rolling, onRollComplete, rollId, gauge = 0 }) => {
  const resultRef = useRef<{ first: number | null; second: number | null }>({ first: null, second: null });
  const rollLockRef = useRef(false);

  useEffect(() => {
    // Reset internal state every time a new roll is initiated
    if (rolling || rollId) {
      console.log(`[Dice] Forcing internal reset for rollId: ${rollId}`);
      resultRef.current = { first: null, second: null };
      rollLockRef.current = false;
    }
  }, [rolling, rollId]);

  const handleDieSettled = useCallback((index: number, dieValue: number) => {
    if (rollLockRef.current) return;
    if (index === 0) resultRef.current.first = dieValue;
    if (index === 1) resultRef.current.second = dieValue;
    if (resultRef.current.first !== null && resultRef.current.second !== null) {
      rollLockRef.current = true;
      onRollComplete?.(resultRef.current.first, resultRef.current.second);
    }
  }, [onRollComplete]);

  return (
    <div className="dice-canvas-wrapper" style={{ width: '100%', height: '240px', position: 'relative' }}>
      <Canvas shadows camera={{ position: [0, 28, 0], fov: 15 }}>
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 15, 5]}
          intensity={1.8}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-3, 4, 3]} intensity={1.2} color="#6366f1" />

        <Physics gravity={[0, -30, 0]} defaultContactMaterial={{ restitution: 0.3, friction: 0.2 }}>
          <Die key={`die-0-${rollId}`} position={DICE_START_POSITIONS[0]} rolling={rolling} targetValue={value[0]} gauge={gauge} onSettled={(dieValue) => handleDieSettled(0, dieValue)} />
          <Die key={`die-1-${rollId}`} position={DICE_START_POSITIONS[1]} rolling={rolling} targetValue={value[1]} gauge={gauge} onSettled={(dieValue) => handleDieSettled(1, dieValue)} />
          <Ground />
          <InvisibleWalls />
        </Physics>

        <Environment preset="city" />
        <ContactShadows resolution={1024} scale={15} blur={2.5} opacity={0.3} far={10} color="#000000" />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {!rolling && value[0] === 0 ? (
          <div className="text-white/30 text-[10px] font-bold tracking-widest animate-pulse uppercase">
            Ready
          </div>
        ) : !rolling ? (
          <div className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-slate-100 shadow-sm">
            {value[0]} + {value[1]}
          </div>
        ) : null}
      </div>
    </div>
  );
};
