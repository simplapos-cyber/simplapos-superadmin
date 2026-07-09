import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Search, Clock, CheckCircle, XCircle, ChefHat } from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Ausstehend", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  preparing: { label: "In Zubereitung", color: "bg-blue-100 text-blue-800", icon: ChefHat },
  ready: { label: "Bereit", color: "bg-green-100 text-green-800", icon: CheckCircle },
  closed: { label: "Abgeschlossen", color: "bg-gray-100 text-gray-800", icon: CheckCircle },
  cancelled: { label: "Storniert", color: "bg-red-100 text-red-800", icon: XCircle },
};

export default function AdminOrders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: recentOrders } = trpc.order.getRecentOrders.useQuery({ limit: 100 });

  const filtered = (recentOrders ?? []).filter((o: any) => {
    const matchSearch = !search || String(o.orderNumber ?? o.id).includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const fmt = (v: number) => `CHF ${(v ?? 0).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bestellungen</h1>
        <p className="text-muted-foreground text-sm">Alle Bestellungen im Überblick</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Bestellnummer suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {Object.entries(statusConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> {filtered.length} Bestellungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Keine Bestellungen gefunden</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((o: any) => {
                const sc = statusConfig[o.status] ?? statusConfig.pending;
                const Icon = sc.icon;
                return (
                  <div key={o.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">#{o.orderNumber ?? o.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.createdAt ? new Date(o.createdAt).toLocaleString("de-CH") : "–"}
                          {o.tableId ? ` · Tisch ${o.tableId}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
                      <span className="font-bold text-sm">{fmt(o.totalAmount ?? 0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
