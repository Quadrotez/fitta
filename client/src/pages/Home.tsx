/**
 * Style: «Тихий ателье» — асимметричная личная примерочная, спокойная палитра, швейные метки.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Download,
  FileUp,
  FolderArchive,
  Layers3,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Shirt,
  SlidersHorizontal,
  Moon,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import TryOnStage from "@/components/TryOnStage";
import FlatStackStage from "@/components/FlatStackStage";
import GarmentPreview from "@/components/GarmentPreview";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  categoryMeta,
  categoryOrder,
  loadFromStorage,
  LOOKS_STORAGE_KEY,
  makeGarment,
  saveToStorage,
  WARDROBE_STORAGE_KEY,
  type Garment,
  type GarmentCategory,
  type GarmentOffset,
  type LookPreset,
  type WarpPoint,
} from "@/lib/wardrobe";

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(
    new Date(date),
  );

const imageToDataUrl = (image: string | Blob) => {
  if (typeof image === "string") return Promise.resolve(image);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось подготовить изображение для экспорта."));
    reader.readAsDataURL(image);
  });
};

const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

type LookExport = {
  format: "fitta-look";
  version: 1;
  exportedAt: string;
  look: Pick<LookPreset, "name" | "createdAt">;
  garments: Array<Omit<Garment, "id" | "image"> & { image: string }>;
};

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [garments, setGarments] = useState<Garment[]>([]);
  const [looks, setLooks] = useState<LookPreset[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<GarmentCategory>("top");
  const [selectedIds, setSelectedIds] = useState<Partial<Record<GarmentCategory, string>>>({});
  const [bodyMode, setBodyMode] = useState<"standard" | "slim" | "curvy">("standard");
  const [viewMode, setViewMode] = useState<"mannequin" | "flat">("mannequin");
  const [isEditing, setIsEditing] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    void Promise.all([
      loadFromStorage<Garment[]>(WARDROBE_STORAGE_KEY, []),
      loadFromStorage<LookPreset[]>(LOOKS_STORAGE_KEY, []),
    ])
      .then(([storedGarments, storedLooks]) => {
        if (!isMounted) return;
        setGarments(storedGarments);
        setLooks(storedLooks);
      })
      .finally(() => {
        if (isMounted) setIsStorageReady(true);
      });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === stageFrameRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const activeGarments = useMemo(() => {
    return Object.fromEntries(
      Object.entries(selectedIds)
        .map(([category, id]) => [
          category,
          garments.find((garment) => garment.id === id),
        ])
        .filter(([, garment]) => Boolean(garment)),
    ) as Partial<Record<GarmentCategory, Garment>>;
  }, [garments, selectedIds]);

  const currentGarments = garments.filter(
    (garment) => garment.category === selectedCategory,
  );
  const selectedCount = Object.keys(activeGarments).length;
  const fittingGarment = activeGarments[selectedCategory];

  const persistGarments = async (nextGarments: Garment[]) => {
    if (!(await saveToStorage(WARDROBE_STORAGE_KEY, nextGarments))) {
      toast.error("Не удалось сохранить библиотеку в IndexedDB. Проверь настройки хранилища браузера.");
      return false;
    }
    setGarments(nextGarments);
    return true;
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Нужен файл изображения: PNG, JPG или WEBP.");
      return;
    }
    if (file.size > 12_000_000) {
      toast.error("Выбери изображение до 12 МБ, чтобы редактор работал без тормозов.");
      return;
    }

    if (!isStorageReady) return;
    setIsLoading(true);
    try {
      const newGarment = makeGarment(file, selectedCategory);
      const nextGarments = [newGarment, ...garments];
      if (await persistGarments(nextGarments)) {
        setSelectedIds((current) => ({ ...current, [selectedCategory]: newGarment.id }));
        toast.success("Вещь добавлена в локальный гардероб.");
      }
    } catch {
      toast.error("Не удалось добавить изображение. Попробуй другой файл.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectGarment = (garment: Garment) => {
    setSelectedIds((current) => ({ ...current, [garment.category]: garment.id }));
    setSelectedCategory(garment.category);
  };

  const removeGarment = async (garment: Garment) => {
    const nextGarments = garments.filter((item) => item.id !== garment.id);
    if (await persistGarments(nextGarments)) {
      setSelectedIds((current) => {
        const next = { ...current };
        if (next[garment.category] === garment.id) delete next[garment.category];
        return next;
      });
      toast.success("Вещь удалена из этого браузера.");
    }
  };

  const saveLook = async () => {
    const garmentIds = Object.values(selectedIds).filter(Boolean) as string[];
    if (!garmentIds.length) {
      toast.error("Сначала выбери хотя бы одну вещь.");
      return;
    }
    const look: LookPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim() || `Образ · ${formatDate(new Date().toISOString())}`,
      garmentIds,
      createdAt: new Date().toISOString(),
    };
    const nextLooks = [look, ...looks].slice(0, 12);
    if (!(await saveToStorage(LOOKS_STORAGE_KEY, nextLooks))) {
      toast.error("Не удалось сохранить образ в IndexedDB.");
      return;
    }
    setLooks(nextLooks);
    setPresetName("");
    toast.success("Образ сохранён локально.");
  };

  const openLook = (look: LookPreset) => {
    const nextSelection: Partial<Record<GarmentCategory, string>> = {};
    look.garmentIds.forEach((id) => {
      const garment = garments.find((item) => item.id === id);
      if (garment) nextSelection[garment.category] = garment.id;
    });
    setSelectedIds(nextSelection);
    toast.success(`Открыт образ «${look.name}».`);
  };

  const deleteLook = async (id: string) => {
    const nextLooks = looks.filter((look) => look.id !== id);
    if (await saveToStorage(LOOKS_STORAGE_KEY, nextLooks)) {
      setLooks(nextLooks);
    }
  };

  const exportLook = async (look: Pick<LookPreset, "name" | "createdAt" | "garmentIds">) => {
    const items = look.garmentIds.map((id) => garments.find((garment) => garment.id === id)).filter((garment): garment is Garment => Boolean(garment));
    if (!items.length) {
      toast.error("В этом образе нет доступных вещей для экспорта.");
      return;
    }
    try {
      const payload: LookExport = {
        format: "fitta-look",
        version: 1,
        exportedAt: new Date().toISOString(),
        look: { name: look.name, createdAt: look.createdAt },
        garments: await Promise.all(items.map(async ({ id: _id, image, ...garment }) => ({ ...garment, image: await imageToDataUrl(image) }))),
      };
      const file = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${look.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "") || "fitta-look"}.fitta.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Файл образа скачан.");
    } catch {
      toast.error("Не удалось подготовить файл образа.");
    }
  };

  const exportCurrentLook = () => {
    const garmentIds = Object.values(selectedIds).filter(Boolean) as string[];
    void exportLook({ name: presetName.trim() || "Мой образ", createdAt: new Date().toISOString(), garmentIds });
  };

  const importLook = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as LookExport;
      if (payload.format !== "fitta-look" || payload.version !== 1 || !Array.isArray(payload.garments) || !payload.garments.length) throw new Error("unsupported file");
      const imported = await Promise.all(payload.garments.map(async (garment) => ({ ...garment, id: crypto.randomUUID(), image: await dataUrlToBlob(garment.image), createdAt: new Date().toISOString() })));
      const nextGarments = [...imported, ...garments];
      const importedLook: LookPreset = { id: crypto.randomUUID(), name: payload.look?.name ? `${payload.look.name} · импорт` : "Импортированный образ", garmentIds: imported.map((garment) => garment.id), createdAt: new Date().toISOString() };
      const nextLooks = [importedLook, ...looks].slice(0, 12);
      const [garmentsSaved, looksSaved] = await Promise.all([saveToStorage(WARDROBE_STORAGE_KEY, nextGarments), saveToStorage(LOOKS_STORAGE_KEY, nextLooks)]);
      if (!garmentsSaved || !looksSaved) throw new Error("storage failure");
      setGarments(nextGarments);
      setLooks(nextLooks);
      setSelectedIds(Object.fromEntries(imported.map((garment) => [garment.category, garment.id])));
      toast.success("Образ импортирован в гардероб.");
    } catch {
      toast.error("Не удалось прочитать файл образа Fitta.");
    }
  };

  const resetScene = () => {
    setSceneKey((key) => key + 1);
    toast.message("Положение модели сброшено.");
  };

  const openPointEditor = () => {
    if (viewMode === "flat") {
      setIsEditing((editing) => !editing);
      return;
    }
    setViewMode("flat");
    setIsEditing(true);
    toast.message("Точная правка слоя открыта в 2D-режиме.");
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageFrameRef.current?.requestFullscreen();
    } catch {
      toast.error("Полноэкранный режим недоступен в этом браузере.");
    }
  };

  const updateFit = (axis: "width" | "height", value: number) => {
    if (!fittingGarment) return;
    const nextGarments = garments.map((garment) =>
      garment.id === fittingGarment.id
        ? {
            ...garment,
            fit: {
              width: garment.fit?.width ?? 100,
              height: garment.fit?.height ?? 100,
              [axis]: value,
            },
          }
        : garment,
    );
    setGarments(nextGarments);
    void saveToStorage(WARDROBE_STORAGE_KEY, nextGarments);
  };

  const resetFit = () => {
    if (!fittingGarment) return;
    const nextGarments = garments.map((garment) =>
      garment.id === fittingGarment.id
        ? { ...garment, fit: { width: 100, height: 100 } }
        : garment,
    );
    setGarments(nextGarments);
    void saveToStorage(WARDROBE_STORAGE_KEY, nextGarments);
    toast.message("Размер слоя возвращён к исходному.");
  };

  const updateWarp = (garmentId: string, warp: WarpPoint[]) => {
    const nextGarments = garments.map((garment) => garment.id === garmentId ? { ...garment, warp } : garment);
    setGarments(nextGarments);
    void saveToStorage(WARDROBE_STORAGE_KEY, nextGarments);
  };

  const updateOffset = (garmentId: string, offset: GarmentOffset) => {
    const nextGarments = garments.map((garment) => garment.id === garmentId ? { ...garment, offset } : garment);
    setGarments(nextGarments);
    void saveToStorage(WARDROBE_STORAGE_KEY, nextGarments);
  };

  return (
    <div className="atelier-shell min-h-screen bg-[#f6f4ef] text-[#1e2522]">
      <header className="flex min-h-[76px] items-center justify-between border-b border-[#d9d8d1] px-5 sm:px-8 lg:px-10">
        <a className="group flex items-center gap-3" href="/" aria-label="Fitta — главная">
          <img src="https://raw.githubusercontent.com/Quadrotez/fitta/master/branding/fitta-logo.png" alt="Логотип Fitta" className="h-12 w-12 rounded-full object-cover shadow-[0_4px_12px_rgba(30,37,34,0.12)] transition-transform duration-200 group-hover:-translate-y-0.5" />
          <span className="leading-none">
            <span className="block text-[19px] font-bold tracking-[-0.08em]">Fitta<span className="text-[#28614e]">/</span></span>
            <span className="mt-1 block font-mono text-[9px] font-medium tracking-[0.16em] text-[#777d77]">PRIVATE FITTING ROOM</span>
          </span>
        </a>

        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/80 text-[#445047] transition-colors hover:bg-white" aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"} title={theme === "light" ? "Тёмная тема" : "Светлая тема"}>
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="relative grid lg:min-h-[calc(100vh-76px)] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="relative z-10 border-b border-[#d9d8d1] bg-[#f8f7f3] lg:border-r lg:border-b-0">
          <div className="flex h-full flex-col px-5 py-6 sm:px-8 lg:px-6 xl:px-8">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="font-mono text-[10px] font-medium tracking-[0.13em] text-[#767b74]">01 — ГАРДЕРОБ</p>
                <h1 className="mt-1 text-[26px] font-bold tracking-[-0.055em]">Мои вещи</h1>
              </div>
              <span className="font-mono text-xs text-[#747a73]">{garments.length.toString().padStart(2, "0")}</span>
            </div>

            <div className="mb-5 grid grid-cols-5 gap-1.5" aria-label="Категории одежды">
              {categoryOrder.map((category) => {
                const isActive = category === selectedCategory;
                const count = garments.filter((item) => item.category === category).length;
                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`category-tab group relative flex min-h-16 flex-col items-center justify-center rounded-2xl border px-1 transition-all ${isActive ? "border-[#28614e] bg-[#eaf0eb] text-[#28614e]" : "border-[#e0dfd9] bg-[#fdfcf9] text-[#767b74] hover:border-[#b9c9bc] hover:text-[#28614e]"}`}
                    aria-pressed={isActive}
                    title={categoryMeta[category].label}
                  >
                    <span className={`mb-1 h-1.5 w-1.5 rounded-full ${isActive ? "bg-[#28614e]" : "bg-[#c1c6bf] group-hover:bg-[#28614e]"}`} />
                    <span className="font-mono text-[8px] font-medium tracking-[0.06em]">{categoryMeta[category].short}</span>
                    {count > 0 && <span className="absolute right-1.5 top-1.5 font-mono text-[8px]">{count}</span>}
                  </button>
                );
              })}
            </div>

            <label className={`upload-surface group mb-5 flex min-h-28 w-full flex-col justify-between rounded-[20px] border border-dashed border-[#abc0b0] bg-[#edf3ee] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#28614e] hover:bg-[#e7f0e9] ${isLoading ? "cursor-wait opacity-75" : "cursor-pointer"}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUpload}
                disabled={isLoading || !isStorageReady}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
                aria-label={`Добавить ${categoryMeta[selectedCategory].label.toLowerCase()} в гардероб`}
              />
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#28614e] text-white shadow-sm">
                {isLoading || !isStorageReady ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </span>
              <span>
                <span className="block text-sm font-semibold tracking-[-0.02em]">Добавить {categoryMeta[selectedCategory].label.toLowerCase()}</span>
                <span className="mt-0.5 block font-mono text-[9px] tracking-[0.04em] text-[#637367]">{isStorageReady ? "PNG, JPG, WEBP · ДО 12 МБ" : "ЗАГРУЖАЮ ЛОКАЛЬНЫЙ ГАРДЕРОБ"}</span>
              </span>
            </label>

            <div className="scrollbar-soft flex max-h-[310px] flex-col gap-2 overflow-y-auto pr-1">
              {currentGarments.length ? (
                currentGarments.map((garment) => {
                  const isSelected = selectedIds[garment.category] === garment.id;
                  return (
                    <div
                      key={garment.id}
                      className={`group flex items-center gap-3 rounded-2xl border p-2 transition-all ${isSelected ? "border-[#28614e] bg-white shadow-[0_5px_18px_rgba(30,37,34,0.06)]" : "border-transparent hover:border-[#ddded8] hover:bg-white/70"}`}
                    >
                      <button onClick={() => selectGarment(garment)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Выбрать ${garment.name}`}>
                        <span className="h-14 w-12 shrink-0 overflow-hidden rounded-xl bg-[#e8e7e1]">
                          <GarmentPreview image={garment.image} alt="" className="h-full w-full object-cover" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold tracking-[-0.015em]">{garment.name}</span>
                          <span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.07em] text-[#7b817b]">
                            <span className={`h-1.5 w-1.5 rounded-full ${categoryMeta[garment.category].dot}`} />
                            {formatDate(garment.createdAt).toUpperCase()}
                          </span>
                        </span>
                      </button>
                      <button onClick={() => removeGarment(garment)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#9a9e99] opacity-100 transition-all hover:bg-[#f4e8e5] hover:text-[#a94f40] lg:opacity-0 lg:group-hover:opacity-100" aria-label={`Удалить ${garment.name}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="flex min-h-28 flex-col justify-center rounded-2xl border border-[#e2e1db] bg-[#fbfaf7] px-4">
                  <p className="text-sm font-semibold tracking-[-0.02em]">Пока пусто</p>
                  <p className="mt-1 max-w-[230px] text-xs leading-5 text-[#727972]">Загрузи вещь на нейтральном фоне, чтобы увидеть её на модели.</p>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-[#dfded8] pt-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] font-medium tracking-[0.13em] text-[#767b74]">02 — ОБРАЗЫ</p>
                <div className="flex items-center gap-2">
                  <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importLook} disabled={!isStorageReady} className="hidden" aria-label="Импортировать образ Fitta" />
                  <button onClick={() => importInputRef.current?.click()} disabled={!isStorageReady} className="flex h-7 items-center gap-1 rounded-md px-1.5 font-mono text-[8px] font-medium tracking-[0.04em] text-[#556157] transition-colors hover:bg-[#eaf0eb] hover:text-[#28614e] disabled:cursor-not-allowed disabled:opacity-45" title="Импортировать образ"><FileUp className="h-3.5 w-3.5" /> ИМПОРТ</button>
                  <span className="font-mono text-[10px] text-[#767b74]">{looks.length}/12</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {looks.slice(0, 3).map((look) => (
                  <div key={look.id} className="group flex items-center rounded-xl px-2 py-2 hover:bg-white">
                    <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => openLook(look)}>
                      <FolderArchive className="h-4 w-4 shrink-0 text-[#28614e]" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{look.name}</span>
                        <span className="font-mono text-[8px] tracking-[0.08em] text-[#848983]">{look.garmentIds.length} ВЕЩ. · {formatDate(look.createdAt).toUpperCase()}</span>
                      </span>
                    </button>
                    <div className="flex items-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                      <button onClick={() => void exportLook(look)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#708276] hover:bg-[#eaf0eb] hover:text-[#28614e]" aria-label={`Экспортировать образ ${look.name}`}><Download className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteLook(look.id)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#9da19c] hover:bg-[#f4e8e5] hover:text-[#a94f40]" aria-label={`Удалить образ ${look.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
                {!looks.length && <p className="px-2 text-xs leading-5 text-[#7b817b]">Собери первый образ — он появится здесь.</p>}
              </div>
            </div>

          </div>
        </aside>

        <section className="relative min-h-[670px] overflow-hidden px-5 py-6 sm:px-8 sm:py-8 lg:px-9 xl:px-12">
          <div className="absolute bottom-0 right-0 top-0 hidden w-[39%] bg-[radial-gradient(circle_at_65%_35%,rgba(40,97,78,0.12),transparent_28%),linear-gradient(145deg,transparent_32%,rgba(40,97,78,0.05)_32%,rgba(40,97,78,0.05)_33%,transparent_33%)] lg:block" />
          <div className="absolute left-5 top-[170px] hidden origin-top-left -rotate-90 font-mono text-[9px] tracking-[0.17em] text-[#8c928c] xl:block">FORM_001 · FIT STUDY</div>
          <div className="relative z-10 mx-auto flex h-full max-w-[1180px] flex-col">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.13em] text-[#717871]">
                  <span className="h-px w-8 bg-[#28614e]" />
                  03 — ПРИМЕРКА
                </div>
                <h2 className="text-[clamp(28px,3vw,42px)] font-bold leading-none tracking-[-0.065em]">Сцена образа <span className="font-mono text-sm font-medium tracking-normal text-[#6f7870]">/ 01</span></h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <div className="flex rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/80 p-1">
                  <button onClick={() => setViewMode("mannequin")} className={`rounded-full px-3 py-1.5 font-mono text-[9px] font-medium tracking-[0.06em] transition-colors ${viewMode === "mannequin" ? "bg-[#28614e] text-white" : "text-[#6d766e] hover:text-[#28614e]"}`}>МАНЕКЕН</button>
                  <button onClick={() => setViewMode("flat")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 font-mono text-[9px] font-medium tracking-[0.06em] transition-colors ${viewMode === "flat" ? "bg-[#28614e] text-white" : "text-[#6d766e] hover:text-[#28614e]"}`}><Layers3 className="h-3 w-3" /> 2D</button>
                </div>
                <button onClick={openPointEditor} disabled={!fittingGarment} className={`flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors ${isEditing && viewMode === "flat" ? "border-[#28614e] bg-[#28614e] text-white" : "border-[#d5d7d1] bg-[#fbfaf7]/80 text-[#445047] hover:bg-white"} disabled:cursor-not-allowed disabled:opacity-45`} title={viewMode === "flat" ? "Редактировать активный слой" : "Открыть 2D-редактор контрольных точек"}>
                  <Pencil className="h-3.5 w-3.5" />
                  {viewMode === "flat" ? (isEditing ? "Готово" : "Править") : "Точки в 2D"}
                </button>
                {viewMode === "mannequin" && <Button onClick={resetScene} variant="outline" className="h-10 gap-2 rounded-full border-[#d5d7d1] bg-[#fbfaf7]/80 px-4 text-xs font-semibold text-[#445047] hover:bg-white">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Сбросить ракурс
                </Button>}
                <button onClick={() => void toggleFullscreen()} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/80 text-[#445047] transition-colors hover:bg-white" aria-label={isFullscreen ? "Закрыть полноэкранный режим" : "Развернуть сцену"} title={isFullscreen ? "Закрыть полноэкранный режим" : "Развернуть сцену"}>
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative grid flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_230px]">
              <div ref={stageFrameRef} className="canvas-frame relative min-h-[500px] overflow-hidden rounded-[16px] border border-[#cfd3cc] bg-[#f1efe9] shadow-[0_12px_28px_rgba(44,54,48,0.06)]">
                {isFullscreen && <button onClick={() => void toggleFullscreen()} className="absolute right-5 top-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/90 text-[#445047] shadow-sm backdrop-blur-sm" aria-label="Закрыть полноэкранный режим" title="Закрыть полноэкранный режим"><Minimize2 className="h-4 w-4" /></button>}
                {viewMode === "mannequin" ? <TryOnStage key={sceneKey} activeGarments={activeGarments} bodyMode={bodyMode} theme={theme} onOffsetChange={updateOffset} /> : <FlatStackStage key={sceneKey} activeGarments={activeGarments} editingGarmentId={isEditing ? fittingGarment?.id : undefined} theme={theme} onWarpChange={updateWarp} onOffsetChange={updateOffset} />}
              </div>

              <div className="flex flex-col gap-4">
                <div className="paper-tag rounded-[13px] border border-[#d8d8d1] bg-[#fbfaf7]/80 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#747b74]">МОДЕЛЬ</p>
                      <p className="mt-1 text-sm font-bold tracking-[-0.025em]">Базовый манекен</p>
                    </div>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf0eb] text-[#28614e]"><Shirt className="h-4 w-4" /></span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["standard", "slim", "curvy"] as const).map((mode) => (
                      <button key={mode} onClick={() => setBodyMode(mode)} className={`min-w-0 overflow-hidden whitespace-nowrap rounded-xl border px-1 py-2 font-mono text-[8px] font-medium tracking-[0.05em] transition-colors ${bodyMode === mode ? "border-[#28614e] bg-[#eaf0eb] text-[#28614e]" : "border-[#e3e3dc] bg-white text-[#747a73] hover:border-[#b9c9bc]"}`}>
                        {mode === "standard" ? "СТАНДАРТ" : mode === "slim" ? "СТРОЙНАЯ" : "ОБЪЁМНАЯ"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="paper-tag rounded-[13px] border border-[#d8d8d1] bg-[#fbfaf7]/80 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#747b74]">ПОДГОНКА СЛОЯ</p>
                      <p className="mt-1 truncate text-sm font-bold tracking-[-0.025em]">{fittingGarment?.name || "Выбери вещь"}</p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eaf0eb] text-[#28614e]"><SlidersHorizontal className="h-4 w-4" /></span>
                  </div>
                  {fittingGarment ? (
                    <div className="space-y-4">
                      <div>
                        <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-medium tracking-[0.09em] text-[#667067]">
                          <span>ШИРИНА</span>
                          <span className="text-[#28614e]">{fittingGarment.fit?.width ?? 100}%</span>
                        </div>
                        <Slider value={[fittingGarment.fit?.width ?? 100]} onValueChange={([value]) => updateFit("width", value)} min={60} max={170} step={1} aria-label="Растянуть одежду по ширине" />
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-medium tracking-[0.09em] text-[#667067]">
                          <span>ВЫСОТА</span>
                          <span className="text-[#28614e]">{fittingGarment.fit?.height ?? 100}%</span>
                        </div>
                        <Slider value={[fittingGarment.fit?.height ?? 100]} onValueChange={([value]) => updateFit("height", value)} min={60} max={170} step={1} aria-label="Растянуть одежду по высоте" />
                      </div>
                      <button onClick={resetFit} className="flex items-center gap-1.5 font-mono text-[9px] font-medium tracking-[0.07em] text-[#6d766e] transition-colors hover:text-[#28614e]">
                        <RotateCcw className="h-3 w-3" /> СБРОСИТЬ ПОДГОНКУ
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="paper-tag rounded-[13px] border border-[#d8d8d1] bg-[#fbfaf7]/80 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#747b74]">СЛОИ ОБРАЗА</p>
                    <span className="font-mono text-xs text-[#28614e]">{selectedCount.toString().padStart(2, "0")}</span>
                  </div>
                  <div className="space-y-2">
                    {categoryOrder.map((category) => {
                      const garment = activeGarments[category];
                      return (
                        <div key={category} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${garment ? "bg-white shadow-[0_2px_8px_rgba(39,50,43,0.03)]" : "opacity-55"}`}>
                          <button disabled={!garment} onClick={() => garment && selectGarment(garment)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default">
                            <span className={`h-2 w-2 rounded-full ${categoryMeta[category].dot}`} />
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{garment?.name || categoryMeta[category].label}</span>
                          </button>
                          {garment ? <button onClick={() => setSelectedIds((current) => { const next = { ...current }; delete next[category]; return next; })} className="rounded-md p-0.5 text-[#8c938d] hover:bg-[#f2e5e1] hover:text-[#a94f40]" aria-label={`Убрать ${garment.name} из образа`}><X className="h-3.5 w-3.5" /></button> : <Plus className="h-3.5 w-3.5 text-[#959a94]" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-[#d9d9d2] pt-5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e3ebe4] text-[#28614e]"><Archive className="h-4 w-4" /></span>
                <Input value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={38} placeholder="Название образа (необязательно)" className="h-10 border-0 bg-transparent px-0 text-sm font-semibold shadow-none placeholder:text-[#949992] focus-visible:ring-0" aria-label="Название сохраняемого образа" />
              </div>
              <Button onClick={exportCurrentLook} disabled={!selectedCount} variant="outline" className="h-11 rounded-full border-[#b5c6b8] bg-transparent px-4 text-xs font-bold text-[#28614e] hover:bg-[#eaf0eb] disabled:opacity-40"><Download className="mr-2 h-4 w-4" />Экспорт</Button>
              <Button onClick={saveLook} disabled={!isStorageReady} className="h-11 rounded-full bg-[#28614e] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(40,97,78,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#1f4f3f] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45">
                <Save className="mr-2 h-4 w-4" />
                Сохранить образ
              </Button>
            </div>

          </div>
        </section>
      </main>
    </div>
  );
}
