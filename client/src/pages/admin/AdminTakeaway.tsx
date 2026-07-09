import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingBag, Search, Clock, TrendingUp, DollarSign } from "lucide-react";
import { toast } from "sonner";

const ORDERS = [
  { id: "#T001", customer: "Max Müller", items: "Pizza Margherita x2, Cola x2", total: "CHF 38.00", time: "19:15", eta: "19:40", status: "In Zubereitung", type: "Takeaway" },
  { id: "#T002", customer: "Anna Bauer", items: "Burger x1, Pommes x1", total: "CHF 22.50", time: "19:20", eta: "19:35", status: "Bereit", type: "Takeaway" },
  { id: "#L001", customer: "Peter Schmid", items: "Pasta Carbonara x1", total: "CHF 19.00", time: "19:10", eta: "19:45", status: "Geliefert", type: "Lieferung" },
  { id: "#T003", customer: "Lisa Weber", items: "Salat x1, Wasser x1", total: "CHF 16.00", time: "19:25", eta: "19:45", status: "Neu", type: "Takeaway" },
];

const STATUS_COLORS: Record<string, string> = {
  Neu: "bg-blue-100 text-blue-800",
  "In Zubereitung": "bg-yellow-100 text-yellow-800",
  Bereit: "bg-green-100 text-green-800",
  Geliefert: "bg-gray-100 text-gray-800",
  Storniert: "bg-red-100 text-red-800",
};

const NEXT_STATUS: Record<string, string> = {
  Neu: "In Zubereitung",
  "In Zubereitung": "Bereit",
  Bereit: "Geliefert",
};

export default function AdminTakeaway() {
  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6" /> Takeaway & Lieferung
          </h1>
          <p className="text-muted-foreground mt-1">Ausser-Haus-Bestellungen verwalten</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: ShoppingBag, label: "Bestellungen heute", value: "4", color: "text-blue-600" },
            { icon: Clock, label: "Ø Lieferzeit", value: "28 Min.", color: "text-orange-600" },
            { icon: DollarSign, label: "Umsatz heute", value: "CHF 95.50", color: "text-green-600" },
            { icon: TrendingUp, label: "Aktive Bestellungen", value: "3", color: "text-purple-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <s.icon className={`h-5 w-5 ${s.color} mb-1`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Bestellung suchen..." className="pl-9" />
              </div>
              <Select>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="new">Neu</SelectItem>
                  <SelectItem value="prep">In Zubereitung</SelectItem>
                  <SelectItem value="ready">Bereit</SelectItem>
                  <SelectItem value="delivered">Geliefert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ORDERS.map((o) => (
                <div key={o.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm">{o.id}</span>
                        <Badge variant="outline">{o.type}</Badge>
                        <Badge className={STATUS_COLORS[o.status]}>{o.status}</Badge>
                      </div>
                      <p className="font-medium mt-1">{o.customer}</p>
                      <p className="text-sm text-muted-foreground">{o.items}</p>
                      <p className="text-xs text-muted-foreground mt-1">Bestellt: {o.time} · ETA: {o.eta}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{o.total}</p>
                      {NEXT_STATUS[o.status] && (
                        <Button size="sm" className="mt-2" onClick={() => toast.success(`Status → ${NEXT_STATUS[o.status]}`)}>
                          → {NEXT_STATUS[o.status]}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    
  );
}
