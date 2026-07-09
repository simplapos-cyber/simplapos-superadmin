import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChefHat, CheckCircle, Clock, AlertCircle, RefreshCw,
  Play, Zap, PauseCircle, CheckCircle2, Filter, Bell,
  Flame, Coffee, UtensilsCrossed, Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useSSE } from "@/hooks/useSSE";
import { useSoundAlert } from "@/hooks/useSoundAlert";
import { SSEStatusBadge } from "@/components/SSEStatusBadge";
import { SoundAlertToggle } from "@/components/SoundAlertToggle";
import { useAuth } from "@/_core/hooks/useAuth";
import { OfflineBanner } from "@/components/OfflineBanner";

// ─── Typen ────────────────────────────────────────────────────────────────────
type OrderItem = {
  id: number; name: string; quantity: number; notes: string | null;
  status: string; course: number; priority: string; itemType: string;
  pickedUpAt?: number | null; pickedUpBy?: string | null;
};
type KitchenOrder = {
  id: number; orderNumber: string; status: string;
  createdAt: Date | null; notes: string | null;
  tableLabel?: string | null;
  items: OrderItem[];
};
type GroupedItem = {
  name: string; totalQty: number; notes: string | null;
  status: string; course: number; priority: string;
  ids: number[]; orderId: number;
  pickedUpAt?: number | null; pickedUpBy?: string | null;
};

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
const FALLBACK_COURSE_LABELS: Record<number, { label: string; icon: React.ReactNode; color: string }> = {
  1: { label: "Vorspeise", icon: <Coffee size={11} />, color: "#60a5fa" },
  2: { label: "Hauptgang", icon: <Utensils size={11} />, color: "#34d399" },
  3: { label: "Dessert",   icon: <UtensilsCrossed size={11} />, color: "#f472b6" },
  4: { label: "Getränk",   icon: <Coffee size={11} />, color: "#a78bfa" },
  5: { label: "Spätgang",  icon: <UtensilsCrossed size={11} />, color: "#fb923c" },
};
const COURSE_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#a78bfa", "#fb923c", "#fbbf24", "#f87171", "#a3e635"];

type CourseConfig = { courseNumber: number; name: string; sortOrder: number; isActive: boolean };

function buildCourseInfo(course: number, configs: CourseConfig[]) {
  const cfg = configs.find(c => c.courseNumber === course);
  if (cfg) {
    const color = COURSE_COLORS[(cfg.sortOrder - 1) % COURSE_COLORS.length];
    return { label: cfg.name, icon: <Utensils size={11} />, color };
  }
  return FALLBACK_COURSE_LABELS[course] ?? { label: `Gang ${course}`, icon: <Utensils size={11} />, color: "#94a3b8" };
}

function groupItems(items: OrderItem[], orderId: number): GroupedItem[] {
  const map = new Map<string, GroupedItem>();
  for (const item of items) {
    const key = `${item.name}||${item.status}||${item.notes ?? ""}||${item.course}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalQty += item.quantity;
      existing.ids.push(item.id);
    } else {
      map.set(key, {
        name: item.name, totalQty: item.quantity, notes: item.notes,
        status: item.status, course: item.course, priority: item.priority,
        ids: [item.id], orderId,
        pickedUpAt: item.pickedUpAt ?? null,
        pickedUpBy: item.pickedUpBy ?? null,
      });
    }
  }
  // Sort by course, then by status (pending first)
  const statusOrder: Record<string, number> = { pending: 0, preparing: 1, ready: 2 };
  return Array.from(map.values()).sort((a, b) => {
    if (a.course !== b.course) return a.course - b.course;
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  });
}

function useElapsedSeconds(createdAt: Date | null): number {
  const [secs, setSecs] = useState(() =>
    createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000) : 0
  );
  useEffect(() => {
    if (!createdAt) return;
    const id = setInterval(() => {
      setSecs(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    }, 10_000);
    return () => clearInterval(id);
  }, [createdAt]);
  return secs;
}

function ElapsedBadge({ createdAt }: { createdAt: Date | null }) {
  const secs = useElapsedSeconds(createdAt);
  const mins = Math.floor(secs / 60);
  const label = mins < 1 ? "< 1 Min." : `${mins} Min.`;
  const urgency = mins >= 20 ? "critical" : mins >= 10 ? "warning" : "ok";
  const colors: Record<string, string> = {
    ok: "background:#1e3a2f;color:#4ade80;border:1px solid #166534",
    warning: "background:#3b2a00;color:#fbbf24;border:1px solid #92400e",
    critical: "background:#3b0f0f;color:#f87171;border:1px solid #991b1b",
  };
  return (
    <span style={{
      ...Object.fromEntries(colors[urgency].split(";").map(s => {
        const [k, v] = s.split(":");
        return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v?.trim()];
      })),
      fontSize: 11, borderRadius: 6, padding: "2px 7px",
      display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600,
    }}>
      {urgency === "critical" && <Flame size={10} />}
      {urgency === "warning" && <Clock size={10} />}
      {urgency === "ok" && <Clock size={10} />}
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "rush") return (
    <span style={{
      background: "#7f1d1d", color: "#fca5a5", border: "1px solid #dc2626",
      fontSize: 10, borderRadius: 4, padding: "1px 6px", fontWeight: 700,
      animation: "pulse 1.5s infinite", display: "inline-flex", alignItems: "center", gap: 3,
    }}>
      <Zap size={9} /> RUSH
    </span>
  );
  if (priority === "hold") return (
    <span style={{
      background: "#1e1b4b", color: "#a5b4fc", border: "1px solid #4338ca",
      fontSize: 10, borderRadius: 4, padding: "1px 6px", fontWeight: 700,
      display: "inline-flex", alignItems: "center", gap: 3,
    }}>
      <PauseCircle size={9} /> HOLD
    </span>
  );
  return null;
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function KuecheDashboard() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const [filter, setFilter] = useState<"all" | "pending" | "preparing" | "ready">("all");
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");

  const { data: kitchenOrders = [], isLoading, isError, refetch } = trpc.order.getKitchenOrders.useQuery(
    { itemType: "food" },
    { refetchInterval: 30_000 }
  );

  const { enabled: soundEnabled, volume, setEnabled: setSoundEnabled, setVolume, playAlert } = useSoundAlert({ variant: "kitchen" });

  const handleSSEEvent = useCallback((event: { type: string; payload: Record<string, unknown> }) => {
    if (event.type === "order_rush") {
      // Rush-Alarm: doppelter Ton + prominenter Toast
      playAlert();
      setTimeout(() => playAlert(), 600);
      const tableLabel = (event.payload?.tableLabel as string | null) ?? "Unbekannt";
      toast.error(
        `⚡ RUSH – ${tableLabel}`,
        {
          description: "Sofortige Zubereitung erforderlich!",
          duration: 8000,
          position: "top-center",
          style: { background: "#dc2626", color: "#fff", border: "2px solid #fca5a5", fontWeight: 700, fontSize: "1.1rem" },
        }
      );
    } else {
      playAlert();
    }
    utils.order.getKitchenOrders.invalidate();
  }, [utils, playAlert]);

  const { status: sseStatus, retryCount } = useSSE(restaurantId, {
    channels: ["kitchen"],
    onEvent: handleSSEEvent,
  });

  const updateItemStatus = trpc.order.updateItemStatus.useMutation({
    onSuccess: () => utils.order.getKitchenOrders.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const markAllReady = trpc.order.markAllReady.useMutation({
    onSuccess: () => {
      toast.success("Alle Positionen als bereit markiert");
      utils.order.getKitchenOrders.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendToKitchen = trpc.order.sendToKitchen.useMutation({
    onSuccess: () => { toast.success("Bestellung gestartet"); utils.order.getKitchenOrders.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const setOrderPriority = trpc.order.setOrderPriority.useMutation({
    onSuccess: () => utils.order.getKitchenOrders.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const updateGroupStatus = useCallback((group: GroupedItem, status: "preparing" | "ready") => {
    for (const itemId of group.ids) {
      updateItemStatus.mutate({ orderId: group.orderId, itemId, status });
    }
  }, [updateItemStatus]);

  // Course config from DB
  const { data: courseConfigsRaw = [] } = trpc.course.list.useQuery(undefined, { staleTime: 60_000 });
  const courseConfigs = courseConfigsRaw as CourseConfig[];

  // Pickup mutations
  const markItemPickedUp = trpc.order.markItemPickedUp.useMutation({
    onSuccess: () => { toast.success("Abgerufen"); utils.order.getKitchenOrders.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const markCoursePickedUp = trpc.order.markCoursePickedUp.useMutation({
    onSuccess: () => { toast.success("Gang abgerufen"); utils.order.getKitchenOrders.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const currentUserName = user?.name ?? user?.email ?? "Köchin";

  const orders = kitchenOrders as KitchenOrder[];

  // Stats
  const stats = useMemo(() => {
    const active = orders.filter(o => o.status !== "ready");
    const ready = orders.filter(o => o.status === "ready");
    const rush = orders.filter(o => o.items.some(i => i.priority === "rush"));
    const avgMins = active.length === 0 ? 0 : Math.round(
      active.reduce((sum, o) => sum + (o.createdAt ? (Date.now() - new Date(o.createdAt).getTime()) / 60000 : 0), 0) / active.length
    );
    return { active: active.length, ready: ready.length, rush: rush.length, avgMins };
  }, [orders]);

  // Filter
  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter(o => o.status === filter);
  }, [orders, filter]);

  // Determine order priority (highest item priority)
  function getOrderPriority(order: KitchenOrder): string {
    if (order.items.some(i => i.priority === "rush")) return "rush";
    if (order.items.some(i => i.priority === "hold")) return "hold";
    return "normal";
  }

  // Sort: rush first, then by createdAt
  const sortedOrders = useMemo(() => [...filteredOrders].sort((a, b) => {
    const pa = getOrderPriority(a) === "rush" ? 0 : getOrderPriority(a) === "hold" ? 2 : 1;
    const pb = getOrderPriority(b) === "rush" ? 0 : getOrderPriority(b) === "hold" ? 2 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  }), [filteredOrders]);

  // CSS for pulse animation
  const pulseStyle = `
    @keyframes kds-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .kds-rush { animation: kds-pulse 1.5s ease-in-out infinite; }
  `;

  return (
    <div style={{ background: "#0a0f0d", minHeight: "100vh", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <style>{pulseStyle}</style>

      {/* ─── Offline Banner ──────────────────────────────────────────────────── */}
      <OfflineBanner />

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: "#111816", borderBottom: "1px solid #1e2d27",
        padding: "12px 16px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          {/* Title + SSE */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ChefHat size={20} color="#4ade80" />
            <span style={{ fontWeight: 800, fontSize: 16, color: "#f0fdf4" }}>Küchen-Display</span>
            <SSEStatusBadge status={sseStatus} retryCount={retryCount} />
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <StatPill label="Aktiv" value={stats.active} color="#4ade80" />
            <StatPill label="Bereit" value={stats.ready} color="#60a5fa" />
            {stats.rush > 0 && <StatPill label="Rush" value={stats.rush} color="#f87171" pulse />}
            <StatPill label="Ø Zeit" value={`${stats.avgMins} Min.`} color="#94a3b8" />
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <SoundAlertToggle
              enabled={soundEnabled} volume={volume}
              onToggle={setSoundEnabled} onVolumeChange={setVolume} onTestSound={playAlert}
            />
            <button
              onClick={() => setViewMode(v => v === "cards" ? "compact" : "cards")}
              style={{
                background: "#1e2d27", border: "1px solid #2d4438", color: "#94a3b8",
                borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11,
              }}
            >
              {viewMode === "cards" ? "Kompakt" : "Karten"}
            </button>
            <button
              onClick={() => refetch()}
              style={{
                background: "#1e2d27", border: "1px solid #2d4438", color: "#94a3b8",
                borderRadius: 6, padding: "5px 8px", cursor: "pointer",
              }}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          {(["all", "pending", "preparing", "ready"] as const).map(f => {
            const labels: Record<string, string> = { all: "Alle", pending: "Neu", preparing: "In Zubereitung", ready: "Bereit" };
            const counts: Record<string, number> = {
              all: orders.length,
              pending: orders.filter(o => o.status === "pending").length,
              preparing: orders.filter(o => o.status === "preparing").length,
              ready: orders.filter(o => o.status === "ready").length,
            };
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: active ? "#166534" : "#1e2d27",
                  border: active ? "1px solid #4ade80" : "1px solid #2d4438",
                  color: active ? "#4ade80" : "#94a3b8",
                  borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400,
                }}
              >
                {labels[f]} {counts[f] > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({counts[f]})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto" }}>

        {/* Loading */}
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ background: "#111816", borderRadius: 10, height: 140, animation: "kds-pulse 1.5s infinite" }} />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div style={{ textAlign: "center", padding: 40, color: "#f87171" }}>
            <AlertCircle size={32} style={{ margin: "0 auto 8px" }} />
            <p style={{ fontWeight: 600 }}>Bestellungen konnten nicht geladen werden</p>
            <button onClick={() => refetch()} style={{
              marginTop: 12, background: "#1e2d27", border: "1px solid #2d4438",
              color: "#94a3b8", borderRadius: 6, padding: "6px 16px", cursor: "pointer",
            }}>Erneut versuchen</button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && orders.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "#4b5563" }}>
            <ChefHat size={48} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <p style={{ fontWeight: 600, fontSize: 16 }}>Keine offenen Bestellungen</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Neue Bestellungen erscheinen automatisch.</p>
          </div>
        )}

        {/* Orders */}
        {!isLoading && !isError && sortedOrders.length > 0 && (
          viewMode === "cards"
            ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {sortedOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onUpdateGroup={updateGroupStatus}
                    onMarkAllReady={() => markAllReady.mutate({ orderId: order.id })}
                    onSendToKitchen={() => sendToKitchen.mutate({ orderId: order.id })}
                    onSetPriority={(p) => setOrderPriority.mutate({ orderId: order.id, priority: p })}
                    isBusy={updateItemStatus.isPending || markAllReady.isPending}
                    courseConfigs={courseConfigs}
                    onMarkCoursePickedUp={(orderId, course) => markCoursePickedUp.mutate({ orderId, course, pickedUpBy: currentUserName })}
                    onMarkItemPickedUp={(orderId, itemId) => markItemPickedUp.mutate({ orderId, itemId, pickedUpBy: currentUserName })}
                    currentUserName={currentUserName}
                  />
                ))}
              </div>
            : <CompactView
                orders={sortedOrders}
                onUpdateGroup={updateGroupStatus}
                onMarkAllReady={(id) => markAllReady.mutate({ orderId: id })}
                isBusy={updateItemStatus.isPending || markAllReady.isPending}
              />
        )}
      </div>
    </div>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, color, pulse }: { label: string; value: number | string; color: string; pulse?: boolean }) {
  return (
    <div style={{
      background: "#1e2d27", border: `1px solid ${color}33`,
      borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 5,
    }} className={pulse ? "kds-rush" : ""}>
      <span style={{ color, fontWeight: 700, fontSize: 14 }}>{value}</span>
      <span style={{ color: "#64748b", fontSize: 11 }}>{label}</span>
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({
  order, onUpdateGroup, onMarkAllReady, onSendToKitchen, onSetPriority, isBusy, courseConfigs, onMarkCoursePickedUp, onMarkItemPickedUp, currentUserName,
}: {
  order: KitchenOrder;
  onUpdateGroup: (g: GroupedItem, s: "preparing" | "ready") => void;
  onMarkAllReady: () => void;
  onSendToKitchen: () => void;
  onSetPriority: (p: "normal" | "rush" | "hold") => void;
  isBusy: boolean;
  courseConfigs: CourseConfig[];
  onMarkCoursePickedUp: (orderId: number, course: number) => void;
  onMarkItemPickedUp: (orderId: number, itemId: number) => void;
  currentUserName: string;
}) {
  const grouped = groupItems(order.items, order.id);
  const orderPriority = order.items.some(i => i.priority === "rush") ? "rush"
    : order.items.some(i => i.priority === "hold") ? "hold" : "normal";

  const allReady = grouped.every(g => g.status === "ready");
  const hasActive = grouped.some(g => g.status === "pending" || g.status === "preparing");

  // Group by course
  const byCourse = new Map<number, GroupedItem[]>();
  for (const g of grouped) {
    if (!byCourse.has(g.course)) byCourse.set(g.course, []);
    byCourse.get(g.course)!.push(g);
  }
  const courses = Array.from(byCourse.keys()).sort((a, b) => a - b);
  const multiCourse = courses.length > 1;

  // ─── Gang-Freigabe ───────────────────────────────────────────────────────────
  // courseRelease: wenn aktiv, wird immer nur der aktuelle (niedrigste noch nicht fertige) Gang angezeigt
  const [courseRelease, setCourseRelease] = useState(false);
  // Bestimme welcher Gang aktuell aktiv ist (niedrigster Gang mit nicht-fertigen Items)
  const activeCourse = useMemo(() => {
    if (!courseRelease || !multiCourse) return null;
    for (const c of courses) {
      const items = byCourse.get(c)!;
      if (items.some(i => i.status !== "ready")) return c;
    }
    return null; // alle fertig
  }, [courseRelease, multiCourse, courses, byCourse]);
  // Welche Gänge sind sichtbar?
  const visibleCourses = useMemo(() => {
    if (!courseRelease || activeCourse === null) return courses;
    // Zeige alle fertigen Gänge + den aktuell aktiven Gang
    return courses.filter(c => {
      if (c < activeCourse) return true; // bereits fertig
      if (c === activeCourse) return true; // aktuell aktiv
      return false; // noch nicht freigegeben
    });
  }, [courseRelease, activeCourse, courses]);
  const lockedCourses = courseRelease && activeCourse !== null
    ? courses.filter(c => c > activeCourse)
    : [];

  const borderColor = orderPriority === "rush" ? "#dc2626"
    : order.status === "ready" ? "#16a34a"
    : order.status === "preparing" ? "#d97706"
    : "#1e40af";

  return (
    <div
      style={{
        background: "#111816",
        border: `2px solid ${borderColor}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: orderPriority === "rush" ? `0 0 16px ${borderColor}66` : "none",
      }}
      className={orderPriority === "rush" ? "kds-rush" : ""}
    >
      {/* Card Header */}
      <div style={{
        background: "#0d1a14", padding: "10px 12px",
        borderBottom: "1px solid #1e2d27",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#f0fdf4", fontFamily: "monospace" }}>
            {order.tableLabel ?? order.orderNumber}
          </span>
          {order.tableLabel && (
            <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>#{order.orderNumber}</span>
          )}
          <PriorityBadge priority={orderPriority} />
        </div>
        <ElapsedBadge createdAt={order.createdAt} />
      </div>

      {/* Order notes */}
      {order.notes && (
        <div style={{ background: "#1a2a1e", padding: "6px 12px", fontSize: 12, color: "#86efac", borderBottom: "1px solid #1e2d27" }}>
          📝 {order.notes}
        </div>
      )}

      {/* Items by course */}
      <div style={{ padding: "8px 10px" }}>
        {visibleCourses.map(course => {
          const courseInfo = buildCourseInfo(course, courseConfigs);
          const items = byCourse.get(course)!;
          const allCourseReady = items.every(g => g.status === "ready");
          return (
            <div key={course} style={{ marginBottom: multiCourse ? 8 : 0 }}>
              {multiCourse && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 10, color: courseInfo.color, fontWeight: 700,
                  marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
                  justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {courseInfo.icon}
                    {courseInfo.label}
                    {courseRelease && course === activeCourse && (
                      <span style={{ marginLeft: 4, background: "#1e3a5f", color: "#60a5fa", fontSize: 9, borderRadius: 4, padding: "1px 5px" }}>AKTIV</span>
                    )}
                  </div>
                  {allCourseReady && (
                    <button
                      onClick={() => onMarkCoursePickedUp(order.id, course)}
                      disabled={isBusy}
                      title={`Gang "${courseInfo.label}" als abgerufen markieren`}
                      style={{
                        background: "#14532d", border: "1px solid #16a34a", color: "#4ade80",
                        borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 9, fontWeight: 700,
                        display: "flex", alignItems: "center", gap: 3,
                      }}
                    >
                      📤 Abruf
                    </button>
                  )}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map((group, idx) => (
                  <ItemRow
                    key={idx}
                    group={group}
                    onUpdate={onUpdateGroup}
                    isBusy={isBusy}
                    onMarkPickedUp={() => onMarkItemPickedUp(order.id, group.ids[0])}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {/* Gesperrte Gänge anzeigen */}
        {lockedCourses.map(course => {
          const courseInfo = buildCourseInfo(course, courseConfigs);
          const items = byCourse.get(course)!;
          const totalQty = items.reduce((s, g) => s + g.totalQty, 0);
          return (
            <div key={course} style={{
              marginTop: 6, padding: "6px 8px", borderRadius: 6,
              background: "#0f1a14", border: "1px dashed #2d4438",
              display: "flex", alignItems: "center", gap: 6, opacity: 0.55,
            }}>
              <PauseCircle size={12} color="#4b5563" />
              <span style={{ fontSize: 10, color: courseInfo.color, fontWeight: 700, textTransform: "uppercase" }}>
                {courseInfo.label}
              </span>
              <span style={{ fontSize: 11, color: "#4b5563" }}>{totalQty} Pos. – wartet auf vorherigen Gang</span>
            </div>
          );
        })}
      </div>

      {/* Card Footer */}
      <div style={{
        borderTop: "1px solid #1e2d27", padding: "8px 10px",
        display: "flex", gap: 6, flexWrap: "wrap",
      }}>
        {order.status === "pending" && (
          <button
            onClick={onSendToKitchen}
            disabled={isBusy}
            style={{
              flex: 1, background: "#1e40af", border: "none", color: "#bfdbfe",
              borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <Play size={12} /> Starten
          </button>
        )}
        {hasActive && !allReady && (
          <button
            onClick={onMarkAllReady}
            disabled={isBusy}
            style={{
              flex: 2, background: "#166534", border: "none", color: "#bbf7d0",
              borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <CheckCircle2 size={13} /> Alle bereit
          </button>
        )}
        {allReady && (
          <div style={{
            flex: 1, background: "#052e16", border: "1px solid #166534", color: "#4ade80",
            borderRadius: 6, padding: "7px 10px", fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
            <CheckCircle size={13} /> Bereit zur Ausgabe
          </div>
        )}
        {/* Priority toggle */}
        <div style={{ display: "flex", gap: 3 }}>
          <PriorityButton
            label="Rush" active={orderPriority === "rush"}
            color="#dc2626" onClick={() => onSetPriority(orderPriority === "rush" ? "normal" : "rush")}
          />
          <PriorityButton
            label="Hold" active={orderPriority === "hold"}
            color="#4338ca" onClick={() => onSetPriority(orderPriority === "hold" ? "normal" : "hold")}
          />
          {multiCourse && (
            <button
              onClick={() => setCourseRelease(v => !v)}
              title={courseRelease ? "Gang-Freigabe deaktivieren" : "Gang-Freigabe aktivieren: nur aktuellen Gang anzeigen"}
              style={{
                background: courseRelease ? "#14532d33" : "transparent",
                border: `1px solid ${courseRelease ? "#16a34a" : "#2d4438"}`,
                color: courseRelease ? "#4ade80" : "#4b5563",
                borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
              }}
            >
              🍴 Gang
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────
function ItemRow({ group, onUpdate, isBusy, onMarkPickedUp }: {
  group: GroupedItem;
  onUpdate: (g: GroupedItem, s: "preparing" | "ready") => void;
  isBusy: boolean;
  onMarkPickedUp?: () => void;
}) {
  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    pending:   { bg: "#1e3a5f", text: "#93c5fd", border: "#1e40af" },
    preparing: { bg: "#3b2a00", text: "#fcd34d", border: "#92400e" },
    ready:     { bg: "#052e16", text: "#4ade80", border: "#166534" },
  };
  const sc = statusColors[group.status] ?? statusColors.pending;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 8px", borderRadius: 7,
      background: sc.bg, border: `1px solid ${sc.border}`,
      opacity: group.status === "ready" ? 0.65 : 1,
    }}>
      {/* Quantity */}
      <span style={{
        fontWeight: 900, fontSize: 20, color: "#f0fdf4",
        minWidth: 28, textAlign: "center", lineHeight: 1,
      }}>
        {group.totalQty}×
      </span>

      {/* Name + notes */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          flexShrink: 0, fontWeight: 700, fontSize: 14, color: "#f0fdf4",
          textDecoration: group.status === "ready" ? "line-through" : "none",
        }}>
          {group.name}
        </p>
        {group.notes && (
          <p style={{ margin: 0, fontSize: 11, color: "#fbbf24", marginTop: 1 }}>
            ⚠ {group.notes}
          </p>
        )}
      </div>

      {/* Action button */}
      <div style={{ flexShrink: 0 }}>
        {group.status === "pending" && (
          <button
            onClick={() => onUpdate(group, "preparing")}
            disabled={isBusy}
            style={{
              background: "#1e40af", border: "none", color: "#bfdbfe",
              borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            <Play size={10} style={{ display: "inline", marginRight: 3 }} />
            Start
          </button>
        )}
        {group.status === "preparing" && (
          <button
            onClick={() => onUpdate(group, "ready")}
            disabled={isBusy}
            style={{
              background: "#166534", border: "none", color: "#bbf7d0",
              borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            <CheckCircle size={10} style={{ display: "inline", marginRight: 3 }} />
            Bereit
          </button>
        )}
        {group.status === "ready" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            {group.pickedUpAt ? (
              <div style={{ fontSize: 9, color: "#6b7280", textAlign: "right" }}>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>📤 Abgerufen</span><br />
                {group.pickedUpBy && <span>{group.pickedUpBy}</span>}
                {group.pickedUpBy && <br />}
                {new Date(group.pickedUpAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : (
              onMarkPickedUp && (
                <button
                  onClick={onMarkPickedUp}
                  disabled={isBusy}
                  style={{
                    background: "#14532d", border: "1px solid #16a34a", color: "#4ade80",
                    borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  📤 Abruf
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Priority Button ──────────────────────────────────────────────────────────
function PriorityButton({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? color + "33" : "transparent",
        border: `1px solid ${active ? color : "#2d4438"}`,
        color: active ? color : "#4b5563",
        borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

// ─── Compact View ─────────────────────────────────────────────────────────────
function CompactView({ orders, onUpdateGroup, onMarkAllReady, isBusy }: {
  orders: KitchenOrder[];
  onUpdateGroup: (g: GroupedItem, s: "preparing" | "ready") => void;
  onMarkAllReady: (id: number) => void;
  isBusy: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {orders.map(order => {
        const grouped = groupItems(order.items, order.id);
        const hasActive = grouped.some(g => g.status === "pending" || g.status === "preparing");
        const orderPriority = order.items.some(i => i.priority === "rush") ? "rush"
          : order.items.some(i => i.priority === "hold") ? "hold" : "normal";
        const borderColor = orderPriority === "rush" ? "#dc2626"
          : order.status === "ready" ? "#16a34a"
          : order.status === "preparing" ? "#d97706" : "#1e40af";

        return (
          <div key={order.id} style={{
            background: "#111816", border: `1px solid ${borderColor}`,
            borderRadius: 8, padding: "8px 12px",
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#f0fdf4", minWidth: 80, fontFamily: "monospace" }}>
              {order.tableLabel ?? order.orderNumber}
            </span>
            <ElapsedBadge createdAt={order.createdAt} />
            <PriorityBadge priority={orderPriority} />
            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {grouped.map((g, i) => (
                <span key={i} style={{
                  fontSize: 12, padding: "2px 8px", borderRadius: 4,
                  background: g.status === "ready" ? "#052e16" : g.status === "preparing" ? "#3b2a00" : "#1e3a5f",
                  color: g.status === "ready" ? "#4ade80" : g.status === "preparing" ? "#fcd34d" : "#93c5fd",
                  textDecoration: g.status === "ready" ? "line-through" : "none",
                }}>
                  {g.totalQty}× {g.name}
                </span>
              ))}
            </div>
            {hasActive && (
              <button
                onClick={() => onMarkAllReady(order.id)}
                disabled={isBusy}
                style={{
                  background: "#166534", border: "none", color: "#bbf7d0",
                  borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700,
                }}
              >
                <CheckCircle2 size={11} style={{ display: "inline", marginRight: 3 }} />
                Alle bereit
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
