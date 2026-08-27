/**
 * Style: «Тихий ателье» — локальная ручная подгонка вещи по четырём контрольным точкам, без внешних сервисов.
 */
import { useEffect, useRef, type PointerEvent } from "react";
import type { WarpPoint } from "@/lib/wardrobe";

interface WarpedGarmentProps {
  image: string | Blob;
  name: string;
  points: WarpPoint[];
  editable: boolean;
  onChange: (points: WarpPoint[]) => void;
}

const CANVAS_SIZE = 1000;
const CANVAS_MARGIN = 0.35;
const CANVAS_SPAN = 1 + CANVAS_MARGIN * 2;

const clamp = (value: number) => Math.min(1.35, Math.max(-0.35, value));

function toCanvasPoint(point: WarpPoint) {
  return {
    x: ((point.x + CANVAS_MARGIN) / CANVAS_SPAN) * CANVAS_SIZE,
    y: ((point.y + CANVAS_MARGIN) / CANVAS_SPAN) * CANVAS_SIZE,
  };
}

function getAffineTransform(
  source: { x: number; y: number }[],
  target: { x: number; y: number }[],
) {
  const [s0, s1, s2] = source;
  const [t0, t1, t2] = target;
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  const solve = (v0: number, v1: number, v2: number) => ({
    a: (v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / denominator,
    b: (v0 * (s2.x - s1.x) + v1 * (s0.x - s2.x) + v2 * (s1.x - s0.x)) / denominator,
    c: (v0 * (s1.x * s2.y - s2.x * s1.y) + v1 * (s2.x * s0.y - s0.x * s2.y) + v2 * (s0.x * s1.y - s1.x * s0.y)) / denominator,
  });
  const x = solve(t0.x, t1.x, t2.x);
  const y = solve(t0.y, t1.y, t2.y);
  return { a: x.a, b: y.a, c: x.b, d: y.b, e: x.c, f: y.c };
}

function paintTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: { x: number; y: number }[],
  target: { x: number; y: number }[],
) {
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

export default function WarpedGarment({ image, name, points, editable, onChange }: WarpedGarmentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const sourceImage = new Image();
    const source = typeof image === "string" ? image : URL.createObjectURL(image);
    sourceImage.onload = () => {
      context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      const target = points.map(toCanvasPoint);
      const w = sourceImage.naturalWidth;
      const h = sourceImage.naturalHeight;
      paintTriangle(context, sourceImage, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }], [target[0], target[1], target[2]]);
      paintTriangle(context, sourceImage, [{ x: 0, y: 0 }, { x: w, y: h }, { x: 0, y: h }], [target[0], target[2], target[3]]);
    };
    sourceImage.src = source;
    return () => {
      sourceImage.onload = null;
      if (typeof image !== "string") URL.revokeObjectURL(source);
    };
  }, [image, points]);

  const movePoint = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const nextPoints = points.map((point, pointIndex) =>
      pointIndex === index
        ? { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }
        : point,
    );
    onChange(nextPoints);
  };

  const startDrag = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    movePoint(index, event);
  };

  return (
    <div ref={frameRef} className="relative h-full w-full overflow-visible" aria-label={`Слой ${name}`}>
      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="pointer-events-none absolute h-[170%] w-[170%] max-w-none" style={{ left: "-35%", top: "-35%" }} />
      {editable && points.map((point, index) => (
        <button
          type="button"
          key={`${name}-${index}`}
          onPointerDown={(event) => startDrag(index, event)}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && movePoint(index, event)}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          className="warp-point absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#28614e] shadow-[0_2px_7px_rgba(30,37,34,0.28)]"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          aria-label={`Контрольная точка ${index + 1} слоя ${name}`}
        >
          <span className="absolute inset-[5px] rounded-full bg-white" />
        </button>
      ))}
      {editable && <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#28614e] px-2 py-1 font-mono text-[8px] font-medium tracking-[0.08em] text-white shadow-sm">ТЯНИ ТОЧКИ</span>}
    </div>
  );
}
