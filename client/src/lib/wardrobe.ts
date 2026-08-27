/**
 * Style: «Тихий ателье» — приватная рабочая поверхность, где одежда и модели остаются в IndexedDB.
 * Данные намеренно разделены по ключам, а записи сериализуются, чтобы Firefox не получил гонку транзакций.
 */
import { nanoid } from "nanoid";

export const WARDROBE_STORAGE_KEY = "garments";
export const LOOKS_STORAGE_KEY = "looks";
export const WORKSPACE_STORAGE_KEY = "lookboard-workspace-v1";
export const DEFAULTS_SEEDED_STORAGE_KEY = "defaults-seeded-v2";
const LEGACY_WARDROBE_STORAGE_KEY = "wardrobe-tryon:garments";
const LEGACY_LOOKS_STORAGE_KEY = "wardrobe-tryon:looks";
const DATABASE_NAME = "fitta-local-wardrobe";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const pendingWrites = new Map<string, Promise<void>>();

export type GarmentCategory = "top" | "bottom" | "outerwear" | "shoes" | "accessory";

export interface WarpPoint { x: number; y: number; }
export interface GarmentOffset { x: number; y: number; }

export const DEFAULT_WARP_POINTS: WarpPoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export interface Garment {
  id: string;
  name: string;
  category: GarmentCategory;
  image: string | Blob;
  fit?: { width: number; height: number };
  offset?: GarmentOffset;
  warp?: WarpPoint[];
  favorite?: boolean;
  isDefault?: boolean;
  createdAt: string;
}

export interface LookPreset {
  id: string;
  name: string;
  garmentIds: string[];
  createdAt: string;
  isDefault?: boolean;
  layers?: BoardLayer[];
  board?: Pick<LookboardWorkspace, "zoom" | "guide">;
}

export interface BoardLayer {
  id: string;
  garmentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  warp: WarpPoint[];
}

export type LookboardGuide = "grid" | "quiet" | "measure";

export interface LookboardWorkspace {
  layers: BoardLayer[];
  selectedLayerId?: string;
  zoom: number;
  guide: LookboardGuide;
}

export const categoryMeta: Record<GarmentCategory, { label: string; short: string; color: string; dot: string }> = {
  top: { label: "Верх", short: "ВЕРХ", color: "bg-[#dfe8e1] text-[#255642]", dot: "bg-[#28614e]" },
  bottom: { label: "Низ", short: "НИЗ", color: "bg-[#e8e4dd] text-[#59504a]", dot: "bg-[#76685d]" },
  outerwear: { label: "Верхняя одежда", short: "СЛОЙ", color: "bg-[#e0e4e4] text-[#3d4d50]", dot: "bg-[#50676a]" },
  shoes: { label: "Обувь", short: "ОБУВЬ", color: "bg-[#e7e2d8] text-[#5e554c]", dot: "bg-[#725b47]" },
  accessory: { label: "Аксессуар", short: "ДЕТАЛЬ", color: "bg-[#e9e7dc] text-[#5f6046]", dot: "bg-[#6c7250]" },
};

export const categoryOrder: GarmentCategory[] = ["top", "bottom", "outerwear", "shoes", "accessory"];

export const defaultPlacement: Record<GarmentCategory, Pick<BoardLayer, "x" | "y" | "width" | "height">> = {
  top: { x: 50, y: 42, width: 58, height: 48 },
  bottom: { x: 51, y: 66, width: 48, height: 55 },
  outerwear: { x: 49, y: 42, width: 66, height: 55 },
  shoes: { x: 50, y: 81, width: 58, height: 20 },
  accessory: { x: 52, y: 17, width: 20, height: 19 },
};

export function makeBoardLayer(garment: Garment, zIndex = 10): BoardLayer {
  return {
    id: nanoid(10),
    garmentId: garment.id,
    ...defaultPlacement[garment.category],
    rotation: 0,
    opacity: 100,
    zIndex,
    visible: true,
    locked: false,
    warp: (garment.warp ?? DEFAULT_WARP_POINTS).map((point) => ({ ...point })),
  };
}

export function makeLayersFromGarmentIds(garmentIds: string[], garments: Garment[]): BoardLayer[] {
  return garmentIds
    .map((garmentId, index) => {
      const garment = garments.find((item) => item.id === garmentId);
      return garment ? makeBoardLayer(garment, 10 + index) : undefined;
    })
    .filter((layer): layer is BoardLayer => Boolean(layer));
}

const svgAsset = (content: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;

export const DEFAULT_GARMENT_DEFINITIONS: Array<Pick<Garment, "name" | "category" | "image">> = [
  { name: "Молочная футболка · пример", category: "top", image: svgAsset(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="t" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#fffdf4"/><stop offset="1" stop-color="#d9ddd5"/></linearGradient></defs><path fill="url(#t)" d="M205 125 120 175 62 270l78 57 45-52v205h230V275l45 52 78-57-58-95-85-50-43 31h-44z"/><path fill="none" stroke="#c9cec5" stroke-width="8" d="M245 130q55 42 110 0"/></svg>`) },
  { name: "Графитовые брюки · пример", category: "bottom", image: svgAsset(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="p" x1="0" x2="1"><stop stop-color="#232b2b"/><stop offset="1" stop-color="#4a5150"/></linearGradient></defs><path fill="url(#p)" d="M160 74h280l28 174-36 278H295l-17-220-18 220H168l-35-278z"/><path fill="none" stroke="#767c79" stroke-width="7" d="M300 80v226M177 106h246"/></svg>`) },
  { name: "Оливковый бомбер · пример", category: "outerwear", image: svgAsset(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="b" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#60775d"/><stop offset="1" stop-color="#24392d"/></linearGradient></defs><path fill="url(#b)" d="M205 108 120 155 54 300l91 52 38-71v208h234V281l38 71 91-52-66-145-85-47-48 36h-74z"/><path fill="none" stroke="#b0bfad" stroke-opacity=".45" stroke-width="9" d="M300 120v369M172 459h256M238 108h124"/></svg>`) },
  { name: "Светлые кеды · пример", category: "shoes", image: svgAsset(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="s" x1="0" x2="1"><stop stop-color="#fffdf8"/><stop offset="1" stop-color="#cbd2ce"/></linearGradient></defs><path fill="url(#s)" stroke="#b5beb9" stroke-width="7" d="M70 335q76 7 150 68l108 78q18 15-5 45H74q-34-7-27-47zM280 335q76 7 150 68l108 78q18 15-5 45H284q-34-7-27-47z"/><path stroke="#87928e" stroke-width="8" d="M120 391h116M330 391h116"/></svg>`) },
  { name: "Терракотовая шапка · пример", category: "accessory", image: svgAsset(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="h" x1="0" x2="1"><stop stop-color="#c85b3e"/><stop offset="1" stop-color="#7f2f27"/></linearGradient></defs><path fill="url(#h)" d="M128 430V245Q135 87 300 70q165 17 172 175v185z"/><path fill="#9a3c31" d="M112 405h376v95H112z"/><path fill="none" stroke="#e38c69" stroke-opacity=".55" stroke-width="9" d="M177 145v253M236 110v288M300 94v304M364 110v288M423 145v253"/></svg>`) },
];

export function makeGarment(file: File, category: GarmentCategory): Garment {
  const withoutExtension = file.name.replace(/\.[^/.]+$/, "");
  return {
    id: nanoid(10),
    name: withoutExtension || "Новая вещь",
    category,
    image: file,
    fit: { width: 100, height: 100 },
    offset: { x: 0, y: 0 },
    warp: DEFAULT_WARP_POINTS.map((point) => ({ ...point })),
    createdAt: new Date().toISOString(),
  };
}

export function makeDefaultGarments(now = new Date().toISOString()): Garment[] {
  return DEFAULT_GARMENT_DEFINITIONS.map((definition) => ({
    ...definition,
    id: nanoid(10),
    fit: { width: 100, height: 100 },
    offset: { x: 0, y: 0 },
    warp: DEFAULT_WARP_POINTS.map((point) => ({ ...point })),
    isDefault: true,
    createdAt: now,
  }));
}

function repairLegacyGarments(value: Garment[]): Garment[] {
  return value.map((garment) => {
    if (typeof garment.image !== "string" || !garment.image.startsWith("/manus-storage/")) return garment;
    const replacement = DEFAULT_GARMENT_DEFINITIONS.find((definition) => definition.category === garment.category)?.image;
    return replacement ? { ...garment, image: replacement, isDefault: true } : garment;
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB недоступен в этом контексте браузера."));
      return;
    }
    let settled = false;
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("Браузер отклонил IndexedDB."));
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error("IndexedDB заблокирован другой вкладкой Fitta."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      if (settled) return;
      settled = true;
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function readFromDatabase<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    let value: T | undefined;
    const transaction = database.transaction(STORE_NAME, "readonly");
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("Чтение IndexedDB отменено.")); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Ошибка чтения IndexedDB.")); };
    transaction.oncomplete = () => { database.close(); resolve(value); };
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onerror = () => reject(request.error ?? new Error("Ошибка чтения записи IndexedDB."));
    request.onsuccess = () => { value = request.result as T | undefined; };
  });
}

async function writeToDatabase<T>(key: string, value: T): Promise<void> {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("Запись IndexedDB отменена.")); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Ошибка записи IndexedDB.")); };
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.objectStore(STORE_NAME).put(value, key);
  });
}

async function deleteFromDatabase(key: string): Promise<void> {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Ошибка удаления IndexedDB.")); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("Удаление IndexedDB отменено.")); };
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.objectStore(STORE_NAME).delete(key);
  });
}

export async function probeStorage(): Promise<boolean> {
  if (typeof window === "undefined" || !window.indexedDB) return false;
  const key = "__fitta_storage_probe__";
  try {
    await writeToDatabase(key, { checkedAt: Date.now() });
    await deleteFromDatabase(key);
    return true;
  } catch {
    return false;
  }
}

function legacyKeyFor(key: string) {
  return key === WARDROBE_STORAGE_KEY ? LEGACY_WARDROBE_STORAGE_KEY : LEGACY_LOOKS_STORAGE_KEY;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось подготовить Blob."));
    reader.readAsDataURL(blob);
  });
}

async function toFallbackValue<T>(key: string, value: T): Promise<T> {
  if (key !== WARDROBE_STORAGE_KEY || !Array.isArray(value)) return value;
  const garments = await Promise.all((value as Garment[]).map(async (garment) => {
    const image = garment.image;
    if (typeof image === "string") return { ...garment, image };
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Не удалось подготовить резервную копию изображения."));
      reader.readAsDataURL(image);
    });
    return { ...garment, image: dataUrl };
  }));
  return garments as T;
}

async function readFallback<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKeyFor(key));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (key === WARDROBE_STORAGE_KEY && Array.isArray(parsed)) {
      return repairLegacyGarments(parsed as Garment[]) as T;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export async function loadFromStorage<T>(key: string, fallback: T): Promise<T> {
  if (typeof window !== "undefined" && window.indexedDB) {
    try {
      const existing = await readFromDatabase<T>(key);
      if (existing !== undefined) {
        if (key === WARDROBE_STORAGE_KEY && Array.isArray(existing)) {
          const repaired = repairLegacyGarments(existing as Garment[]);
          const changed = repaired.some((garment, index) => garment.image !== (existing as Garment[])[index]?.image);
          if (changed) await writeToDatabase(key, repaired as T);
          return repaired as T;
        }
        return existing;
      }
      const legacy = window.localStorage.getItem(legacyKeyFor(key));
      if (legacy) {
        const migrated = JSON.parse(legacy) as T;
        const repaired = key === WARDROBE_STORAGE_KEY && Array.isArray(migrated)
          ? repairLegacyGarments(migrated as Garment[]) as T
          : migrated;
        await writeToDatabase(key, repaired);
        return repaired;
      }
    } catch {
      // Firefox private mode and hardened profiles can reject IndexedDB. Use the local fallback below.
    }
  }
  return readFallback(key, fallback);
}

async function writeFallback<T>(key: string, value: T): Promise<boolean> {
  try {
    const fallbackValue = await toFallbackValue(key, value);
    window.localStorage.setItem(key, JSON.stringify(fallbackValue));
    return true;
  } catch {
    return false;
  }
}

export async function saveToStorage<T>(key: string, value: T): Promise<boolean> {
  const previousWrite = pendingWrites.get(key) ?? Promise.resolve();
  const nextWrite = previousWrite.catch(() => undefined).then(async () => {
    try {
      await writeToDatabase(key, value);
    } catch {
      if (!(await writeFallback(key, value))) throw new Error("Ни IndexedDB, ни резервное локальное хранилище недоступны.");
    }
  });
  pendingWrites.set(key, nextWrite);
  try {
    await nextWrite;
    return true;
  } catch {
    return false;
  } finally {
    if (pendingWrites.get(key) === nextWrite) pendingWrites.delete(key);
  }
}
