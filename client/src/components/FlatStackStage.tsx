/**
 * Style: «Тихое ателье» — единственная 2D-рабочая поверхность Fitta.
 * Масштаб увеличивает полотно вокруг центра, а предметы остаются независимо
 * растягиваемыми и перемещаемыми без обязательного режима точек.
 */
import type { CSSProperties, WheelEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import WarpedGarment from "@/components/WarpedGarment";
import { categoryOrder, DEFAULT_WARP_POINTS, type Garment, type GarmentCategory, type GarmentOffset, type WarpPoint } from "@/lib/wardrobe";

interface FlatStackStageProps {
  activeGarments: Partial<Record<GarmentCategory, Garment>>;
  editingGarmentId?: string;
  theme: "light" | "dark";
  zoom: number;
  onZoomChange: (value: number) => void;
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

const clampZoom = (value: number) => Math.min(2.4, Math.max(0.65, value));

export default function FlatStackStage({ activeGarments, editingGarmentId, theme, zoom, onZoomChange, onWarpChange, onOffsetChange }: FlatStackStageProps) {
  const selectedGarments = categoryOrder.map((category) => activeGarments[category]).filter(Boolean) as Garment[];
  const isDark = theme === "dark";
  const changeZoom = (delta: number) => onZoomChange(clampZoom(Number((zoom + delta).toFixed(2))));
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY > 0 ? -0.08 : 0.08;
    changeZoom(direction);
  };

  return (
    <div
      className={`flat-stack-stage relative h-full w-full overflow-hidden ${isDark ? "bg-[#111915]" : "bg-[#efede7]"}`}
      aria-label="2D-стек образа"
      onWheel={handleWheel}
    >
      <div className="absolute right-5 top-5 z-30 flex items-center gap-1 rounded-full border border-current/15 bg-background/80 p-1 shadow-sm backdrop-blur-sm">
        <button type="button" onClick={() => changeZoom(-0.12)} className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground" aria-label="Уменьшить масштаб 2D"><Minus className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => onZoomChange(1)} className="min-w-14 px-1 font-mono text-[10px] font-medium tracking-[0.06em] text-foreground/75" aria-label="Сбросить масштаб 2D">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => changeZoom(0.12)} className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground" aria-label="Увеличить масштаб 2D"><Plus className="h-3.5 w-3.5" /></button>
      </div>
      <div className="pointer-events-none absolute bottom-5 left-5 z-30 flex items-center gap-2 rounded-md border border-current/10 bg-background/65 px-2 py-1 font-mono text-[9px] tracking-[0.05em] text-foreground/60 backdrop-blur-sm">
        <RotateCcw className="h-3 w-3" /> КОЛЕСО · МАСШТАБ
      </div>
      <div className="flat-viewport absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: "50% 50%" }}>
        <div className="flat-grid pointer-events-none absolute inset-0" />
        <span className={`absolute left-7 top-7 font-mono text-[10px] tracking-[0.15em] ${isDark ? "text-[#aebbb1]" : "text-[#6e786f]"}`}>LOOKBOARD_2D</span>
        <span className={`absolute bottom-7 right-7 font-mono text-[10px] tracking-[0.15em] ${isDark ? "text-[#aebbb1]" : "text-[#6e786f]"}`}>{selectedGarments.length.toString().padStart(2, "0")} LAYERS</span>
        {!selectedGarments.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={`mb-3 h-10 w-10 rounded-full border border-dashed ${isDark ? "border-[#7aa48a]/55" : "border-[#28614e]/45"}`} />
            <p className={`text-sm font-bold tracking-[-0.02em] ${isDark ? "text-[#edf2ee]" : "text-[#4d594f]"}`}>Добавь вещи в образ</p>
            <p className={`mt-1 max-w-52 text-xs leading-5 ${isDark ? "text-[#aebbb1]" : "text-[#778177]"}`}>Вещи можно перемещать прямо на полотне.</p>
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
              <WarpedGarment image={garment.image} name={garment.name} points={garment.warp ?? DEFAULT_WARP_POINTS} offset={garment.offset ?? { x: 0, y: 0 }} zoom={zoom} editable={editingGarmentId === garment.id} onChange={(points) => onWarpChange(garment.id, points)} onOffsetChange={(offset) => onOffsetChange(garment.id, offset)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
