import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, MapPin, Clock, Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";

const stats = [
  { label: "Aktive Lieferungen", value: "0", icon: Truck, color: "text-blue-600" },
  { label: "Heute geliefert", value: "0", icon: Package, color: "text-green-600" },
  { label: "Ø Lieferzeit", value: "–", icon: Clock, color: "text-orange-600" },
  { label: "Lieferzone", value: "–", icon: MapPin, color: "text-purple-600" },
];

function AdminDeliveryInner() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lieferung</h1>
          <p className="text-muted-foreground text-sm">Lieferbestellungen und Zonen verwalten</p>
        </div>
        <Button onClick={() => toast.info("Neue Lieferzone – Feature kommt bald")} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Lieferzone
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className={`h-7 w-7 ${s.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" /> Aktive Lieferungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm text-center py-6">Keine aktiven Lieferungen</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Lieferzonen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm text-center py-6">
              Noch keine Lieferzonen konfiguriert.
            </p>
            <Button variant="outline" className="w-full mt-2" onClick={() => toast.info("Feature kommt bald")}>
              <Plus className="h-4 w-4 mr-1" /> Zone hinzufügen
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDelivery() {
  return (
    <ModuleGate moduleId="lieferung">
      <AdminDeliveryInner />
    </ModuleGate>
  );
}
