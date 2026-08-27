/**
 * Style: «Тихий ателье» — автономная WebGL-сцена без сетевых 3D-зависимостей.
 * Решение: манекен собран из объёмных Three.js-примитивов в устойчивой прямой стойке;
 * одежда лежит на отдельных цилиндрических 3D-поверхностях, а не на 2D-изображении.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { Garment, GarmentCategory, GarmentOffset } from "@/lib/wardrobe";

interface TryOnStageProps {
  activeGarments: Partial<Record<GarmentCategory, Garment>>;
  bodyMode: "standard" | "slim" | "curvy";
  theme: "light" | "dark";
  onOffsetChange: (garmentId: string, offset: GarmentOffset) => void;
}

type SurfaceConfig = {
  position: [number, number, number];
  radius: number;
  height: number;
  arc: number;
  z: number;
};

/** Верх и низ находятся на независимых высотах, чтобы брюки не пересекались с курткой. */
const surfaces: Record<GarmentCategory, SurfaceConfig> = {
  top: { position: [0, 0.42, 0], radius: 0.43, height: 0.76, arc: 3.9, z: 0.035 },
  bottom: { position: [0, -0.5, 0], radius: 0.34, height: 0.92, arc: 2.95, z: 0.035 },
  outerwear: { position: [0, 0.39, 0], radius: 0.51, height: 0.92, arc: 4.18, z: 0.06 },
  shoes: { position: [0, -1.17, 0.02], radius: 0.35, height: 0.17, arc: 2.55, z: 0.05 },
  accessory: { position: [0, 0.96, 0], radius: 0.28, height: 0.3, arc: 3.1, z: 0.07 },
};

const clampOffset = (value: number) => Math.max(-1.25, Math.min(1.25, value));

function useObjectUrl(image: string | Blob) {
  const [url, setUrl] = useState(() => (typeof image === "string" ? image : ""));

  useEffect(() => {
    if (typeof image === "string") {
      setUrl(image);
      return;
    }

    const nextUrl = URL.createObjectURL(image);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image]);

  return url;
}

function MannequinMaterial({ color }: { color: string }) {
  return <meshStandardMaterial color={color} roughness={0.79} metalness={0.04} />;
}

/**
 * Предсказуемый автономный манекен: человек стоит прямо, руки опущены вдоль корпуса.
 * Здесь нет GLB, анимаций, скелета или сторонних URL — только настоящие меши WebGL.
 */
function PrimitiveMannequin({ bodyMode, dark }: Pick<TryOnStageProps, "bodyMode"> & { dark: boolean }) {
  const dimensions: [number, number, number] = bodyMode === "slim" ? [0.9, 1.03, 0.9] : bodyMode === "curvy" ? [1.13, 1, 1.11] : [1, 1, 1];
  const color = dark ? "#73887a" : "#bebbb1";

  return (
    <group scale={dimensions}>
      {/* Голова и шея */}
      <mesh position={[0, 1.22, 0.02]} scale={[0.96, 1.12, 0.93]} castShadow receiveShadow>
        <sphereGeometry args={[0.2, 32, 24]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.1, 0.11, 0.16, 24]} />
        <MannequinMaterial color={color} />
      </mesh>

      {/* Торс с более широкими плечами и узкой талией */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.28, 0.78, 32]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.12, 0]} scale={[1, 0.72, 0.79]} castShadow receiveShadow>
        <sphereGeometry args={[0.31, 32, 20]} />
        <MannequinMaterial color={color} />
      </mesh>

      {/* Руки расположены вертикально у корпуса, без A-позы и жестов. */}
      <mesh position={[-0.47, 0.48, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.085, 0.105, 0.6, 20]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.47, 0.48, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.085, 0.105, 0.6, 20]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[-0.47, -0.11, 0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.085, 0.57, 20]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.47, -0.11, 0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.085, 0.57, 20]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[-0.47, -0.46, 0.02]} scale={[0.78, 1.35, 0.72]} castShadow receiveShadow>
        <sphereGeometry args={[0.075, 18, 14]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.47, -0.46, 0.02]} scale={[0.78, 1.35, 0.72]} castShadow receiveShadow>
        <sphereGeometry args={[0.075, 18, 14]} />
        <MannequinMaterial color={color} />
      </mesh>

      {/* Ноги стоят параллельно, стопы опираются на пол. */}
      <mesh position={[-0.17, -0.56, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.125, 0.96, 24]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.17, -0.56, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.125, 0.96, 24]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[-0.17, -1.14, 0.07]} scale={[0.93, 0.48, 1.45]} castShadow receiveShadow>
        <sphereGeometry args={[0.15, 20, 14]} />
        <MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.17, -1.14, 0.07]} scale={[0.93, 0.48, 1.45]} castShadow receiveShadow>
        <sphereGeometry args={[0.15, 20, 14]} />
        <MannequinMaterial color={color} />
      </mesh>
    </group>
  );
}

function GarmentSurface({ garment, onOffsetChange, onDragChange }: { garment: Garment; onOffsetChange: (id: string, offset: GarmentOffset) => void; onDragChange: (value: boolean) => void }) {
  const textureUrl = useObjectUrl(garment.image);

  return textureUrl ? (
    <Suspense fallback={null}>
      <LoadedGarmentSurface textureUrl={textureUrl} garment={garment} onOffsetChange={onOffsetChange} onDragChange={onDragChange} />
    </Suspense>
  ) : null;
}

function LoadedGarmentSurface({ textureUrl, garment, onOffsetChange, onDragChange }: { textureUrl: string; garment: Garment; onOffsetChange: (id: string, offset: GarmentOffset) => void; onDragChange: (value: boolean) => void }) {
  const texture = useTexture(textureUrl);
  const drag = useRef<{ pointerId: number; point: THREE.Vector3; offset: GarmentOffset } | null>(null);
  const config = surfaces[garment.category];
  const offset = garment.offset ?? { x: 0, y: 0 };
  const fit = garment.fit ?? { width: 100, height: 100 };

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);

  const getDragPoint = (event: ThreeEvent<PointerEvent>) => {
    const point = new THREE.Vector3();
    event.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(config.position[2] + config.z + config.radius)), point);
    return point;
  };

  const startMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    drag.current = { pointerId: event.pointerId, point: getDragPoint(event), offset };
    (event.target as unknown as { setPointerCapture: (pointerId: number) => void }).setPointerCapture(event.pointerId);
    onDragChange(true);
  };

  const move = (event: ThreeEvent<PointerEvent>) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const point = getDragPoint(event);
    onOffsetChange(garment.id, {
      x: clampOffset(activeDrag.offset.x + (point.x - activeDrag.point.x) / 1.15),
      y: clampOffset(activeDrag.offset.y + (point.y - activeDrag.point.y) / 1.35),
    });
  };

  const finishMove = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    (event.target as unknown as { releasePointerCapture: (pointerId: number) => void }).releasePointerCapture(event.pointerId);
    drag.current = null;
    onDragChange(false);
  };

  return (
    <mesh
      position={[config.position[0] + offset.x * 1.15, config.position[1] - offset.y * 1.35, config.position[2] + config.z]}
      onPointerDown={startMove}
      onPointerMove={move}
      onPointerUp={finishMove}
      onPointerCancel={finishMove}
      castShadow
    >
      <cylinderGeometry args={[config.radius * (fit.width / 100), config.radius * (fit.width / 100), config.height * (fit.height / 100), 36, 1, true, -config.arc / 2, config.arc]} />
      <meshStandardMaterial map={texture} transparent opacity={0.98} side={THREE.DoubleSide} roughness={0.9} metalness={0} />
    </mesh>
  );
}

function FittingScene({ activeGarments, bodyMode, theme, onOffsetChange }: TryOnStageProps) {
  const [draggingGarment, setDraggingGarment] = useState(false);
  const dark = theme === "dark";
  const background = dark ? "#111915" : "#f1efe9";
  const floor = dark ? "#24322a" : "#d5d7ce";

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 5, 11]} />
      <PerspectiveCamera makeDefault position={[0, 0.22, 5.6]} fov={37} />
      <ambientLight intensity={dark ? 1.28 : 1.06} />
      <directionalLight position={[4, 6, 5]} intensity={dark ? 2.1 : 2.35} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -2]} intensity={dark ? 0.65 : 0.42} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.28, 0]} receiveShadow>
        <circleGeometry args={[3.7, 64]} />
        <meshStandardMaterial color={floor} roughness={1} />
      </mesh>
      <PrimitiveMannequin bodyMode={bodyMode} dark={dark} />
      {Object.values(activeGarments).map((garment) => garment && <GarmentSurface key={garment.id} garment={garment} onOffsetChange={onOffsetChange} onDragChange={setDraggingGarment} />)}
      <OrbitControls
        enabled={!draggingGarment}
        enablePan={false}
        enableDamping
        dampingFactor={0.09}
        rotateSpeed={0.66}
        zoomSpeed={0.62}
        minDistance={2.5}
        maxDistance={12}
        minPolarAngle={0.48}
        maxPolarAngle={2.65}
        target={[0, 0.05, 0]}
      />
    </>
  );
}

export default function TryOnStage(props: TryOnStageProps) {
  const dark = props.theme === "dark";
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const preventPageScroll = (event: WheelEvent) => event.preventDefault();
    stage.addEventListener("wheel", preventPageScroll, { passive: false });
    return () => stage.removeEventListener("wheel", preventPageScroll);
  }, []);

  return (
    <div ref={stageRef} className="relative h-full w-full touch-none" aria-label="Настоящая 3D-сцена примерки: перетаскивай пустое поле для полного поворота, тяни одежду для перемещения, используй колесо для масштаба">
      <Canvas className="fitta-webgl-canvas" shadows dpr={[1, 2]} gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }} style={{ background: dark ? "#111915" : "#f1efe9", display: "block", touchAction: "none" }}>
        <FittingScene {...props} />
      </Canvas>
    </div>
  );
}
