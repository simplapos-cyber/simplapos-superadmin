import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, RefreshCw, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const STATUS_LABEL: Record<string, string> = {
  pending: "Offen", preparing: "In Zubereitung", ready: "Bereit",
  served: "Serviert", paid: "Bezahlt", cancelled: "Storniert",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800", preparing: "bg-yellow-100 text-yellow-800",
  ready: "bg-green-100 text-green-800", served: "bg-purple-100 text-purple-800",
  paid: "bg-gray-100 text-gray-600", cancelled: "bg-red-100 text-red-800",
};

export default function Waiter_history() {
  const [, navigate] = useLocation();
  const { data: orders = [], isLoading, isError, refetch } = trpc.order.getRecentOrders.useQuery({ limit: 100 }, {
    refetchInterval: 30_000,
  });

  const paidOrders = (orders as Array<{ id: number; tableLabel?: string; status: string; totalAmount: string | null; createdAt: number }>)
    .filter((o) => ["paid", "cancelled"].includes(o.status));

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Bestellverlauf</h1>
          <p className="text-sm text-muted-foreground">{paidOrders.length} abgeschlossene Bestellungen</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {isLoading && <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>}
      {isError && (
        <div className="p-6 text-center text-destructive border rounded-lg">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p className="font-medium">Verlauf konnte nicht geladen werden</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Erneut versuchen</Button>
        </div>
      )}
      {!isLoading && paidOrders.length === 0 && (
        <div className="p-10 text-center text-muted-foreground border rounded-lg">
          <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Noch keine abgeschlossenen Bestellungen</p>
        </div>
      )}
      <div className="space-y-2">
        {paidOrders.map((order) => (
          <Card key={order.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => navigate(`/kellner/order?orderId=${order.id}`)}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">#{order.id}{order.tableLabel ? ` · ${order.tableLabel}` : ""}</p>
                <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString("de-CH")}</p>
              </div>
              <div className="text-right">
                <Badge className={`text-xs ${STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[order.status] ?? order.status}</Badge>
                {order.totalAmount && <p className="text-xs font-medium mt-1">CHF {parseFloat(order.totalAmount).toFixed(2)}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
