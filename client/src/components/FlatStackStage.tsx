/**
 * Style: «Тихий ателье» — плоская рабочая поверхность, где предметы складываются слоями без манекена.
 */
import type { CSSProperties } from "react";
import WarpedGarment from "@/components/WarpedGarment";
import { categoryOrder, DEFAULT_WARP_POINTS, type Garment, type GarmentCategory, type GarmentOffset, type WarpPoint } from "@/lib/wardrobe";

interface FlatStackStageProps {
  activeGarments: Partial<Record<GarmentCategory, Garment>>;
  editingGarmentId?: string;
  theme: "light" | "dark";
  onWarpChange: (garmentId: string, points: WarpPoint[]) => void;
  onOffsetChange: (garmentId: string, offset: GarmentOffset) => void;
}

const layerPosition: Record<GarmentCategory, { x: number; y: number; width: number; height: number }> = {
  top: { x: 50, y: 41, width: 58, height: 48 },
  bottom: { x: 51, y: 66, width: 48, height: 55 },
  outerwear: { x: 49, y: 42, width: 66, height: 55 },
  shoes: { x: 50, y: 81, width: 58, height: 20 },
  accessory: { x: 52, y: 17, width: 20, height: 19 },
};

export default function FlatStackStage({ activeGarments, editingGarmentId, theme, onWarpChange, onOffsetChange }: FlatStackStageProps) {
  const selectedGarments = categoryOrder
    .map((category) => activeGarments[category])
    .filter(Boolean) as Garment[];
  const isDark = theme === "dark";

  return (
    <div className={`flat-stack-stage relative h-full w-full overflow-hidden ${isDark ? "bg-[#111915]" : "bg-[#efede7]"}`} aria-label="2D-стек образа">
      <div className="flat-grid pointer-events-none absolute inset-0" />
      <span className={`absolute left-7 top-7 font-mono text-[10px] tracking-[0.15em] ${isDark ? "text-[#aebbb1]" : "text-[#6e786f]"}`}>LOOKBOARD_2D</span>
      <span className={`absolute bottom-7 right-7 font-mono text-[10px] tracking-[0.15em] ${isDark ? "text-[#aebbb1]" : "text-[#6e786f]"}`}>{selectedGarments.length.toString().padStart(2, "0")} LAYERS</span>
      {!selectedGarments.length && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`mb-3 h-10 w-10 rounded-full border border-dashed ${isDark ? "border-[#7aa48a]/55" : "border-[#28614e]/45"}`} />
          <p className={`text-sm font-bold tracking-[-0.02em] ${isDark ? "text-[#edf2ee]" : "text-[#4d594f]"}`}>Добавь вещи в образ</p>
          <p className={`mt-1 max-w-52 text-xs leading-5 ${isDark ? "text-[#aebbb1]" : "text-[#778177]"}`}>В 2D-режиме они будут просто накладываться друг на друга.</p>
        </div>
      )}
      {selectedGarments.map((garment, index) => {
        const placement = layerPosition[garment.category];
        const fit = garment.fit ?? { width: 100, height: 100 };
        const style: CSSProperties = {
          left: `${placement.x}%`,
          top: `${placement.y}%`,
          width: `${(placement.width * fit.width) / 100}%`,
          height: `${(placement.height * fit.height) / 100}%`,
          zIndex: index + 2,
          transform: "translate(-50%, -50%)",
        };
        return (
          <div key={garment.id} className="absolute overflow-visible shadow-[0_12px_22px_rgba(30,37,34,0.10)]" style={style}>
            <WarpedGarment image={garment.image} name={garment.name} points={garment.warp ?? DEFAULT_WARP_POINTS} offset={garment.offset ?? { x: 0, y: 0 }} editable={editingGarmentId === garment.id} onChange={(points) => onWarpChange(garment.id, points)} onOffsetChange={(offset) => onOffsetChange(garment.id, offset)} />
          </div>
        );
      })}
    </div>
  );
}
