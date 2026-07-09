import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSSE } from "@/hooks/useSSE";
import { CheckCircle2, Clock, RefreshCw, Utensils, Bell } from "lucide-react";
import { toast } from "sonner";

type ReadyItem = {
  id: number;
  name: string;
  quantity: number;
  course: number;
  readySince: number | null;
};

type ReadyOrder = {
  orderId: number;
  orderNumber: string;
  tableLabel: string | null;
  createdAt: number | null;
  readyItems: ReadyItem[];
};

const COURSE_NAMES: Record<number, string> = {
  1: "Vorspeise",
  2: "Hauptgang",
  3: "Dessert",
  4: "Getränk",
};

function ElapsedMinutes({ createdAt }: { createdAt: number | null }) {
  if (!createdAt) return null;
  const mins = Math.floor((Date.now() - createdAt) / 60000);
  const color = mins >= 20 ? "#ef4444" : mins >= 10 ? "#f59e0b" : "#22c55e";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 12, fontWeight: 700, color,
      background: `${color}22`, borderRadius: 6, padding: "2px 8px",
    }}>
      <Clock size={11} />
      {mins < 1 ? "< 1 Min." : `${mins} Min.`}
    </span>
  );
}

export default function Waiter_ready() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;
  const currentUserName = user?.name ?? user?.email ?? "Kellner";

  const utils = trpc.useUtils();

  const { data: rawOrders = [], isLoading, refetch } = trpc.order.getReadyOrders.useQuery(
    undefined,
    { refetchInterval: 15_000 }
  );
  const orders = rawOrders as ReadyOrder[];

  const markItemPickedUp = trpc.order.markItemPickedUp.useMutation({
    onSuccess: () => {
      toast.success("Abgerufen ✓");
      utils.order.getReadyOrders.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markCoursePickedUp = trpc.order.markCoursePickedUp.useMutation({
    onSuccess: () => {
      toast.success("Gang abgerufen ✓");
      utils.order.getReadyOrders.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // SSE: refresh when kitchen marks items ready
  const handleSSEEvent = useCallback((event: { type: string }) => {
    if (event.type === "order_ready" || event.type === "order_update") {
      utils.order.getReadyOrders.invalidate();
    }
  }, [utils]);

  useSSE(restaurantId, { channels: ["floor"], onEvent: handleSSEEvent });

  // Group ready items by course within each order
  const ordersWithCourses = useMemo(() => {
    return orders.map(order => {
      const byCourse = new Map<number, ReadyItem[]>();
      for (const item of order.readyItems) {
        if (!byCourse.has(item.course)) byCourse.set(item.course, []);
        byCourse.get(item.course)!.push(item);
      }
      const courses = Array.from(byCourse.keys()).sort((a, b) => a - b);
      return { ...order, byCourse, courses };
    });
  }, [orders]);

  const totalReady = orders.reduce((s, o) => s + o.readyItems.length, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: "#166534", color: "#f0fdf4",
        padding: "14px 16px", position: "sticky", top: 0, zIndex: 50,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell size={20} color="#bbf7d0" />
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>Abholbereit</div>
              <div style={{ fontSize: 12, color: "#86efac" }}>
                {isLoading ? "Lädt..." : totalReady === 0 ? "Alles abgeholt" : `${orders.length} Tisch${orders.length !== 1 ? "e" : ""} warten`}
              </div>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            style={{ background: "#14532d", border: "1px solid #166534", color: "#bbf7d0", borderRadius: 8, padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto" }}>
        {/* Loading */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: 60, color: "#16a34a" }}>
            <RefreshCw size={28} style={{ margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
            <p>Lade bereite Bestellungen...</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && orders.length === 0 && (
          <div style={{ textAlign: "center", padding: 80, color: "#16a34a" }}>
            <CheckCircle2 size={56} style={{ margin: "0 auto 16px", opacity: 0.4 }} />
            <p style={{ fontWeight: 700, fontSize: 18, color: "#166534" }}>Alles abgeholt!</p>
            <p style={{ fontSize: 14, color: "#4ade80", marginTop: 6 }}>Keine Bestellungen warten auf Abholung.</p>
          </div>
        )}

        {/* Order cards */}
        {!isLoading && ordersWithCourses.map(order => (
          <div
            key={order.orderId}
            style={{
              background: "#fff",
              border: "2px solid #16a34a",
              borderRadius: 12,
              marginBottom: 14,
              overflow: "hidden",
              boxShadow: "0 2px 12px rgba(22,163,74,0.12)",
            }}
          >
            {/* Card Header */}
            <div style={{
              background: "#f0fdf4", padding: "12px 16px",
              borderBottom: "1px solid #dcfce7",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Utensils size={18} color="#16a34a" />
                <span style={{ fontWeight: 800, fontSize: 20, color: "#166534" }}>
                  {order.tableLabel ?? order.orderNumber}
                </span>
                {order.tableLabel && (
                  <span style={{ fontSize: 12, color: "#86efac" }}>#{order.orderNumber}</span>
                )}
              </div>
              <ElapsedMinutes createdAt={order.createdAt} />
            </div>

            {/* Items by course */}
            <div style={{ padding: "12px 16px" }}>
              {order.courses.map(course => {
                const items = order.byCourse.get(course)!;
                const courseName = COURSE_NAMES[course] ?? `Gang ${course}`;
                const multiCourse = order.courses.length > 1;

                return (
                  <div key={course} style={{ marginBottom: multiCourse ? 12 : 0 }}>
                    {multiCourse && (
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        marginBottom: 6,
                      }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: "#16a34a",
                          textTransform: "uppercase", letterSpacing: "0.05em",
                        }}>
                          {courseName}
                        </span>
                        <button
                          onClick={() => markCoursePickedUp.mutate({ orderId: order.orderId, course, pickedUpBy: currentUserName })}
                          disabled={markCoursePickedUp.isPending}
                          style={{
                            background: "#dcfce7", border: "1px solid #16a34a", color: "#166534",
                            borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700,
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <CheckCircle2 size={11} /> Ganzen Gang abholen
                        </button>
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {items.map(item => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            background: "#f0fdf4", borderRadius: 8, padding: "10px 14px",
                            border: "1px solid #bbf7d0",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{
                              background: "#16a34a", color: "#fff",
                              borderRadius: 6, padding: "2px 8px",
                              fontWeight: 800, fontSize: 15, minWidth: 28, textAlign: "center",
                            }}>
                              ×{item.quantity}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: 15, color: "#166534" }}>
                              {item.name}
                            </span>
                          </div>
                          <button
                            onClick={() => markItemPickedUp.mutate({ orderId: order.orderId, itemId: item.id, pickedUpBy: currentUserName })}
                            disabled={markItemPickedUp.isPending}
                            style={{
                              background: "#16a34a", border: "none", color: "#fff",
                              borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                              fontSize: 13, fontWeight: 700,
                              display: "flex", alignItems: "center", gap: 6,
                              transition: "background 0.15s",
                            }}
                          >
                            <CheckCircle2 size={14} /> Abgeholt
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
