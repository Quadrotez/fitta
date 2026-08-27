/**
 * Style: «Тихий ателье» — приватный и спокойный интерфейс, где данные остаются в localStorage.
 */
import { nanoid } from "nanoid";

export const WARDROBE_STORAGE_KEY = "wardrobe-tryon:garments";
export const LOOKS_STORAGE_KEY = "wardrobe-tryon:looks";

export type GarmentCategory = "top" | "bottom" | "outerwear" | "shoes" | "accessory";

export interface Garment {
  id: string;
  name: string;
  category: GarmentCategory;
  image: string;
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

export function makeGarment(
  file: File,
  image: string,
  category: GarmentCategory,
): Garment {
  const withoutExtension = file.name.replace(/\.[^/.]+$/, "");
  return {
    id: nanoid(10),
    name: withoutExtension || "Новая вещь",
    category,
    image,
    createdAt: new Date().toISOString(),
  };
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

