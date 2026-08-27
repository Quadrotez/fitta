/**
 * Style: «Тихий ателье» — графитовый линейный манекен и деликатные тканевые слои.
 */
import { Edges, Image, Line, OrbitControls, SoftShadows } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import type { Garment, GarmentCategory } from "@/lib/wardrobe";

interface TryOnCanvasProps {
  activeGarments: Partial<Record<GarmentCategory, Garment>>;
  bodyMode: "standard" | "slim" | "curvy";
  sceneKey: number;
}

const garmentPosition: Record<GarmentCategory, [number, number, number]> = {
  top: [0, 1.48, 0.58],
  bottom: [0, 0.15, 0.56],
  outerwear: [0, 1.48, 0.68],
  shoes: [0, -1.13, 0.47],
  accessory: [0, 2.23, 0.52],
};

const garmentScale: Record<GarmentCategory, [number, number]> = {
  top: [1.48, 1.82],
  bottom: [1.2, 2.1],
  outerwear: [1.82, 2.12],
  shoes: [1.18, 0.6],
  accessory: [0.64, 0.64],
};

function GarmentLayer({ garment }: { garment: Garment }) {
  const fit = garment.fit ?? { width: 100, height: 100 };
  const [baseWidth, baseHeight] = garmentScale[garment.category];
  return (
    <Image
      key={garment.id}
      url={garment.image}
      position={garmentPosition[garment.category]}
      scale={[(baseWidth * fit.width) / 100, (baseHeight * fit.height) / 100]}
      transparent
      opacity={0.97}
      side={THREE.DoubleSide}
      toneMapped={false}
    />
  );
}

function Mannequin({
  activeGarments,
  bodyMode,
}: Omit<TryOnCanvasProps, "sceneKey">) {
  const scale: Record<TryOnCanvasProps["bodyMode"], [number, number, number]> = {
    standard: [1, 1, 1],
    slim: [0.88, 1.04, 0.88],
    curvy: [1.13, 0.98, 1.13],
  };

  return (
    <group scale={scale[bodyMode]} rotation={[0, -0.12, 0]}>
      <mesh position={[0, 2.85, 0]} castShadow>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.64} />
        <Edges color="#4a544d" />
      </mesh>
      <mesh position={[0, 2.43, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.18, 0.34, 20]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.5} />
        <Edges color="#4a544d" />
      </mesh>

      <mesh position={[0, 1.46, 0]} castShadow>
        <cylinderGeometry args={[0.64, 0.49, 1.67, 32]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.44} />
        <Edges color="#4a544d" />
      </mesh>
      <mesh position={[-0.84, 1.58, 0]} rotation={[0, 0, -0.22]} castShadow>
        <capsuleGeometry args={[0.17, 1.38, 12, 20]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.42} />
        <Edges color="#4a544d" />
      </mesh>
      <mesh position={[0.84, 1.58, 0]} rotation={[0, 0, 0.22]} castShadow>
        <capsuleGeometry args={[0.17, 1.38, 12, 20]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.42} />
        <Edges color="#4a544d" />
      </mesh>
      <mesh position={[-0.33, -0.11, 0]} castShadow>
        <capsuleGeometry args={[0.24, 1.62, 12, 20]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.42} />
        <Edges color="#4a544d" />
      </mesh>
      <mesh position={[0.33, -0.11, 0]} castShadow>
        <capsuleGeometry args={[0.24, 1.62, 12, 20]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.42} />
        <Edges color="#4a544d" />
      </mesh>

      <mesh position={[-0.35, -1.1, 0.08]} scale={[0.95, 0.42, 1.32]} castShadow>
        <sphereGeometry args={[0.25, 20, 20]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.42} />
        <Edges color="#4a544d" />
      </mesh>
      <mesh position={[0.35, -1.1, 0.08]} scale={[0.95, 0.42, 1.32]} castShadow>
        <sphereGeometry args={[0.25, 20, 20]} />
        <meshStandardMaterial color="#eeece5" roughness={1} transparent opacity={0.42} />
        <Edges color="#4a544d" />
      </mesh>

      <Line points={[[0, 2.35, 0.01], [0, 0.78, 0.01], [0, -0.78, 0.01]]} color="#28614e" lineWidth={0.9} transparent opacity={0.7} />
      <Line points={[[-0.5, 1.98, 0.02], [0, 2.15, 0.02], [0.5, 1.98, 0.02]]} color="#4a544d" lineWidth={1.1} transparent opacity={0.7} />

      <Suspense fallback={null}>
        {Object.values(activeGarments).map((garment) =>
          garment ? <GarmentLayer garment={garment} key={garment.id} /> : null,
        )}
      </Suspense>
    </group>
  );
}

function Scene({ activeGarments, bodyMode }: Omit<TryOnCanvasProps, "sceneKey">) {
  return (
    <>
      <color attach="background" args={["#f1efe9"]} />
      <fog attach="fog" args={["#f1efe9", 7, 13]} />
      <ambientLight intensity={1.55} />
      <directionalLight position={[3.5, 5.4, 5]} intensity={2.1} castShadow />
      <directionalLight position={[-4, 1, 1]} intensity={0.55} color="#d6e7dc" />
      <Mannequin activeGarments={activeGarments} bodyMode={bodyMode} />
      <mesh position={[0, -1.43, -0.18]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.24, 48]} />
        <shadowMaterial color="#485148" opacity={0.18} />
      </mesh>
      <OrbitControls
        enablePan={false}
        enableZoom
        zoomSpeed={0.72}
        minDistance={4.8}
        maxDistance={10.5}
        minPolarAngle={Math.PI / 2.9}
        maxPolarAngle={Math.PI / 2.05}
        minAzimuthAngle={-0.65}
        maxAzimuthAngle={0.65}
        target={[0, 0.8, 0]}
      />
    </>
  );
}

export default function TryOnCanvas({
  activeGarments,
  bodyMode,
  sceneKey,
}: TryOnCanvasProps) {
  return (
    <Canvas
      key={sceneKey}
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.15, 7.1], fov: 32 }}
      gl={{ antialias: true, alpha: false }}
    >
      <SoftShadows size={16} samples={10} focus={0.22} />
      <Scene activeGarments={activeGarments} bodyMode={bodyMode} />
    </Canvas>
  );
}
