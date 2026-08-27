/**
 * Style: «Тихий ателье» — настоящая WebGL-сцена с 3D-моделью, Orbit-камерой и локальными текстурными слоями.
 * Решение: одежда лежит на отдельных цилиндрических 3D-поверхностях, а не на вращаемом 2D-изображении.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useAnimations, useGLTF, useTexture } from "@react-three/drei";
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

/** Зоны одежды не пересекаются: верх расположен на торсе, а низ — ниже линии талии. */
const surfaces: Record<GarmentCategory, SurfaceConfig> = {
  top: { position: [0, 0.22, -0.04], radius: 0.42, height: 0.83, arc: 3.85, z: 0.04 },
  bottom: { position: [0, -0.53, -0.05], radius: 0.33, height: 0.83, arc: 2.9, z: 0.035 },
  outerwear: { position: [0, 0.19, -0.07], radius: 0.5, height: 0.97, arc: 4.15, z: 0.06 },
  shoes: { position: [0, -0.88, -0.13], radius: 0.36, height: 0.18, arc: 2.5, z: 0.04 },
  accessory: { position: [0, 0.74, -0.12], radius: 0.27, height: 0.34, arc: 3.1, z: 0.08 },
};

const clampOffset = (value: number) => Math.max(-1.25, Math.min(1.25, value));
/**
 * Vercel не содержит служебный `/manus-storage`, поэтому URL модели должен быть
 * внешним и бинарным. SHA фиксирует версию CC0-исходника и исключает внезапную
 * замену модели в ветке источника.
 */
const MANNEQUIN_MODEL_URL = "https://raw.githubusercontent.com/met4citizen/TalkingHead/eed58d198076a7e1e825f804802921c4d3804d46/avatars/mpfb.glb";

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

function Mannequin({ bodyMode, dark }: Pick<TryOnStageProps, "bodyMode"> & { dark: boolean }) {
  const mannequinRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MANNEQUIN_MODEL_URL);
  const { actions } = useAnimations(animations, mannequinRef);
  const scale = bodyMode === "slim" ? [0.9, 1.04, 0.9] : bodyMode === "curvy" ? [1.12, 1, 1.1] : [1, 1, 1];

  useEffect(() => {
    const idle = actions.idle;
    if (!idle) return undefined;
    idle.reset().play();
    return () => {
      idle.stop();
    };
  }, [actions]);

  useEffect(() => {
    // MPFB поставляется в A-позе. Руки переводятся в спокойную витринную стойку
    // в мировом пространстве, поэтому не зависят от локальной ориентации костей.
    const leftArm = scene.getObjectByName("LeftArm");
    const rightArm = scene.getObjectByName("RightArm");
    const poseKey = "fittaBaseQuaternion";
    [leftArm, rightArm].forEach((arm) => {
      if (!arm) return;
      if (!arm.userData[poseKey]) arm.userData[poseKey] = arm.quaternion.clone();
      arm.quaternion.copy(arm.userData[poseKey] as THREE.Quaternion);
    });
    scene.updateMatrixWorld(true);
    if (leftArm) leftArm.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), 0.94);
    if (rightArm) rightArm.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -0.94);
    scene.updateMatrixWorld(true);

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.material = new THREE.MeshStandardMaterial({
        color: dark ? "#637a6e" : "#c8c3b8",
        roughness: 0.84,
        metalness: 0.02,
      });
    });
  }, [dark, scene]);

  return <primitive ref={mannequinRef} object={scene} position={[0, -0.95, 0]} scale={scale as [number, number, number]} />;
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

  const startMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const point = new THREE.Vector3();
    event.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(config.position[2] + config.z + config.radius)), point);
    drag.current = { pointerId: event.pointerId, point, offset };
    (event.target as unknown as { setPointerCapture: (pointerId: number) => void }).setPointerCapture(event.pointerId);
    onDragChange(true);
  };

  const move = (event: ThreeEvent<PointerEvent>) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const point = new THREE.Vector3();
    event.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(config.position[2] + config.z + config.radius)), point);
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
      <PerspectiveCamera makeDefault position={[0, 0.4, 5.6]} fov={37} />
      <ambientLight intensity={dark ? 1.6 : 1.35} />
      <directionalLight position={[4, 6, 5]} intensity={dark ? 2.1 : 2.5} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -2]} intensity={dark ? 0.65 : 0.45} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.98, 0]} receiveShadow>
        <circleGeometry args={[3.7, 64]} />
        <meshStandardMaterial color={floor} roughness={1} />
      </mesh>
      <Suspense fallback={null}>
        <Mannequin bodyMode={bodyMode} dark={dark} />
      </Suspense>
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
        target={[0, 0.35, 0]}
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

useGLTF.preload(MANNEQUIN_MODEL_URL);
