import { useState, useCallback, useRef, useMemo, useEffect, memo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";
import { usePersistFn } from "@/hooks/usePersistFn";
import {
  Plus, Minus, RotateCw, Trash2, Copy, Save, Upload, Download,
  Undo2, Redo2, Eye, Smartphone, Tablet, Monitor, Grid3X3,
  Wand2, ArrowLeft, MoreVertical, Layers, Settings, ZoomIn, ZoomOut,
  Move, MousePointer, Hand, X, Pencil, Lock, Unlock
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FloorObject {
  id?: number;
  clientId: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string | null;
  tableNumber: number | null;
  seats: number | null;
  isActive: boolean;
  qrCodeEnabled: boolean;
  qrOrderEnabled: boolean;
  qrPaymentEnabled: boolean;
  notes: string | null;
  properties: any;
}

interface DevicePosition {
  objectId: number;
  clientId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  hidden: boolean;
}

interface HistoryEntry {
  objects: FloorObject[];
  timestamp: number;
}

type DeviceType = "desktop" | "tablet" | "phone";

// ─── Constants (defined once, never re-created) ─────────────────────────────
const MAX_HISTORY = 20;

const OBJECT_LIBRARY = {
  tables: [
    { type: "table_round", label: "Rund", icon: "○", width: 80, height: 80, defaultSeats: 4 },
    { type: "table_square", label: "Quadrat", icon: "□", width: 80, height: 80, defaultSeats: 4 },
    { type: "table_rect", label: "Rechteck", icon: "▭", width: 120, height: 80, defaultSeats: 6 },
    { type: "table_long", label: "Langtisch", icon: "═", width: 200, height: 60, defaultSeats: 8 },
    { type: "table_high", label: "Stehtisch", icon: "⬡", width: 60, height: 60, defaultSeats: 2 },
    { type: "table_banquet", label: "Bankett", icon: "▬", width: 240, height: 80, defaultSeats: 12 },
    { type: "table_custom", label: "Individuell", icon: "◇", width: 100, height: 100, defaultSeats: 4 },
    { type: "table_oval", label: "Oval", icon: "⬭", width: 140, height: 90, defaultSeats: 6 },
    { type: "table_corner", label: "Ecktisch", icon: "⌐", width: 100, height: 100, defaultSeats: 3 },
    { type: "table_booth", label: "Nische", icon: "⊓", width: 140, height: 100, defaultSeats: 4 },
  ],
  seating: [
    { type: "chair", label: "Stuhl", icon: "🪑", width: 30, height: 30 },
    { type: "barstool", label: "Barhocker", icon: "⊡", width: 30, height: 30 },
    { type: "bench", label: "Bank", icon: "▰", width: 120, height: 30 },
    { type: "sofa", label: "Sofa", icon: "🛋️", width: 160, height: 60 },
    { type: "lounge_chair", label: "Sessel", icon: "🪑", width: 60, height: 60 },
    { type: "outdoor_chair", label: "Gartenstuhl", icon: "⊞", width: 35, height: 35 },
    { type: "highchair", label: "Kinderstuhl", icon: "👶", width: 30, height: 30 },
  ],
  gastro: [
    { type: "bar", label: "Bar/Theke", icon: "🍸", width: 200, height: 60 },
    { type: "bar_corner", label: "Eckbar", icon: "🍹", width: 160, height: 160 },
    { type: "kitchen", label: "Küche", icon: "👨‍🍳", width: 160, height: 120 },
    { type: "cashier", label: "Kasse", icon: "💳", width: 80, height: 60 },
    { type: "buffet", label: "Buffet", icon: "🍽️", width: 200, height: 80 },
    { type: "salad_bar", label: "Salatbar", icon: "🥗", width: 180, height: 60 },
    { type: "reception", label: "Empfang", icon: "🛎️", width: 120, height: 60 },
    { type: "wardrobe", label: "Garderobe", icon: "🧥", width: 120, height: 40 },
    { type: "wine_rack", label: "Weinregal", icon: "🍷", width: 80, height: 120 },
    { type: "coffee_machine", label: "Kaffeemaschine", icon: "☕", width: 60, height: 40 },
    { type: "ice_cream", label: "Eisvitrine", icon: "🍦", width: 140, height: 60 },
    { type: "display_case", label: "Vitrine", icon: "🧁", width: 120, height: 60 },
    { type: "serving_station", label: "Servicestation", icon: "🍴", width: 80, height: 60 },
  ],
  building: [
    { type: "wall", label: "Wand", icon: "▮", width: 200, height: 12 },
    { type: "wall_thick", label: "Dicke Wand", icon: "█", width: 200, height: 24 },
    { type: "door", label: "Tür", icon: "🚪", width: 60, height: 12 },
    { type: "door_double", label: "Doppeltür", icon: "🚪🚪", width: 120, height: 12 },
    { type: "door_sliding", label: "Schiebetür", icon: "⇔", width: 100, height: 12 },
    { type: "window", label: "Fenster", icon: "▯", width: 100, height: 12 },
    { type: "window_large", label: "Panoramafenster", icon: "▯▯", width: 200, height: 12 },
    { type: "stairs", label: "Treppe", icon: "⬈", width: 80, height: 120 },
    { type: "elevator", label: "Aufzug", icon: "⬆️", width: 80, height: 80 },
    { type: "emergency_exit", label: "Notausgang", icon: "🚨", width: 60, height: 12 },
    { type: "column", label: "Säule", icon: "●", width: 30, height: 30 },
    { type: "pillar_rect", label: "Pfeiler", icon: "■", width: 40, height: 40 },
    { type: "toilet", label: "WC", icon: "🚻", width: 100, height: 80 },
    { type: "toilet_disabled", label: "Behinderten-WC", icon: "♿", width: 120, height: 100 },
  ],
  outdoor: [
    { type: "parasol", label: "Sonnenschirm", icon: "☂️", width: 120, height: 120 },
    { type: "awning", label: "Markise", icon: "▓", width: 200, height: 40 },
    { type: "planter", label: "Pflanzkasten", icon: "🌱", width: 100, height: 30 },
    { type: "fence", label: "Zaun/Absperrung", icon: "┃┃", width: 150, height: 10 },
    { type: "heater", label: "Heizstrahler", icon: "🔥", width: 40, height: 40 },
    { type: "fountain", label: "Brunnen", icon: "⛲", width: 80, height: 80 },
    { type: "playground", label: "Spielplatz", icon: "🎠", width: 160, height: 120 },
  ],
  decoration: [
    { type: "plant", label: "Pflanze", icon: "🌿", width: 40, height: 40 },
    { type: "plant_large", label: "Grosse Pflanze", icon: "🌳", width: 60, height: 60 },
    { type: "divider", label: "Trennwand", icon: "┃", width: 12, height: 120 },
    { type: "divider_glass", label: "Glastrennwand", icon: "│", width: 8, height: 120 },
    { type: "decoration", label: "Deko", icon: "✦", width: 40, height: 40 },
    { type: "aquarium", label: "Aquarium", icon: "🐠", width: 120, height: 40 },
    { type: "fireplace", label: "Kamin", icon: "🔥", width: 100, height: 60 },
    { type: "stage", label: "Bühne", icon: "🎭", width: 200, height: 120 },
    { type: "dance_floor", label: "Tanzfläche", icon: "💃", width: 200, height: 200 },
    { type: "dj_booth", label: "DJ-Pult", icon: "🎧", width: 100, height: 60 },
  ],
};

// Flatten library for quick lookup
const LIBRARY_FLAT = Object.values(OBJECT_LIBRARY).flat();

let _nextId = 1;
function genId() { return `obj_${Date.now()}_${_nextId++}`; }

const DEVICE_DIMENSIONS: Record<DeviceType, { width: number; height: number; label: string }> = {
  desktop: { width: 1200, height: 800, label: "Desktop (Querformat)" },
  tablet: { width: 1024, height: 768, label: "Tablet (Querformat)" },
  phone: { width: 390, height: 844, label: "Smartphone (Hochformat)" },
};

// ─── Floor Styles ────────────────────────────────────────────────────────────
const FLOOR_STYLES = [
  { id: "none", label: "Kein Boden", color: "#ffffff" },
  { id: "parkett_hell", label: "Parkett Hell", color: "#d4a76a" },
  { id: "parkett_dunkel", label: "Parkett Dunkel", color: "#8b5e3c" },
  { id: "laminat_grau", label: "Laminat Grau", color: "#b8b8b8" },
  { id: "laminat_eiche", label: "Laminat Eiche", color: "#c9a96e" },
  { id: "fliesen_weiss", label: "Fliesen Weiss", color: "#f0f0f0" },
  { id: "fliesen_grau", label: "Fliesen Grau", color: "#9e9e9e" },
  { id: "fliesen_schwarz", label: "Fliesen Schwarz", color: "#3a3a3a" },
  { id: "fliesen_terrakotta", label: "Fliesen Terrakotta", color: "#c75b39" },
  { id: "rasen", label: "Rasen", color: "#4a8c3f" },
  { id: "beton", label: "Beton", color: "#8c8c8c" },
  { id: "holz_natur", label: "Holz Natur", color: "#a67c52" },
  { id: "marmor_weiss", label: "Marmor Weiss", color: "#e8e4df" },
  { id: "marmor_schwarz", label: "Marmor Schwarz", color: "#2d2d2d" },
  { id: "teppich_rot", label: "Teppich Rot", color: "#8b2020" },
  { id: "teppich_blau", label: "Teppich Blau", color: "#1e3a5f" },
];

function getFloorStyleCSS(styleId: string): React.CSSProperties {
  const style = FLOOR_STYLES.find(s => s.id === styleId);
  if (!style || styleId === "none") return { backgroundColor: "#ffffff" };
  if (styleId.startsWith("parkett")) {
    return {
      backgroundColor: style.color,
      backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 30px, rgba(0,0,0,0.05) 30px, rgba(0,0,0,0.05) 31px), repeating-linear-gradient(0deg, transparent, transparent 120px, rgba(0,0,0,0.08) 120px, rgba(0,0,0,0.08) 121px)`,
    };
  }
  if (styleId.startsWith("fliesen")) {
    return {
      backgroundColor: style.color,
      backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
      backgroundSize: "40px 40px",
    };
  }
  if (styleId === "rasen") {
    return {
      backgroundColor: style.color,
      backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)`,
      backgroundSize: "8px 8px",
    };
  }
  if (styleId.startsWith("marmor")) {
    return {
      backgroundColor: style.color,
      backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.1) 75%, transparent 75%)`,
      backgroundSize: "60px 60px",
    };
  }
  if (styleId.startsWith("laminat") || styleId.startsWith("holz")) {
    return {
      backgroundColor: style.color,
      backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(0,0,0,0.04) 60px, rgba(0,0,0,0.04) 61px)`,
    };
  }
  return { backgroundColor: style.color };
}

// ─── Canvas Object Renderer (memoized component) ────────────────────────────
const STRUCTURAL_TYPES = new Set(["wall", "wall_thick", "door", "door_double", "door_sliding", "window", "window_large", "fence", "divider", "divider_glass", "awning"]);

const CanvasObject = memo(function CanvasObject({ obj, isSelected, isHidden }: { obj: FloorObject; isSelected: boolean; isHidden?: boolean }) {
  const isTable = obj.type.startsWith("table_");
  const isStructural = STRUCTURAL_TYPES.has(obj.type);
  const libraryItem = LIBRARY_FLAT.find(l => l.type === obj.type);
  const icon = libraryItem?.icon || "?";

  const selectionRing = isSelected ? "ring-2 ring-blue-500 ring-offset-1 shadow-lg z-10" : "hover:shadow-md";
  const hiddenStyle = isHidden ? "opacity-30" : "";

  const baseStyle: React.CSSProperties = {
    left: obj.x,
    top: obj.y,
    width: obj.width,
    height: obj.height,
    transform: `rotate(${obj.rotation}deg)`,
    transformOrigin: "center center",
  };

  if (isTable) {
    const bgColor = obj.isActive ? "bg-white border-slate-300" : "bg-gray-100 border-gray-300 opacity-60";
    const shape = (obj.type === "table_round" || obj.type === "table_high" || obj.type === "table_oval") ? "rounded-full" : "rounded-lg";
    return (
      <div className={`absolute border-2 flex items-center justify-center select-none transition-shadow duration-150 ${shape} ${bgColor} ${selectionRing} ${hiddenStyle}`} style={baseStyle}>
        <div className="flex flex-col items-center gap-0.5 pointer-events-none">
          {obj.tableNumber && <span className="font-bold text-slate-700 text-[11px]">{obj.tableNumber}</span>}
          {obj.label && <span className="text-[9px] text-slate-500 truncate max-w-[90%]">{obj.label}</span>}
          {obj.seats && <span className="text-[8px] text-slate-400">{obj.seats}P</span>}
        </div>
        {isHidden && <Lock className="w-3 h-3 text-slate-400 absolute top-0.5 right-0.5" />}
      </div>
    );
  }

  if (isStructural) {
    const bgColor = obj.type.includes("wall") ? "bg-slate-700 border-slate-800" :
      obj.type.includes("door") ? "bg-amber-700 border-amber-800" :
      obj.type.includes("window") ? "bg-sky-200 border-sky-400" :
      obj.type.includes("fence") ? "bg-stone-400 border-stone-500" :
      obj.type.includes("divider") ? "bg-slate-300 border-slate-400" :
      "bg-slate-500 border-slate-600";
    const shape = obj.type.includes("wall") || obj.type.includes("fence") || obj.type.includes("divider") ? "rounded-none" : "rounded-sm";
    return (
      <div className={`absolute border flex items-center justify-center select-none transition-shadow duration-150 ${shape} ${bgColor} ${selectionRing} ${hiddenStyle}`} style={baseStyle}>
        {obj.width > 40 && obj.height > 20 && (
          <span className="text-[9px] text-white/80 pointer-events-none truncate px-1">{obj.label || libraryItem?.label}</span>
        )}
        {isHidden && <Lock className="w-3 h-3 text-white/60 absolute top-0.5 right-0.5" />}
      </div>
    );
  }

  const iconSize = Math.min(obj.width, obj.height);
  const fontSize = Math.max(14, Math.min(iconSize * 0.55, 40));

  return (
    <div
      className={`absolute flex flex-col items-center justify-center select-none transition-shadow duration-150 rounded-lg ${selectionRing} ${hiddenStyle}`}
      style={{
        ...baseStyle,
        background: isSelected ? "rgba(59,130,246,0.08)" : "transparent",
        border: isSelected ? "2px solid rgba(59,130,246,0.3)" : "2px solid transparent",
      }}
    >
      <span className="pointer-events-none leading-none" style={{ fontSize }}>{icon}</span>
      {obj.label && obj.height > 35 && (
        <span className="text-[8px] text-slate-600 truncate max-w-[95%] pointer-events-none mt-0.5">{obj.label}</span>
      )}
      {isHidden && <Lock className="w-3 h-3 text-slate-400 absolute top-0.5 right-0.5" />}
    </div>
  );
});

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FloorPlanDesigner() {
  const isMobile = useIsMobile();

  // ─── State (minimized: use refs for transient values) ─────────────────────
  const [currentPlanId, setCurrentPlanId] = useState<number | null>(null);
  const [objects, setObjects] = useState<FloorObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(isMobile ? 0.5 : 1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize] = useState(20);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [showNewPlanDialog, setShowNewPlanDialog] = useState(false);
  const [showQuickSetup, setShowQuickSetup] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanArea, setNewPlanArea] = useState("Hauptbereich");
  const [quickSetup, setQuickSetup] = useState({ rooms: 1, tablesPerRoom: 10, tableShape: "mixed" as const, seatsPerTable: 4 });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [floorStyle, setFloorStyle] = useState("none");
  const [showFloorStylePicker, setShowFloorStylePicker] = useState(false);
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null);
  const [deletePlanName, setDeletePlanName] = useState("");
  const [renamePlanId, setRenamePlanId] = useState<number | null>(null);
  const [renamePlanValue, setRenamePlanValue] = useState("");
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

  // Device-specific Layout State
  const [editingDevice, setEditingDevice] = useState<DeviceType>("desktop");
  const [devicePositions, setDevicePositions] = useState<Record<DeviceType, DevicePosition[] | null>>({
    desktop: null, tablet: null, phone: null,
  });
  const [isDeviceCustomized, setIsDeviceCustomized] = useState<Record<DeviceType, boolean>>({
    desktop: false, tablet: false, phone: false,
  });

  // ─── Refs for transient/drag state (no re-renders) ────────────────────────
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragObjStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  // Pinch-to-resize state for individual objects
  const pinchResizeStartRef = useRef<{ width: number; height: number } | null>(null);
  const pinchResizeObjRef = useRef<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Force re-render trigger for drag (minimal)
  const [, forceUpdate] = useState(0);

  // History stored in ref to avoid re-renders on every push
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyVersion, setHistoryVersion] = useState(0); // only for undo/redo UI update

  // ─── tRPC Queries ──────────────────────────────────────────────────────────
  const plansQuery = trpc.floorPlan.list.useQuery(undefined, {
    staleTime: 30000,
    retry: 1,
  });
  const planQuery = trpc.floorPlan.get.useQuery(
    { id: currentPlanId! },
    { enabled: !!currentPlanId, staleTime: 10000, retry: 1 }
  );
  const createPlanMutation = trpc.floorPlan.create.useMutation();
  const updatePlanMutation = trpc.floorPlan.update.useMutation();
  const deletePlanMutation = trpc.floorPlan.delete.useMutation();
  const duplicatePlanMutation = trpc.floorPlan.duplicate.useMutation();
  const publishMutation = trpc.floorPlan.publish.useMutation();
  const unpublishMutation = trpc.floorPlan.unpublish.useMutation();
  const bulkUpdateMutation = trpc.floorPlan.bulkUpdateObjects.useMutation();
  const saveVersionMutation = trpc.floorPlan.saveVersion.useMutation();
  const listVersionsQuery = trpc.floorPlan.listVersions.useQuery(
    { floorPlanId: currentPlanId! },
    { enabled: !!currentPlanId, staleTime: 30000 }
  );
  const restoreVersionMutation = trpc.floorPlan.restoreVersion.useMutation();
  const quickSetupMutation = trpc.floorPlan.quickSetup.useMutation();
  const analyzeImageMutation = trpc.floorPlan.analyzeImage.useMutation();

  // Device Layout queries
  const tabletLayoutQuery = trpc.floorPlan.getDeviceLayout.useQuery(
    { floorPlanId: currentPlanId!, device: "tablet" },
    { enabled: !!currentPlanId, staleTime: 30000 }
  );
  const phoneLayoutQuery = trpc.floorPlan.getDeviceLayout.useQuery(
    { floorPlanId: currentPlanId!, device: "phone" },
    { enabled: !!currentPlanId, staleTime: 30000 }
  );
  const saveDeviceLayoutMutation = trpc.floorPlan.saveDeviceLayout.useMutation();
  const deleteDeviceLayoutMutation = trpc.floorPlan.deleteDeviceLayout.useMutation();

  // ─── Load plan objects when plan changes (with guard against double-load) ──
  const lastLoadedPlanIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (planQuery.data?.objects && planQuery.data.id !== lastLoadedPlanIdRef.current) {
      lastLoadedPlanIdRef.current = planQuery.data.id;
      const loaded = planQuery.data.objects.map((obj: any) => ({
        ...obj,
        clientId: obj.id ? `db_${obj.id}` : genId(),
      }));
      setObjects(loaded);
      // Reset history
      historyRef.current = [{ objects: loaded, timestamp: Date.now() }];
      historyIndexRef.current = 0;
      setHistoryVersion(v => v + 1);
      setEditingDevice("desktop");
      setFloorStyle((planQuery.data as any).floorStyle || "none");
      setHasUnsavedChanges(false);
    }
  }, [planQuery.data]);

  // Load device layouts
  useEffect(() => {
    if (tabletLayoutQuery.data) {
      const positions = typeof tabletLayoutQuery.data.objectPositions === "string"
        ? JSON.parse(tabletLayoutQuery.data.objectPositions)
        : tabletLayoutQuery.data.objectPositions;
      setDevicePositions(prev => ({ ...prev, tablet: positions }));
      setIsDeviceCustomized(prev => ({ ...prev, tablet: true }));
    }
  }, [tabletLayoutQuery.data]);

  useEffect(() => {
    if (phoneLayoutQuery.data) {
      const positions = typeof phoneLayoutQuery.data.objectPositions === "string"
        ? JSON.parse(phoneLayoutQuery.data.objectPositions)
        : phoneLayoutQuery.data.objectPositions;
      setDevicePositions(prev => ({ ...prev, phone: positions }));
      setIsDeviceCustomized(prev => ({ ...prev, phone: true }));
    }
  }, [phoneLayoutQuery.data]);

  // ─── Get effective objects for current device ──────────────────────────────
  const effectiveObjects = useMemo(() => {
    if (editingDevice === "desktop" || !isDeviceCustomized[editingDevice]) {
      return objects;
    }
    const positions = devicePositions[editingDevice];
    if (!positions) return objects;
    return objects.map(obj => {
      const pos = positions.find((p: DevicePosition) => p.objectId === obj.id || p.clientId === obj.clientId);
      if (pos) {
        return { ...obj, x: pos.x, y: pos.y, width: pos.width, height: pos.height, rotation: pos.rotation, isActive: !pos.hidden ? obj.isActive : false };
      }
      return obj;
    });
  }, [objects, editingDevice, isDeviceCustomized, devicePositions]);

  // ─── Current canvas dimensions ─────────────────────────────────────────────
  const canvasDimensions = useMemo(() => {
    if (editingDevice === "desktop") {
      return { width: planQuery.data?.canvasWidth || 1200, height: planQuery.data?.canvasHeight || 800 };
    }
    return DEVICE_DIMENSIONS[editingDevice];
  }, [editingDevice, planQuery.data]);

  // ─── History Management (ref-based, no re-renders on push) ─────────────────
  const pushHistory = usePersistFn((newObjects: FloorObject[]) => {
    const h = historyRef.current;
    const idx = historyIndexRef.current;
    const trimmed = h.slice(0, idx + 1);
    trimmed.push({ objects: JSON.parse(JSON.stringify(newObjects)), timestamp: Date.now() });
    // Limit history to MAX_HISTORY entries
    if (trimmed.length > MAX_HISTORY) trimmed.shift();
    historyRef.current = trimmed;
    historyIndexRef.current = Math.min(trimmed.length - 1, idx + 1);
  });

  const undo = usePersistFn(() => {
    const idx = historyIndexRef.current;
    if (idx > 0) {
      const newIndex = idx - 1;
      historyIndexRef.current = newIndex;
      setObjects(JSON.parse(JSON.stringify(historyRef.current[newIndex].objects)));
      setHasUnsavedChanges(true);
      setHistoryVersion(v => v + 1);
    }
  });

  const redo = usePersistFn(() => {
    const idx = historyIndexRef.current;
    const h = historyRef.current;
    if (idx < h.length - 1) {
      const newIndex = idx + 1;
      historyIndexRef.current = newIndex;
      setObjects(JSON.parse(JSON.stringify(h[newIndex].objects)));
      setHasUnsavedChanges(true);
      setHistoryVersion(v => v + 1);
    }
  });

  // ─── Save Plan (stable ref, no re-creation) ───────────────────────────────
  const savePlan = usePersistFn(async () => {
    if (!currentPlanId) return;
    try {
      await bulkUpdateMutation.mutateAsync({
        floorPlanId: currentPlanId,
        objects: objects.map(obj => ({
          type: obj.type,
          x: obj.x, y: obj.y,
          width: obj.width, height: obj.height,
          rotation: obj.rotation,
          label: obj.label || undefined,
          tableNumber: obj.tableNumber || undefined,
          seats: obj.seats || undefined,
          isActive: obj.isActive,
          qrCodeEnabled: obj.qrCodeEnabled,
          qrOrderEnabled: obj.qrOrderEnabled,
          qrPaymentEnabled: obj.qrPaymentEnabled,
          notes: obj.notes || undefined,
          properties: obj.properties || undefined,
        })),
      });
      await updatePlanMutation.mutateAsync({ id: currentPlanId, floorStyle });
      setHasUnsavedChanges(false);
    } catch (e) {
      console.error("[FloorPlanDesigner] Auto-save failed:", e);
    }
  });

  // ─── Auto-Save (ref-based timer, no state loop) ───────────────────────────
  useEffect(() => {
    if (hasUnsavedChanges && currentPlanId) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        savePlan();
      }, 5000); // 5s debounce (was 3s - more breathing room for mobile)
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [hasUnsavedChanges, objects, floorStyle]);

  // ─── Save Device Layout ────────────────────────────────────────────────────
  const saveDeviceLayout = usePersistFn(async (device: DeviceType) => {
    if (!currentPlanId || device === "desktop") return;
    const positions = effectiveObjects.map(obj => ({
      objectId: obj.id || 0,
      x: obj.x, y: obj.y, width: obj.width, height: obj.height,
      rotation: obj.rotation, hidden: !obj.isActive,
    }));
    try {
      await saveDeviceLayoutMutation.mutateAsync({
        floorPlanId: currentPlanId, device,
        canvasWidth: DEVICE_DIMENSIONS[device].width,
        canvasHeight: DEVICE_DIMENSIONS[device].height,
        objectPositions: positions,
      });
      setDevicePositions(prev => ({ ...prev, [device]: positions }));
      setIsDeviceCustomized(prev => ({ ...prev, [device]: true }));
      toast.success(`${device === "tablet" ? "Tablet" : "Smartphone"}-Layout gespeichert`);
    } catch {
      toast.error("Fehler beim Speichern");
    }
  });

  const resetDeviceLayout = usePersistFn(async (device: DeviceType) => {
    if (!currentPlanId || device === "desktop") return;
    try {
      await deleteDeviceLayoutMutation.mutateAsync({ floorPlanId: currentPlanId, device });
      setDevicePositions(prev => ({ ...prev, [device]: null }));
      setIsDeviceCustomized(prev => ({ ...prev, [device]: false }));
      toast.success(`${device === "tablet" ? "Tablet" : "Smartphone"}-Layout zurückgesetzt`);
    } catch {
      toast.error("Fehler beim Zurücksetzen");
    }
  });

  const initDeviceLayout = usePersistFn((device: DeviceType) => {
    if (device === "desktop") return;
    const dim = DEVICE_DIMENSIONS[device];
    const desktopDim = { width: planQuery.data?.canvasWidth || 1200, height: planQuery.data?.canvasHeight || 800 };
    const scaleX = dim.width / desktopDim.width;
    const scaleY = dim.height / desktopDim.height;
    const scale = Math.min(scaleX, scaleY) * 0.85;
    const positions: DevicePosition[] = objects.map(obj => ({
      objectId: obj.id || 0, clientId: obj.clientId,
      x: Math.round(obj.x * scale + (dim.width - desktopDim.width * scale) / 2),
      y: Math.round(obj.y * scale + 20),
      width: Math.round(obj.width * scale), height: Math.round(obj.height * scale),
      rotation: obj.rotation, hidden: false,
    }));
    setDevicePositions(prev => ({ ...prev, [device]: positions }));
    setIsDeviceCustomized(prev => ({ ...prev, [device]: true }));
    toast.success(`${device === "tablet" ? "Tablet" : "Smartphone"}-Layout initialisiert`);
  });

  const switchDevice = usePersistFn((device: DeviceType) => {
    setEditingDevice(device);
    setSelectedId(null);
    setShowProperties(false);
    if (device === "phone") setZoom(isMobile ? 0.4 : 0.7);
    else if (device === "tablet") setZoom(isMobile ? 0.5 : 0.85);
    else setZoom(isMobile ? 0.5 : 1);
    setPanOffset({ x: 0, y: 0 });
  });

  // ─── Snap to Grid ──────────────────────────────────────────────────────────
  const snapToGrid = usePersistFn((value: number) => {
    if (!showGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  });

  // ─── Add Object from Library ───────────────────────────────────────────────
  const addObject = usePersistFn((libraryItem: any) => {
    const tableCount = objects.filter(o => o.type.startsWith("table_")).length;
    const w = libraryItem.width;
    const h = libraryItem.height;
    // Clamp within canvas bounds
    const maxX = Math.max(0, canvasDimensions.width - w);
    const maxY = Math.max(0, canvasDimensions.height - h);
    const rawX = snapToGrid(100 + Math.random() * Math.min(200, maxX - 100));
    const rawY = snapToGrid(100 + Math.random() * Math.min(200, maxY - 100));
    const newObj: FloorObject = {
      clientId: genId(),
      type: libraryItem.type,
      x: Math.max(0, Math.min(maxX, rawX)),
      y: Math.max(0, Math.min(maxY, rawY)),
      width: w, height: h,
      rotation: 0,
      label: libraryItem.type.startsWith("table_") ? `Tisch ${tableCount + 1}` : libraryItem.label,
      tableNumber: libraryItem.type.startsWith("table_") ? tableCount + 1 : null,
      seats: libraryItem.defaultSeats || null,
      isActive: true, qrCodeEnabled: false, qrOrderEnabled: false, qrPaymentEnabled: false,
      notes: null, properties: null,
    };
    const newObjects = [...objects, newObj];
    setObjects(newObjects);
    setSelectedId(newObj.clientId);
    pushHistory(newObjects);
    setHasUnsavedChanges(true);
    if (isMobile) {
      setShowLibrary(false);
      toast.success(`${libraryItem.label} hinzugefügt`);
    }
  });

  const deleteSelected = usePersistFn(() => {
    if (!selectedId) return;
    const newObjects = objects.filter(o => o.clientId !== selectedId);
    setObjects(newObjects);
    setSelectedId(null);
    setShowProperties(false);
    pushHistory(newObjects);
    setHasUnsavedChanges(true);
  });

  // ─── Delete Plan ──────────────────────────────────────────────────────────
  const handleDeletePlan = usePersistFn(async (planId: number) => {
    try {
      await deletePlanMutation.mutateAsync({ id: planId });
      if (currentPlanId === planId) {
        setCurrentPlanId(null);
        setObjects([]);
      }
      plansQuery.refetch();
      toast.success("Tischplan gelöscht");
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeletePlanId(null);
    }
  });

  const duplicateSelected = usePersistFn(() => {
    if (!selectedId) return;
    const obj = objects.find(o => o.clientId === selectedId);
    if (!obj) return;
    const newObj: FloorObject = { ...obj, clientId: genId(), id: undefined, x: obj.x + 20, y: obj.y + 20 };
    const newObjects = [...objects, newObj];
    setObjects(newObjects);
    setSelectedId(newObj.clientId);
    pushHistory(newObjects);
    setHasUnsavedChanges(true);
  });

  const rotateSelected = usePersistFn(() => {
    if (!selectedId) return;
    const newObjects = objects.map(o =>
      o.clientId === selectedId ? { ...o, rotation: (o.rotation + 45) % 360 } : o
    );
    setObjects(newObjects);
    pushHistory(newObjects);
    setHasUnsavedChanges(true);
  });

  const updateSelectedProp = usePersistFn((key: keyof FloorObject, value: any) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.clientId === selectedId ? { ...o, [key]: value } : o));
    setHasUnsavedChanges(true);
  });

  // ─── Pinch-to-Zoom Helper ─────────────────────────────────────────────────
  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ─── Touch Handlers (stable via usePersistFn) ─────────────────────────────
  const handleTouchStart = usePersistFn((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchStartDistRef.current = getDistance(e.touches);
      // If an object is selected, pinch resizes it; otherwise pinch zooms canvas
      if (selectedId) {
        const obj = objects.find(o => o.clientId === selectedId);
        if (obj) {
          pinchResizeStartRef.current = { width: obj.width, height: obj.height };
          pinchResizeObjRef.current = selectedId;
        }
      } else {
        pinchStartZoomRef.current = zoom;
        pinchResizeStartRef.current = null;
        pinchResizeObjRef.current = null;
      }
      return;
    }
    if (e.touches.length === 1 && isMobile) {
      const touch = e.touches[0];
      longPressTimer.current = setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left - panOffset.x) / zoom;
        const y = (touch.clientY - rect.top - panOffset.y) / zoom;
        const clickedObj = [...effectiveObjects].reverse().find(obj =>
          x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height
        );
        if (clickedObj) {
          setSelectedId(clickedObj.clientId);
          setShowProperties(true);
          if (navigator.vibrate) navigator.vibrate(50);
        }
      }, 500);
    }
  });

  const handleTouchMove = usePersistFn((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      e.preventDefault();
      const dist = getDistance(e.touches);
      const scale = dist / pinchStartDistRef.current;

      // Pinch-to-resize selected object
      if (pinchResizeStartRef.current && pinchResizeObjRef.current) {
        const minSize = 30;
        const maxW = canvasDimensions.width;
        const maxH = canvasDimensions.height;
        const newWidth = Math.max(minSize, Math.min(maxW, Math.round(pinchResizeStartRef.current.width * scale)));
        const newHeight = Math.max(minSize, Math.min(maxH, Math.round(pinchResizeStartRef.current.height * scale)));
        setObjects(prev => prev.map(o =>
          o.clientId === pinchResizeObjRef.current
            ? { ...o, width: newWidth, height: newHeight }
            : o
        ));
      } else {
        // Pinch-to-zoom canvas
        setZoom(Math.max(0.25, Math.min(3, pinchStartZoomRef.current * scale)));
      }
    }
  });

  const handleTouchEnd = usePersistFn(() => {
    if (pinchResizeStartRef.current && pinchResizeObjRef.current) {
      pushHistory(objects);
      setHasUnsavedChanges(true);
    }
    pinchStartDistRef.current = null;
    pinchResizeStartRef.current = null;
    pinchResizeObjRef.current = null;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  });

  // ─── Pointer Handlers (ref-based drag, minimal re-renders) ────────────────
  const handleCanvasPointerDown = usePersistFn((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panOffset.x) / zoom;
    const y = (e.clientY - rect.top - panOffset.y) / zoom;

    const clickedObj = [...effectiveObjects].reverse().find(obj =>
      x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height
    );

    if (tool === "pan" || e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (clickedObj) {
      setSelectedId(clickedObj.clientId);
      if (!isMobile) setShowProperties(true);
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragObjStartRef.current = { x: clickedObj.x, y: clickedObj.y };
      canvas.setPointerCapture(e.pointerId);
    } else {
      setSelectedId(null);
      setShowProperties(false);
    }
  });

  const handleCanvasPointerMove = usePersistFn((e: React.PointerEvent) => {
    if (isPanningRef.current) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (isDraggingRef.current && selectedId) {
      const dx = (e.clientX - dragStartRef.current.x) / zoom;
      const dy = (e.clientY - dragStartRef.current.y) / zoom;
      const rawX = snapToGrid(dragObjStartRef.current.x + dx);
      const rawY = snapToGrid(dragObjStartRef.current.y + dy);
      // Clamp within canvas bounds so objects never go outside
      const draggedObj = objects.find(o => o.clientId === selectedId);
      const objW = draggedObj?.width || 80;
      const objH = draggedObj?.height || 80;
      const maxX = canvasDimensions.width - objW;
      const maxY = canvasDimensions.height - objH;
      const newX = Math.max(0, Math.min(maxX, rawX));
      const newY = Math.max(0, Math.min(maxY, rawY));

      if (editingDevice === "desktop") {
        setObjects(prev => prev.map(o =>
          o.clientId === selectedId ? { ...o, x: newX, y: newY } : o
        ));
      } else {
        setDevicePositions(prev => {
          const positions = prev[editingDevice] || [];
          const updated = positions.map((p: DevicePosition) =>
            (p.objectId === objects.find(o => o.clientId === selectedId)?.id || p.clientId === selectedId)
              ? { ...p, x: newX, y: newY }
              : p
          );
          return { ...prev, [editingDevice]: updated };
        });
      }
    }
  });

  const handleCanvasPointerUp = usePersistFn((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      if (editingDevice === "desktop") {
        pushHistory(objects);
      }
      setHasUnsavedChanges(true);
    }
    isDraggingRef.current = false;
    isPanningRef.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  });

  const handleWheel = usePersistFn((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.25, Math.min(3, prev + delta)));
  });

  // ─── Create New Plan ───────────────────────────────────────────────────────
  const handleCreatePlan = async (nameOverride?: string): Promise<number | null> => {
    const name = nameOverride || newPlanName.trim();
    if (!name) return null;
    try {
      const result = await createPlanMutation.mutateAsync({ name, areaName: newPlanArea });
      setCurrentPlanId(result.id);
      setObjects([]);
      setShowNewPlanDialog(false);
      setNewPlanName("");
      plansQuery.refetch();
      toast.success("Tischplan erstellt");
      return result.id;
    } catch (err: unknown) {
      console.error("[FloorPlanDesigner] handleCreatePlan error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Fehler beim Erstellen: " + msg);
      return null;
    }
  };

  const handleQuickSetup = async (planId?: number) => {
    const id = planId || currentPlanId;
    if (!id) return;
    try {
      await quickSetupMutation.mutateAsync({ floorPlanId: id, ...quickSetup });
      planQuery.refetch();
      setShowQuickSetup(false);
      toast.success("Tischplan automatisch erstellt");
    } catch {
      toast.error("Fehler beim Erstellen");
    }
  };

  const handlePublish = async () => {
    if (!currentPlanId) return;
    try {
      await savePlan();
      if (isDeviceCustomized.tablet) await saveDeviceLayout("tablet");
      if (isDeviceCustomized.phone) await saveDeviceLayout("phone");
      await saveVersionMutation.mutateAsync({ floorPlanId: currentPlanId, description: "Veröffentlicht" });
      await publishMutation.mutateAsync({ id: currentPlanId });
      plansQuery.refetch();
      toast.success("Tischplan veröffentlicht");
    } catch {
      toast.error("Fehler beim Veröffentlichen");
    }
  };

  // ─── Selected Object ──────────────────────────────────────────────────────
  const selectedObject = useMemo(() => effectiveObjects.find(o => o.clientId === selectedId), [effectiveObjects, selectedId]);

  // ─── Plan List View (no plan selected) ────────────────────────────────────
  if (!currentPlanId) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        {/* KI-Analyse Ladeindikator */}
        {isAiAnalyzing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-xs mx-4">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900 text-base">KI analysiert Tischplan…</p>
                <p className="text-sm text-slate-500 mt-1">Tische, Türen und Bereiche werden erkannt</p>
                <p className="text-xs text-slate-400 mt-2">Dies kann 10–30 Sekunden dauern</p>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Tischplan-Designer</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">Restaurant-Grundrisse erstellen und pro Gerät anpassen</p>
          </div>
        </div>

        {/* Creation Options */}
        <div className="grid grid-cols-2 gap-2 md:gap-3 mb-6 md:mb-8">
          <Card className="p-3 md:p-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.97]" onClick={() => setShowNewPlanDialog(true)}>
            <div className="flex flex-col md:flex-row items-center md:items-center gap-2 md:gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-center md:text-left">
                <p className="font-medium text-slate-900 text-xs md:text-sm">Leerer Plan</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 md:p-4 cursor-pointer hover:border-purple-300 hover:shadow-md transition-all active:scale-[0.97]" onClick={() => { setShowNewPlanDialog(true); setShowQuickSetup(true); }}>
            <div className="flex flex-col md:flex-row items-center md:items-center gap-2 md:gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                <Wand2 className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-center md:text-left">
                <p className="font-medium text-slate-900 text-xs md:text-sm">Assistent</p>
              </div>
            </div>
          </Card>

          <Card
            className={`p-3 md:p-4 cursor-pointer hover:border-green-300 hover:shadow-md transition-all active:scale-[0.97] ${isAiAnalyzing ? "opacity-50 pointer-events-none" : ""}`}
            onClick={() => !isAiAnalyzing && fileInputRef.current?.click()}
          >
            <div className="flex flex-col md:flex-row items-center md:items-center gap-2 md:gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                {isAiAnalyzing ? (
                  <svg className="w-5 h-5 text-green-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <Upload className="w-5 h-5 text-green-600" />
                )}
              </div>
              <div className="text-center md:text-left">
                <p className="font-medium text-slate-900 text-xs md:text-sm">
                  {isAiAnalyzing ? "KI analysiert…" : "KI-Erkennung"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-3 md:p-4 cursor-pointer hover:border-amber-300 hover:shadow-md transition-all opacity-60" onClick={() => toast.info("Wählen Sie einen bestehenden Plan zum Kopieren")}>
            <div className="flex flex-col md:flex-row items-center md:items-center gap-2 md:gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Copy className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-center md:text-left">
                <p className="font-medium text-slate-900 text-xs md:text-sm">Kopieren</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Existing Plans */}
        <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3">Ihre Tischpläne</h2>
        {plansQuery.isLoading ? (
          <div className="text-center py-12 text-slate-400">Laden...</div>
        ) : plansQuery.isError ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-red-600 mb-2">Fehler beim Laden der Tischpläne</p>
            <Button variant="outline" size="sm" onClick={() => plansQuery.refetch()}>Erneut versuchen</Button>
          </Card>
        ) : !plansQuery.data?.length ? (
          <Card className="p-6 md:p-8 text-center">
            <Grid3X3 className="w-10 h-10 md:w-12 md:h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-600 text-sm">Noch keine Tischpläne</p>
            <p className="text-xs text-slate-400 mt-1">Erstellen Sie Ihren ersten Tischplan</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plansQuery.data.map((plan: any) => (
              <Card key={plan.id} className="overflow-hidden">
                {deletePlanId === plan.id ? (
                  /* Inline delete confirmation - no dialog/portal needed (iOS Safari compatible) */
                  <div className="p-4 bg-red-50">
                    <p className="text-sm font-medium text-red-800 mb-3">
                      „{plan.name}“ wirklich löschen?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleDeletePlan(plan.id)}
                      >
                        Ja, löschen
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setDeletePlanId(null)}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : renamePlanId === plan.id ? (
                  /* Rename mode */
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-500">Tischplan umbenennen</p>
                    <input
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={renamePlanValue}
                      onChange={e => setRenamePlanValue(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && renamePlanValue.trim()) {
                          await updatePlanMutation.mutateAsync({ id: plan.id, name: renamePlanValue.trim() });
                          plansQuery.refetch();
                          setRenamePlanId(null);
                        } else if (e.key === "Escape") {
                          setRenamePlanId(null);
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!renamePlanValue.trim() || updatePlanMutation.isPending}
                        onClick={async () => {
                          if (!renamePlanValue.trim()) return;
                          await updatePlanMutation.mutateAsync({ id: plan.id, name: renamePlanValue.trim() });
                          plansQuery.refetch();
                          setRenamePlanId(null);
                        }}
                      >
                        Speichern
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setRenamePlanId(null)}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Normal card view */
                  <div className="flex">
                    {/* Plan info - clickable to open */}
                    <div
                      className="flex-1 p-4 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors min-w-0"
                      onClick={() => setCurrentPlanId(plan.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 truncate">{plan.name}</p>
                          <p className="text-xs text-slate-500">{plan.areaName}</p>
                        </div>
                        <Badge variant={plan.status === "published" ? "default" : "secondary"}>
                          {plan.status === "published" ? "Live" : "Entwurf"}
                        </Badge>
                      </div>
                    </div>
                    {/* Rename button */}
                    <div
                      className="flex items-center justify-center w-12 border-l border-slate-200 text-slate-400 active:text-blue-600 active:bg-blue-50 transition-colors touch-manipulation cursor-pointer select-none"
                      role="button"
                      tabIndex={0}
                      title="Umbenennen"
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRenamePlanId(plan.id);
                        setRenamePlanValue(plan.name);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRenamePlanId(plan.id);
                        setRenamePlanValue(plan.name);
                      }}
                    >
                      <Pencil className="w-4 h-4 pointer-events-none" />
                    </div>
                    {/* Delete button - uses onTouchEnd for reliable iOS Safari handling */}
                    <div
                      className="flex items-center justify-center w-12 border-l border-slate-200 text-slate-400 active:text-red-600 active:bg-red-100 transition-colors touch-manipulation cursor-pointer select-none"
                      role="button"
                      tabIndex={0}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletePlanId(plan.id);
                        setDeletePlanName(plan.name);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletePlanId(plan.id);
                        setDeletePlanName(plan.name);
                      }}
                    >
                      <Trash2 className="w-5 h-5 pointer-events-none" />
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* New Plan Dialog */}
        <Dialog open={showNewPlanDialog} onOpenChange={(open) => { setShowNewPlanDialog(open); if (!open) setShowQuickSetup(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{showQuickSetup ? "Schnell-Assistent" : "Neuer Tischplan"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={newPlanName} onChange={e => setNewPlanName(e.target.value)} placeholder="z.B. Hauptraum, Terrasse..." />
              </div>
              <div>
                <Label>Bereich</Label>
                <Input value={newPlanArea} onChange={e => setNewPlanArea(e.target.value)} placeholder="z.B. Innenbereich, Terrasse..." />
              </div>
              {showQuickSetup && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Räume</Label>
                    <Input type="number" min={1} max={10} value={quickSetup.rooms} onChange={e => setQuickSetup(s => ({ ...s, rooms: +e.target.value }))} />
                  </div>
                  <div>
                    <Label>Tische/Raum</Label>
                    <Input type="number" min={1} max={100} value={quickSetup.tablesPerRoom} onChange={e => setQuickSetup(s => ({ ...s, tablesPerRoom: +e.target.value }))} />
                  </div>
                  <div>
                    <Label>Tischform</Label>
                    <Select value={quickSetup.tableShape} onValueChange={v => setQuickSetup(s => ({ ...s, tableShape: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="round">Rund</SelectItem>
                        <SelectItem value="square">Quadratisch</SelectItem>
                        <SelectItem value="rect">Rechteckig</SelectItem>
                        <SelectItem value="mixed">Gemischt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Sitzplätze</Label>
                    <Input type="number" min={1} max={20} value={quickSetup.seatsPerTable} onChange={e => setQuickSetup(s => ({ ...s, seatsPerTable: +e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowNewPlanDialog(false); setShowQuickSetup(false); }}>Abbrechen</Button>
              <Button onClick={async () => {
                const newId = await handleCreatePlan();
                if (showQuickSetup && newId) {
                  await handleQuickSetup(newId);
                }
              }}>
                {showQuickSetup ? "Generieren" : "Erstellen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setIsAiAnalyzing(true);
          try {
            const planName = file.name.replace(/\.[^.]+$/, "") || "KI-Plan";
            const newId = await handleCreatePlan(planName);
            if (!newId) { toast.error("Plan konnte nicht erstellt werden"); setIsAiAnalyzing(false); return; }
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const dataUrl = reader.result as string;

                // Measure the actual image dimensions so we can pass them to the backend
                // for accurate proportional scaling.
                const imgDims = await new Promise<{ w: number; h: number }>((resolve) => {
                  const img = new Image();
                  img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
                  img.onerror = () => resolve({ w: 1200, h: 800 });
                  img.src = dataUrl;
                });

                // Pass the data URL directly to the backend (no storage upload needed).
                // The LLM core already handles data: URLs natively (base64 image blocks).
                // This avoids signed-URL issues with /manus-storage/ paths.
                const analysis = await analyzeImageMutation.mutateAsync({
                  imageUrl: dataUrl,
                  imageWidth: imgDims.w,
                  imageHeight: imgDims.h,
                });
                if (analysis.objects?.length) {
                  const cw = canvasDimensions.width;  // 1200
                  const ch = canvasDimensions.height; // 800

                  // Valid object types accepted by the backend schema
                  const VALID_TYPES = new Set([
                    "table_round", "table_square", "table_rect", "table_long", "table_high",
                    "table_banquet", "table_custom", "table_oval", "table_corner", "table_booth",
                    "chair", "barstool", "bench", "sofa", "lounge_chair", "outdoor_chair", "highchair",
                    "bar", "bar_corner", "kitchen", "cashier", "buffet", "salad_bar", "reception",
                    "wardrobe", "wine_rack", "coffee_machine", "ice_cream", "display_case", "serving_station",
                    "wall", "wall_thick", "door", "door_double", "door_sliding",
                    "window", "window_large", "stairs", "elevator", "emergency_exit",
                    "column", "pillar_rect", "toilet", "toilet_disabled",
                    "parasol", "awning", "planter", "fence", "heater", "fountain", "playground",
                    "plant", "plant_large", "divider", "divider_glass", "decoration",
                    "aquarium", "fireplace", "stage", "dance_floor", "dj_booth",
                  ]);

                  const recognized: FloorObject[] = analysis.objects.map((obj: any) => {
                    // Convert percent coordinates (0-100) to canvas pixels
                    const xPct = typeof obj.x_pct === 'number' ? obj.x_pct : (obj.x ?? 10);
                    const yPct = typeof obj.y_pct === 'number' ? obj.y_pct : (obj.y ?? 10);
                    const wPct = typeof obj.width_pct === 'number' ? obj.width_pct : (obj.width ?? 7);
                    const hPct = typeof obj.height_pct === 'number' ? obj.height_pct : (obj.height ?? 14);

                    const w = Math.max(20, Math.round(wPct / 100 * cw));
                    const h = Math.max(20, Math.round(hPct / 100 * ch));
                    const x = Math.max(0, Math.min(cw - w, Math.round(xPct / 100 * cw)));
                    const y = Math.max(0, Math.min(ch - h, Math.round(yPct / 100 * ch)));
                    const objType = VALID_TYPES.has(obj.type) ? obj.type : "decoration";
                    return {
                      clientId: genId(),
                      type: objType,
                      x, y, width: w, height: h,
                      rotation: obj.rotation || 0,
                      label: obj.label || null,
                      tableNumber: obj.tableNumber || null,
                      seats: obj.seats || null,
                      isActive: true, qrCodeEnabled: false, qrOrderEnabled: false, qrPaymentEnabled: false,
                      notes: null, properties: null,
                    };
                  });
                  setObjects(recognized);
                  setHasUnsavedChanges(true);
                  toast.success(`${recognized.length} Objekte erkannt und platziert`);
                } else {
                  toast.info("Keine Objekte erkannt – leerer Plan erstellt");
                }
              } catch (err) {
                console.error("[FloorPlanDesigner] KI-Analyse error:", err);
                toast.error("KI-Analyse fehlgeschlagen");
              } finally {
                setIsAiAnalyzing(false);
              }
            };
            reader.readAsDataURL(file);
          } catch {
            toast.error("Fehler bei der KI-Erkennung");
            setIsAiAnalyzing(false);
          }
          e.target.value = "";
        }} />
      </div>
    );
  }

  // ─── Editor View ───────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* KI-Analyse Ladeindikator (Editor-Ansicht) */}
      {isAiAnalyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-xs mx-4">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-900 text-base">KI analysiert Tischplan…</p>
              <p className="text-sm text-slate-500 mt-1">Tische, Türen und Bereiche werden erkannt</p>
              <p className="text-xs text-slate-400 mt-2">Dies kann 10–30 Sekunden dauern</p>
            </div>
          </div>
        </div>
      )}
      {/* ─── Top Toolbar ──────────────────────────────────────────────────────── */}
      {isMobile ? (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-white shrink-0">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => { savePlan(); setCurrentPlanId(null); }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium text-slate-700 truncate flex-1 mx-1">
            {planQuery.data?.name || "..."}
          </span>
          {hasUnsavedChanges && <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}

          <DeviceSwitcher editingDevice={editingDevice} isDeviceCustomized={isDeviceCustomized} switchDevice={switchDevice} />

          <Button variant={tool === "select" ? "default" : "ghost"} size="sm" className="h-9 w-9 p-0" onClick={() => setTool("select")}>
            <MousePointer className="w-4 h-4" />
          </Button>
          <Button variant={tool === "pan" ? "default" : "ghost"} size="sm" className="h-9 w-9 p-0" onClick={() => setTool("pan")}>
            <Hand className="w-4 h-4" />
          </Button>

          <Button size="sm" className="h-9 w-9 p-0 bg-blue-600 hover:bg-blue-700 text-white shrink-0" onClick={() => setShowLibrary(true)} title="Objekte hinzufügen">
            <Plus className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setShowMobileMenu(!showMobileMenu)}>
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-white shrink-0 overflow-x-auto">
          <Button variant="ghost" size="sm" onClick={() => { savePlan(); setCurrentPlanId(null); }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-slate-700 truncate max-w-[120px]">
            {planQuery.data?.name || "..."}
          </span>
          {hasUnsavedChanges && <Badge variant="secondary" className="text-[10px]">Ungespeichert</Badge>}

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <Button variant={tool === "select" ? "default" : "ghost"} size="sm" onClick={() => setTool("select")} title="Auswählen">
            <MousePointer className="w-4 h-4" />
          </Button>
          <Button variant={tool === "pan" ? "default" : "ghost"} size="sm" onClick={() => setTool("pan")} title="Verschieben">
            <Hand className="w-4 h-4" />
          </Button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndexRef.current <= 0} title="Rückgängig">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={historyIndexRef.current >= historyRef.current.length - 1} title="Wiederholen">
            <Redo2 className="w-4 h-4" />
          </Button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Verkleinern">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-slate-500 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(3, z + 0.25))} title="Vergrössern">
            <ZoomIn className="w-4 h-4" />
          </Button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <Button variant={showGrid ? "default" : "ghost"} size="sm" onClick={() => setShowGrid(!showGrid)} title="Raster">
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowFloorStylePicker(!showFloorStylePicker)} title="Boden">
            <Layers className="w-4 h-4" />
          </Button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowLibrary(!showLibrary)} title="Objekte hinzufügen">
            <Plus className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Objekte</span>
          </Button>

          <div className="flex-1" />

          <DeviceSwitcher editingDevice={editingDevice} isDeviceCustomized={isDeviceCustomized} switchDevice={switchDevice} />

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <Button variant="ghost" size="sm" onClick={() => { savePlan(); toast.success("Gespeichert"); }} title="Speichern">
            <Save className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={handlePublish} className="bg-green-600 hover:bg-green-700 text-white">
            <Eye className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Veröffentlichen</span>
          </Button>
        </div>
      )}

      {/* ─── Device Layout Info Bar ───────────────────────────────────────────── */}
      {editingDevice !== "desktop" && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-1.5 flex-1">
            {editingDevice === "tablet" ? <Tablet className="w-3.5 h-3.5 text-blue-600" /> : <Smartphone className="w-3.5 h-3.5 text-blue-600" />}
            <span className="text-xs font-medium text-blue-700">
              {editingDevice === "tablet" ? "Tablet" : "Smartphone"}-Layout
            </span>
            {isDeviceCustomized[editingDevice] ? (
              <Badge variant="default" className="text-[9px] h-4 bg-green-600">Individuell</Badge>
            ) : (
              <Badge variant="secondary" className="text-[9px] h-4">Vom Desktop</Badge>
            )}
            <span className="text-[10px] text-blue-500 ml-1">
              {DEVICE_DIMENSIONS[editingDevice].width}×{DEVICE_DIMENSIONS[editingDevice].height}px
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!isDeviceCustomized[editingDevice] ? (
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => initDeviceLayout(editingDevice)}>
                Individuell anpassen
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => saveDeviceLayout(editingDevice)}>
                  <Save className="w-3 h-3 mr-1" /> Speichern
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-600" onClick={() => resetDeviceLayout(editingDevice)}>
                  <Unlock className="w-3 h-3 mr-1" /> Zurücksetzen
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Mobile More Menu ─────────────────────────────────────────────────── */}
      {isMobile && showMobileMenu && (
        <div className="absolute top-12 right-2 z-50 bg-white rounded-lg shadow-lg border p-2 min-w-[180px]">
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md" onClick={() => { undo(); setShowMobileMenu(false); }}>
            <Undo2 className="w-4 h-4" /> Rückgängig
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md" onClick={() => { redo(); setShowMobileMenu(false); }}>
            <Redo2 className="w-4 h-4" /> Wiederholen
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md" onClick={() => { setShowGrid(!showGrid); setShowMobileMenu(false); }}>
            <Grid3X3 className="w-4 h-4" /> Raster {showGrid ? "aus" : "ein"}
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md" onClick={() => { setShowFloorStylePicker(true); setShowMobileMenu(false); }}>
            <Layers className="w-4 h-4" /> Boden
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md" onClick={() => { savePlan(); toast.success("Gespeichert"); setShowMobileMenu(false); }}>
            <Save className="w-4 h-4" /> Speichern
          </button>
          {editingDevice !== "desktop" && !isDeviceCustomized[editingDevice] && (
            <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 rounded-md" onClick={() => { initDeviceLayout(editingDevice); setShowMobileMenu(false); }}>
              <Pencil className="w-4 h-4" /> Individuell anpassen
            </button>
          )}
          {editingDevice !== "desktop" && isDeviceCustomized[editingDevice] && (
            <>
              <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-green-700 hover:bg-green-50 rounded-md" onClick={() => { saveDeviceLayout(editingDevice); setShowMobileMenu(false); }}>
                <Save className="w-4 h-4" /> Layout speichern
              </button>
              <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md" onClick={() => { resetDeviceLayout(editingDevice); setShowMobileMenu(false); }}>
                <Unlock className="w-4 h-4" /> Zurücksetzen
              </button>
            </>
          )}
          <div className="h-px bg-slate-100 my-1" />
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-green-700 hover:bg-green-50 rounded-md" onClick={() => { handlePublish(); setShowMobileMenu(false); }}>
            <Eye className="w-4 h-4" /> Veröffentlichen
          </button>
          <div className="h-px bg-slate-100 my-1" />
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-slate-500">Zoom</span>
            <div className="flex items-center gap-1">
              <button className="w-7 h-7 flex items-center justify-center rounded bg-slate-100" onClick={() => setZoom(z => Math.max(0.25, z - 0.15))}>
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button className="w-7 h-7 flex items-center justify-center rounded bg-slate-100" onClick={() => setZoom(z => Math.min(3, z + 0.15))}>
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Floor Style Picker ─────────────────────────────────────────────── */}
      {showFloorStylePicker && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-white rounded-lg shadow-lg border p-3 w-[320px] max-h-[260px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Boden wählen</span>
            <button onClick={() => setShowFloorStylePicker(false)} className="p-1 hover:bg-slate-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {FLOOR_STYLES.map(s => (
              <button
                key={s.id}
                onClick={() => { setFloorStyle(s.id); setHasUnsavedChanges(true); setShowFloorStylePicker(false); }}
                className={`flex flex-col items-center gap-1 p-2 rounded-md border transition-all ${
                  floorStyle === s.id ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="w-8 h-8 rounded-sm border border-slate-200" style={getFloorStyleCSS(s.id)} />
                <span className="text-[9px] text-slate-600 text-center leading-tight">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: Object Library (Desktop/Tablet only) */}
        {!isMobile && (
          <div className={`${showLibrary ? "w-56 md:w-64" : "w-0"} shrink-0 border-r bg-white overflow-y-auto transition-all duration-200`}>
            {showLibrary && <LibraryContent addObject={addObject} />}
          </div>
        )}

        {/* Center: Canvas */}
        <div className="flex-1 overflow-hidden bg-slate-50 relative">
          {editingDevice !== "desktop" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-blue-600/90 text-white text-[10px] px-2 py-0.5 rounded-full">
              {editingDevice === "tablet" ? "Tablet" : "Smartphone"} · {canvasDimensions.width}×{canvasDimensions.height}
            </div>
          )}

          <div
            ref={canvasRef}
            className="w-full h-full overflow-hidden touch-none"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ cursor: tool === "pan" ? "grab" : "default" }}
          >
            <div
              className="relative"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                width: canvasDimensions.width,
                height: canvasDimensions.height,
              }}
            >
              {/* Grid */}
              {showGrid && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
                  <defs>
                    <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                      <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              )}

              {/* Canvas Background with floor style */}
              <div className={`absolute inset-0 border rounded-lg shadow-sm ${
                editingDevice === "phone" ? "border-blue-300 border-2" :
                editingDevice === "tablet" ? "border-purple-300 border-2" :
                "border-slate-200"
              }`} style={getFloorStyleCSS(floorStyle)} />

              {/* Objects (memoized) */}
              {effectiveObjects.map(obj => (
                <CanvasObject key={obj.clientId} obj={obj} isSelected={obj.clientId === selectedId} />
              ))}
            </div>
          </div>

          {/* Object count badge */}
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-slate-500 shadow-sm">
            {objects.filter(o => o.type.startsWith("table_")).length} Tische · {objects.length} Objekte
          </div>

          {/* ─── Mobile Floating Action Buttons ─────────────────────────────────── */}
          {isMobile && (
            <div className="absolute right-3 flex flex-col gap-2" style={{ bottom: "max(5rem, calc(1.25rem + env(safe-area-inset-bottom, 3rem)))" }}>
              {selectedId && (
                <>
                  <Button size="sm" variant="destructive" className="h-11 w-11 rounded-full p-0 shadow-lg" onClick={deleteSelected}>
                    <Trash2 className="w-5 h-5" />
                  </Button>
                  <Button size="sm" variant="secondary" className="h-11 w-11 rounded-full p-0 shadow-lg" onClick={rotateSelected}>
                    <RotateCw className="w-5 h-5" />
                  </Button>
                  <Button size="sm" variant="secondary" className="h-11 w-11 rounded-full p-0 shadow-lg" onClick={() => setShowProperties(true)}>
                    <Pencil className="w-5 h-5" />
                  </Button>
                </>
              )}
              <Button size="sm" className="h-12 w-12 rounded-full p-0 shadow-lg bg-blue-600 hover:bg-blue-700" onClick={() => setShowLibrary(true)}>
                <Plus className="w-6 h-6 text-white" />
              </Button>
            </div>
          )}
        </div>

        {/* Right: Properties Panel (Desktop/Tablet only) */}
        {!isMobile && showProperties && selectedObject && (
          <div className="w-64 md:w-72 shrink-0 border-l bg-white overflow-y-auto">
            <PropertiesPanel selectedObject={selectedObject} updateSelectedProp={updateSelectedProp} rotateSelected={rotateSelected} duplicateSelected={duplicateSelected} deleteSelected={deleteSelected} />
          </div>
        )}
      </div>

      {/* ─── Mobile Drawers ───────────────────────────────────────────────────── */}
      {isMobile && (
        <Drawer open={showLibrary} onOpenChange={setShowLibrary}>
          <DrawerContent className="max-h-[75vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-base">Objekt hinzufügen</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto pb-6">
              <LibraryContent addObject={addObject} />
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {isMobile && (
        <Drawer open={showProperties && !!selectedObject} onOpenChange={setShowProperties}>
          <DrawerContent className="max-h-[70vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-base">Eigenschaften bearbeiten</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto pb-6">
              {selectedObject && <PropertiesPanel selectedObject={selectedObject} updateSelectedProp={updateSelectedProp} rotateSelected={rotateSelected} duplicateSelected={duplicateSelected} deleteSelected={deleteSelected} />}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Desktop Library Toggle */}
      {!isMobile && !showLibrary && (
        <Button variant="ghost" size="sm" className="absolute top-14 left-2 z-10" onClick={() => setShowLibrary(true)}>
          <Layers className="w-4 h-4 mr-1" /> Bibliothek
        </Button>
      )}

    </div>
  );
}

// ─── Extracted Sub-Components (stable, no re-render cascade) ─────────────────

const DeviceSwitcher = memo(function DeviceSwitcher({ editingDevice, isDeviceCustomized, switchDevice }: {
  editingDevice: DeviceType;
  isDeviceCustomized: Record<DeviceType, boolean>;
  switchDevice: (d: DeviceType) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
      {(["desktop", "tablet", "phone"] as DeviceType[]).map(device => {
        const Icon = device === "desktop" ? Monitor : device === "tablet" ? Tablet : Smartphone;
        const isActive = editingDevice === device;
        const isCustom = isDeviceCustomized[device];
        return (
          <Button key={device} variant={isActive ? "default" : "ghost"} size="sm" className="h-7 px-2 relative" onClick={() => switchDevice(device)} title={`${DEVICE_DIMENSIONS[device].label}${isCustom ? " (individuell)" : ""}`}>
            <Icon className="w-3.5 h-3.5" />
            {isCustom && device !== "desktop" && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />
            )}
          </Button>
        );
      })}
    </div>
  );
});

const categoryLabels: Record<string, string> = {
  tables: "Tische", seating: "Sitzgelegenheiten", gastro: "Gastronomie",
  building: "Gebäude", outdoor: "Aussenbereich", decoration: "Dekoration",
};
const categoryColors: Record<string, string> = {
  tables: "hover:border-blue-300 hover:bg-blue-50",
  seating: "hover:border-indigo-300 hover:bg-indigo-50",
  gastro: "hover:border-amber-300 hover:bg-amber-50",
  building: "hover:border-slate-400 hover:bg-slate-50",
  outdoor: "hover:border-sky-300 hover:bg-sky-50",
  decoration: "hover:border-green-300 hover:bg-green-50",
};

const LibraryContent = memo(function LibraryContent({ addObject }: { addObject: (item: any) => void }) {
  return (
    <div className="p-3">
      {Object.entries(OBJECT_LIBRARY).map(([category, items]) => (
        <div key={category} className="mb-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {categoryLabels[category] || category} ({items.length})
          </h3>
          <div className="grid grid-cols-4 md:grid-cols-3 gap-1.5">
            {items.map(item => (
              <button
                key={item.type}
                onClick={() => addObject(item)}
                className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border border-slate-200 ${categoryColors[category] || "hover:border-blue-300 hover:bg-blue-50"} active:scale-[0.95] transition-all text-center min-h-[48px]`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-[9px] text-slate-600 leading-tight truncate w-full">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

const PropertiesPanel = memo(function PropertiesPanel({ selectedObject, updateSelectedProp, rotateSelected, duplicateSelected, deleteSelected }: {
  selectedObject: FloorObject;
  updateSelectedProp: (key: keyof FloorObject, value: any) => void;
  rotateSelected: () => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
}) {
  return (
    <div className="p-3 md:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Eigenschaften</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={rotateSelected} title="Drehen">
            <RotateCw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={duplicateSelected} title="Duplizieren">
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={deleteSelected} title="Löschen">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full grid grid-cols-2 h-9">
          <TabsTrigger value="general" className="text-xs">Allgemein</TabsTrigger>
          <TabsTrigger value="functions" className="text-xs">Funktionen</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-3 mt-3">
          <div>
            <Label className="text-xs">Bezeichnung</Label>
            <Input value={selectedObject.label || ""} onChange={e => updateSelectedProp("label", e.target.value || null)} className="h-9 text-sm" />
          </div>
          {selectedObject.type.startsWith("table_") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tischnr.</Label>
                <Input type="number" value={selectedObject.tableNumber || ""} onChange={e => updateSelectedProp("tableNumber", +e.target.value || null)} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Sitzplätze</Label>
                <Input type="number" value={selectedObject.seats || ""} onChange={e => updateSelectedProp("seats", +e.target.value || null)} className="h-9 text-sm" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Breite</Label>
              <Input type="number" value={selectedObject.width} onChange={e => updateSelectedProp("width", +e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Höhe</Label>
              <Input type="number" value={selectedObject.height} onChange={e => updateSelectedProp("height", +e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Drehung ({selectedObject.rotation}°)</Label>
            <input type="range" min={0} max={360} step={15} value={selectedObject.rotation} onChange={e => updateSelectedProp("rotation", +e.target.value)} className="w-full h-2 mt-1" />
          </div>
        </TabsContent>

        <TabsContent value="functions" className="space-y-3 mt-3">
          <div className="flex items-center justify-between py-1">
            <Label className="text-xs">Aktiv</Label>
            <Switch checked={selectedObject.isActive} onCheckedChange={v => updateSelectedProp("isActive", v)} />
          </div>
          {selectedObject.type.startsWith("table_") && (
            <>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs">QR-Code</Label>
                <Switch checked={selectedObject.qrCodeEnabled} onCheckedChange={v => updateSelectedProp("qrCodeEnabled", v)} />
              </div>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs">QR-Bestellung</Label>
                <Switch checked={selectedObject.qrOrderEnabled} onCheckedChange={v => updateSelectedProp("qrOrderEnabled", v)} />
              </div>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs">QR-Zahlung</Label>
                <Switch checked={selectedObject.qrPaymentEnabled} onCheckedChange={v => updateSelectedProp("qrPaymentEnabled", v)} />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
});
