import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Clock, Download, Filter, RefreshCw, TrendingUp, Users, Package } from "lucide-react";
import { toast } from "sonner";

type PickupEntry = {
  itemId: number;
  orderId: number;
  orderNumber: string;
  tableLabel: string | null;
  itemName: string;
  quantity: number;
  course: number;
  pickedUpAt: number | null;
  pickedUpBy: string | null;
};

const COURSE_NAMES: Record<number, string> = {
  1: "Vorspeise",
  2: "Hauptgang",
  3: "Dessert",
  4: "Getränk",
};

function formatTime(ts: number | null) {
  if (!ts) return "–";
  return new Date(ts).toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatTimeShort(ts: number | null) {
  if (!ts) return "–";
  return new Date(ts).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

export default function AbrufVerlauf() {
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [toDate, setToDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString().slice(0, 16);
  });
  const [filterWaiter, setFilterWaiter] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");

  const { data: rawData = [], isLoading, refetch } = trpc.order.getPickupHistory.useQuery({
    fromDate: fromDate ? new Date(fromDate).getTime() : undefined,
    toDate: toDate ? new Date(toDate).getTime() : undefined,
    limit: 500,
  }, { refetchInterval: 30_000 });

  const data = rawData as PickupEntry[];

  // Unique waiters for filter dropdown
  const waiters = useMemo(() => {
    const names = new Set(data.map(d => d.pickedUpBy).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [data]);

  // Filtered data
  const filtered = useMemo(() => {
    return data.filter(entry => {
      if (filterWaiter && entry.pickedUpBy !== filterWaiter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!entry.itemName.toLowerCase().includes(q) &&
            !(entry.tableLabel ?? "").toLowerCase().includes(q) &&
            !(entry.pickedUpBy ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data, filterWaiter, searchText]);

  // Stats
  const stats = useMemo(() => {
    const byWaiter = new Map<string, number>();
    for (const e of filtered) {
      const w = e.pickedUpBy ?? "Unbekannt";
      byWaiter.set(w, (byWaiter.get(w) ?? 0) + e.quantity);
    }
    const topWaiter = Array.from(byWaiter.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      total: filtered.reduce((s, e) => s + e.quantity, 0),
      entries: filtered.length,
      uniqueWaiters: byWaiter.size,
      topWaiter: topWaiter ? `${topWaiter[0]} (${topWaiter[1]} Pos.)` : "–",
    };
  }, [filtered]);

  // Export CSV
  function exportCSV() {
    const header = "Zeitpunkt;Kellner;Tisch;Bestellung;Artikel;Menge;Gang";
    const rows = filtered.map(e =>
      [
        formatTime(e.pickedUpAt),
        e.pickedUpBy ?? "–",
        e.tableLabel ?? e.orderNumber,
        e.orderNumber,
        e.itemName,
        e.quantity,
        COURSE_NAMES[e.course] ?? `Gang ${e.course}`,
      ].join(";")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abruf-verlauf-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportiert");
  }

  // Group by hour for timeline view
  const byHour = useMemo(() => {
    const map = new Map<string, PickupEntry[]>();
    for (const e of filtered) {
      if (!e.pickedUpAt) continue;
      const d = new Date(e.pickedUpAt);
      const key = `${d.getHours().toString().padStart(2, "0")}:00`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div style={{ padding: "20px", maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Abruf-Verlauf</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>Welcher Kellner hat wann welche Bestellungen abgerufen</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => refetch()}
            style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <RefreshCw size={14} /> Aktualisieren
          </button>
          <button
            onClick={exportCSV}
            style={{ background: "#0f172a", color: "#f8fafc", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}
          >
            <Download size={14} /> CSV Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>VON</label>
          <input
            type="datetime-local"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>BIS</label>
          <input
            type="datetime-local"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>KELLNER</label>
          <select
            value={filterWaiter}
            onChange={e => setFilterWaiter(e.target.value)}
            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff", minWidth: 140 }}
          >
            <option value="">Alle Kellner</option>
            {waiters.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>SUCHE</label>
          <input
            type="text"
            placeholder="Artikel, Tisch, Kellner..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff", width: "100%" }}
          />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Abgerufene Positionen", value: stats.total, icon: <Package size={16} />, color: "#3b82f6" },
          { label: "Abruf-Ereignisse", value: stats.entries, icon: <Clock size={16} />, color: "#8b5cf6" },
          { label: "Aktive Kellner", value: stats.uniqueWaiters, icon: <Users size={16} />, color: "#10b981" },
          { label: "Aktivster Kellner", value: stats.topWaiter, icon: <TrendingUp size={16} />, color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: s.color, marginBottom: 6 }}>
              {s.icon}
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Timeline by hour */}
      {byHour.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Abrufe nach Uhrzeit
          </h3>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {byHour.map(([hour, entries]) => {
              const qty = entries.reduce((s, e) => s + e.quantity, 0);
              const maxQty = Math.max(...byHour.map(([, e]) => e.reduce((s, x) => s + x.quantity, 0)));
              const height = Math.max(20, Math.round((qty / maxQty) * 60));
              return (
                <div key={hour} title={`${hour}: ${qty} Positionen`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ width: 32, height, background: "#3b82f6", borderRadius: "4px 4px 0 0", opacity: 0.8 }} />
                  <span style={{ fontSize: 9, color: "#94a3b8" }}>{hour}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
          <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
          <p>Lade Abruf-Verlauf...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
          <Filter size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <p style={{ fontWeight: 600 }}>Keine Abrufe im gewählten Zeitraum</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Passen Sie den Datumsfilter an oder warten Sie auf neue Abrufe.</p>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                {["Zeitpunkt", "Kellner", "Tisch", "Artikel", "Menge", "Gang"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#374151", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => (
                <tr
                  key={entry.itemId}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    background: idx % 2 === 0 ? "#fff" : "#fafafa",
                    transition: "background 0.15s",
                  }}
                >
                  <td style={{ padding: "9px 14px", color: "#374151", fontVariantNumeric: "tabular-nums" }}>
                    {formatTime(entry.pickedUpAt)}
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{
                      background: "#eff6ff", color: "#1d4ed8", borderRadius: 4,
                      padding: "2px 8px", fontSize: 12, fontWeight: 600,
                    }}>
                      {entry.pickedUpBy ?? "–"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", fontWeight: 700, color: "#0f172a" }}>
                    {entry.tableLabel ?? entry.orderNumber}
                  </td>
                  <td style={{ padding: "9px 14px", color: "#374151" }}>{entry.itemName}</td>
                  <td style={{ padding: "9px 14px", color: "#374151", fontWeight: 600 }}>×{entry.quantity}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{
                      background: "#f0fdf4", color: "#15803d", borderRadius: 4,
                      padding: "2px 8px", fontSize: 11, fontWeight: 600,
                    }}>
                      {COURSE_NAMES[entry.course] ?? `Gang ${entry.course}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "10px 14px", borderTop: "1px solid #f1f5f9", color: "#94a3b8", fontSize: 12 }}>
            {filtered.length} Einträge · {stats.total} Positionen total
          </div>
        </div>
      )}
    </div>
  );
}
