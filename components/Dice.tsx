import React, { useEffect, useRef, useState } from 'react';

interface DiceProps {
  value: [number, number];
  rolling: boolean;
}

type RenderMode = 'loading' | 'webgl' | 'fallback';

export const Dice: React.FC<DiceProps> = ({ value, rolling }) => {
  const [renderMode, setRenderMode] = useState<RenderMode>('loading');
  const renderModeRef = useRef<RenderMode>('loading');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<{
    updateRoll: (isRolling: boolean, values: [number, number]) => void;
    dispose: () => void;
  } | null>(null);
  const previousRollingRef = useRef(false);
  const updateRenderMode = (mode: RenderMode) => {
    renderModeRef.current = mode;
    setRenderMode(mode);
  };

  useEffect(() => {
    let isMounted = true;
    const fallbackTimer = window.setTimeout(() => {
      if (isMounted && renderModeRef.current === 'loading') {
        updateRenderMode('fallback');
      }
    }, 1500);

    if (typeof window !== 'undefined') {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        window.clearTimeout(fallbackTimer);
        updateRenderMode('fallback');
        return () => {
          isMounted = false;
        };
      }
    }
    const init = async () => {
      Promise.all([
        import('/vendor/three.module.js'),
        import('/vendor/cannon-es.js')
      ])
        .then(([threeModule, CANNON]) => {
          if (!isMounted || !containerRef.current) return;
          window.clearTimeout(fallbackTimer);
          const {
            Scene,
            PerspectiveCamera,
            WebGLRenderer,
            Color,
            Mesh,
            BoxGeometry,
            MeshStandardMaterial,
            AmbientLight,
            DirectionalLight,
            PlaneGeometry,
            MeshBasicMaterial,
            CanvasTexture,
            Vector3,
            Quaternion
          } = threeModule;

          if (!containerRef.current) return;

          const width = containerRef.current.clientWidth;
          const height = containerRef.current.clientHeight;

          const scene = new Scene();
          scene.background = new Color(0x0f172a);

          const camera = new PerspectiveCamera(40, width / height, 0.1, 100);
          camera.position.set(0, 6, 10);
          camera.lookAt(0, 0, 0);

          const renderer = new WebGLRenderer({ antialias: true, alpha: true });
          renderer.setSize(width, height);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(renderer.domElement);

          const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
          world.broadphase = new CANNON.SAPBroadphase(world);
          world.allowSleep = true;

          const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
          groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
          world.addBody(groundBody);

          const light = new AmbientLight(0xffffff, 0.6);
          const dir = new DirectionalLight(0xffffff, 1);
          dir.position.set(5, 10, 2);
          scene.add(light, dir);

          const ground = new Mesh(new PlaneGeometry(30, 30), new MeshBasicMaterial({ visible: false }));
          ground.rotation.x = -Math.PI / 2;
          scene.add(ground);

          const createFaceTexture = (label: number) => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#0f172a';
              ctx.font = 'bold 72px Noto Sans KR, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label.toString(), canvas.width / 2, canvas.height / 2);
            }
            return new CanvasTexture(canvas);
          };

          const materials = [2, 5, 1, 6, 3, 4].map(face => new MeshStandardMaterial({ map: createFaceTexture(face), roughness: 0.4, metalness: 0.1 }));

          const diceGeometry = new BoxGeometry(1.6, 1.6, 1.6);

          const diceBodies: any[] = [];
          const diceMeshes: any[] = [];

          const createDie = (offsetX: number) => {
            const mesh = new Mesh(diceGeometry, materials);
            mesh.castShadow = true;
            mesh.position.set(offsetX, 2, 0);
            scene.add(mesh);

            const body = new CANNON.Body({
              mass: 1.2,
              shape: new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8)),
              position: new CANNON.Vec3(offsetX, 2, 0)
            });
            body.linearDamping = 0.2;
            body.angularDamping = 0.3;
            world.addBody(body);

            diceMeshes.push(mesh);
            diceBodies.push(body);
          };

          createDie(-1.5);
          createDie(1.5);

          const valueToQuaternion = (faceValue: number) => {
            const q = new Quaternion();
            const rotations: Record<number, [number, number, number]> = {
              1: [0, 0, 0],
              2: [0, 0, -Math.PI / 2],
              3: [-Math.PI / 2, 0, 0],
              4: [Math.PI / 2, 0, 0],
              5: [0, 0, Math.PI / 2],
              6: [Math.PI, 0, 0]
            };
            const [x, y, z] = rotations[faceValue] || [0, 0, 0];
            q.setFromEuler(x, y, z);
            return q;
          };

          const updateRoll = (isRolling: boolean, values: [number, number]) => {
            if (isRolling) {
              diceBodies.forEach((body, idx) => {
                body.wakeUp();
                body.position.set(idx === 0 ? -1.5 : 1.5, 3, 0);
                body.velocity.set(Math.random() * 2 - 1, 4 + Math.random() * 2, Math.random() * 2 - 1);
                body.angularVelocity.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
              });
            } else {
              diceBodies.forEach((body, idx) => {
                body.velocity.setZero();
                body.angularVelocity.setZero();
                const targetQuat = valueToQuaternion(values[idx]);
                body.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w);
              });
            }
          };

          let lastTime = performance.now();
          const step = () => {
            const now = performance.now();
            const delta = Math.min((now - lastTime) / 1000, 0.033);
            lastTime = now;
            world.step(1 / 60, delta, 3);

            diceBodies.forEach((body, idx) => {
              const mesh = diceMeshes[idx];
              mesh.position.copy(body.position as unknown as Vector3);
              mesh.quaternion.copy(body.quaternion as unknown as Quaternion);
            });

            renderer.render(scene, camera);
            requestAnimationFrame(step);
          };

          requestAnimationFrame(step);

          const onResize = () => {
            if (!containerRef.current) return;
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
          };

          window.addEventListener('resize', onResize);

          engineRef.current = {
            updateRoll,
            dispose: () => {
              window.removeEventListener('resize', onResize);
              renderer.dispose();
              diceGeometry.dispose();
              materials.forEach((mat: any) => mat.dispose?.());
            }
          };
          updateRenderMode('webgl');
        })
        .catch(() => {
          if (isMounted) {
            window.clearTimeout(fallbackTimer);
            updateRenderMode('fallback');
          }
        });
    };

    init();

    return () => {
      isMounted = false;
      window.clearTimeout(fallbackTimer);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!engineRef.current || renderMode !== 'webgl') return;
    if (rolling !== previousRollingRef.current) {
      engineRef.current.updateRoll(rolling, value);
      previousRollingRef.current = rolling;
    } else if (!rolling) {
      engineRef.current.updateRoll(false, value);
    }
  }, [rolling, value, renderMode]);

  if (renderMode === 'fallback') {
    return (
      <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 bg-nebula-card/50 rounded-xl border border-white/10 backdrop-blur-sm">
        {value.map((val, idx) => (
          <div
            key={idx}
            className={`w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg shadow-[0_0_10px_rgba(255,255,255,0.5)] flex items-center justify-center text-2xl font-bold text-nebula-bg transition-transform duration-100 ${rolling ? 'animate-bounce-short' : ''}`}
          >
            {val}
          </div>
        ))}
      </div>
    );
  }

  if (renderMode === 'loading') {
    return (
      <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 bg-nebula-card/50 rounded-xl border border-white/10 backdrop-blur-sm">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-slate-800/80 animate-pulse" />
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-slate-800/80 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="dice-canvas-wrapper">
      <div ref={containerRef} className="dice-canvas" />
    </div>
  );
};
