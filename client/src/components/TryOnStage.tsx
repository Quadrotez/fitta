/**
 * Style: «Тихий ателье» — спокойная WebGL-примерочная с настоящими объёмными мешами.
 * Жесты считают движение в плоскости, зафиксированной камерой в начале drag, поэтому
 * смена перспективы не меняет направление перемещения одежды.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent, useLoader } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useTexture } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";
import type { Garment, GarmentCategory, GarmentOffset, MannequinGender, UserModel } from "@/lib/wardrobe";

interface TryOnStageProps {
  activeGarments: Partial<Record<GarmentCategory, Garment>>;
  bodyGender: MannequinGender;
  bodyScale: { width: number; height: number; depth: number };
  customModel?: UserModel;
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

const surfaces: Record<GarmentCategory, SurfaceConfig> = {
  top: { position: [0, 0.42, 0], radius: 0.43, height: 0.76, arc: 3.9, z: 0.035 },
  bottom: { position: [0, -0.5, 0], radius: 0.34, height: 0.92, arc: 2.95, z: 0.035 },
  outerwear: { position: [0, 0.39, 0], radius: 0.51, height: 0.92, arc: 4.18, z: 0.06 },
  shoes: { position: [0, -1.17, 0.02], radius: 0.35, height: 0.17, arc: 2.55, z: 0.05 },
  accessory: { position: [0, 0.96, 0], radius: 0.28, height: 0.3, arc: 3.1, z: 0.07 },
};

const clampOffset = (value: number) => Math.max(-1.25, Math.min(1.25, value));
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

function useObjectUrl(file: Blob | string) {
  const [url, setUrl] = useState(() => (typeof file === "string" ? file : ""));
  useEffect(() => {
    if (typeof file === "string") {
      setUrl(file);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url;
}

function MannequinMaterial({ color }: { color: string }) {
  return <meshStandardMaterial color={color} roughness={0.79} metalness={0.04} />;
}

function PrimitiveMannequin({ bodyGender, bodyScale, dark }: Pick<TryOnStageProps, "bodyGender" | "bodyScale"> & { dark: boolean }) {
  const genderDimensions = {
    neutral: { shoulder: 1, chest: 1, hip: 1, waist: 1 },
    masculine: { shoulder: 1.12, chest: 1.1, hip: 0.96, waist: 1.04 },
    feminine: { shoulder: 0.94, chest: 1.04, hip: 1.13, waist: 0.88 },
  }[bodyGender];
  const dimensions: [number, number, number] = [bodyScale.width / 100, bodyScale.height / 100, bodyScale.depth / 100];
  const color = dark ? "#788c7e" : "#bdbbb2";

  return (
    <group scale={dimensions}>
      <mesh position={[0, 1.22, 0.02]} scale={[0.96, 1.12, 0.93]} castShadow receiveShadow>
        <sphereGeometry args={[0.2, 32, 24]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.1, 0.11, 0.16, 24]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.6, 0]} scale={[genderDimensions.shoulder, 1, 1]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38 * genderDimensions.chest, 0.28 * genderDimensions.waist, 0.78, 32]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.12, 0]} scale={[genderDimensions.hip, 0.72, 0.79]} castShadow receiveShadow>
        <sphereGeometry args={[0.31, 32, 20]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[-0.47 * genderDimensions.shoulder, 0.48, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.085, 0.105, 0.6, 20]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.47 * genderDimensions.shoulder, 0.48, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.085, 0.105, 0.6, 20]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[-0.47 * genderDimensions.shoulder, -0.11, 0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.085, 0.57, 20]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.47 * genderDimensions.shoulder, -0.11, 0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.085, 0.57, 20]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[-0.47 * genderDimensions.shoulder, -0.46, 0.02]} scale={[0.78, 1.35, 0.72]} castShadow receiveShadow>
        <sphereGeometry args={[0.075, 18, 14]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.47 * genderDimensions.shoulder, -0.46, 0.02]} scale={[0.78, 1.35, 0.72]} castShadow receiveShadow>
        <sphereGeometry args={[0.075, 18, 14]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[-0.17 * genderDimensions.hip, -0.56, 0]} scale={[genderDimensions.hip, 1, 1]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.125, 0.96, 24]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.17 * genderDimensions.hip, -0.56, 0]} scale={[genderDimensions.hip, 1, 1]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.125, 0.96, 24]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[-0.17 * genderDimensions.hip, -1.14, 0.07]} scale={[0.93, 0.48, 1.45]} castShadow receiveShadow>
        <sphereGeometry args={[0.15, 20, 14]} /><MannequinMaterial color={color} />
      </mesh>
      <mesh position={[0.17 * genderDimensions.hip, -1.14, 0.07]} scale={[0.93, 0.48, 1.45]} castShadow receiveShadow>
        <sphereGeometry args={[0.15, 20, 14]} /><MannequinMaterial color={color} />
      </mesh>
    </group>
  );
}

function LoadedCustomModel({ model }: { model: UserModel }) {
  const url = useObjectUrl(model.file);
  if (!url) return null;
  if (model.format === "glb" || model.format === "gltf") return <LoadedGltf url={url} />;
  if (model.format === "obj") return <LoadedObj url={url} />;
  return <LoadedFbx url={url} />;
}

function LoadedGltf({ url }: { url: string }) {
  const result = useLoader(GLTFLoader, url);
  const scene = useMemo(() => result.scene.clone(true), [result.scene]);
  return <primitive object={scene} position={[0, -1.2, 0]} scale={[1.15, 1.15, 1.15]} />;
}

function LoadedObj({ url }: { url: string }) {
  const object = useLoader(OBJLoader, url);
  const scene = useMemo(() => object.clone(true), [object]);
  return <primitive object={scene} position={[0, -1.2, 0]} scale={[1.15, 1.15, 1.15]} />;
}

function LoadedFbx({ url }: { url: string }) {
  const object = useLoader(FBXLoader, url);
  const scene = useMemo(() => object.clone(true), [object]);
  return <primitive object={scene} position={[0, -1.2, 0]} scale={[0.012, 0.012, 0.012]} />;
}

function garmentSurfaceColor(category: GarmentCategory) {
  return { top: "#f3f0e4", bottom: "#343d3b", outerwear: "#425b4a", shoes: "#e9e6dc", accessory: "#a84d38" }[category];
}

function FallbackGarmentSurface({ garment, depthOffset = 0 }: { garment: Garment; depthOffset?: number }) {
  const config = surfaces[garment.category];
  const offset = garment.offset ?? { x: 0, y: 0 };
  const fit = garment.fit ?? { width: 100, height: 100 };
  const curvature = clampPercent(garment.curvature ?? 100) / 100;
  const arc = Math.max(0.8, config.arc * (0.08 + curvature * 0.92));
  return (
      <mesh position={[config.position[0] + offset.x * 1.15, config.position[1] - offset.y * 1.35, config.position[2] + config.z + depthOffset]}>
      <cylinderGeometry args={[config.radius * (fit.width / 100), config.radius * (fit.width / 100), config.height * (fit.height / 100), 36, 1, true, -arc / 2, arc]} />
      <meshStandardMaterial color={garmentSurfaceColor(garment.category)} transparent opacity={depthOffset < 0 ? 0.18 : 0.92} side={THREE.DoubleSide} roughness={0.9} />
    </mesh>
  );
}

function GarmentSurface({ garment, onOffsetChange, onDragChange }: { garment: Garment; onOffsetChange: (id: string, offset: GarmentOffset) => void; onDragChange: (value: boolean) => void }) {
  const textureUrl = useObjectUrl(garment.image);
  return <>
    <FallbackGarmentSurface garment={garment} depthOffset={textureUrl ? -0.012 : 0} />
    {textureUrl && <Suspense fallback={null}><LoadedGarmentSurface textureUrl={textureUrl} garment={garment} onOffsetChange={onOffsetChange} onDragChange={onDragChange} /></Suspense>}
  </>;
}

function LoadedGarmentSurface({ textureUrl, garment, onOffsetChange, onDragChange }: { textureUrl: string; garment: Garment; onOffsetChange: (id: string, offset: GarmentOffset) => void; onDragChange: (value: boolean) => void }) {
  const texture = useTexture(textureUrl);
  const drag = useRef<{ pointerId: number; point: THREE.Vector3; anchor: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; offset: GarmentOffset } | null>(null);
  const config = surfaces[garment.category];
  const offset = garment.offset ?? { x: 0, y: 0 };
  const fit = garment.fit ?? { width: 100, height: 100 };
  const curvature = clampPercent(garment.curvature ?? 100) / 100;
  const arc = Math.max(0.8, config.arc * (0.08 + curvature * 0.92));

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);

  const getDragPoint = (event: ThreeEvent<PointerEvent>, anchor: THREE.Vector3) => {
    const cameraDirection = new THREE.Vector3();
    event.camera.getWorldDirection(cameraDirection);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDirection, anchor);
    const point = new THREE.Vector3();
    event.ray.intersectPlane(plane, point);
    return point;
  };

  const startMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const anchor = new THREE.Vector3(config.position[0] + offset.x * 1.15, config.position[1] - offset.y * 1.35, config.position[2] + config.z);
    const right = new THREE.Vector3().setFromMatrixColumn(event.camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(event.camera.matrixWorld, 1).normalize();
    drag.current = { pointerId: event.pointerId, point: getDragPoint(event, anchor), anchor, right, up, offset };
    (event.target as unknown as { setPointerCapture: (pointerId: number) => void }).setPointerCapture(event.pointerId);
    onDragChange(true);
  };

  const move = (event: ThreeEvent<PointerEvent>) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const point = getDragPoint(event, activeDrag.anchor);
    const delta = point.sub(activeDrag.point);
    onOffsetChange(garment.id, {
      x: clampOffset(activeDrag.offset.x + delta.dot(activeDrag.right) / 1.15),
      y: clampOffset(activeDrag.offset.y - delta.dot(activeDrag.up) / 1.35),
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
      <cylinderGeometry args={[config.radius * (fit.width / 100), config.radius * (fit.width / 100), config.height * (fit.height / 100), 36, 1, true, -arc / 2, arc]} />
      <meshStandardMaterial map={texture} transparent opacity={0.98} side={THREE.DoubleSide} roughness={0.9} metalness={0} />
    </mesh>
  );
}

function FittingScene({ activeGarments, bodyGender, bodyScale, customModel, theme, onOffsetChange }: TryOnStageProps) {
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.28, 0]} receiveShadow><circleGeometry args={[3.7, 64]} /><meshStandardMaterial color={floor} roughness={1} /></mesh>
      {customModel ? <Suspense fallback={null}><LoadedCustomModel model={customModel} /></Suspense> : <PrimitiveMannequin bodyGender={bodyGender} bodyScale={bodyScale} dark={dark} />}
      {Object.values(activeGarments).map((garment) => garment && <GarmentSurface key={garment.id} garment={garment} onOffsetChange={onOffsetChange} onDragChange={setDraggingGarment} />)}
      <OrbitControls enabled={!draggingGarment} enablePan={false} enableDamping dampingFactor={0.09} rotateSpeed={0.66} zoomSpeed={0.62} minDistance={2.5} maxDistance={12} minPolarAngle={0.48} maxPolarAngle={2.65} target={[0, 0.05, 0]} />
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
    <div ref={stageRef} className="relative h-full w-full touch-none" aria-label="Настоящая 3D-сцена примерки: тяни пустое поле для ракурса, одежду для перемещения, используй колесо для масштаба">
      <Canvas fallback={<div className="flex h-full min-h-[500px] flex-col items-center justify-center gap-2 bg-[#111915] px-8 text-center text-[#dce8df]"><strong className="font-mono text-xs tracking-[0.12em]">WEBGL НЕДОСТУПЕН</strong><span className="max-w-sm text-sm text-[#aebbb1]">Включи аппаратное ускорение или используй 2D-режим — локальные вещи и образы при этом не пропадут.</span></div>} className="fitta-webgl-canvas" shadows dpr={[1, 2]} gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }} style={{ background: dark ? "#111915" : "#f1efe9", display: "block", touchAction: "none" }}>
        <FittingScene {...props} />
      </Canvas>
    </div>
  );
}
