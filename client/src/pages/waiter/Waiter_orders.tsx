import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, RefreshCw, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";

const STATUS_LABEL: Record<string, string> = {
  pending: "Offen", preparing: "In Zubereitung", ready: "Bereit",
  served: "Serviert", paid: "Bezahlt", cancelled: "Storniert",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800", preparing: "bg-yellow-100 text-yellow-800",
  ready: "bg-green-100 text-green-800", served: "bg-purple-100 text-purple-800",
  paid: "bg-gray-100 text-gray-600", cancelled: "bg-red-100 text-red-800",
};

export default function Waiter_orders() {
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const { data: orders = [], isLoading, isError, refetch } = trpc.order.getRecentOrders.useQuery({ limit: 50 }, {
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t("waiterOrders.myOrders")}</h1>
          <p className="text-sm text-muted-foreground">{(orders as unknown[]).length} Bestellungen</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {isLoading && <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>}
      {isError && (
        <div className="p-6 text-center text-destructive border rounded-lg">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p className="font-medium">{t("orders.loadError")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>{t("common.retry")}</Button>
        </div>
      )}
      {!isLoading && !isError && (orders as unknown[]).length === 0 && (
        <div className="p-10 text-center text-muted-foreground border rounded-lg">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Keine Bestellungen vorhanden</p>
        </div>
      )}
      <div className="space-y-3">
        {(orders as Array<{ id: number; tableLabel?: string; status: string; totalAmount: string | null; createdAt: number; guestCount?: number | null }>).map((order) => (
          <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/kellner/order?orderId=${order.id}`)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">Bestellung #{order.id}{order.tableLabel ? ` · ${order.tableLabel}` : ""}</p>
                <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString("de-CH")}</p>
              </div>
              <div className="text-right space-y-1">
                <Badge className={`text-xs ${STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[order.status] ?? order.status}</Badge>
                {order.totalAmount && <p className="text-xs font-medium">CHF {parseFloat(order.totalAmount).toFixed(2)}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
