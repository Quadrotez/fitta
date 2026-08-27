/**
 * Style: «Тихий ателье» — приватная рабочая поверхность, где одежда и модели остаются в IndexedDB.
 * Данные намеренно разделены по ключам, а записи сериализуются, чтобы Firefox не получил гонку транзакций.
 */
import { nanoid } from "nanoid";

export const WARDROBE_STORAGE_KEY = "garments";
export const LOOKS_STORAGE_KEY = "looks";
export const USER_MODEL_STORAGE_KEY = "mannequin-model";
export const DEFAULTS_SEEDED_STORAGE_KEY = "defaults-seeded-v2";
const LEGACY_WARDROBE_STORAGE_KEY = "wardrobe-tryon:garments";
const LEGACY_LOOKS_STORAGE_KEY = "wardrobe-tryon:looks";
const DATABASE_NAME = "fitta-local-wardrobe";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const pendingWrites = new Map<string, Promise<void>>();

export type GarmentCategory = "top" | "bottom" | "outerwear" | "shoes" | "accessory";
export type MannequinGender = "neutral" | "masculine" | "feminine";

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
  /** 0 = less wrap on the mannequin, 100 = follows the cylindrical surface. */
  curvature?: number;
  isDefault?: boolean;
  createdAt: string;
}

export interface LookPreset {
  id: string;
  name: string;
  garmentIds: string[];
  createdAt: string;
  isDefault?: boolean;
}

export interface UserModel {
  id: string;
  name: string;
  format: "glb" | "gltf" | "obj" | "fbx";
  file: Blob;
  createdAt: string;
}

export const categoryMeta: Record<GarmentCategory, { label: string; short: string; color: string; dot: string }> = {
  top: { label: "Верх", short: "ВЕРХ", color: "bg-[#dfe8e1] text-[#255642]", dot: "bg-[#28614e]" },
  bottom: { label: "Низ", short: "НИЗ", color: "bg-[#e8e4dd] text-[#59504a]", dot: "bg-[#76685d]" },
  outerwear: { label: "Верхняя одежда", short: "СЛОЙ", color: "bg-[#e0e4e4] text-[#3d4d50]", dot: "bg-[#50676a]" },
  shoes: { label: "Обувь", short: "ОБУВЬ", color: "bg-[#e7e2d8] text-[#5e554c]", dot: "bg-[#725b47]" },
  accessory: { label: "Аксессуар", short: "ДЕТАЛЬ", color: "bg-[#e9e7dc] text-[#5f6046]", dot: "bg-[#6c7250]" },
};

export const categoryOrder: GarmentCategory[] = ["top", "bottom", "outerwear", "shoes", "accessory"];

export const DEFAULT_GARMENT_DEFINITIONS: Array<Pick<Garment, "name" | "category" | "image">> = [
  { name: "Молочная футболка · пример", category: "top", image: "/manus-storage/fitta-default-top_239580a7.png" },
  { name: "Графитовые брюки · пример", category: "bottom", image: "/manus-storage/fitta-default-bottom_38b70388.png" },
  { name: "Оливковый бомбер · пример", category: "outerwear", image: "/manus-storage/fitta-default-outerwear_797d129a.png" },
  { name: "Светлые кеды · пример", category: "shoes", image: "/manus-storage/fitta-default-shoes_339df0e2.png" },
  { name: "Терракотовая шапка · пример", category: "accessory", image: "/manus-storage/fitta-default-accessory_a339d7ac.png" },
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
    curvature: 100,
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
    curvature: 100,
    warp: DEFAULT_WARP_POINTS.map((point) => ({ ...point })),
    isDefault: true,
    createdAt: now,
  }));
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
  if (key === USER_MODEL_STORAGE_KEY && value && typeof value === "object") {
    const model = value as unknown as UserModel;
    return { ...model, file: await blobToDataUrl(model.file) } as T;
  }
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
    if (key === USER_MODEL_STORAGE_KEY && parsed && typeof parsed === "object") {
      const model = parsed as unknown as UserModel & { file: string };
      const response = await fetch(model.file);
      return { ...model, file: await response.blob() } as T;
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
      if (existing !== undefined) return existing;
      const legacy = window.localStorage.getItem(legacyKeyFor(key));
      if (legacy) {
        const migrated = JSON.parse(legacy) as T;
        await writeToDatabase(key, migrated);
        return migrated;
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

export async function saveUserModel(model: UserModel | null): Promise<boolean> {
  if (model === null) {
    try { await deleteFromDatabase(USER_MODEL_STORAGE_KEY); return true; } catch { return false; }
  }
  return saveToStorage(USER_MODEL_STORAGE_KEY, model);
}

export function loadUserModel(): Promise<UserModel | undefined> {
  return loadFromStorage<UserModel | undefined>(USER_MODEL_STORAGE_KEY, undefined);
}
