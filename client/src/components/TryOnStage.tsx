/**
 * Style: «Тихий ателье» — лаконичный человекоподобный макет и прямое управление сценой без WebGL.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import WarpedGarment from "@/components/WarpedGarment";
import { DEFAULT_WARP_POINTS, type Garment, type GarmentCategory, type WarpPoint } from "@/lib/wardrobe";

interface TryOnStageProps {
  activeGarments: Partial<Record<GarmentCategory, Garment>>;
  bodyMode: "standard" | "slim" | "curvy";
  editingGarmentId?: string;
  onWarpChange: (garmentId: string, points: WarpPoint[]) => void;
}

const categorySlot: Record<GarmentCategory, { left: number; top: number; width: number; height: number; zIndex: number }> = {
  top: { left: 26, top: 22, width: 48, height: 32, zIndex: 4 },
  bottom: { left: 30, top: 58, width: 40, height: 38, zIndex: 3 },
  outerwear: { left: 17, top: 18, width: 66, height: 45, zIndex: 6 },
  shoes: { left: 26, top: 85, width: 48, height: 12, zIndex: 7 },
  accessory: { left: 36, top: 8, width: 28, height: 20, zIndex: 8 },
};

const bodyScale = {
  standard: "scale(1)",
  slim: "scaleX(0.9) scaleY(1.03)",
  curvy: "scaleX(1.1) scaleY(0.98)",
} as const;

function FlatMannequin({ bodyMode }: Pick<TryOnStageProps, "bodyMode">) {
  return (
    <svg viewBox="0 0 440 620" aria-label="Человекоподобный манекен" role="img" className="h-full w-full overflow-visible" style={{ transform: bodyScale[bodyMode], transformOrigin: "50% 95%" }}>
      <defs>
        <linearGradient id="fitta-canvas" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f6f3eb" /><stop offset="1" stopColor="#e4dfd4" /></linearGradient>
      </defs>
      <ellipse cx="220" cy="577" rx="98" ry="10" fill="#486053" opacity="0.16" />
      <g fill="url(#fitta-canvas)" stroke="#636c63" strokeWidth="1.25" strokeLinejoin="round">
        <ellipse cx="220" cy="80" rx="29" ry="39" />
        <path d="M204 118h32l5 29h-42z" />
        <path d="M165 151q55-24 110 0l20 182H145z" />
        <path d="M168 157q-29 11-42 42l-28 111q-6 22 11 31 18 9 29-10l36-100z" />
        <path d="M272 157q29 11 42 42l28 111q6 22-11 31-18 9-29-10l-36-100z" />
        <path d="M159 333h122l-6 69-10 158h-47l2-171h-10l2 171h-47l-10-158z" />
        <path d="M156 561h57v13q0 13-14 13h-41q-12 0-12-12 0-10 10-14z" />
        <path d="M227 561h57v13q0 13-14 13h-41q-12 0-12-12 0-10 10-14z" />
      </g>
      <g fill="none" stroke="#737c73" strokeWidth="1" opacity="0.62">
        <path d="M165 151q55 25 110 0" />
        <path d="M153 185q67 21 134 0" />
        <path d="M151 329q69 11 138 0" />
        <path d="M220 145v416" strokeDasharray="4 7" opacity="0.8" />
        <path d="M121 199l17 4M319 203l17-4M170 400h100" strokeDasharray="2 5" />
      </g>
    </svg>
  );
}

export default function TryOnStage({ activeGarments, bodyMode, editingGarmentId, onWarpChange }: TryOnStageProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ pointerId: number; x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setZoom((current) => Math.min(1.45, Math.max(0.72, current - event.deltaY * 0.001)));
    };
    scene.addEventListener("wheel", onWheel, { passive: false });
    return () => scene.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragOrigin.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Некоторые браузерные события не разрешают Pointer Capture; обычное перетаскивание всё равно работает.
    }
    setIsDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    setYaw(Math.max(-28, Math.min(28, origin.yaw + (event.clientX - origin.x) * 0.16)));
    setPitch(Math.max(-10, Math.min(10, origin.pitch - (event.clientY - origin.y) * 0.1)));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragOrigin.current?.pointerId !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer Capture мог не включиться; освобождать нечего.
    }
    dragOrigin.current = null;
    setIsDragging(false);
  };

  return (
    <div ref={sceneRef} className={`relative h-full w-full touch-none overflow-hidden overscroll-contain select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`} aria-label="Сцена примерки: колесо меняет масштаб, перетаскивание меняет ракурс" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
      <span className="pointer-events-none absolute right-5 top-5 z-20 rounded-full border border-[#d5d7d1] bg-[#f8f7f2]/85 px-2.5 py-1 font-mono text-[9px] tracking-[0.08em] text-[#667067] backdrop-blur-sm">{Math.round(zoom * 100)}%</span>
      <div className="absolute inset-0 will-change-transform transition-transform duration-100 ease-out" style={{ transform: `perspective(1100px) rotateX(${pitch}deg) rotateY(${yaw}deg) scale(${zoom})`, transformOrigin: "50% 50%" }}>
        <div className="absolute inset-[4%_16%_2%]"><FlatMannequin bodyMode={bodyMode} /></div>
        {Object.values(activeGarments).map((garment) => {
          if (!garment) return null;
          const slot = categorySlot[garment.category];
          const fit = garment.fit ?? { width: 100, height: 100 };
          const style: CSSProperties = { left: `${slot.left + (slot.width - (slot.width * fit.width) / 100) / 2}%`, top: `${slot.top + (slot.height - (slot.height * fit.height) / 100) / 2}%`, width: `${(slot.width * fit.width) / 100}%`, height: `${(slot.height * fit.height) / 100}%`, zIndex: slot.zIndex };
          return <div key={garment.id} className="absolute overflow-visible" style={style}><WarpedGarment image={garment.image} name={garment.name} points={garment.warp ?? DEFAULT_WARP_POINTS} editable={editingGarmentId === garment.id} onChange={(points) => onWarpChange(garment.id, points)} /></div>;
        })}
        <div className="pointer-events-none absolute inset-x-[17%] top-[5%] h-px bg-[#28614e]/20" />
        <div className="pointer-events-none absolute bottom-[4%] left-1/2 h-px w-[58%] -translate-x-1/2 bg-[#28614e]/15" />
      </div>
    </div>
  );
}
