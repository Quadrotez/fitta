/**
 * Style: «Тихий ателье» — асимметричная рабочая поверхность стилиста.
 * Сцена остаётся главным объектом, настройки появляются контекстно, а локальные данные
 * сохраняются без серверного аккаунта.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, Download, FileUp, FolderArchive, Layers3, Loader2, Maximize2, Minimize2,
  Pencil, Plus, RotateCcw, Save, Shirt, SlidersHorizontal, Moon, Sun, Trash2, Upload, X,
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
  categoryMeta, categoryOrder, DEFAULTS_SEEDED_STORAGE_KEY, loadFromStorage, loadUserModel,
  LOOKS_STORAGE_KEY, makeDefaultGarments, makeGarment, probeStorage, saveToStorage,
  saveUserModel, USER_MODEL_STORAGE_KEY, WARDROBE_STORAGE_KEY,
  type Garment, type GarmentCategory, type GarmentOffset, type LookPreset, type MannequinGender,
  type UserModel, type WarpPoint,
} from "@/lib/wardrobe";

const formatDate = (date: string) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(date));
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

type StorageState = "checking" | "ready" | "fallback";
const genderOptions: Array<{ value: MannequinGender; label: string }> = [
  { value: "neutral", label: "НЕЙТРАЛЬНЫЙ" },
  { value: "masculine", label: "МУЖСКОЙ" },
  { value: "feminine", label: "ЖЕНСКИЙ" },
];

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [garments, setGarments] = useState<Garment[]>([]);
  const [looks, setLooks] = useState<LookPreset[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<GarmentCategory>("top");
  const [selectedIds, setSelectedIds] = useState<Partial<Record<GarmentCategory, string>>>({});
  const [bodyGender, setBodyGender] = useState<MannequinGender>("neutral");
  const [bodyScale, setBodyScale] = useState({ width: 100, height: 100, depth: 100 });
  const [customModel, setCustomModel] = useState<UserModel>();
  const [viewMode, setViewMode] = useState<"mannequin" | "flat">("mannequin");
  const [isEditing, setIsEditing] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [storageState, setStorageState] = useState<StorageState>("checking");
  const [presetName, setPresetName] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const indexedDbWorks = await probeStorage();
      if (!mounted) return;
      setStorageState(indexedDbWorks ? "ready" : "fallback");
      const [storedGarments, storedLooks, seeded, storedModel] = await Promise.all([
        loadFromStorage<Garment[]>(WARDROBE_STORAGE_KEY, []),
        loadFromStorage<LookPreset[]>(LOOKS_STORAGE_KEY, []),
        loadFromStorage<boolean>(DEFAULTS_SEEDED_STORAGE_KEY, false),
        loadUserModel(),
      ]);
      if (!mounted) return;
      let nextGarments = storedGarments;
      let nextLooks = storedLooks;
      if (!seeded) {
        const defaults = makeDefaultGarments();
        nextGarments = [...defaults, ...storedGarments];
        const defaultLook: LookPreset = {
          id: crypto.randomUUID(),
          name: "Первый образ · пример",
          garmentIds: defaults.map((garment) => garment.id),
          createdAt: new Date().toISOString(),
          isDefault: true,
        };
        nextLooks = [defaultLook, ...storedLooks];
        await Promise.all([
          saveToStorage(WARDROBE_STORAGE_KEY, nextGarments),
          saveToStorage(LOOKS_STORAGE_KEY, nextLooks),
          saveToStorage(DEFAULTS_SEEDED_STORAGE_KEY, true),
        ]);
      }
      setGarments(nextGarments);
      setLooks(nextLooks);
      setCustomModel(storedModel);
      if (!Object.keys(selectedIds).length) {
        const firstLook = nextLooks[0];
        if (firstLook) {
          const initialSelection: Partial<Record<GarmentCategory, string>> = {};
          firstLook.garmentIds.forEach((id) => {
            const garment = nextGarments.find((item) => item.id === id);
            if (garment) initialSelection[garment.category] = garment.id;
          });
          setSelectedIds(initialSelection);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === stageFrameRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const activeGarments = useMemo(() => Object.fromEntries(
    Object.entries(selectedIds).map(([category, id]) => [category, garments.find((garment) => garment.id === id)]).filter(([, garment]) => Boolean(garment)),
  ) as Partial<Record<GarmentCategory, Garment>>, [garments, selectedIds]);
  const currentGarments = garments.filter((garment) => garment.category === selectedCategory);
  const selectedCount = Object.keys(activeGarments).length;
  const fittingGarment = activeGarments[selectedCategory];

  const persistGarments = async (nextGarments: Garment[]) => {
    if (!(await saveToStorage(WARDROBE_STORAGE_KEY, nextGarments))) {
      toast.error("Браузер отклонил сохранение. В Firefox проверь приватное окно и разрешение на хранение данных для этого сайта.");
      return false;
    }
    setGarments(nextGarments);
    return true;
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Нужен файл PNG, JPG или WEBP."); return; }
    if (file.size > 12_000_000) { toast.error("Выбери изображение до 12 МБ."); return; }
    setIsLoading(true);
    try {
      const newGarment = makeGarment(file, selectedCategory);
      if (await persistGarments([newGarment, ...garments])) {
        setSelectedIds((current) => ({ ...current, [selectedCategory]: newGarment.id }));
        toast.success("Вещь добавлена в локальный гардероб.");
      }
    } catch { toast.error("Не удалось добавить изображение."); }
    finally { setIsLoading(false); }
  };

  const handleModelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["glb", "gltf", "obj", "fbx"].includes(extension)) { toast.error("Поддерживаются GLB, GLTF, OBJ и FBX."); return; }
    if (file.size > 80_000_000) { toast.error("Модель должна быть меньше 80 МБ."); return; }
    const model: UserModel = { id: crypto.randomUUID(), name: file.name.replace(/\.[^/.]+$/, ""), format: extension as UserModel["format"], file, createdAt: new Date().toISOString() };
    if (await saveUserModel(model)) { setCustomModel(model); setSceneKey((key) => key + 1); toast.success("Модель сохранена только в этом браузере."); }
    else toast.error("Не удалось сохранить модель. Firefox мог заблокировать IndexedDB для этого сайта.");
  };

  const selectGarment = (garment: Garment) => { setSelectedIds((current) => ({ ...current, [garment.category]: garment.id })); setSelectedCategory(garment.category); };
  const removeGarment = async (garment: Garment) => {
    if (garment.isDefault) { toast.message("Пример одежды можно оставить в библиотеке или удалить вместе с вещью."); }
    const nextGarments = garments.filter((item) => item.id !== garment.id);
    if (await persistGarments(nextGarments)) {
      setSelectedIds((current) => { const next = { ...current }; if (next[garment.category] === garment.id) delete next[garment.category]; return next; });
    }
  };

  const saveLook = async () => {
    const garmentIds = Object.values(selectedIds).filter(Boolean) as string[];
    if (!garmentIds.length) { toast.error("Сначала выбери хотя бы одну вещь."); return; }
    const look: LookPreset = { id: crypto.randomUUID(), name: presetName.trim() || `Образ · ${formatDate(new Date().toISOString())}`, garmentIds, createdAt: new Date().toISOString() };
    const nextLooks = [look, ...looks.filter((item) => !item.isDefault || item.id !== look.id)].slice(0, 12);
    if (await saveToStorage(LOOKS_STORAGE_KEY, nextLooks)) { setLooks(nextLooks); setPresetName(""); toast.success("Образ сохранён локально."); }
    else toast.error("Не удалось сохранить образ в браузере.");
  };

  const openLook = (look: LookPreset) => {
    const nextSelection: Partial<Record<GarmentCategory, string>> = {};
    look.garmentIds.forEach((id) => { const garment = garments.find((item) => item.id === id); if (garment) nextSelection[garment.category] = garment.id; });
    setSelectedIds(nextSelection); toast.success(`Открыт образ «${look.name}».`);
  };
  const deleteLook = async (id: string) => { const nextLooks = looks.filter((look) => look.id !== id); if (await saveToStorage(LOOKS_STORAGE_KEY, nextLooks)) setLooks(nextLooks); };

  const exportLook = async (look: Pick<LookPreset, "name" | "createdAt" | "garmentIds">) => {
    const items = look.garmentIds.map((id) => garments.find((garment) => garment.id === id)).filter((garment): garment is Garment => Boolean(garment));
    if (!items.length) { toast.error("В образе нет доступных вещей."); return; }
    try {
      const payload: LookExport = { format: "fitta-look", version: 1, exportedAt: new Date().toISOString(), look: { name: look.name, createdAt: look.createdAt }, garments: await Promise.all(items.map(async ({ id: _id, image, ...garment }) => ({ ...garment, image: await imageToDataUrl(image) }))) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `${look.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "") || "fitta-look"}.fitta.json`; link.click(); URL.revokeObjectURL(url); toast.success("Файл образа скачан.");
    } catch { toast.error("Не удалось подготовить экспорт."); }
  };
  const exportCurrentLook = () => void exportLook({ name: presetName.trim() || "Мой образ", createdAt: new Date().toISOString(), garmentIds: Object.values(selectedIds).filter(Boolean) as string[] });

  const importLook = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as LookExport;
      if (payload.format !== "fitta-look" || payload.version !== 1 || !Array.isArray(payload.garments) || !payload.garments.length) throw new Error("unsupported");
      const imported = await Promise.all(payload.garments.map(async (garment) => ({ ...garment, id: crypto.randomUUID(), image: await dataUrlToBlob(garment.image), createdAt: new Date().toISOString() })));
      const nextGarments = [...imported, ...garments];
      const importedLook: LookPreset = { id: crypto.randomUUID(), name: payload.look?.name ? `${payload.look.name} · импорт` : "Импортированный образ", garmentIds: imported.map((garment) => garment.id), createdAt: new Date().toISOString() };
      const nextLooks = [importedLook, ...looks].slice(0, 12);
      const [garmentsSaved, looksSaved] = await Promise.all([saveToStorage(WARDROBE_STORAGE_KEY, nextGarments), saveToStorage(LOOKS_STORAGE_KEY, nextLooks)]);
      if (!garmentsSaved || !looksSaved) throw new Error("storage");
      setGarments(nextGarments); setLooks(nextLooks); setSelectedIds(Object.fromEntries(imported.map((garment) => [garment.category, garment.id]))); toast.success("Образ импортирован в гардероб.");
    } catch { toast.error("Не удалось прочитать файл образа Fitta."); }
  };

  const updateFit = (axis: "width" | "height", value: number) => {
    if (!fittingGarment) return;
    const next = garments.map((garment) => garment.id === fittingGarment.id ? { ...garment, fit: { width: garment.fit?.width ?? 100, height: garment.fit?.height ?? 100, [axis]: value } } : garment);
    setGarments(next); void saveToStorage(WARDROBE_STORAGE_KEY, next);
  };
  const updateCurvature = (value: number) => {
    if (!fittingGarment) return;
    const next = garments.map((garment) => garment.id === fittingGarment.id ? { ...garment, curvature: value } : garment);
    setGarments(next); void saveToStorage(WARDROBE_STORAGE_KEY, next);
  };
  const resetFit = () => {
    if (!fittingGarment) return;
    const next = garments.map((garment) => garment.id === fittingGarment.id ? { ...garment, fit: { width: 100, height: 100 }, curvature: 100 } : garment);
    setGarments(next); void saveToStorage(WARDROBE_STORAGE_KEY, next); toast.message("Подгонка слоя возвращена к исходной.");
  };
  const updateWarp = (garmentId: string, warp: WarpPoint[]) => { const next = garments.map((garment) => garment.id === garmentId ? { ...garment, warp } : garment); setGarments(next); void saveToStorage(WARDROBE_STORAGE_KEY, next); };
  const updateOffset = (garmentId: string, offset: GarmentOffset) => { const next = garments.map((garment) => garment.id === garmentId ? { ...garment, offset } : garment); setGarments(next); void saveToStorage(WARDROBE_STORAGE_KEY, next); };
  const resetScene = () => { setSceneKey((key) => key + 1); toast.message("Положение модели сброшено."); };
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await stageFrameRef.current?.requestFullscreen(); } catch { toast.error("Полноэкранный режим недоступен в этом браузере."); } };
  const changeBodyScale = (axis: "width" | "height" | "depth", value: number) => setBodyScale((current) => ({ ...current, [axis]: value }));
  const toggleEditor = () => { if (!fittingGarment) return; setIsEditing((editing) => !editing); };
  const clearCustomModel = async () => { if (await saveUserModel(null)) { setCustomModel(undefined); setSceneKey((key) => key + 1); toast.message("Возвращён базовый манекен."); } };

  return (
    <div className="atelier-shell min-h-screen bg-[#f6f4ef] text-[#1e2522]">
      <header className="flex min-h-[76px] items-center justify-between border-b border-[#d9d8d1] px-5 sm:px-8 lg:px-10">
        <a className="group flex items-center gap-3" href="/" aria-label="Fitta — главная"><img src="https://raw.githubusercontent.com/Quadrotez/fitta/master/branding/fitta-logo.png" alt="Логотип Fitta" className="h-9 w-9 rounded-full object-cover opacity-80 shadow-[0_2px_6px_rgba(30,37,34,0.10)] transition-transform duration-200 group-hover:-translate-y-0.5" /><span className="leading-none"><span className="block text-[19px] font-bold tracking-[-0.08em]">Fitta<span className="text-[#28614e]">/</span></span><span className="mt-1 block font-mono text-[9px] font-medium tracking-[0.16em] text-[#777d77]">PRIVATE FITTING ROOM</span></span></a>
        <div className="flex items-center gap-2"><span className="hidden font-mono text-[9px] tracking-[0.08em] text-[#777d77] sm:block">{storageState === "fallback" ? "ЛОКАЛЬНЫЙ РЕЗЕРВ" : storageState === "ready" ? "ЛОКАЛЬНО · INDEXEDDB" : "ПРОВЕРКА ХРАНИЛИЩА"}</span><button onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/80 text-[#445047] transition-colors hover:bg-white" aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"} title={theme === "light" ? "Тёмная тема" : "Светлая тема"}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button></div>
      </header>

      <main className="relative grid lg:min-h-[calc(100vh-76px)] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="relative z-10 border-b border-[#d9d8d1] bg-[#f8f7f3] lg:border-r lg:border-b-0"><div className="flex h-full flex-col px-5 py-6 sm:px-8 lg:px-6 xl:px-8">
          <div className="mb-5 flex items-end justify-between"><div><p className="font-mono text-[10px] font-medium tracking-[0.13em] text-[#767b74]">01 — ГАРДЕРОБ</p><h1 className="mt-1 text-[26px] font-bold tracking-[-0.055em]">Мои вещи</h1></div><span className="font-mono text-xs text-[#747a73]">{garments.length.toString().padStart(2, "0")}</span></div>
          <div className="mb-5 grid grid-cols-5 gap-1.5" aria-label="Категории одежды">{categoryOrder.map((category) => { const active = category === selectedCategory; const count = garments.filter((item) => item.category === category).length; return <button key={category} onClick={() => setSelectedCategory(category)} className={`category-tab group relative flex min-h-16 flex-col items-center justify-center rounded-2xl border px-1 transition-all ${active ? "border-[#28614e] bg-[#eaf0eb] text-[#28614e]" : "border-[#e0dfd9] bg-[#fdfcf9] text-[#767b74] hover:border-[#b9c9bc] hover:text-[#28614e]"}`} aria-pressed={active} title={categoryMeta[category].label}><span className={`mb-1 h-1.5 w-1.5 rounded-full ${active ? "bg-[#28614e]" : "bg-[#c1c6bf] group-hover:bg-[#28614e]"}`} /><span className="font-mono text-[8px] font-medium tracking-[0.06em]">{categoryMeta[category].short}</span>{count > 0 && <span className="absolute right-1.5 top-1.5 font-mono text-[8px]">{count}</span>}</button>; })}</div>
          <label className={`upload-surface group mb-5 flex min-h-28 w-full flex-col justify-between rounded-[20px] border border-dashed border-[#abc0b0] bg-[#edf3ee] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#28614e] hover:bg-[#e7f0e9] ${isLoading ? "cursor-wait opacity-75" : "cursor-pointer"}`}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUpload} disabled={isLoading || storageState === "checking"} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait" aria-label={`Добавить ${categoryMeta[selectedCategory].label.toLowerCase()} в гардероб`} /><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#28614e] text-white shadow-sm">{isLoading || storageState === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</span><span><span className="block text-sm font-semibold tracking-[-0.02em]">Добавить {categoryMeta[selectedCategory].label.toLowerCase()}</span><span className="mt-0.5 block font-mono text-[9px] tracking-[0.04em] text-[#637367]">{storageState === "checking" ? "ПРОВЕРЯЮ ЛОКАЛЬНОЕ ХРАНИЛИЩЕ" : "PNG, JPG, WEBP · ДО 12 МБ"}</span></span></label>
          <div className="scrollbar-soft flex max-h-[310px] flex-col gap-2 overflow-y-auto pr-1">{currentGarments.length ? currentGarments.map((garment) => { const active = selectedIds[garment.category] === garment.id; return <div key={garment.id} className={`group flex items-center gap-3 rounded-2xl border p-2 transition-all ${active ? "border-[#28614e] bg-white shadow-[0_5px_18px_rgba(30,37,34,0.06)]" : "border-transparent hover:border-[#ddded8] hover:bg-white/70"}`}><button onClick={() => selectGarment(garment)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Выбрать ${garment.name}`}><span className="h-14 w-12 shrink-0 overflow-hidden rounded-xl bg-[#e8e7e1]"><GarmentPreview image={garment.image} alt="" className="h-full w-full object-cover" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold tracking-[-0.015em]">{garment.name}</span><span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.07em] text-[#7b817b]"><span className={`h-1.5 w-1.5 rounded-full ${categoryMeta[garment.category].dot}`} />{garment.isDefault ? "ПРИМЕР" : formatDate(garment.createdAt).toUpperCase()}</span></span></button><button onClick={() => void removeGarment(garment)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#9a9e99] opacity-100 transition-all hover:bg-[#f4e8e5] hover:text-[#a94f40] lg:opacity-0 lg:group-hover:opacity-100" aria-label={`Удалить ${garment.name}`}><X className="h-4 w-4" /></button></div>; }) : <div className="flex min-h-28 flex-col justify-center rounded-2xl border border-[#e2e1db] bg-[#fbfaf7] px-4"><p className="text-sm font-semibold tracking-[-0.02em]">Пока пусто</p><p className="mt-1 max-w-[230px] text-xs leading-5 text-[#727972]">Добавь вещь на нейтральном фоне.</p></div>}</div>
          <div className="mt-6 border-t border-[#dfded8] pt-5"><div className="mb-3 flex items-center justify-between gap-2"><p className="font-mono text-[10px] font-medium tracking-[0.13em] text-[#767b74]">02 — ОБРАЗЫ</p><div className="flex items-center gap-2"><input ref={importInputRef} type="file" accept="application/json,.json" onChange={importLook} disabled={storageState === "checking"} className="hidden" aria-label="Импортировать образ Fitta" /><button onClick={() => importInputRef.current?.click()} disabled={storageState === "checking"} className="flex h-7 items-center gap-1 rounded-md px-1.5 font-mono text-[8px] font-medium tracking-[0.04em] text-[#556157] transition-colors hover:bg-[#eaf0eb] hover:text-[#28614e] disabled:cursor-not-allowed disabled:opacity-45" title="Импортировать образ"><FileUp className="h-3.5 w-3.5" /> ИМПОРТ</button><span className="font-mono text-[10px] text-[#767b74]">{looks.length}/12</span></div></div><div className="space-y-1.5">{looks.slice(0, 3).map((look) => <div key={look.id} className="group flex items-center rounded-xl px-2 py-2 hover:bg-white"><button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => openLook(look)}><FolderArchive className="h-4 w-4 shrink-0 text-[#28614e]" /><span className="min-w-0"><span className="block truncate text-xs font-semibold">{look.name}</span><span className="font-mono text-[8px] tracking-[0.08em] text-[#848983]">{look.garmentIds.length} ВЕЩ. · {formatDate(look.createdAt).toUpperCase()}</span></span></button><div className="flex items-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100"><button onClick={() => void exportLook(look)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#708276] hover:bg-[#eaf0eb] hover:text-[#28614e]" aria-label={`Экспортировать образ ${look.name}`}><Download className="h-3.5 w-3.5" /></button>{!look.isDefault && <button onClick={() => void deleteLook(look.id)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#9da19c] hover:bg-[#f4e8e5] hover:text-[#a94f40]" aria-label={`Удалить образ ${look.name}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div></div>)}{!looks.length && <p className="px-2 text-xs leading-5 text-[#7b817b]">Собери первый образ — он появится здесь.</p>}</div></div>
        </div></aside>

        <section className="relative min-h-[670px] overflow-hidden px-5 py-6 sm:px-8 sm:py-8 lg:px-9 xl:px-12"><div className="absolute bottom-0 right-0 top-0 hidden w-[39%] bg-[radial-gradient(circle_at_65%_35%,rgba(40,97,78,0.12),transparent_28%),linear-gradient(145deg,transparent_32%,rgba(40,97,78,0.05)_32%,rgba(40,97,78,0.05)_33%,transparent_33%)] lg:block" /><div className="absolute left-5 top-[170px] hidden origin-top-left -rotate-90 font-mono text-[9px] tracking-[0.17em] text-[#8c928c] xl:block">FORM_001 · FIT STUDY</div><div className="relative z-10 mx-auto flex h-full max-w-[1180px] flex-col">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.13em] text-[#717871]"><span className="h-px w-8 bg-[#28614e]" />03 — ПРИМЕРКА</div><h2 className="text-[clamp(28px,3vw,42px)] font-bold leading-none tracking-[-0.065em]">Сцена образа <span className="font-mono text-sm font-medium tracking-normal text-[#6f7870]">/ 01</span></h2></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><div className="flex rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/80 p-1"><button onClick={() => setViewMode("mannequin")} className={`rounded-full px-3 py-1.5 font-mono text-[9px] font-medium tracking-[0.06em] transition-colors ${viewMode === "mannequin" ? "bg-[#28614e] text-white" : "text-[#6d766e] hover:text-[#28614e]"}`}>МАНЕКЕН</button><button onClick={() => setViewMode("flat")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 font-mono text-[9px] font-medium tracking-[0.06em] transition-colors ${viewMode === "flat" ? "bg-[#28614e] text-white" : "text-[#6d766e] hover:text-[#28614e]"}`}><Layers3 className="h-3 w-3" /> 2D</button></div>{fittingGarment && <button onClick={toggleEditor} className={`flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors ${isEditing ? "border-[#28614e] bg-[#28614e] text-white" : "border-[#d5d7d1] bg-[#fbfaf7]/80 text-[#445047] hover:bg-white"}`} title={viewMode === "flat" ? "Открыть точки деформации" : "Открыть растягивание слоя в 3D"}><Pencil className="h-3.5 w-3.5" />{viewMode === "flat" ? (isEditing ? "ГОТОВО" : "ТОЧКИ") : (isEditing ? "3D-ПОДГОНКА" : "ПОДОГНАТЬ")}</button>}{viewMode === "mannequin" && <Button onClick={resetScene} variant="outline" className="h-10 gap-2 rounded-full border-[#d5d7d1] bg-[#fbfaf7]/80 px-4 text-xs font-semibold text-[#445047] hover:bg-white"><RotateCcw className="h-3.5 w-3.5" />Сбросить ракурс</Button>}<button onClick={() => void toggleFullscreen()} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/80 text-[#445047] transition-colors hover:bg-white" aria-label={isFullscreen ? "Закрыть полноэкранный режим" : "Развернуть сцену"} title={isFullscreen ? "Закрыть полноэкранный режим" : "Развернуть сцену"}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button></div></div>
          <div className="relative grid flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_250px]"><div ref={stageFrameRef} className="canvas-frame relative min-h-[500px] overflow-hidden rounded-[16px] border border-[#cfd3cc] bg-[#f1efe9] shadow-[0_12px_28px_rgba(44,54,48,0.06)]">{isFullscreen && <button onClick={() => void toggleFullscreen()} className="absolute right-5 top-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/90 text-[#445047] shadow-sm" aria-label="Закрыть полноэкранный режим"><Minimize2 className="h-4 w-4" /></button>}{viewMode === "mannequin" ? <TryOnStage key={sceneKey} activeGarments={activeGarments} bodyGender={bodyGender} bodyScale={bodyScale} customModel={customModel} theme={theme} onOffsetChange={updateOffset} /> : <FlatStackStage key={sceneKey} activeGarments={activeGarments} editingGarmentId={isEditing ? fittingGarment?.id : undefined} theme={theme} onWarpChange={updateWarp} onOffsetChange={updateOffset} />}</div>
            <div className="flex flex-col gap-4">
              <div className="paper-tag rounded-[13px] border border-[#d8d8d1] bg-[#fbfaf7]/80 p-5"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#747b74]">МОДЕЛЬ</p><p className="mt-1 text-sm font-bold tracking-[-0.025em]">{customModel?.name || "Базовый манекен"}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf0eb] text-[#28614e]"><Shirt className="h-4 w-4" /></span></div><div className="mb-4 grid grid-cols-3 gap-1.5">{genderOptions.map((option) => <button key={option.value} onClick={() => setBodyGender(option.value)} disabled={Boolean(customModel)} className={`min-w-0 overflow-hidden whitespace-nowrap rounded-xl border px-1 py-2 font-mono text-[8px] font-medium tracking-[0.03em] transition-colors ${bodyGender === option.value ? "border-[#28614e] bg-[#eaf0eb] text-[#28614e]" : "border-[#e3e3dc] bg-white text-[#747a73] hover:border-[#b9c9bc]"} disabled:cursor-not-allowed disabled:opacity-45`}>{option.label}</button>)}</div><div className="space-y-3">{(["width", "height", "depth"] as const).map((axis) => <div key={axis}><div className="mb-1.5 flex justify-between font-mono text-[9px] font-medium tracking-[0.08em] text-[#667067]"><span>{axis === "width" ? "ШИРИНА" : axis === "height" ? "ВЫСОТА" : "ГЛУБИНА"}</span><span className="text-[#28614e]">{bodyScale[axis]}%</span></div><Slider value={[bodyScale[axis]]} onValueChange={([value]) => changeBodyScale(axis, value)} min={axis === "height" ? 85 : 80} max={axis === "height" ? 115 : 125} step={1} disabled={Boolean(customModel)} aria-label={`Настроить ${axis}`} /></div>)}</div><div className="mt-4 flex gap-2"><label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#b5c6b8] px-2 py-2 font-mono text-[9px] font-medium text-[#28614e] hover:bg-[#eaf0eb]"><input ref={modelInputRef} type="file" accept=".glb,.gltf,.obj,.fbx,model/gltf-binary,model/gltf+json,model/obj,application/octet-stream" onChange={handleModelUpload} className="hidden" /> <Upload className="h-3.5 w-3.5" /> СВОЯ МОДЕЛЬ</label>{customModel && <button onClick={() => void clearCustomModel()} className="rounded-xl border border-[#d5d7d1] px-2 text-[#7a817a] hover:text-[#a94f40]" aria-label="Удалить свою модель"><Trash2 className="h-3.5 w-3.5" /></button>}</div><p className="mt-2 font-mono text-[8px] leading-4 tracking-[0.04em] text-[#7b817b]">GLB · GLTF · OBJ · FBX · только локально</p></div>
              <div className="paper-tag rounded-[13px] border border-[#d8d8d1] bg-[#fbfaf7]/80 p-5"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#747b74]">ПОДГОНКА СЛОЯ</p><p className="mt-1 truncate text-sm font-bold tracking-[-0.025em]">{fittingGarment?.name || "Выбери вещь"}</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eaf0eb] text-[#28614e]"><SlidersHorizontal className="h-4 w-4" /></span></div>{fittingGarment && <div className="space-y-4"><div><div className="mb-2 flex items-center justify-between font-mono text-[9px] font-medium tracking-[0.09em] text-[#667067]"><span>ШИРИНА</span><span className="text-[#28614e]">{fittingGarment.fit?.width ?? 100}%</span></div><Slider value={[fittingGarment.fit?.width ?? 100]} onValueChange={([value]) => updateFit("width", value)} min={60} max={170} step={1} aria-label="Растянуть одежду по ширине" /></div><div><div className="mb-2 flex items-center justify-between font-mono text-[9px] font-medium tracking-[0.09em] text-[#667067]"><span>ВЫСОТА</span><span className="text-[#28614e]">{fittingGarment.fit?.height ?? 100}%</span></div><Slider value={[fittingGarment.fit?.height ?? 100]} onValueChange={([value]) => updateFit("height", value)} min={60} max={170} step={1} aria-label="Растянуть одежду по высоте" /></div>{viewMode === "mannequin" && isEditing && <div><div className="mb-2 flex items-center justify-between font-mono text-[9px] font-medium tracking-[0.09em] text-[#667067]"><span>ЗАКРУГЛЕНИЕ 3D</span><span className="text-[#28614e]">{Math.round(fittingGarment.curvature ?? 100)}%</span></div><Slider value={[fittingGarment.curvature ?? 100]} onValueChange={([value]) => updateCurvature(value)} min={0} max={100} step={1} aria-label="Растянуть одежду по кривизне манекена" /></div>}<button onClick={resetFit} className="flex items-center gap-1.5 font-mono text-[9px] font-medium tracking-[0.07em] text-[#6d766e] transition-colors hover:text-[#28614e]"><RotateCcw className="h-3 w-3" />СБРОСИТЬ ПОДГОНКУ</button></div>}</div>
              <div className="paper-tag rounded-[13px] border border-[#d8d8d1] bg-[#fbfaf7]/80 p-5"><div className="mb-4 flex items-center justify-between"><p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#747b74]">СЛОИ ОБРАЗА</p><span className="font-mono text-xs text-[#28614e]">{selectedCount.toString().padStart(2, "0")}</span></div><div className="space-y-2">{categoryOrder.map((category) => { const garment = activeGarments[category]; return <div key={category} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${garment ? "bg-white shadow-[0_2px_8px_rgba(39,50,43,0.03)]" : "opacity-55"}`}><button disabled={!garment} onClick={() => garment && selectGarment(garment)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"><span className={`h-2 w-2 rounded-full ${categoryMeta[category].dot}`} /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{garment?.name || categoryMeta[category].label}</span></button>{garment ? <button onClick={() => setSelectedIds((current) => { const next = { ...current }; delete next[category]; return next; })} className="rounded-md p-0.5 text-[#8c938d] hover:bg-[#f2e5e1] hover:text-[#a94f40]" aria-label={`Убрать ${garment.name} из образа`}><X className="h-3.5 w-3.5" /></button> : <Plus className="h-3.5 w-3.5 text-[#959a94]" />}</div>; })}</div></div>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-[#d9d9d2] pt-5 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e3ebe4] text-[#28614e]"><Archive className="h-4 w-4" /></span><Input value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={38} placeholder="Название образа (необязательно)" className="h-10 border-0 bg-transparent px-0 text-sm font-semibold shadow-none placeholder:text-[#949992] focus-visible:ring-0" aria-label="Название сохраняемого образа" /></div><Button onClick={exportCurrentLook} disabled={!selectedCount} variant="outline" className="h-11 rounded-full border-[#b5c6b8] bg-transparent px-4 text-xs font-bold text-[#28614e] hover:bg-[#eaf0eb] disabled:opacity-40"><Download className="mr-2 h-4 w-4" />Экспорт</Button><Button onClick={saveLook} disabled={storageState === "checking"} className="h-11 rounded-full bg-[#28614e] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(40,97,78,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#1f4f3f] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"><Save className="mr-2 h-4 w-4" />Сохранить образ</Button></div>
        </div></section>
      </main>
    </div>
  );
}
