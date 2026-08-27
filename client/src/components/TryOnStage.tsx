/**
 * Style: «Тихий ателье» — человекоподобный плоский макет, без WebGL и нестабильных шейдеров.
 */
import { useState, type CSSProperties, type WheelEvent } from "react";
import WarpedGarment from "@/components/WarpedGarment";
import { DEFAULT_WARP_POINTS, type Garment, type GarmentCategory, type WarpPoint } from "@/lib/wardrobe";

interface TryOnStageProps {
  activeGarments: Partial<Record<GarmentCategory, Garment>>;
  bodyMode: "standard" | "slim" | "curvy";
  editingGarmentId?: string;
  onWarpChange: (garmentId: string, points: WarpPoint[]) => void;
}

const categorySlot: Record<
  GarmentCategory,
  { left: number; top: number; width: number; height: number; zIndex: number }
> = {
  top: { left: 25, top: 25, width: 50, height: 34, zIndex: 4 },
  bottom: { left: 31, top: 55, width: 38, height: 37, zIndex: 3 },
  outerwear: { left: 17, top: 20, width: 66, height: 46, zIndex: 6 },
  shoes: { left: 27, top: 86, width: 46, height: 11, zIndex: 7 },
  accessory: { left: 36, top: 9, width: 28, height: 20, zIndex: 8 },
};

const bodyScale = {
  standard: "scale(1)",
  slim: "scaleX(0.9) scaleY(1.03)",
  curvy: "scaleX(1.1) scaleY(0.98)",
} as const;

function FlatMannequin({ bodyMode }: Pick<TryOnStageProps, "bodyMode">) {
  return (
    <svg
      viewBox="0 0 440 620"
      aria-label="Человекоподобный манекен"
      role="img"
      className="h-full w-full overflow-visible"
      style={{ transform: bodyScale[bodyMode], transformOrigin: "50% 95%" }}
    >
      <defs>
        <linearGradient id="fitta-skin" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ded8cd" />
          <stop offset="1" stopColor="#c7c0b5" />
        </linearGradient>
        <linearGradient id="fitta-suit" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e8e4dc" />
          <stop offset="1" stopColor="#d8d2c7" />
        </linearGradient>
      </defs>
      <ellipse cx="220" cy="575" rx="104" ry="17" fill="#627066" opacity="0.11" />
      <circle cx="220" cy="85" r="42" fill="url(#fitta-skin)" />
      <path d="M201 121h38l7 35h-52z" fill="url(#fitta-skin)" />
      <path d="M153 158c20-17 43-25 67-25s47 8 67 25l22 184H131z" fill="url(#fitta-suit)" />
      <path d="M157 162c-20 7-39 23-48 46l-35 124c-5 18 7 35 26 38 17 3 32-8 37-25l34-111" fill="url(#fitta-skin)" />
      <path d="M283 162c20 7 39 23 48 46l35 124c5 18-7 35-26 38-17 3-32-8-37-25l-34-111" fill="url(#fitta-skin)" />
      <path d="M154 334h132l-5 77-12 154h-55l6-183h-8l-6 183h-55l-12-154z" fill="url(#fitta-suit)" />
      <path d="M150 566h61v17c0 8-7 14-15 14h-45c-9 0-15-7-15-15 0-9 6-16 14-16z" fill="#bcb4a8" />
      <path d="M229 566h61v17c0 8-7 14-15 14h-45c-9 0-15-7-15-15 0-9 6-16 14-16z" fill="#bcb4a8" />
      <path d="M157 166c21-14 42-22 63-22 22 0 43 8 64 22" fill="none" stroke="#8b928a" strokeWidth="1.4" opacity="0.7" />
      <path d="M220 158v405" fill="none" stroke="#b8b3aa" strokeDasharray="5 6" strokeWidth="1" />
    </svg>
  );
}

export default function TryOnStage({ activeGarments, bodyMode, editingGarmentId, onWarpChange }: TryOnStageProps) {
  const [zoom, setZoom] = useState(1);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => Math.min(1.45, Math.max(0.72, current - event.deltaY * 0.001)));
  };

  return (
    <div className="relative h-full w-full overflow-hidden" aria-label="Сцена примерки; используйте колёсико мыши для масштаба" onWheel={handleWheel}>
      <span className="pointer-events-none absolute right-5 top-5 z-20 rounded-full border border-[#d5d7d1] bg-[#f8f7f2]/85 px-2.5 py-1 font-mono text-[9px] tracking-[0.08em] text-[#667067] backdrop-blur-sm">{Math.round(zoom * 100)}%</span>
      <div className="absolute inset-0 transition-transform duration-150 ease-out" style={{ transform: `scale(${zoom})`, transformOrigin: "50% 50%" }}>
        <div className="absolute inset-[4%_16%_2%]">
          <FlatMannequin bodyMode={bodyMode} />
        </div>
        {Object.values(activeGarments).map((garment) => {
        if (!garment) return null;
        const slot = categorySlot[garment.category];
        const fit = garment.fit ?? { width: 100, height: 100 };
        const style: CSSProperties = {
          left: `${slot.left + (slot.width - (slot.width * fit.width) / 100) / 2}%`,
          top: `${slot.top + (slot.height - (slot.height * fit.height) / 100) / 2}%`,
          width: `${(slot.width * fit.width) / 100}%`,
          height: `${(slot.height * fit.height) / 100}%`,
          zIndex: slot.zIndex,
        };
        return (
          <div key={garment.id} className="absolute overflow-visible" style={style}>
            <WarpedGarment image={garment.image} name={garment.name} points={garment.warp ?? DEFAULT_WARP_POINTS} editable={editingGarmentId === garment.id} onChange={(points) => onWarpChange(garment.id, points)} />
          </div>
        );
        })}
        <div className="pointer-events-none absolute inset-x-[17%] top-[5%] h-px bg-[#28614e]/20" />
        <div className="pointer-events-none absolute bottom-[4%] left-1/2 h-[1px] w-[58%] -translate-x-1/2 bg-[#28614e]/15" />
      </div>
    </div>
  );
}
