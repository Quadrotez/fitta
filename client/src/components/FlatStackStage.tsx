/**
 * Style: «Тихое ателье», переосмысленное как точная персональная lookboard-доска.
 * Каждый слой независим: его можно выбирать, двигать, растягивать, поворачивать,
 * скрывать и локально деформировать без потери координат при любом масштабе сцены.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import { Focus, Grid3X3, Minus, Plus, RotateCcw, Ruler } from "lucide-react";
import type { BoardLayer, Garment, LookboardGuide, WarpPoint } from "@/lib/wardrobe";
import { DEFAULT_WARP_POINTS } from "@/lib/wardrobe";

interface FlatStackStageProps {
  layers: BoardLayer[];
  garments: Garment[];
  selectedLayerId?: string;
  warpMode: boolean;
  guide: LookboardGuide;
  zoom: number;
  theme: "light" | "dark";
  onSelect: (layerId?: string) => void;
  onLayerChange: (layer: BoardLayer) => void;
  onInteractionStart: () => void;
  onZoomChange: (value: number) => void;
  onGuideChange: (guide: LookboardGuide) => void;
}

const CANVAS_SIZE = 1000;
const CANVAS_MARGIN = 0.35;
const CANVAS_SPAN = 1 + CANVAS_MARGIN * 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clampPoint = (value: number) => clamp(value, -0.35, 1.35);
const clampZoom = (value: number) => clamp(value, 0.6, 2.5);
const toCanvasPoint = (point: WarpPoint) => ({ x: ((point.x + CANVAS_MARGIN) / CANVAS_SPAN) * CANVAS_SIZE, y: ((point.y + CANVAS_MARGIN) / CANVAS_SPAN) * CANVAS_SIZE });

function getAffineTransform(source: { x: number; y: number }[], target: { x: number; y: number }[]) {
  const [s0, s1, s2] = source;
  const [t0, t1, t2] = target;
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  const solve = (v0: number, v1: number, v2: number) => ({
    a: (v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / denominator,
    b: (v0 * (s2.x - s1.x) + v1 * (s0.x - s2.x) + v2 * (s1.x - s0.x)) / denominator,
    c: (v0 * (s1.x * s2.y - s2.x * s1.y) + v1 * (s2.x * s0.y - s0.x * s2.y) + v2 * (s0.x * s1.y)) / denominator,
  });
  const x = solve(t0.x, t1.x, t2.x);
  const y = solve(t0.y, t1.y, t2.y);
  return { a: x.a, b: y.a, c: x.b, d: y.b, e: x.c, f: y.c };
}

function paintTriangle(context: CanvasRenderingContext2D, image: HTMLImageElement, source: { x: number; y: number }[], target: { x: number; y: number }[]) {
  const transform = getAffineTransform(source, target);
  context.save();
  context.beginPath();
  context.moveTo(target[0].x, target[0].y);
  context.lineTo(target[1].x, target[1].y);
  context.lineTo(target[2].x, target[2].y);
  context.closePath();
  context.clip();
  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
  context.drawImage(image, 0, 0);
  context.restore();
}

function resolvePoint(frame: HTMLDivElement, event: PointerEvent<HTMLButtonElement>) {
  const withQuads = frame as HTMLDivElement & { getBoxQuads?: () => DOMQuad[] };
  const quad = withQuads.getBoxQuads?.()[0];
  if (quad) {
    const ux = quad.p2.x - quad.p1.x;
    const uy = quad.p2.y - quad.p1.y;
    const vx = quad.p4.x - quad.p1.x;
    const vy = quad.p4.y - quad.p1.y;
    const dx = event.clientX - quad.p1.x;
    const dy = event.clientY - quad.p1.y;
    const determinant = ux * vy - uy * vx;
    if (Math.abs(determinant) > 0.0001) return { x: (dx * vy - dy * vx) / determinant, y: (ux * dy - uy * dx) / determinant };
  }
  const rect = frame.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}

function BoardLayerView({ layer, garment, stageRef, selected, warpMode, onSelect, onLayerChange, onInteractionStart }: {
  layer: BoardLayer;
  garment: Garment;
  stageRef: React.RefObject<HTMLDivElement | null>;
  selected: boolean;
  warpMode: boolean;
  onSelect: () => void;
  onLayerChange: (layer: BoardLayer) => void;
  onInteractionStart: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [ready, setReady] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; layer: BoardLayer } | null>(null);

  useEffect(() => {
    if (typeof garment.image === "string") { setReady(false); setImageUrl(garment.image); return undefined; }
    const url = URL.createObjectURL(garment.image);
    setReady(false); setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [garment.image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready || !warpMode || !selected) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const target = (layer.warp ?? DEFAULT_WARP_POINTS).map(toCanvasPoint);
    paintTriangle(context, image, [{ x: 0, y: 0 }, { x: image.naturalWidth, y: 0 }, { x: image.naturalWidth, y: image.naturalHeight }], [target[0], target[1], target[2]]);
    paintTriangle(context, image, [{ x: 0, y: 0 }, { x: image.naturalWidth, y: image.naturalHeight }, { x: 0, y: image.naturalHeight }], [target[0], target[2], target[3]]);
  }, [layer.warp, ready, selected, warpMode]);

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button") || layer.locked || (warpMode && selected)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    onInteractionStart();
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, layer };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const action = drag.current;
    const stage = stageRef.current;
    if (!action || action.pointerId !== event.pointerId || !stage) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    onLayerChange({ ...action.layer, x: clamp(action.layer.x + ((event.clientX - action.x) / rect.width) * 100, -10, 110), y: clamp(action.layer.y + ((event.clientY - action.y) / rect.height) * 100, -10, 110) });
  };
  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) { event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null; }
  };
  const movePoint = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    const point = resolvePoint(frame, event);
    const warp = (layer.warp ?? DEFAULT_WARP_POINTS).map((current, pointIndex) => pointIndex === index ? { x: clampPoint(point.x), y: clampPoint(point.y) } : current);
    onLayerChange({ ...layer, warp });
  };
  const style: CSSProperties = { left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, zIndex: layer.zIndex, opacity: layer.opacity / 100, transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)` };
  const points = layer.warp ?? DEFAULT_WARP_POINTS;
  const showWarp = selected && warpMode && !layer.locked;

  return <div ref={frameRef} style={{ ...style, touchAction: layer.locked ? "pan-y" : "none" }} className={`absolute overflow-visible ${layer.locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={`Слой ${garment.name}`}>
    {selected && <span className={`pointer-events-none absolute inset-[-8px] border ${showWarp ? "border-[#28614e] border-dashed" : "border-[#28614e]/70"}`} />}
    {imageUrl && <img ref={imageRef} src={imageUrl} alt={garment.name} draggable={false} onLoad={() => setReady(true)} className={`pointer-events-none absolute inset-0 h-full w-full select-none object-fill ${showWarp ? "opacity-0" : ""}`} />}
    {showWarp && <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="pointer-events-none absolute h-[170%] w-[170%] max-w-none" style={{ left: "-35%", top: "-35%" }} />}
    {showWarp && points.map((point, index) => <button type="button" key={`${layer.id}-${index}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onInteractionStart(); event.currentTarget.setPointerCapture(event.pointerId); movePoint(index, event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.preventDefault(); movePoint(index, event); } }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} className="warp-point absolute z-20 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-[#28614e] shadow-[0_3px_10px_rgba(30,37,34,0.28)]" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, touchAction: "none" }} aria-label={`Контрольная точка ${index + 1} слоя ${garment.name}`}><span className="h-1.5 w-1.5 rounded-full bg-white" /></button>)}
  </div>;
}

export default function FlatStackStage({ layers, garments, selectedLayerId, warpMode, guide, zoom, theme, onSelect, onLayerChange, onInteractionStart, onZoomChange, onGuideChange }: FlatStackStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const activeLayers = layers.filter((layer) => layer.visible).sort((a, b) => a.zIndex - b.zIndex);
  const isDark = theme === "dark";
  const changeZoom = (delta: number) => onZoomChange(clampZoom(Number((zoom + delta).toFixed(2))));
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); changeZoom(event.deltaY > 0 ? -0.08 : 0.08); };
  const guideOptions: Array<{ value: LookboardGuide; icon: typeof Grid3X3; label: string }> = [{ value: "grid", icon: Grid3X3, label: "Сетка" }, { value: "quiet", icon: Focus, label: "Чистое полотно" }, { value: "measure", icon: Ruler, label: "Линейки" }];

  return <div ref={stageRef} className={`flat-stack-stage lookboard-stage relative h-full w-full overflow-hidden ${isDark ? "bg-[#101713]" : "bg-[#efede7]"}`} style={{ touchAction: "pan-y" }} data-guide={guide} aria-label="2D-доска образа" onWheel={handleWheel} onPointerDown={() => onSelect(undefined)}>
    <div className="absolute right-5 top-5 z-40 flex items-center gap-1 rounded-full border border-current/15 bg-background/85 p-1 shadow-sm backdrop-blur-sm">
      <button type="button" onClick={() => changeZoom(-0.12)} className="grid h-8 w-8 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-accent" aria-label="Уменьшить масштаб"><Minus className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => onZoomChange(1)} className="min-w-14 px-1 font-mono text-[10px] font-medium tracking-[0.06em] text-foreground/75" aria-label="Сбросить масштаб">{Math.round(zoom * 100)}%</button>
      <button type="button" onClick={() => changeZoom(0.12)} className="grid h-8 w-8 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-accent" aria-label="Увеличить масштаб"><Plus className="h-3.5 w-3.5" /></button>
    </div>
    <div className="absolute left-5 top-5 z-40 flex items-center border border-current/10 bg-background/70 p-1 backdrop-blur-sm">{guideOptions.map(({ value, icon: Icon, label }) => <button key={value} type="button" onClick={(event) => { event.stopPropagation(); onGuideChange(value); }} className={`grid h-7 w-7 place-items-center transition-colors ${guide === value ? "bg-[#28614e] text-white" : "text-foreground/55 hover:bg-accent"}`} aria-label={label} aria-pressed={guide === value}><Icon className="h-3.5 w-3.5" /></button>)}</div>
    <div className="pointer-events-none absolute bottom-5 left-5 z-40 flex items-center gap-2 border border-current/10 bg-background/70 px-2 py-1 font-mono text-[9px] tracking-[0.05em] text-foreground/60 backdrop-blur-sm"><RotateCcw className="h-3 w-3" /> КОЛЕСО · МАСШТАБ</div>
    <div data-lookboard-viewport className="flat-viewport absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: "50% 50%" }}>
      <div className="flat-grid pointer-events-none absolute inset-0" />
      <div className="lookboard-guides pointer-events-none absolute inset-[9%]" />
      <span className={`absolute left-7 top-7 font-mono text-[10px] tracking-[0.15em] ${isDark ? "text-[#aebbb1]" : "text-[#6e786f]"}`}>FITTA / BOARD</span>
      <span className={`absolute bottom-7 right-7 font-mono text-[10px] tracking-[0.15em] ${isDark ? "text-[#aebbb1]" : "text-[#6e786f]"}`}>{layers.length.toString().padStart(2, "0")} LAYERS</span>
      {!layers.length && <div className="absolute inset-0 grid place-items-center text-center"><div><span className={`mx-auto mb-3 block h-12 w-12 border border-dashed ${isDark ? "border-[#7aa48a]/55" : "border-[#28614e]/45"}`} /><p className={`text-base font-bold ${isDark ? "text-[#edf2ee]" : "text-[#4d594f]"}`}>Начни с любой вещи</p><p className={`mt-1 text-xs ${isDark ? "text-[#aebbb1]" : "text-[#778177]"}`}>Добавляй, дублируй и собирай слои прямо на доске.</p></div></div>}
      {activeLayers.map((layer) => { const garment = garments.find((item) => item.id === layer.garmentId); return garment ? <BoardLayerView key={layer.id} layer={layer} garment={garment} stageRef={stageRef} selected={selectedLayerId === layer.id} warpMode={warpMode} onSelect={() => onSelect(layer.id)} onLayerChange={onLayerChange} onInteractionStart={onInteractionStart} /> : null; })}
    </div>
  </div>;
}
