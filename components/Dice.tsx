import { useEffect, useMemo, useRef, Suspense, Component, type ErrorInfo, type ReactNode, type FC, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, useBox, usePlane } from '@react-three/cannon';
import { useGLTF, Environment, ContactShadows, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

interface DiceProps {
  value: [number, number];
  rolling: boolean;
  onRollComplete?: (values: [number, number]) => void;
}

// Global constant for dice size
const DIE_SIZE = 0.35;
const ROLL_AREA_HALF = 1.8;
const WALL_THICKNESS = 0.2;
const WALL_HEIGHT = 0.7;

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

const DieModel = () => {
  const { scene } = useGLTF('/dice/scene.gltf') as any;

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

const FACE_NORMALS: Array<{ value: number; normal: THREE.Vector3 }> = [
  { value: 1, normal: new THREE.Vector3(0, 1, 0) },
  { value: 6, normal: new THREE.Vector3(0, -1, 0) },
  { value: 2, normal: new THREE.Vector3(1, 0, 0) },
  { value: 5, normal: new THREE.Vector3(-1, 0, 0) },
  { value: 3, normal: new THREE.Vector3(0, 0, 1) },
  { value: 4, normal: new THREE.Vector3(0, 0, -1) }
];

const getTopFaceValue = (quaternion: THREE.Quaternion) => {
  const worldUp = new THREE.Vector3(0, 1, 0);
  let bestValue = 1;
  let bestDot = -Infinity;
  FACE_NORMALS.forEach(face => {
    const faceNormal = face.normal.clone().applyQuaternion(quaternion);
    const dot = faceNormal.dot(worldUp);
    if (dot > bestDot) {
      bestDot = dot;
      bestValue = face.value;
    }
  });
  return bestValue;
};

const Die = ({
  position,
  rolling,
  onSettled
}: {
  position: [number, number, number];
  rolling: boolean;
  onSettled?: (value: number) => void;
}) => {
  const [ref, api] = useBox(() => ({
    mass: 8,
    position,
    args: [DIE_SIZE, DIE_SIZE, DIE_SIZE],
    friction: 0.45,
    restitution: 0.28,
    linearDamping: 0.2,
    angularDamping: 0.25,
    allowSleep: true,
    sleepSpeedLimit: 0.2,
    sleepTimeLimit: 0.5,
  }));

  const groupRef = useRef<THREE.Group | null>(null);
  const rollApplied = useRef(false);
  const settledRef = useRef(false);
  const settleTimerRef = useRef(0);
  const velocityRef = useRef(new THREE.Vector3());
  const angularVelocityRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const unsubVelocity = api.velocity.subscribe(([x, y, z]) => {
      velocityRef.current.set(x, y, z);
    });
    const unsubAngular = api.angularVelocity.subscribe(([x, y, z]) => {
      angularVelocityRef.current.set(x, y, z);
    });
    return () => {
      unsubVelocity();
      unsubAngular();
    };
  }, [api.angularVelocity, api.velocity]);

  useEffect(() => {
    if (rolling) {
      rollApplied.current = false;
      settledRef.current = false;
      settleTimerRef.current = 0;
      api.wakeUp();
      api.linearDamping.set(0.18);
      api.angularDamping.set(0.16);

      // Reset to a fixed start position every roll
      api.position.set(position[0], 6, position[2]);
      api.rotation.set(0, 0, 0);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);

      // Controlled initial roll force
      const velX = (Math.random() - 0.5) * 4.2;
      const velY = -7.5;
      const velZ = (Math.random() - 0.5) * 4.2;
      api.velocity.set(velX, velY, velZ);

      // Apply a strong off-center impulse for torque (spin)
      const impulse: [number, number, number] = [
        (Math.random() - 0.5) * 14,
        7,
        (Math.random() - 0.5) * 14
      ];
      // Point of offset is critical for torque. Max offset is DIE_SIZE/2 (0.35)
      const point: [number, number, number] = [
        (Math.random() - 0.5) * (DIE_SIZE / 2),
        DIE_SIZE / 3,
        (Math.random() - 0.5) * (DIE_SIZE / 2)
      ];
      api.applyImpulse(impulse, point);
    } else if (!rolling && !rollApplied.current) {
      api.linearDamping.set(0.5);
      api.angularDamping.set(0.45);
      rollApplied.current = true;
    }
  }, [rolling, api, position]);

  useFrame((_, delta) => {
    if (!rolling || settledRef.current || !groupRef.current) return;
    const speed = velocityRef.current.length();
    const spin = angularVelocityRef.current.length();
    if (speed < 0.12 && spin < 0.5) {
      settleTimerRef.current += delta;
      if (settleTimerRef.current > 0.35 && !settledRef.current) {
        settledRef.current = true;
        onSettled?.(getTopFaceValue(groupRef.current.quaternion));
      }
    } else {
      settleTimerRef.current = 0;
    }
  });

  return (
    <group ref={(node) => {
      (ref as any).current = node;
      groupRef.current = node;
    }}>
      <DiceErrorBoundary fallback={<DieFallback />}>
        <Suspense fallback={<DieFallback />}>
          <DieModel />
        </Suspense>
      </DiceErrorBoundary>
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

const Wall = ({ position, args }: { position: [number, number, number]; args: [number, number, number] }) => {
  const [ref] = useBox(() => ({
    args,
    position,
    type: 'Static'
  }));
  return (
    <mesh ref={ref as any} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#1f2937" transparent opacity={0.55} metalness={0.2} roughness={0.6} />
    </mesh>
  );
};

const InvisibleWalls = () => {
  return (
    <group>
      <Wall position={[0, WALL_HEIGHT / 2, -ROLL_AREA_HALF]} args={[ROLL_AREA_HALF * 2 + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
      <Wall position={[0, WALL_HEIGHT / 2, ROLL_AREA_HALF]} args={[ROLL_AREA_HALF * 2 + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
      <Wall position={[-ROLL_AREA_HALF, WALL_HEIGHT / 2, 0]} args={[WALL_THICKNESS, WALL_HEIGHT, ROLL_AREA_HALF * 2 + WALL_THICKNESS]} />
      <Wall position={[ROLL_AREA_HALF, WALL_HEIGHT / 2, 0]} args={[WALL_THICKNESS, WALL_HEIGHT, ROLL_AREA_HALF * 2 + WALL_THICKNESS]} />
    </group>
  );
};

export const Dice: FC<DiceProps> = ({ value, rolling, onRollComplete }) => {
  const resultRef = useRef<{ first: number | null; second: number | null }>({ first: null, second: null });
  const rollLockRef = useRef(false);

  useEffect(() => {
    if (rolling) {
      resultRef.current = { first: null, second: null };
      rollLockRef.current = false;
    }
  }, [rolling]);

  const handleDieSettled = useCallback((index: number, dieValue: number) => {
    if (rollLockRef.current) return;
    if (index === 0) resultRef.current.first = dieValue;
    if (index === 1) resultRef.current.second = dieValue;
    if (resultRef.current.first && resultRef.current.second) {
      rollLockRef.current = true;
      onRollComplete?.([resultRef.current.first, resultRef.current.second]);
    }
  }, [onRollComplete]);

  return (
    <div className="dice-canvas-wrapper" style={{ width: '100%', height: '240px', position: 'relative' }}>
      <Canvas shadows>
        {/* Top-down camera to match board perspective */}
        <OrthographicCamera makeDefault position={[0, 10, 0]} rotation={[-Math.PI / 2, 0, 0]} zoom={70} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 15, 5]}
          intensity={1.8}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-3, 4, 3]} intensity={1.2} color="#6366f1" />

        <Physics gravity={[0, -32, 0]} defaultContactMaterial={{ restitution: 0.28, friction: 0.45 }}>
          <Die position={[-1.2, 5, 0]} rolling={rolling} onSettled={(dieValue) => handleDieSettled(0, dieValue)} />
          <Die position={[1.2, 5, 0]} rolling={rolling} onSettled={(dieValue) => handleDieSettled(1, dieValue)} />
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
