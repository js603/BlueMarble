import { useEffect, useMemo, useRef, Suspense, Component, type ErrorInfo, type ReactNode, type FC } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, useBox, usePlane } from '@react-three/cannon';
import { useGLTF, Environment, ContactShadows, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

interface DiceProps {
  value: [number, number];
  rolling: boolean;
}

// Global constant for dice size
const DIE_SIZE = 0.35;
const ROLL_AREA_RADIUS = 1.9;

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

const VALUE_ROTATIONS: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [0, 0, Math.PI / 2],
  3: [-Math.PI / 2, 0, 0],
  4: [Math.PI / 2, 0, 0],
  5: [0, 0, -Math.PI / 2],
  6: [Math.PI, 0, 0]
};

const Die = ({ position, rolling, value }: { position: [number, number, number], rolling: boolean, value: number }) => {
  const [ref, api] = useBox(() => ({
    mass: 10,
    position,
    args: [DIE_SIZE, DIE_SIZE, DIE_SIZE],
    friction: 0.35,
    restitution: 0.2,
    linearDamping: 0.15,
    angularDamping: 0.12,
    allowSleep: true,
    sleepSpeedLimit: 0.15,
    sleepTimeLimit: 0.6,
  }));

  const rollApplied = useRef(false);

  useEffect(() => {
    if (rolling) {
      rollApplied.current = false;
      api.wakeUp();
      api.linearDamping.set(0.12);
      api.angularDamping.set(0.1);

      // Random starting spread
      const startX = position[0] + (Math.random() - 0.5) * 0.8;
      const startZ = (Math.random() - 0.5) * 0.8;
      api.position.set(startX, 6, startZ);

      // Increased initial horizontal speed
      const velX = (Math.random() - 0.5) * 5;
      const velY = -10;
      const velZ = (Math.random() - 0.5) * 5;
      api.velocity.set(velX, velY, velZ);

      // Apply a strong off-center impulse for torque (spin)
      const impulse: [number, number, number] = [
        (Math.random() - 0.5) * 18,
        8,
        (Math.random() - 0.5) * 18
      ];
      // Point of offset is critical for torque. Max offset is DIE_SIZE/2 (0.35)
      const point: [number, number, number] = [
        (Math.random() - 0.5) * (DIE_SIZE / 2),
        DIE_SIZE / 3,
        (Math.random() - 0.5) * (DIE_SIZE / 2)
      ];
      api.applyImpulse(impulse, point);
    } else if (!rolling && !rollApplied.current) {
      api.linearDamping.set(0.4);
      api.angularDamping.set(0.35);
      rollApplied.current = true;
    }
  }, [rolling, api, position]);

  useEffect(() => {
    if (rolling || value <= 0) return;
    const rotation = VALUE_ROTATIONS[value] ?? [0, 0, 0];
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
    api.rotation.set(rotation[0], rotation[1], rotation[2]);
  }, [rolling, value, api]);

  return (
    <group ref={ref as any}>
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

const InvisibleWalls = () => {
  // Balanced walls to keep dice centered in the hub
  usePlane(() => ({ position: [0, 0, -ROLL_AREA_RADIUS], rotation: [0, 0, 0] }));
  usePlane(() => ({ position: [0, 0, ROLL_AREA_RADIUS], rotation: [0, Math.PI, 0] }));
  usePlane(() => ({ position: [-ROLL_AREA_RADIUS, 0, 0], rotation: [0, Math.PI / 2, 0] }));
  usePlane(() => ({ position: [ROLL_AREA_RADIUS, 0, 0], rotation: [0, -Math.PI / 2, 0] }));
  return null;
};

export const Dice: FC<DiceProps> = ({ value, rolling }) => {
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

        <Physics gravity={[0, -40, 0]} defaultContactMaterial={{ restitution: 0.2, friction: 0.35 }}>
          <Die position={[-1.2, 5, 0]} rolling={rolling} value={value[0]} />
          <Die position={[1.2, 5, 0]} rolling={rolling} value={value[1]} />
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
