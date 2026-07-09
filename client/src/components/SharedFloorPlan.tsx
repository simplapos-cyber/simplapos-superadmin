/**
 * SharedFloorPlan – Gemeinsamer Tischplan-Canvas für Admin und Kellner.
 *
 * Beide Rollen (Admin + alle Kellner) innerhalb einer Restaurant-ID verwenden
 * exakt dieselbe Komponente. Echtzeit-Sync läuft über SSE (useSSE-Hook).
 *
 * Props:
 *  - planGroups: Daten aus trpc.order.getTableStatus
 *  - sseStatus / sseRetryCount: SSE-Verbindungsstatus (aus useSSE)
 *  - isLoading / isError: Ladezustand
 *  - onTableClick: Callback wenn ein Tisch angeklickt wird
 *  - pendingTableId: ID des Tisches der gerade geladen wird (Spinner)
 */
import { useCallback, useRef, useState, useEffect, memo } from "react";
import React from "react";
import { ZoomIn, ZoomOut, Maximize2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SSEStatusBadge } from "@/components/SSEStatusBadge";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import type { SSEConnectionStatus } from "@/hooks/useSSE";

// ─── Types ────────────────────────────────────────────────────────────────────
export type SharedTableEntry = {
  id: number;
  sourceType: string;
  label: string;
  seats: number;
  x: number; y: number; width: number; height: number; rotation: number; objType: string;
  currentOrder: { id: number; status: string; totalAmount: string | null; guestCount: number | null; createdAt: Date | null } | null;
};

export type SharedPlanGroup = {
  planId: number;
  planName: string;
  canvasWidth: number;
  canvasHeight: number;
  floorStyle: string;
  phoneLayout: {
    canvasWidth: number;
    canvasHeight: number;
    positions: Array<{ objectId: number; x: number; y: number; width: number; height: number; rotation: number; hidden: boolean }>;
  } | null;
  tables: SharedTableEntry[];
};

type FloorObj = {
  id?: number;
  type: string;
  x: number; y: number; width: number; height: number; rotation: number;
  label: string | null;
  tableNumber: number | null;
  seats: number | null;
  isActive: boolean;
};

// ─── Floor Style CSS ──────────────────────────────────────────────────────────
const FLOOR_STYLES = [
  { id: "none", color: "#ffffff" },
  { id: "parkett_hell", color: "#d4a76a" },
  { id: "parkett_dunkel", color: "#8b5e3c" },
  { id: "laminat_grau", color: "#b8b8b8" },
  { id: "laminat_eiche", color: "#c9a96e" },
  { id: "fliesen_weiss", color: "#f0f0f0" },
  { id: "fliesen_grau", color: "#9e9e9e" },
  { id: "fliesen_schwarz", color: "#3a3a3a" },
  { id: "fliesen_terrakotta", color: "#c75b39" },
  { id: "rasen", color: "#4a8c3f" },
  { id: "beton", color: "#8c8c8c" },
  { id: "holz_natur", color: "#a67c52" },
  { id: "marmor_weiss", color: "#e8e4df" },
  { id: "marmor_schwarz", color: "#2d2d2d" },
  { id: "teppich_rot", color: "#8b2020" },
  { id: "teppich_blau", color: "#1e3a5f" },
];

function getFloorStyleCSS(styleId: string): React.CSSProperties {
  const style = FLOOR_STYLES.find(s => s.id === styleId);
  if (!style || styleId === "none") return { backgroundColor: "#f8f9fa" };
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

// ─── Library for icons ────────────────────────────────────────────────────────
const LIBRARY_FLAT: Array<{ type: string; icon: string; label: string }> = [
  { type: "table_round", icon: "○", label: "Rund" },
  { type: "table_square", icon: "□", label: "Quadrat" },
  { type: "table_rect", icon: "▭", label: "Rechteck" },
  { type: "table_long", icon: "═", label: "Langtisch" },
  { type: "table_high", icon: "⬡", label: "Stehtisch" },
  { type: "table_banquet", icon: "▬", label: "Bankett" },
  { type: "table_custom", icon: "◇", label: "Individuell" },
  { type: "table_oval", icon: "⬭", label: "Oval" },
  { type: "table_corner", icon: "⌐", label: "Ecktisch" },
  { type: "table_booth", icon: "⊓", label: "Nische" },
  { type: "chair", icon: "🪑", label: "Stuhl" },
  { type: "barstool", icon: "⊡", label: "Barhocker" },
  { type: "bench", icon: "▰", label: "Bank" },
  { type: "sofa", icon: "🛋️", label: "Sofa" },
  { type: "bar", icon: "🍸", label: "Bar/Theke" },
  { type: "kitchen", icon: "👨‍🍳", label: "Küche" },
  { type: "cashier", icon: "💳", label: "Kasse" },
  { type: "buffet", icon: "🍽️", label: "Buffet" },
  { type: "reception", icon: "🛎️", label: "Empfang" },
  { type: "plant", icon: "🌿", label: "Pflanze" },
  { type: "stairs", icon: "🪜", label: "Treppe" },
  { type: "emergency_exit", icon: "🚪", label: "Notausgang" },
  { type: "decoration", icon: "✦", label: "Deko" },
  { type: "aquarium", icon: "🐠", label: "Aquarium" },
  { type: "fireplace", icon: "🔥", label: "Kamin" },
  { type: "stage", icon: "🎭", label: "Bühne" },
  { type: "dance_floor", icon: "💃", label: "Tanzfläche" },
  { type: "dj_booth", icon: "🎧", label: "DJ-Pult" },
  { type: "wine_rack", icon: "🍷", label: "Weinregal" },
  { type: "coffee_machine", icon: "☕", label: "Kaffeemaschine" },
  { type: "wardrobe", icon: "🧥", label: "Garderobe" },
];

const STRUCTURAL_TYPES = new Set([
  "wall", "wall_thick", "door", "door_double", "door_sliding",
  "window", "window_large", "fence", "divider", "divider_glass", "awning",
]);

// ─── Status Colors & Labels ───────────────────────────────────────────────────
export const SHARED_STATUS_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  pending:    { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  preparing:  { bg: "#fef9c3", border: "#f59e0b", text: "#92400e" },
  ready:      { bg: "#dcfce7", border: "#22c55e", text: "#14532d" },
  served:     { bg: "#f3e8ff", border: "#a855f7", text: "#581c87" },
  paid:       { bg: "#f1f5f9", border: "#94a3b8", text: "#475569" },
  cancelled:  { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
};

export const SHARED_STATUS_LABEL: Record<string, string> = {
  pending: "Offen", preparing: "Zubereitung", ready: "Bereit",
  served: "Serviert", paid: "Bezahlt", cancelled: "Storniert",
};

// ─── Canvas Object Component ──────────────────────────────────────────────────
// Returns minutes elapsed since createdAt, or null
function getWaitMinutes(createdAt: Date | null | undefined): number | null {
  if (!createdAt) return null;
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 60_000);
}

const CanvasObject = memo(function CanvasObject({
  obj, orderStatus, onTableClick, isPending,
}: {
  obj: FloorObj;
  orderStatus?: { id: number; status: string; totalAmount: string | null; guestCount: number | null; createdAt: Date | null } | null;
  onTableClick?: (obj: FloorObj) => void;
  isPending?: boolean;
}) {
  const isTable = obj.type.startsWith("table_");
  const isStructural = STRUCTURAL_TYPES.has(obj.type);
  const libraryItem = LIBRARY_FLAT.find(l => l.type === obj.type);

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: obj.x,
    top: obj.y,
    width: obj.width,
    height: obj.height,
    transform: `rotate(${obj.rotation}deg)`,
    transformOrigin: "center center",
  };

  if (isTable) {
    const isFree = !orderStatus || ["paid", "cancelled"].includes(orderStatus.status);
    const statusColors = orderStatus && !isFree ? SHARED_STATUS_COLOR[orderStatus.status] : null;
    const isRound = obj.type === "table_round" || obj.type === "table_high" || obj.type === "table_oval";
    const borderRadius = isRound ? "50%" : "8px";
    // Wartezeit-Hervorhebung: ab 30 Min. rot, 15-29 Min. orange
    const waitMins = !isFree ? getWaitMinutes(orderStatus?.createdAt) : null;
    const waitOverride = waitMins !== null && waitMins >= 30
      ? { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" }
      : waitMins !== null && waitMins >= 15
      ? { bg: "#ffedd5", border: "#f97316", text: "#7c2d12" }
      : null;
    const effectiveColors = waitOverride ?? statusColors;
    const bgColor = effectiveColors ? effectiveColors.bg : (obj.isActive ? "#ffffff" : "#f1f5f9");
    const borderColor = statusColors ? statusColors.border : (obj.isActive ? "#cbd5e1" : "#e2e8f0");

    return (
      <div
        onClick={() => onTableClick?.(obj)}
        style={{
          ...baseStyle,
          background: bgColor,
          border: `2px solid ${waitOverride ? waitOverride.border : borderColor}`,
          borderRadius,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: onTableClick ? "pointer" : "default",
          boxShadow: orderStatus && !isFree ? `0 0 0 1px ${borderColor}40` : "none",
          transition: "transform 0.1s ease, box-shadow 0.1s ease",
          userSelect: "none",
          opacity: obj.isActive ? 1 : 0.5,
        }}
        onMouseEnter={e => { if (onTableClick) (e.currentTarget as HTMLElement).style.transform = `rotate(${obj.rotation}deg) scale(1.04)`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = `rotate(${obj.rotation}deg) scale(1)`; }}
      >
        {obj.tableNumber && (
          <span style={{ fontSize: Math.min(obj.width, obj.height) * 0.22, fontWeight: 700, color: statusColors ? statusColors.text : "#334155", lineHeight: 1 }}>
            {obj.tableNumber}
          </span>
        )}
        {obj.label && !obj.tableNumber && (
          <span style={{ fontSize: Math.min(obj.width, obj.height) * 0.16, fontWeight: 600, color: statusColors ? statusColors.text : "#475569", lineHeight: 1, maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
            {obj.label}
          </span>
        )}
        {orderStatus && !isFree && (
          <span style={{ fontSize: Math.min(obj.width, obj.height) * 0.13, color: effectiveColors?.text, fontWeight: 500, lineHeight: 1, marginTop: 2 }}>
            {SHARED_STATUS_LABEL[orderStatus.status] ?? orderStatus.status}
          </span>
        )}
        {orderStatus?.totalAmount && !isFree && parseFloat(orderStatus.totalAmount) > 0 && (
          <span style={{ fontSize: Math.min(obj.width, obj.height) * 0.12, color: effectiveColors?.text, lineHeight: 1, marginTop: 1 }}>
            CHF {parseFloat(orderStatus.totalAmount).toFixed(2)}
          </span>
        )}
        {waitMins !== null && waitMins >= 15 && (
          <span style={{ fontSize: Math.min(obj.width, obj.height) * 0.11, color: effectiveColors?.text, lineHeight: 1, marginTop: 1, fontWeight: 700 }}>
            ⏱ {waitMins}m
          </span>
        )}
        {isPending && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", borderRadius, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 16, height: 16, border: "2px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}
      </div>
    );
  }

  if (isStructural) {
    const bgColor = obj.type.includes("wall") ? "#475569" :
      obj.type.includes("door") ? "#b45309" :
      obj.type.includes("window") ? "#bae6fd" :
      obj.type.includes("fence") ? "#a8a29e" :
      obj.type.includes("divider") ? "#cbd5e1" : "#94a3b8";
    const isRounded = !obj.type.includes("wall") && !obj.type.includes("fence") && !obj.type.includes("divider");
    return (
      <div style={{ ...baseStyle, background: bgColor, borderRadius: isRounded ? "4px" : "0", border: "1px solid rgba(0,0,0,0.2)" }} />
    );
  }

  // Decorative objects (plants, buffet, etc.)
  const icon = libraryItem?.icon || "?";
  const iconSize = Math.min(obj.width, obj.height);
  const fontSize = Math.max(12, Math.min(iconSize * 0.55, 36));
  return (
    <div style={{ ...baseStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize, lineHeight: 1, userSelect: "none" }}>{icon}</span>
      {obj.label && obj.height > 35 && (
        <span style={{ fontSize: 9, color: "#64748b", marginTop: 2, maxWidth: "95%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obj.label}</span>
      )}
    </div>
  );
});

// ─── Inner Canvas with Zoom/Pan ───────────────────────────────────────────────
function FloorCanvas({
  group,
  allObjects,
  onTableClick,
  onSplitClick,
  pendingTableId,
}: {
  group: SharedPlanGroup;
  allObjects: FloorObj[];
  onTableClick: (table: SharedTableEntry) => void;
  onSplitClick?: (table: SharedTableEntry) => void;
  pendingTableId: number | null;
}) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });

  const phoneLayout = group.phoneLayout;
  const effectiveCanvas = isMobile && phoneLayout
    ? { width: phoneLayout.canvasWidth, height: phoneLayout.canvasHeight }
    : { width: group.canvasWidth, height: group.canvasHeight };

  const tableStatusMap = new Map<number, SharedTableEntry["currentOrder"]>(
    group.tables.map(t => [t.id, t.currentOrder])
  );

  const getObjPosition = (obj: FloorObj): FloorObj => {
    if (isMobile && phoneLayout) {
      const pos = phoneLayout.positions.find(p => p.objectId === obj.id);
      if (pos && !pos.hidden) {
        return { ...obj, x: pos.x, y: pos.y, width: pos.width, height: pos.height, rotation: pos.rotation };
      }
      if (pos?.hidden) return { ...obj, isActive: false };
    }
    return obj;
  };

  const computeFit = useCallback((w: number, h: number) => {
    const zoomX = (w - 32) / effectiveCanvas.width;
    const zoomY = (h - 32) / effectiveCanvas.height;
    const fitZoom = Math.min(zoomX, zoomY, 1);
    const scaledW = effectiveCanvas.width * fitZoom;
    const scaledH = effectiveCanvas.height * fitZoom;
    return { zoom: fitZoom, pan: { x: (w - scaledW) / 2, y: (h - scaledH) / 2 } };
  }, [effectiveCanvas.width, effectiveCanvas.height]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const doFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (!clientWidth || !clientHeight) return;
    const fit = computeFit(clientWidth, clientHeight);
    setZoom(fit.zoom);
    setPan(fit.pan);
  }, [computeFit]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let fitted = false;
    const tryFit = () => {
      if (!el) return;
      const { clientWidth, clientHeight } = el;
      if (clientWidth > 0 && clientHeight > 0) {
        const fit = computeFit(clientWidth, clientHeight);
        setZoom(fit.zoom);
        setPan(fit.pan);
        fitted = true;
      }
    };
    tryFit();
    if (!fitted) {
      const observer = new ResizeObserver(() => { if (!fitted) { tryFit(); } });
      observer.observe(el);
      return () => observer.disconnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.planId, effectiveCanvas.width, effectiveCanvas.height]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-table]")) return;
    isPanning.current = true;
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y });
  }, []);

  const onPointerUp = useCallback(() => { isPanning.current = false; }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", flex: 1, overflow: "hidden", background: "#e2e8f0", borderRadius: 12 }}>
      {/* Zoom controls */}
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          onClick={() => setZoom(z => Math.min(3, z + 0.15))}
          style={{ width: 32, height: 32, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}
        ><ZoomIn size={14} /></button>
        <button
          onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}
          style={{ width: 32, height: 32, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}
        ><ZoomOut size={14} /></button>
        <button
          onClick={doFit}
          style={{ width: 32, height: 32, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}
        ><Maximize2 size={14} /></button>
      </div>

      {/* Canvas viewport */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden", cursor: "grab", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={handleWheel}
      >
        <div style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          width: effectiveCanvas.width,
          height: effectiveCanvas.height,
          position: "relative",
          ...getFloorStyleCSS(group.floorStyle),
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}>
          {/* Non-table objects (background layer: walls, plants, etc.) */}
          {allObjects.filter(o => !o.type.startsWith("table_")).map((obj, i) => {
            const positioned = getObjPosition(obj);
            return <CanvasObject key={obj.id ?? `obj-${i}`} obj={positioned} />;
          })}

          {/* Table objects (foreground layer) */}
          {allObjects.filter(o => o.type.startsWith("table_")).map((obj, i) => {
            const positioned = getObjPosition(obj);
            const tableEntry = group.tables.find(t => t.id === obj.id);
            const orderStatus = obj.id != null ? tableStatusMap.get(obj.id) ?? null : null;
            const isOccupied = orderStatus && !["paid", "cancelled"].includes(orderStatus.status);
            return (
              <div key={obj.id ?? `table-${i}`} data-table="true" style={{ position: "absolute", left: positioned.x, top: positioned.y, width: positioned.width, height: positioned.height, transform: `rotate(${positioned.rotation}deg)`, transformOrigin: "center center" }}>
                <CanvasObject
                  obj={{ ...positioned, x: 0, y: 0 }}
                  orderStatus={orderStatus}
                  onTableClick={tableEntry ? () => onTableClick(tableEntry) : undefined}
                  isPending={pendingTableId === obj.id}
                />
                {isOccupied && onSplitClick && tableEntry && (
                  <button
                    data-table="true"
                    onClick={e => { e.stopPropagation(); onSplitClick(tableEntry); }}
                    title="Rechnung teilen"
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#6366f1",
                      border: "2px solid white",
                      color: "white",
                      fontSize: 11,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                      zIndex: 10,
                      lineHeight: 1,
                    }}
                  >÷</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main SharedFloorPlan Component ──────────────────────────────────────────
export interface SharedFloorPlanProps {
  /** Data from trpc.order.getTableStatus */
  planGroups: SharedPlanGroup[];
  isLoading: boolean;
  isError: boolean;
  onRefetch?: () => void;
  /** SSE connection status for real-time badge */
  sseStatus: SSEConnectionStatus;
  sseRetryCount?: number;
  /** Called when a table is tapped */
  onTableClick: (table: SharedTableEntry) => void;
  /** Called when the split-bill button on a table is tapped */
  onSplitClick?: (table: SharedTableEntry) => void;
  /** ID of the table currently being loaded (shows spinner) */
  pendingTableId?: number | null;
  /** Canvas height (default: calc(100dvh - 220px)) */
  canvasHeight?: string;
}

export function SharedFloorPlan({
  planGroups,
  isLoading,
  isError,
  onRefetch,
  sseStatus,
  sseRetryCount = 0,
  onTableClick,
  onSplitClick,
  pendingTableId = null,
  canvasHeight = "calc(100dvh - 220px)",
}: SharedFloorPlanProps) {
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);

  const currentGroup = planGroups[selectedPlanIdx] ?? null;

  // Load full floor plan objects (walls, plants, etc.) for the active plan
  const { data: planDetail } = trpc.floorPlan.getForWaiter.useQuery(
    { id: currentGroup?.planId ?? 0 },
    { enabled: !!currentGroup && currentGroup.planId > 0, staleTime: 30_000 }
  );

  const allTables = planGroups.flatMap(g => g.tables);
  const occupiedCount = allTables.filter(
    t => t.currentOrder && !["paid", "cancelled"].includes(t.currentOrder.status)
  ).length;
  const freeCount = allTables.length - occupiedCount;

  // Build objects array: prefer full planDetail, fallback to table positions
  const allObjects: FloorObj[] = planDetail?.objects?.map((o: any) => ({
    id: o.id,
    type: o.type,
    x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation,
    label: o.label,
    tableNumber: o.tableNumber,
    seats: o.seats,
    isActive: o.isActive ?? true,
  })) ?? [];

  const objectsToRender: FloorObj[] = allObjects.length > 0
    ? allObjects
    : (currentGroup?.tables ?? []).map(t => ({
        id: t.id,
        type: t.objType,
        x: t.x, y: t.y, width: t.width, height: t.height, rotation: t.rotation,
        label: t.label,
        tableNumber: null,
        seats: t.seats,
        isActive: true,
      }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Header: Title + Zähler + SSE-Badge + Legende ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Tischplan</h1>
          <p style={{ fontSize: 12, color: "#64748b", margin: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {occupiedCount} besetzt · {freeCount} frei · {allTables.length} gesamt
            <SSEStatusBadge status={sseStatus} retryCount={sseRetryCount} />
            {!isLoading && !isError && allTables.length > 0 && (
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(SHARED_STATUS_LABEL)
                  .filter(([k]) => k !== "cancelled" && k !== "paid")
                  .map(([status, label]) => (
                    <span key={status} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: SHARED_STATUS_COLOR[status]?.bg, border: `1px solid ${SHARED_STATUS_COLOR[status]?.border}`, display: "inline-block" }} />
                      {label}
                    </span>
                  ))}
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#ffffff", border: "1px solid #cbd5e1", display: "inline-block" }} />
                  Frei
                </span>
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Plan Tabs (wenn mehrere Bereiche) ── */}
      {planGroups.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexShrink: 0, overflowX: "auto" }}>
          {planGroups.map((g, i) => (
            <button
              key={g.planId}
              onClick={() => setSelectedPlanIdx(i)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                background: i === selectedPlanIdx ? "var(--primary)" : "#f1f5f9",
                color: i === selectedPlanIdx ? "white" : "#475569",
                whiteSpace: "nowrap",
                transition: "background 0.15s",
              }}
            >
              {g.planName}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                ({g.tables.filter(t => t.currentOrder && !["paid", "cancelled"].includes(t.currentOrder.status)).length}/{g.tables.length})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[...Array(6)].map((_, i) => <Skeleton key={i} style={{ height: 80, borderRadius: 8 }} />)}
        </div>
      )}

      {/* ── Error ── */}
      {isError && (
        <div style={{ padding: 24, textAlign: "center", border: "1px solid #fca5a5", borderRadius: 12, color: "#dc2626" }}>
          <AlertCircle style={{ width: 32, height: 32, margin: "0 auto 8px" }} />
          <p style={{ fontWeight: 500 }}>Tischplan konnte nicht geladen werden</p>
          {onRefetch && (
            <Button variant="outline" size="sm" style={{ marginTop: 12 }} onClick={onRefetch}>
              Erneut versuchen
            </Button>
          )}
        </div>
      )}

      {/* ── Empty ── */}
      {!isLoading && !isError && allTables.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", border: "1px dashed #e2e8f0", borderRadius: 12 }}>
          <p style={{ fontWeight: 500 }}>Keine Tische konfiguriert</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Erstellen Sie zuerst einen Tischplan im Admin-Bereich.</p>
        </div>
      )}

      {/* ── Canvas ── */}
      {!isLoading && !isError && currentGroup && (
        <div style={{ height: canvasHeight, minHeight: 300, display: "flex", flexDirection: "column" }}>
          <FloorCanvas
            group={currentGroup}
            allObjects={objectsToRender}
            onTableClick={onTableClick}
            onSplitClick={onSplitClick}
            pendingTableId={pendingTableId}
          />
        </div>
      )}
    </div>
  );
}
