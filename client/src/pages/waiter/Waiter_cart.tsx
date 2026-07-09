import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, UtensilsCrossed } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";

type TableEntry = {
  id: number; sourceType: string; label: string; seats: number;
  currentOrder: { id: number; status: string; totalAmount: string | null; guestCount: number | null } | null;
};

export default function Waiter_cart() {
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const { data: planGroups = [], isLoading } = trpc.order.getTableStatus.useQuery(undefined, { refetchInterval: 15_000 });

  const activeOrders = (planGroups as Array<{ tables: TableEntry[] }>)
    .flatMap((g) => g.tables)
    .filter((t) => t.currentOrder && !["paid", "cancelled"].includes(t.currentOrder.status))
    .map((t) => ({ table: t, order: t.currentOrder! }));

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">{t("cart.activeOrders")}</h1>
        <p className="text-sm text-muted-foreground">{t("cart.tapToEdit")}</p>
      </div>
      {isLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>}
      {!isLoading && activeOrders.length === 0 && (
        <div className="p-10 text-center text-muted-foreground border rounded-lg">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{t("cart.noActiveOrders")}</p>
            <Button className="mt-4" onClick={() => navigate("/kellner/tables")}>
            <UtensilsCrossed className="h-4 w-4 mr-2" /> {t("cart.selectTable")}
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {activeOrders.map(({ table, order }) => (
          <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/kellner/order?orderId=${order.id}`)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{table.label}</p>
                <p className="text-xs text-muted-foreground">{t("cart.orderNr")} #{order.id}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">CHF {parseFloat(order.totalAmount ?? "0").toFixed(2)}</p>
                <p className="text-xs text-muted-foreground capitalize">{order.status}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
