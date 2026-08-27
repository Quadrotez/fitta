/**
 * Style: «Тихий ателье» — приватный и спокойный интерфейс, где данные остаются в IndexedDB браузера.
 */
import { nanoid } from "nanoid";

export const WARDROBE_STORAGE_KEY = "garments";
export const LOOKS_STORAGE_KEY = "looks";
const LEGACY_WARDROBE_STORAGE_KEY = "wardrobe-tryon:garments";
const LEGACY_LOOKS_STORAGE_KEY = "wardrobe-tryon:looks";
const DATABASE_NAME = "fitta-local-wardrobe";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";

export type GarmentCategory = "top" | "bottom" | "outerwear" | "shoes" | "accessory";

export interface WarpPoint {
  x: number;
  y: number;
}

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
  fit?: {
    width: number;
    height: number;
  };
  warp?: WarpPoint[];
  createdAt: string;
}

export interface LookPreset {
  id: string;
  name: string;
  garmentIds: string[];
  createdAt: string;
}

export const categoryMeta: Record<
  GarmentCategory,
  { label: string; short: string; color: string; dot: string }
> = {
  top: {
    label: "Верх",
    short: "ВЕРХ",
    color: "bg-[#dfe8e1] text-[#255642]",
    dot: "bg-[#28614e]",
  },
  bottom: {
    label: "Низ",
    short: "НИЗ",
    color: "bg-[#e8e4dd] text-[#59504a]",
    dot: "bg-[#76685d]",
  },
  outerwear: {
    label: "Верхняя одежда",
    short: "СЛОЙ",
    color: "bg-[#e0e4e4] text-[#3d4d50]",
    dot: "bg-[#50676a]",
  },
  shoes: {
    label: "Обувь",
    short: "ОБУВЬ",
    color: "bg-[#e7e2d8] text-[#5e554c]",
    dot: "bg-[#725b47]",
  },
  accessory: {
    label: "Аксессуар",
    short: "ДЕТАЛЬ",
    color: "bg-[#e9e7dc] text-[#5f6046]",
    dot: "bg-[#6c7250]",
  },
};

export const categoryOrder: GarmentCategory[] = [
  "top",
  "bottom",
  "outerwear",
  "shoes",
  "accessory",
];

export function makeGarment(file: File, category: GarmentCategory): Garment {
  const withoutExtension = file.name.replace(/\.[^/.]+$/, "");
  return {
    id: nanoid(10),
    name: withoutExtension || "Новая вещь",
    category,
    image: file,
    fit: { width: 100, height: 100 },
    warp: DEFAULT_WARP_POINTS,
    createdAt: new Date().toISOString(),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
  });
}

async function readFromDatabase<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T | undefined);
    transaction.oncomplete = () => database.close();
  });
}

async function writeToDatabase<T>(key: string, value: T): Promise<void> {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.objectStore(STORE_NAME).put(value, key);
  });
}

function legacyKeyFor(key: string) {
  return key === WARDROBE_STORAGE_KEY ? LEGACY_WARDROBE_STORAGE_KEY : LEGACY_LOOKS_STORAGE_KEY;
}

export async function loadFromStorage<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === "undefined" || !window.indexedDB) return fallback;
  try {
    const existing = await readFromDatabase<T>(key);
    if (existing !== undefined) return existing;
    const legacy = window.localStorage.getItem(legacyKeyFor(key));
    if (legacy) {
      const migrated = JSON.parse(legacy) as T;
      await writeToDatabase(key, migrated);
      return migrated;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export async function saveToStorage<T>(key: string, value: T): Promise<boolean> {
  try {
    await writeToDatabase(key, value);
    return true;
  } catch {
    return false;
  }
}
