/**
 * Style: Fitta — «тихое ателье» как настоящий персональный lookboard.
 * Вещи не привязаны к категориям на сцене: каждый экземпляр — независимый слой
 * с собственными координатами, размером, поворотом, прозрачностью и историей правок.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Archive, ArrowDown, ArrowUp, Copy, Download, Eye, EyeOff, FileUp, FolderArchive, Heart, Layers3, Loader2, Lock, Maximize2, Minimize2, Moon, Pencil, Plus, Redo2, RotateCcw, Save, Search, SlidersHorizontal, Sun, Trash2, Undo2, Unlock, Upload, X } from "lucide-react";
import { toast } from "sonner";
import FlatStackStage from "@/components/FlatStackStage";
import GarmentPreview from "@/components/GarmentPreview";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { categoryMeta, categoryOrder, DEFAULTS_SEEDED_STORAGE_KEY, LOOKS_STORAGE_KEY, makeBoardLayer, makeDefaultGarments, makeGarment, makeLayersFromGarmentIds, probeStorage, saveToStorage, loadFromStorage, WARDROBE_STORAGE_KEY, WORKSPACE_STORAGE_KEY, type BoardLayer, type Garment, type GarmentCategory, type LookPreset, type LookboardGuide, type LookboardWorkspace } from "@/lib/wardrobe";

const formatDate = (date: string) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(date));
const cloneWorkspace = (workspace: LookboardWorkspace): LookboardWorkspace => JSON.parse(JSON.stringify(workspace)) as LookboardWorkspace;
const emptyWorkspace = (): LookboardWorkspace => ({ layers: [], zoom: 1, guide: "grid" });
const imageToDataUrl = (image: string | Blob) => typeof image === "string" ? Promise.resolve(image) : new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Не удалось подготовить изображение для экспорта.")); reader.readAsDataURL(image); });
const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

type LookExport = {
  format: "fitta-look";
  version: 1 | 2;
  exportedAt: string;
  look: Pick<LookPreset, "name" | "createdAt" | "layers" | "board">;
  garments: Array<Omit<Garment, "image"> & { image: string }>;
};
type StorageState = "checking" | "ready" | "fallback";

function normalizeWorkspace(value: LookboardWorkspace | undefined, garments: Garment[], fallbackIds: string[] = []): LookboardWorkspace {
  if (value?.layers?.length) {
    return {
      layers: value.layers.filter((layer) => garments.some((garment) => garment.id === layer.garmentId)).map((layer, index) => ({ ...layer, zIndex: Number.isFinite(layer.zIndex) ? layer.zIndex : index + 10, visible: layer.visible !== false, locked: Boolean(layer.locked), opacity: layer.opacity ?? 100, rotation: layer.rotation ?? 0 })),
      selectedLayerId: value.selectedLayerId,
      zoom: value.zoom ?? 1,
      guide: value.guide ?? "grid",
    };
  }
  return { ...emptyWorkspace(), layers: makeLayersFromGarmentIds(fallbackIds, garments) };
}

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [garments, setGarments] = useState<Garment[]>([]);
  const [looks, setLooks] = useState<LookPreset[]>([]);
  const [workspace, setWorkspace] = useState<LookboardWorkspace>(emptyWorkspace);
  const workspaceRef = useRef(workspace);
  const [past, setPast] = useState<LookboardWorkspace[]>([]);
  const [future, setFuture] = useState<LookboardWorkspace[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<GarmentCategory>("top");
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [warpMode, setWarpMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [storageState, setStorageState] = useState<StorageState>("checking");
  const [hydrated, setHydrated] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const indexedDbWorks = await probeStorage();
      const [storedGarments, storedLooks, storedWorkspace, seeded] = await Promise.all([
        loadFromStorage<Garment[]>(WARDROBE_STORAGE_KEY, []),
        loadFromStorage<LookPreset[]>(LOOKS_STORAGE_KEY, []),
        loadFromStorage<LookboardWorkspace | undefined>(WORKSPACE_STORAGE_KEY, undefined),
        loadFromStorage<boolean>(DEFAULTS_SEEDED_STORAGE_KEY, false),
      ]);
      if (!mounted) return;
      let nextGarments = storedGarments;
      let nextLooks = storedLooks;
      if (!seeded) {
        const defaults = makeDefaultGarments();
        const layers = makeLayersFromGarmentIds(defaults.map((garment) => garment.id), defaults);
        nextGarments = [...defaults, ...storedGarments];
        nextLooks = [{ id: crypto.randomUUID(), name: "Первый образ · пример", garmentIds: defaults.map((garment) => garment.id), layers, board: { zoom: 1, guide: "grid" }, createdAt: new Date().toISOString(), isDefault: true }, ...storedLooks];
        await Promise.all([saveToStorage(WARDROBE_STORAGE_KEY, nextGarments), saveToStorage(LOOKS_STORAGE_KEY, nextLooks), saveToStorage(DEFAULTS_SEEDED_STORAGE_KEY, true)]);
      }
      const firstLook = nextLooks[0];
      const firstLookWorkspace = firstLook?.layers ? { layers: firstLook.layers, selectedLayerId: undefined, zoom: firstLook.board?.zoom ?? 1, guide: firstLook.board?.guide ?? "grid" } : undefined;
      const nextWorkspace = normalizeWorkspace(storedWorkspace ?? firstLookWorkspace, nextGarments, firstLook?.garmentIds);
      if (!nextWorkspace.selectedLayerId && nextWorkspace.layers.length) nextWorkspace.selectedLayerId = nextWorkspace.layers.at(-1)?.id;
      setGarments(nextGarments);
      setLooks(nextLooks);
      setWorkspace(nextWorkspace);
      setStorageState(indexedDbWorks ? "ready" : "fallback");
      setHydrated(true);
    })().catch(() => { if (mounted) { setStorageState("fallback"); setHydrated(true); toast.error("Не удалось открыть локальный гардероб."); } });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => { void saveToStorage(WORKSPACE_STORAGE_KEY, workspace); }, 240);
    return () => window.clearTimeout(timeout);
  }, [workspace, hydrated]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === stageFrameRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const selectedLayer = workspace.layers.find((layer) => layer.id === workspace.selectedLayerId);
  const selectedGarment = selectedLayer ? garments.find((garment) => garment.id === selectedLayer.garmentId) : undefined;
  const visibleLayerCount = workspace.layers.filter((layer) => layer.visible).length;
  const currentGarments = useMemo(() => garments.filter((garment) => garment.category === selectedCategory).filter((garment) => !favoritesOnly || garment.favorite).filter((garment) => garment.name.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))), [garments, selectedCategory, favoritesOnly, search]);

  const remember = useCallback(() => {
    const snapshot = cloneWorkspace(workspaceRef.current);
    setPast((current) => [...current, snapshot].slice(-60));
    setFuture([]);
  }, []);
  const undo = useCallback(() => {
    setPast((current) => {
      const previous = current.at(-1);
      if (!previous) return current;
      setFuture((items) => [cloneWorkspace(workspaceRef.current), ...items].slice(0, 60));
      setWorkspace(cloneWorkspace(previous));
      return current.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((current) => {
      const next = current[0];
      if (!next) return current;
      setPast((items) => [...items, cloneWorkspace(workspaceRef.current)].slice(-60));
      setWorkspace(cloneWorkspace(next));
      return current.slice(1);
    });
  }, []);

  const updateLayer = useCallback((nextLayer: BoardLayer) => setWorkspace((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === nextLayer.id ? nextLayer : layer) })), []);
  const updateSelectedLayer = (patch: Partial<BoardLayer>) => { if (!selectedLayer) return; remember(); updateLayer({ ...selectedLayer, ...patch }); };
  const addGarmentToBoard = (garment: Garment) => {
    remember();
    const layer = makeBoardLayer(garment, Math.max(10, ...workspace.layers.map((item) => item.zIndex + 1)));
    setWorkspace((current) => ({ ...current, layers: [...current.layers, layer], selectedLayerId: layer.id }));
    setWarpMode(false);
    toast.success("Вещь добавлена на доску.");
  };
  const duplicateLayer = () => {
    if (!selectedLayer) return;
    remember();
    const copy: BoardLayer = { ...selectedLayer, id: crypto.randomUUID(), x: selectedLayer.x + 3, y: selectedLayer.y + 3, zIndex: Math.max(...workspace.layers.map((layer) => layer.zIndex)) + 1, warp: selectedLayer.warp.map((point) => ({ ...point })) };
    setWorkspace((current) => ({ ...current, layers: [...current.layers, copy], selectedLayerId: copy.id }));
  };
  const removeSelectedLayer = () => {
    if (!selectedLayer) return;
    remember();
    setWorkspace((current) => { const layers = current.layers.filter((layer) => layer.id !== selectedLayer.id); return { ...current, layers, selectedLayerId: layers.at(-1)?.id }; });
    setWarpMode(false);
  };
  const moveLayer = (direction: -1 | 1) => {
    if (!selectedLayer) return;
    remember();
    const ordered = [...workspace.layers].sort((a, b) => a.zIndex - b.zIndex);
    const index = ordered.findIndex((layer) => layer.id === selectedLayer.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;
    updateLayer({ ...selectedLayer, zIndex: swapWith.zIndex });
    updateLayer({ ...swapWith, zIndex: selectedLayer.zIndex });
  };
  const startNewBoard = () => {
    if (!workspace.layers.length) return;
    remember();
    setWorkspace({ ...emptyWorkspace(), guide: workspace.guide });
    setWarpMode(false);
    toast.success("Новая чистая доска готова.");
  };

  const persistGarments = async (next: Garment[]) => {
    if (!(await saveToStorage(WARDROBE_STORAGE_KEY, next))) { toast.error("Не удалось сохранить изменения. Проверь режим хранения браузера."); return false; }
    setGarments(next); return true;
  };
  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Нужен PNG, JPG или WEBP."); return; }
    if (file.size > 12_000_000) { toast.error("Выбери изображение до 12 МБ."); return; }
    setIsLoading(true);
    try { const garment = makeGarment(file, selectedCategory); if (await persistGarments([garment, ...garments])) addGarmentToBoard(garment); }
    catch { toast.error("Не удалось добавить изображение."); }
    finally { setIsLoading(false); }
  };
  const removeGarment = async (garment: Garment) => {
    if (await persistGarments(garments.filter((item) => item.id !== garment.id))) {
      setWorkspace((current) => ({ ...current, layers: current.layers.filter((layer) => layer.garmentId !== garment.id), selectedLayerId: current.selectedLayerId }));
    }
  };
  const toggleFavorite = async (garment: Garment) => { await persistGarments(garments.map((item) => item.id === garment.id ? { ...item, favorite: !item.favorite } : item)); };

  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await stageFrameRef.current?.requestFullscreen(); } catch { toast.error("Полноэкранный режим недоступен в этом браузере."); } };
  const saveLook = async () => {
    if (!workspace.layers.length) { toast.error("Сначала добавь вещь на доску."); return; }
    const look: LookPreset = { id: crypto.randomUUID(), name: presetName.trim() || `Образ · ${formatDate(new Date().toISOString())}`, garmentIds: workspace.layers.map((layer) => layer.garmentId), layers: cloneWorkspace(workspace).layers, board: { zoom: workspace.zoom, guide: workspace.guide }, createdAt: new Date().toISOString() };
    const next = [look, ...looks].slice(0, 24);
    if (await saveToStorage(LOOKS_STORAGE_KEY, next)) { setLooks(next); setPresetName(""); toast.success("Доска сохранена локально."); } else toast.error("Не удалось сохранить образ.");
  };
  const openLook = (look: LookPreset) => { remember(); const next = normalizeWorkspace(look.layers ? { layers: look.layers, selectedLayerId: undefined, zoom: look.board?.zoom ?? 1, guide: look.board?.guide ?? "grid" } : undefined, garments, look.garmentIds); next.selectedLayerId = next.layers.at(-1)?.id; setWorkspace(next); setWarpMode(false); };
  const deleteLook = async (id: string) => { const next = looks.filter((look) => look.id !== id); if (await saveToStorage(LOOKS_STORAGE_KEY, next)) setLooks(next); };
  const duplicateLook = async (look: LookPreset) => { const copy = { ...look, id: crypto.randomUUID(), name: `${look.name} · копия`, createdAt: new Date().toISOString(), layers: look.layers?.map((layer) => ({ ...layer, id: crypto.randomUUID(), warp: layer.warp.map((point) => ({ ...point })) })) }; const next = [copy, ...looks].slice(0, 24); if (await saveToStorage(LOOKS_STORAGE_KEY, next)) { setLooks(next); toast.success("Копия образа сохранена."); } };
  const exportLook = async (look: Pick<LookPreset, "name" | "createdAt" | "garmentIds" | "layers" | "board">) => {
    const items = Array.from(new Set(look.garmentIds)).map((id) => garments.find((garment) => garment.id === id)).filter((garment): garment is Garment => Boolean(garment));
    if (!items.length) { toast.error("В образе нет доступных вещей."); return; }
    try {
      const payload: LookExport = { format: "fitta-look", version: 2, exportedAt: new Date().toISOString(), look: { name: look.name, createdAt: look.createdAt, layers: look.layers, board: look.board }, garments: await Promise.all(items.map(async ({ image, ...garment }) => ({ ...garment, image: await imageToDataUrl(image) }))) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `${look.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "") || "fitta-look"}.fitta.json`; link.click(); URL.revokeObjectURL(url); toast.success("Доска экспортирована.");
    } catch { toast.error("Не удалось подготовить экспорт."); }
  };
  const importLook = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as LookExport;
      if (payload.format !== "fitta-look" || (payload.version !== 1 && payload.version !== 2) || !Array.isArray(payload.garments) || !payload.garments.length) throw new Error("unsupported");
      const idMap = new Map<string, string>();
      const imported = await Promise.all(payload.garments.map(async (garment) => { const id = crypto.randomUUID(); idMap.set(garment.id, id); return { ...garment, id, image: await dataUrlToBlob(garment.image), createdAt: new Date().toISOString() }; }));
      const importedLayers = payload.look?.layers?.map((layer) => ({ ...layer, id: crypto.randomUUID(), garmentId: idMap.get(layer.garmentId) ?? layer.garmentId, warp: layer.warp.map((point) => ({ ...point })) })) ?? makeLayersFromGarmentIds(imported.map((garment) => garment.id), imported);
      const importedLook: LookPreset = { id: crypto.randomUUID(), name: payload.look?.name ? `${payload.look.name} · импорт` : "Импортированная доска", garmentIds: imported.map((garment) => garment.id), layers: importedLayers, board: payload.look?.board, createdAt: new Date().toISOString() };
      const nextGarments = [...imported, ...garments]; const nextLooks = [importedLook, ...looks].slice(0, 24);
      const [garmentsSaved, looksSaved] = await Promise.all([saveToStorage(WARDROBE_STORAGE_KEY, nextGarments), saveToStorage(LOOKS_STORAGE_KEY, nextLooks)]);
      if (!garmentsSaved || !looksSaved) throw new Error("storage");
      setGarments(nextGarments); setLooks(nextLooks); openLook({ ...importedLook, layers: importedLayers }); toast.success("Доска импортирована.");
    } catch { toast.error("Не удалось прочитать файл Fitta."); }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const input = target instanceof HTMLInputElement ? target : undefined;
      const isEditableField = target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable || (input ? ["text", "search", "email", "password", "url", "tel", "number"].includes(input.type) : false);
      if (isEditableField) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      else if (event.key === "Delete" || event.key === "Backspace") { if (selectedLayer) { event.preventDefault(); removeSelectedLayer(); } }
      else if (event.key.toLowerCase() === "w" && selectedLayer) { event.preventDefault(); setWarpMode((value) => !value); }
      else if (event.key === "Escape") { setWarpMode(false); setWorkspace((current) => ({ ...current, selectedLayerId: undefined })); }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [redo, selectedLayer, undo]);

  return <div className="atelier-shell min-h-screen bg-[#f6f4ef] text-[#1e2522]">
    <header className="flex min-h-[76px] items-center justify-between border-b border-[#d9d8d1] px-5 sm:px-8 lg:px-10">
      <a className="group flex items-center gap-3" href="/" aria-label="Fitta — главная"><img src="https://raw.githubusercontent.com/Quadrotez/fitta/master/branding/fitta-logo.png" alt="Логотип Fitta" className="h-8 w-8 rounded-sm object-cover opacity-65" /><span className="leading-none"><span className="block text-[22px] font-bold tracking-[-0.08em]">Fitta<span className="text-[#28614e]">/</span></span><span className="mt-1 block font-mono text-[9px] font-medium tracking-[0.16em] text-[#777d77]">PRIVATE FITTING ROOM</span></span></a>
      <div className="flex items-center gap-3"><span className="hidden font-mono text-[9px] tracking-[0.08em] text-[#777d77] sm:block">{storageState === "fallback" ? "ЛОКАЛЬНЫЙ РЕЗЕРВ" : storageState === "ready" ? "ЛОКАЛЬНО · INDEXEDDB" : "ПРОВЕРКА ХРАНИЛИЩА"}</span><button onClick={toggleTheme} className="grid h-10 w-10 place-items-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/80 text-[#445047] hover:bg-white" aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button></div>
    </header>
    <main className="lookbook-shell relative grid min-h-[calc(100vh-76px)] xl:grid-cols-[260px_minmax(0,1fr)_270px]">
      <aside className="library-panel border-b border-[#d9d8d1] bg-[#f8f7f3] xl:border-b-0 xl:border-r"><div className="flex h-full flex-col px-5 py-6 sm:px-8 xl:px-6">
        <div className="mb-5 flex items-end justify-between"><div><p className="font-mono text-[10px] font-medium tracking-[0.13em] text-[#767b74]">01 — АРХИВ ВЕЩЕЙ</p><h1 className="mt-1 text-[26px] font-bold tracking-[-0.055em]">Гардероб</h1></div><span className="font-mono text-xs text-[#747a73]">{garments.length.toString().padStart(2, "0")}</span></div>
        <div className="mb-3 flex items-center gap-2 border border-[#deded8] bg-[#fbfaf7] px-3"><Search className="h-3.5 w-3.5 text-[#7c847c]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти вещь" className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[#969b96]" aria-label="Поиск вещи" /><button onClick={() => setFavoritesOnly((value) => !value)} className={`grid h-7 w-7 place-items-center ${favoritesOnly ? "text-[#b25843]" : "text-[#899089]"}`} aria-label="Только избранное" aria-pressed={favoritesOnly}><Heart className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-current" : ""}`} /></button></div>
        <div className="mb-4 grid grid-cols-5 gap-1.5" aria-label="Категории одежды">{categoryOrder.map((category) => { const active = category === selectedCategory; const count = garments.filter((item) => item.category === category).length; return <button key={category} onClick={() => setSelectedCategory(category)} className={`category-tab relative flex min-h-14 flex-col items-center justify-center border px-1 transition-all ${active ? "border-[#28614e] bg-[#eaf0eb] text-[#28614e]" : "border-[#e0dfd9] bg-[#fdfcf9] text-[#767b74] hover:border-[#b9c9bc]"}`} aria-pressed={active}><span className={`mb-1 h-1.5 w-1.5 rounded-full ${active ? "bg-[#28614e]" : "bg-[#c1c6bf]"}`} /><span className="font-mono text-[8px] font-medium tracking-[0.06em]">{categoryMeta[category].short}</span>{count > 0 && <span className="absolute right-1.5 top-1.5 font-mono text-[8px]">{count}</span>}</button>; })}</div>
        <label className={`upload-surface group mb-4 flex min-h-24 w-full flex-col justify-between border border-dashed border-[#abc0b0] bg-[#edf3ee] p-3 text-left ${isLoading ? "cursor-wait opacity-75" : "cursor-pointer"}`}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUpload} disabled={isLoading || storageState === "checking"} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait" aria-label={`Добавить ${categoryMeta[selectedCategory].label.toLowerCase()}`} /><span className="grid h-7 w-7 place-items-center rounded-full bg-[#28614e] text-white">{isLoading || storageState === "checking" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}</span><span><span className="block text-sm font-semibold">Добавить {categoryMeta[selectedCategory].label.toLowerCase()}</span><span className="mt-0.5 block font-mono text-[8px] tracking-[0.04em] text-[#637367]">PNG, JPG, WEBP · ДО 12 МБ</span></span></label>
        <div className="scrollbar-soft flex min-h-[250px] flex-1 flex-col gap-1.5 overflow-y-auto pr-1">{currentGarments.length ? currentGarments.map((garment) => { const onBoard = workspace.layers.some((layer) => layer.garmentId === garment.id); return <div key={garment.id} className={`group flex items-center gap-2 border p-2 transition-all ${onBoard ? "border-[#a9bcac] bg-white" : "border-transparent hover:border-[#ddded8] hover:bg-white/75"}`}><button onClick={() => addGarmentToBoard(garment)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label={`Добавить ${garment.name} на доску`}><span className="h-12 w-11 shrink-0 overflow-hidden bg-[#e8e7e1]"><GarmentPreview image={garment.image} alt="" className="h-full w-full object-cover" /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{garment.name}</span><span className="mt-1 flex items-center gap-1.5 font-mono text-[8px] text-[#7b817b]"><span className={`h-1.5 w-1.5 rounded-full ${categoryMeta[garment.category].dot}`} />{garment.isDefault ? "ПРИМЕР" : formatDate(garment.createdAt).toUpperCase()}</span></span></button><div className="flex flex-col opacity-100 xl:opacity-0 xl:group-hover:opacity-100"><button onClick={() => void toggleFavorite(garment)} className={`grid h-6 w-6 place-items-center ${garment.favorite ? "text-[#b25843]" : "text-[#98a098]"}`} aria-label={`Избранное: ${garment.name}`}><Heart className={`h-3.5 w-3.5 ${garment.favorite ? "fill-current" : ""}`} /></button>{!garment.isDefault && <button onClick={() => void removeGarment(garment)} className="grid h-6 w-6 place-items-center text-[#9a9e99] hover:text-[#a94f40]" aria-label={`Удалить ${garment.name}`}><X className="h-3.5 w-3.5" /></button>}</div></div>; }) : <div className="grid min-h-28 place-items-center border border-dashed border-[#d8d9d2] p-4 text-center"><p className="text-xs text-[#727972]">В этой подборке пока ничего нет.</p></div>}</div>
        <div className="mt-5 border-t border-[#dfded8] pt-4"><div className="mb-2 flex items-center justify-between"><p className="font-mono text-[10px] font-medium tracking-[0.13em] text-[#767b74]">02 — ДОСКИ</p><div className="flex items-center gap-2"><input ref={importInputRef} type="file" accept="application/json,.json" onChange={importLook} disabled={storageState === "checking"} className="hidden" /><button onClick={() => importInputRef.current?.click()} disabled={storageState === "checking"} className="flex h-7 items-center gap-1 rounded-md px-1.5 font-mono text-[8px] font-medium tracking-[0.04em] text-[#556157] hover:bg-[#eaf0eb]" title="Импортировать доску"><FileUp className="h-3.5 w-3.5" /> ИМПОРТ</button><span className="font-mono text-[10px] text-[#767b74]">{looks.length}/24</span></div></div><div className="max-h-36 space-y-1 overflow-y-auto pr-1">{looks.slice(0, 8).map((look) => <div key={look.id} className="group flex items-center gap-1 border border-transparent px-1 py-1.5 hover:border-[#e2e1db] hover:bg-white"><button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => openLook(look)}><FolderArchive className="h-3.5 w-3.5 shrink-0 text-[#28614e]" /><span className="min-w-0"><span className="block truncate text-[11px] font-semibold">{look.name}</span><span className="font-mono text-[8px] tracking-[0.08em] text-[#848983]">{look.layers?.length ?? look.garmentIds.length} СЛОЁВ</span></span></button><div className="flex items-center"><button onClick={() => void duplicateLook(look)} className="grid h-6 w-6 place-items-center text-[#829082] hover:text-[#28614e]" aria-label={`Создать копию ${look.name}`}><Copy className="h-3 w-3" /></button><button onClick={() => void exportLook(look)} className="grid h-6 w-6 place-items-center text-[#829082] hover:text-[#28614e]" aria-label={`Экспортировать ${look.name}`}><Download className="h-3 w-3" /></button>{!look.isDefault && <button onClick={() => void deleteLook(look.id)} className="grid h-6 w-6 place-items-center text-[#9da19c] hover:text-[#a94f40]" aria-label={`Удалить ${look.name}`}><Trash2 className="h-3 w-3" /></button>}</div></div>)}</div></div>
      </div></aside>
      <section className="workspace-panel relative min-h-[680px] overflow-hidden px-5 py-6 sm:px-8 lg:px-10 xl:px-11"><div className="absolute bottom-0 right-0 top-0 hidden w-[42%] bg-[linear-gradient(135deg,transparent_35%,rgba(40,97,78,0.055)_35%,rgba(40,97,78,0.055)_35.4%,transparent_35.4%)] xl:block" /><div className="relative z-10 mx-auto flex h-full max-w-[1180px] flex-col">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.13em] text-[#717871]"><span className="h-px w-8 bg-[#28614e]" />03 — ЛИЧНАЯ ДОСКА</div><h2 className="text-[clamp(30px,3.4vw,48px)] font-bold leading-none tracking-[-0.07em]">Собери без спешки <span className="font-mono text-sm font-medium tracking-normal text-[#6f7870]">/ 2D</span></h2></div><div className="flex items-center gap-2"><button onClick={startNewBoard} className="grid h-10 w-10 place-items-center rounded-full border border-[#c6d6c9] bg-[#edf3ee] text-[#28614e] sm:flex sm:w-auto sm:gap-2 sm:px-3 sm:text-[10px] sm:font-bold" aria-label="Создать пустую доску"><Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">НОВАЯ</span></button><button onClick={undo} disabled={!past.length} className="grid h-10 w-10 place-items-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/85 text-[#445047] disabled:opacity-35" aria-label="Отменить действие"><Undo2 className="h-4 w-4" /></button><button onClick={redo} disabled={!future.length} className="grid h-10 w-10 place-items-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/85 text-[#445047] disabled:opacity-35" aria-label="Повторить действие"><Redo2 className="h-4 w-4" /></button><button onClick={() => setWarpMode((value) => !value)} disabled={!selectedLayer || selectedLayer.locked} className={`flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold ${warpMode ? "border-[#28614e] bg-[#28614e] text-white" : "border-[#d5d7d1] bg-[#fbfaf7]/85 text-[#445047]"}`} title="Точечная деформация слоя"><Pencil className="h-3.5 w-3.5" />{warpMode ? "ГОТОВО" : "ТОЧКИ"}</button><button onClick={() => void toggleFullscreen()} className="grid h-10 w-10 place-items-center rounded-full border border-[#d5d7d1] bg-[#fbfaf7]/85 text-[#445047]" aria-label={isFullscreen ? "Закрыть полноэкранный режим" : "Развернуть сцену"}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button></div></div>
        <div ref={stageFrameRef} className="canvas-frame relative min-h-[520px] flex-1 overflow-hidden border border-[#cfd3cc] bg-[#f1efe9] shadow-none"><FlatStackStage layers={workspace.layers} garments={garments} selectedLayerId={workspace.selectedLayerId} warpMode={warpMode} guide={workspace.guide} zoom={workspace.zoom} theme={theme} onSelect={(id) => { setWarpMode(false); setWorkspace((current) => ({ ...current, selectedLayerId: id })); }} onInteractionStart={remember} onLayerChange={updateLayer} onZoomChange={(zoom) => setWorkspace((current) => ({ ...current, zoom }))} onGuideChange={(guide) => setWorkspace((current) => ({ ...current, guide }))} /></div>
        <div className="mt-4 grid gap-3 border-t border-[#d9d9d2] pt-4 sm:grid-cols-[1fr_auto]"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center bg-[#e3ebe4] text-[#28614e]"><Archive className="h-4 w-4" /></span><input value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={38} placeholder="Название новой доски" className="h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[#949992]" aria-label="Название сохраняемой доски" /></div><div className="flex gap-2"><Button onClick={() => void exportLook({ name: presetName.trim() || "Текущая доска", createdAt: new Date().toISOString(), garmentIds: workspace.layers.map((layer) => layer.garmentId), layers: workspace.layers, board: { zoom: workspace.zoom, guide: workspace.guide } })} disabled={!workspace.layers.length} variant="outline" className="h-11 rounded-full border-[#b5c6b8] bg-transparent px-4 text-xs font-bold text-[#28614e] hover:bg-[#eaf0eb]"><Download className="mr-2 h-4 w-4" />Экспорт</Button><Button onClick={saveLook} disabled={!workspace.layers.length || storageState === "checking"} className="h-11 rounded-full bg-[#28614e] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(40,97,78,0.18)] hover:bg-[#1f4f3f]"><Save className="mr-2 h-4 w-4" />Сохранить</Button></div></div>
      </div></section>
      <aside className="inspector-panel border-t border-[#d9d8d1] bg-[#f8f7f3] xl:border-l xl:border-t-0"><div className="p-5 sm:p-8 xl:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] font-medium tracking-[0.13em] text-[#767b74]">04 — ИНСПЕКТОР СЛОЯ</p><h3 className="mt-1 text-lg font-bold tracking-[-0.04em]">{selectedGarment?.name || "Выбери слой"}</h3></div><span className="grid h-9 w-9 place-items-center bg-[#eaf0eb] text-[#28614e]"><SlidersHorizontal className="h-4 w-4" /></span></div>
        {selectedLayer && selectedGarment ? <div className="space-y-5"><div className="grid grid-cols-6 border border-[#dbddd6]">{[{ icon: Copy, label: "Дублировать", action: duplicateLayer }, { icon: selectedLayer.visible ? Eye : EyeOff, label: "Скрыть слой", action: () => updateSelectedLayer({ visible: !selectedLayer.visible }) }, { icon: selectedLayer.locked ? Unlock : Lock, label: "Блокировка", action: () => updateSelectedLayer({ locked: !selectedLayer.locked }) }, { icon: ArrowUp, label: "Поднять слой", action: () => moveLayer(1) }, { icon: ArrowDown, label: "Опустить слой", action: () => moveLayer(-1) }, { icon: Trash2, label: "Удалить", action: removeSelectedLayer }].map(({ icon: Icon, label, action }) => <button key={label} onClick={action} className="grid h-10 place-items-center border-r last:border-r-0 text-[#647066] hover:bg-[#edf3ee] hover:text-[#28614e]" aria-label={label}><Icon className="h-3.5 w-3.5" /></button>)}</div>
          <div className="border-y border-[#ddded8] py-4"><p className="mb-3 font-mono text-[9px] tracking-[0.12em] text-[#798078]">РАСПОЛОЖЕНИЕ</p><div className="grid grid-cols-2 gap-x-4 gap-y-4">{([{ label: "X", value: selectedLayer.x, min: -10, max: 110, patch: (value: number) => ({ x: value }) }, { label: "Y", value: selectedLayer.y, min: -10, max: 110, patch: (value: number) => ({ y: value }) }, { label: "ШИРИНА", value: selectedLayer.width, min: 8, max: 160, patch: (value: number) => ({ width: value }) }, { label: "ВЫСОТА", value: selectedLayer.height, min: 8, max: 160, patch: (value: number) => ({ height: value }) }, { label: "ПОВОРОТ", value: selectedLayer.rotation, min: -180, max: 180, patch: (value: number) => ({ rotation: value }) }, { label: "ПРОЗРАЧНОСТЬ", value: selectedLayer.opacity, min: 10, max: 100, patch: (value: number) => ({ opacity: value }) }]).map(({ label, value, min, max, patch }) => <div key={label} onPointerDown={remember}><div className="mb-2 flex justify-between font-mono text-[8px] tracking-[0.08em] text-[#687269]"><span>{label}</span><span className="text-[#28614e]">{Math.round(value)}{label === "ПРОЗРАЧНОСТЬ" ? "%" : label === "ПОВОРОТ" ? "°" : ""}</span></div><Slider value={[value]} onValueChange={([next]) => updateLayer({ ...selectedLayer, ...patch(next) })} min={min} max={max} step={1} aria-label={label} /></div>)}</div></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => updateSelectedLayer({ x: 50, y: 50 })} className="border border-[#ccd6ce] px-2.5 py-2 font-mono text-[8px] tracking-[0.06em] text-[#46614d] hover:bg-[#eaf0eb]">В ЦЕНТР</button><button onClick={() => updateSelectedLayer({ width: 100, height: 100, rotation: 0, opacity: 100 })} className="flex items-center gap-1.5 border border-[#d9ddd7] px-2.5 py-2 font-mono text-[8px] tracking-[0.06em] text-[#687269] hover:bg-white"><RotateCcw className="h-3 w-3" />СБРОСИТЬ</button></div>
          <div className="border-t border-[#ddded8] pt-4"><p className="font-mono text-[9px] leading-5 tracking-[0.08em] text-[#788078]">{warpMode ? "Тяни четыре точки, чтобы изменить форму локально." : "Тяни слой на доске. W — точки, Delete — удалить, ⌘/Ctrl+Z — отменить."}</p></div>
        </div> : <div className="border border-dashed border-[#d5d9d3] p-5 text-center"><Layers3 className="mx-auto h-5 w-5 text-[#91a092]" /><p className="mt-3 text-sm font-semibold">Здесь появятся параметры</p><p className="mt-1 text-xs leading-5 text-[#747d74]">Нажми на вещь на доске, чтобы точно её настроить.</p></div>}
        <div className="mt-6 border-t border-[#ddded8] pt-4"><div className="mb-2 flex items-center justify-between"><p className="font-mono text-[10px] font-medium tracking-[0.13em] text-[#767b74]">СЛОИ ДОСКИ</p><span className="font-mono text-xs text-[#28614e]">{visibleLayerCount.toString().padStart(2, "0")}</span></div><div className="space-y-1">{[...workspace.layers].sort((a, b) => b.zIndex - a.zIndex).map((layer) => { const garment = garments.find((item) => item.id === layer.garmentId); return garment ? <button key={layer.id} onClick={() => { setWarpMode(false); setWorkspace((current) => ({ ...current, selectedLayerId: layer.id })); }} className={`flex w-full items-center gap-2 border px-2 py-2 text-left transition-colors ${workspace.selectedLayerId === layer.id ? "border-[#94b09b] bg-[#edf3ee]" : "border-transparent hover:border-[#dedfd9] hover:bg-white"}`}><span className={`h-2 w-2 rounded-full ${categoryMeta[garment.category].dot}`} /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{garment.name}</span>{layer.locked && <Lock className="h-3 w-3 text-[#7b867c]" />}{!layer.visible && <EyeOff className="h-3 w-3 text-[#7b867c]" />}</button> : null; })}</div></div>
      </div></aside>
    </main>
  </div>;
}
