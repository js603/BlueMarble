import { useEffect, useMemo, useRef, Suspense, Component, type ErrorInfo, type ReactNode, type FC } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, useBox, usePlane } from '@react-three/cannon';
import { useGLTF, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

interface DiceProps {
  value: [number, number];
  rolling: boolean;
}

// Global constant for dice size
const DIE_SIZE = 0.7;

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

// Map dice value to Euler rotations (in radians)
const getRotationForValue = (val: number): [number, number, number] => {
  switch (val) {
    case 1: return [0, 0, 0];
    case 2: return [0, 0, -Math.PI / 2];
    case 3: return [-Math.PI / 2, 0, 0];
    case 4: return [Math.PI / 2, 0, 0];
    case 5: return [0, 0, Math.PI / 2];
    case 6: return [Math.PI, 0, 0];
    default: return [0, 0, 0];
  }
};

const DieModel = ({ targetValue, rolling }: { targetValue: number, rolling: boolean }) => {
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

  useEffect(() => {
    if (model && !rolling) {
      const rotations = getRotationForValue(targetValue);
      model.rotation.set(...rotations);
    }
  }, [model, targetValue, rolling]);

  if (!model) return null;
  return <primitive object={model} />;
};

const DieFallback = ({ targetValue, rolling }: { targetValue: number, rolling: boolean }) => {
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

  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (meshRef.current && !rolling) {
      const rotations = getRotationForValue(targetValue);
      meshRef.current.rotation.set(...rotations);
    }
  }, [targetValue, rolling]);

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} />
      {textures.map((tex, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} map={tex} roughness={0.1} metalness={0.1} />
      ))}
    </mesh>
  );
};

const Die = ({ position, targetValue, rolling }: { position: [number, number, number], targetValue: number, rolling: boolean }) => {
  const [ref, api] = useBox(() => ({
    mass: 10,
    position,
    args: [DIE_SIZE, DIE_SIZE, DIE_SIZE],
    friction: 0.1,
    restitution: 0.5,
    linearDamping: 0.05,
    angularDamping: 0.05, // Reduced damping for more spin
  }));

  const rollApplied = useRef(false);

  useEffect(() => {
    if (rolling) {
      rollApplied.current = false;
      api.wakeUp();

      // Random starting spread
      const startX = position[0] + (Math.random() - 0.5) * 2;
      const startZ = (Math.random() - 0.5) * 3;
      api.position.set(startX, 7, startZ);

      // Increased initial horizontal speed
      const velX = (Math.random() - 0.5) * 12;
      const velY = -15; // Faster drop
      const velZ = (Math.random() - 0.5) * 12;
      api.velocity.set(velX, velY, velZ);

      // Apply a strong off-center impulse for torque (spin)
      const impulse: [number, number, number] = [
        (Math.random() - 0.5) * 60,
        20,
        (Math.random() - 0.5) * 60
      ];
      // Point of offset is critical for torque. Max offset is DIE_SIZE/2 (0.35)
      const point: [number, number, number] = [
        (Math.random() - 0.5) * 0.6,
        0.3,
        (Math.random() - 0.5) * 0.6
      ];
      api.applyImpulse(impulse, point);
    } else if (!rolling && !rollApplied.current) {
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
      const rotations = getRotationForValue(targetValue);
      api.rotation.set(...rotations);
      api.position.set(position[0], DIE_SIZE / 2, 0);
      rollApplied.current = true;
    }
  }, [rolling, api, targetValue, position]);

  return (
    <group ref={ref as any}>
      <DiceErrorBoundary fallback={<DieFallback targetValue={targetValue} rolling={rolling} />}>
        <Suspense fallback={<DieFallback targetValue={targetValue} rolling={rolling} />}>
          <DieModel targetValue={targetValue} rolling={rolling} />
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
  // Balanced walls to keep dice in the 4x4 area
  usePlane(() => ({ position: [0, 0, -3], rotation: [0, 0, 0] }));
  usePlane(() => ({ position: [0, 0, 3], rotation: [0, Math.PI, 0] }));
  usePlane(() => ({ position: [-3.5, 0, 0], rotation: [0, Math.PI / 2, 0] }));
  usePlane(() => ({ position: [3.5, 0, 0], rotation: [0, -Math.PI / 2, 0] }));
  return null;
};

export const Dice: FC<DiceProps> = ({ value, rolling }) => {
  return (
    <div className="dice-canvas-wrapper" style={{ width: '100%', height: '240px', position: 'relative' }}>
      <Canvas shadows>
        {/* Adjusted camera for more depth perspective */}
        <PerspectiveCamera makeDefault position={[0, 9, 10]} fov={30} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 15, 5]}
          intensity={1.8}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-3, 4, 3]} intensity={1.2} color="#6366f1" />

        <Physics gravity={[0, -40, 0]} defaultContactMaterial={{ restitution: 0.5, friction: 0.1 }}>
          <Die position={[-1.2, 5, 0]} targetValue={value[0]} rolling={rolling} />
          <Die position={[1.2, 5, 0]} targetValue={value[1]} rolling={rolling} />
          <Ground />
          <InvisibleWalls />
        </Physics>

        <Environment preset="city" />
        <ContactShadows resolution={1024} scale={15} blur={2.5} opacity={0.3} far={10} color="#000000" />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {!rolling && value[0] === 0 && (
          <div className="text-white/30 text-[10px] font-bold tracking-widest animate-pulse uppercase">
            Ready
          </div>
        )}
      </div>
    </div>
  );
};
