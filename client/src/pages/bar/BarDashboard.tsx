import { useCallback, useMemo, useState } from "react";
import {
  Wine, CheckCircle, Clock, AlertCircle, RefreshCw,
  Play, Zap, PauseCircle, CheckCircle2, Flame,
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
};
type BarOrder = {
  id: number; orderNumber: string; status: string;
  createdAt: Date | null; notes: string | null;
  tableLabel?: string | null;
  items: OrderItem[];
};
type GroupedItem = {
  name: string; totalQty: number; notes: string | null;
  status: string; ids: number[]; orderId: number;
};

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
function groupItems(items: OrderItem[], orderId: number): GroupedItem[] {
  const map = new Map<string, GroupedItem>();
  for (const item of items) {
    const key = `${item.name}||${item.status}||${item.notes ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalQty += item.quantity;
      existing.ids.push(item.id);
    } else {
      map.set(key, {
        name: item.name, totalQty: item.quantity, notes: item.notes,
        status: item.status, ids: [item.id], orderId,
      });
    }
  }
  const statusOrder: Record<string, number> = { pending: 0, preparing: 1, ready: 2 };
  return Array.from(map.values()).sort((a, b) =>
    (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
  );
}

function useElapsedMins(createdAt: Date | null): number {
  const [mins, setMins] = useState(() =>
    createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000) : 0
  );
  // update every 30s
  useMemo(() => {
    const id = setInterval(() => {
      if (createdAt) setMins(Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    }, 30_000);
    return () => clearInterval(id);
  }, [createdAt]);
  return mins;
}

function ElapsedBadge({ createdAt }: { createdAt: Date | null }) {
  const mins = useElapsedMins(createdAt);
  const label = mins < 1 ? "< 1 Min." : `${mins} Min.`;
  const urgency = mins >= 10 ? "critical" : mins >= 5 ? "warning" : "ok";
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    ok:       { bg: "#1e3a2f", color: "#4ade80", border: "#166534" },
    warning:  { bg: "#3b2a00", color: "#fbbf24", border: "#92400e" },
    critical: { bg: "#3b0f0f", color: "#f87171", border: "#991b1b" },
  };
  const c = colors[urgency];
  return (
    <span style={{
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontSize: 11, borderRadius: 6, padding: "2px 7px",
      display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600,
    }}>
      {urgency === "critical" ? <Flame size={10} /> : <Clock size={10} />}
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "rush") return (
    <span style={{
      background: "#7f1d1d", color: "#fca5a5", border: "1px solid #dc2626",
      fontSize: 10, borderRadius: 4, padding: "1px 6px", fontWeight: 700,
      display: "inline-flex", alignItems: "center", gap: 3,
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

function StatPill({ label, value, color, pulse }: { label: string; value: number | string; color: string; pulse?: boolean }) {
  return (
    <div style={{
      background: "#1a1f2e", border: `1px solid ${color}33`,
      borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 5,
      animation: pulse ? "bar-pulse 1.5s ease-in-out infinite" : "none",
    }}>
      <span style={{ color, fontWeight: 700, fontSize: 14 }}>{value}</span>
      <span style={{ color: "#64748b", fontSize: 11 }}>{label}</span>
    </div>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function BarDashboard() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const [filter, setFilter] = useState<"all" | "pending" | "preparing" | "ready">("all");
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");

  const { data: barOrders = [], isLoading, isError, refetch } = trpc.order.getKitchenOrders.useQuery(
    { itemType: "drink" },
    { refetchInterval: 30_000 }
  );

  const { enabled: soundEnabled, volume, setEnabled: setSoundEnabled, setVolume, playAlert } = useSoundAlert({ variant: "bar" });

  const handleSSEEvent = useCallback((event: { type: string; payload: Record<string, unknown> }) => {
    if (event.type === "order_rush") {
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
    channels: ["bar"],
    onEvent: handleSSEEvent,
  });

  const updateItemStatus = trpc.order.updateItemStatus.useMutation({
    onSuccess: (_, v) => {
      if (v.status === "ready") toast.success("Getränk bereit!");
      utils.order.getKitchenOrders.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markAllReady = trpc.order.markAllReady.useMutation({
    onSuccess: () => {
      toast.success("Alle Getränke bereit!");
      utils.order.getKitchenOrders.invalidate();
    },
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

  const orders = barOrders as BarOrder[];

  const stats = useMemo(() => {
    const active = orders.filter(o => o.status !== "ready");
    const ready = orders.filter(o => o.status === "ready");
    const rush = orders.filter(o => o.items.some(i => i.priority === "rush"));
    const avgMins = active.length === 0 ? 0 : Math.round(
      active.reduce((sum, o) => sum + (o.createdAt ? (Date.now() - new Date(o.createdAt).getTime()) / 60000 : 0), 0) / active.length
    );
    return { active: active.length, ready: ready.length, rush: rush.length, avgMins };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter(o => o.status === filter);
  }, [orders, filter]);

  function getOrderPriority(order: BarOrder): string {
    if (order.items.some(i => i.priority === "rush")) return "rush";
    if (order.items.some(i => i.priority === "hold")) return "hold";
    return "normal";
  }

  const sortedOrders = useMemo(() => [...filteredOrders].sort((a, b) => {
    const pa = getOrderPriority(a) === "rush" ? 0 : getOrderPriority(a) === "hold" ? 2 : 1;
    const pb = getOrderPriority(b) === "rush" ? 0 : getOrderPriority(b) === "hold" ? 2 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  }), [filteredOrders]);

  const pulseStyle = `
    @keyframes bar-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .bar-rush { animation: bar-pulse 1.5s ease-in-out infinite; }
  `;

  return (
    <div style={{ background: "#080c14", minHeight: "100vh", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <style>{pulseStyle}</style>

      {/* ─── Offline Banner */}
      <OfflineBanner />

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: "#0d1117", borderBottom: "1px solid #1e2535",
        padding: "12px 16px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Wine size={20} color="#818cf8" />
            <span style={{ fontWeight: 800, fontSize: 16, color: "#f0f4ff" }}>Bar-Display</span>
            <SSEStatusBadge status={sseStatus} retryCount={retryCount} />
          </div>

          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <StatPill label="Aktiv" value={stats.active} color="#818cf8" />
            <StatPill label="Bereit" value={stats.ready} color="#60a5fa" />
            {stats.rush > 0 && <StatPill label="Rush" value={stats.rush} color="#f87171" pulse />}
            <StatPill label="Ø Zeit" value={`${stats.avgMins} Min.`} color="#94a3b8" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <SoundAlertToggle
              enabled={soundEnabled} volume={volume}
              onToggle={setSoundEnabled} onVolumeChange={setVolume} onTestSound={playAlert}
            />
            <button
              onClick={() => setViewMode(v => v === "cards" ? "compact" : "cards")}
              style={{
                background: "#1a1f2e", border: "1px solid #2d3748", color: "#94a3b8",
                borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11,
              }}
            >
              {viewMode === "cards" ? "Kompakt" : "Karten"}
            </button>
            <button
              onClick={() => refetch()}
              style={{
                background: "#1a1f2e", border: "1px solid #2d3748", color: "#94a3b8",
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
              <button key={f} onClick={() => setFilter(f)} style={{
                background: active ? "#312e81" : "#1a1f2e",
                border: active ? "1px solid #818cf8" : "1px solid #2d3748",
                color: active ? "#818cf8" : "#94a3b8",
                borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400,
              }}>
                {labels[f]} {counts[f] > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({counts[f]})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto" }}>

        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ background: "#0d1117", borderRadius: 10, height: 120, animation: "bar-pulse 1.5s infinite" }} />
            ))}
          </div>
        )}

        {isError && (
          <div style={{ textAlign: "center", padding: 40, color: "#f87171" }}>
            <AlertCircle size={32} style={{ margin: "0 auto 8px" }} />
            <p style={{ fontWeight: 600 }}>Bestellungen konnten nicht geladen werden</p>
            <button onClick={() => refetch()} style={{
              marginTop: 12, background: "#1a1f2e", border: "1px solid #2d3748",
              color: "#94a3b8", borderRadius: 6, padding: "6px 16px", cursor: "pointer",
            }}>Erneut versuchen</button>
          </div>
        )}

        {!isLoading && !isError && orders.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "#4b5563" }}>
            <Wine size={48} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <p style={{ fontWeight: 600, fontSize: 16 }}>Keine offenen Getränkebestellungen</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Neue Bestellungen erscheinen automatisch.</p>
          </div>
        )}

        {!isLoading && !isError && sortedOrders.length > 0 && (
          viewMode === "cards"
            ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {sortedOrders.map(order => (
                  <BarOrderCard
                    key={order.id}
                    order={order}
                    onUpdateGroup={updateGroupStatus}
                    onMarkAllReady={() => markAllReady.mutate({ orderId: order.id })}
                    onSetPriority={(p) => setOrderPriority.mutate({ orderId: order.id, priority: p })}
                    isBusy={updateItemStatus.isPending || markAllReady.isPending}
                  />
                ))}
              </div>
            : <BarCompactView
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

// ─── Bar Order Card ───────────────────────────────────────────────────────────
function BarOrderCard({
  order, onUpdateGroup, onMarkAllReady, onSetPriority, isBusy,
}: {
  order: BarOrder;
  onUpdateGroup: (g: GroupedItem, s: "preparing" | "ready") => void;
  onMarkAllReady: () => void;
  onSetPriority: (p: "normal" | "rush" | "hold") => void;
  isBusy: boolean;
}) {
  const grouped = groupItems(order.items, order.id);
  const orderPriority = order.items.some(i => i.priority === "rush") ? "rush"
    : order.items.some(i => i.priority === "hold") ? "hold" : "normal";
  const allReady = grouped.every(g => g.status === "ready");
  const hasActive = grouped.some(g => g.status === "pending" || g.status === "preparing");

  const borderColor = orderPriority === "rush" ? "#dc2626"
    : order.status === "ready" ? "#16a34a"
    : order.status === "preparing" ? "#d97706"
    : "#4338ca";

  return (
    <div
      style={{
        background: "#0d1117", border: `2px solid ${borderColor}`,
        borderRadius: 10, overflow: "hidden",
        boxShadow: orderPriority === "rush" ? `0 0 16px ${borderColor}66` : "none",
      }}
      className={orderPriority === "rush" ? "bar-rush" : ""}
    >
      {/* Header */}
      <div style={{
        background: "#080c14", padding: "10px 12px",
        borderBottom: "1px solid #1e2535",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#f0f4ff", fontFamily: "monospace" }}>
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
        <div style={{ background: "#1a1f2e", padding: "6px 12px", fontSize: 12, color: "#a5b4fc", borderBottom: "1px solid #1e2535" }}>
          📝 {order.notes}
        </div>
      )}

      {/* Items */}
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {grouped.map((group, idx) => (
          <BarItemRow key={idx} group={group} onUpdate={onUpdateGroup} isBusy={isBusy} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid #1e2535", padding: "8px 10px",
        display: "flex", gap: 6, flexWrap: "wrap",
      }}>
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
        <div style={{ display: "flex", gap: 3 }}>
          <button
            onClick={() => onSetPriority(orderPriority === "rush" ? "normal" : "rush")}
            style={{
              background: orderPriority === "rush" ? "#dc262633" : "transparent",
              border: `1px solid ${orderPriority === "rush" ? "#dc2626" : "#2d3748"}`,
              color: orderPriority === "rush" ? "#dc2626" : "#4b5563",
              borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
            }}
          >Rush</button>
          <button
            onClick={() => onSetPriority(orderPriority === "hold" ? "normal" : "hold")}
            style={{
              background: orderPriority === "hold" ? "#4338ca33" : "transparent",
              border: `1px solid ${orderPriority === "hold" ? "#4338ca" : "#2d3748"}`,
              color: orderPriority === "hold" ? "#818cf8" : "#4b5563",
              borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
            }}
          >Hold</button>
        </div>
      </div>
    </div>
  );
}

// ─── Bar Item Row ─────────────────────────────────────────────────────────────
function BarItemRow({ group, onUpdate, isBusy }: {
  group: GroupedItem;
  onUpdate: (g: GroupedItem, s: "preparing" | "ready") => void;
  isBusy: boolean;
}) {
  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    pending:   { bg: "#1e2a4a", text: "#93c5fd", border: "#1e40af" },
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
      <span style={{ fontWeight: 900, fontSize: 20, color: "#f0f4ff", minWidth: 28, textAlign: "center", lineHeight: 1 }}>
        {group.totalQty}×
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontWeight: 700, fontSize: 14, color: "#f0f4ff",
          textDecoration: group.status === "ready" ? "line-through" : "none",
        }}>
          {group.name}
        </p>
        {group.notes && (
          <p style={{ margin: 0, fontSize: 11, color: "#fbbf24", marginTop: 1 }}>⚠ {group.notes}</p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        {group.status === "pending" && (
          <button
            onClick={() => onUpdate(group, "preparing")}
            disabled={isBusy}
            style={{
              background: "#312e81", border: "none", color: "#c7d2fe",
              borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600,
            }}
          >
            <Play size={10} style={{ display: "inline", marginRight: 3 }} />Start
          </button>
        )}
        {group.status === "preparing" && (
          <button
            onClick={() => onUpdate(group, "ready")}
            disabled={isBusy}
            style={{
              background: "#166534", border: "none", color: "#bbf7d0",
              borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700,
            }}
          >
            <CheckCircle size={10} style={{ display: "inline", marginRight: 3 }} />Bereit
          </button>
        )}
        {group.status === "ready" && <CheckCircle size={16} color="#4ade80" />}
      </div>
    </div>
  );
}

// ─── Bar Compact View ─────────────────────────────────────────────────────────
function BarCompactView({ orders, onUpdateGroup, onMarkAllReady, isBusy }: {
  orders: BarOrder[];
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
          : order.status === "preparing" ? "#d97706" : "#4338ca";

        return (
          <div key={order.id} style={{
            background: "#0d1117", border: `1px solid ${borderColor}`,
            borderRadius: 8, padding: "8px 12px",
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#f0f4ff", minWidth: 80, fontFamily: "monospace" }}>
              {order.tableLabel ?? order.orderNumber}
            </span>
            <ElapsedBadge createdAt={order.createdAt} />
            <PriorityBadge priority={orderPriority} />
            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {grouped.map((g, i) => (
                <span key={i} style={{
                  fontSize: 12, padding: "2px 8px", borderRadius: 4,
                  background: g.status === "ready" ? "#052e16" : g.status === "preparing" ? "#3b2a00" : "#1e2a4a",
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
                <CheckCircle2 size={11} style={{ display: "inline", marginRight: 3 }} />Alle bereit
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
