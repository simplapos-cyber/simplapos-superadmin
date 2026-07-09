import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const INITIAL_METHODS = [
  { id: "cash", name: "Bar (Cash)", fee: "0", enabled: true, icon: "💵" },
  { id: "credit", name: "Kreditkarte", fee: "1.5", enabled: true, icon: "💳" },
  { id: "debit", name: "Debitkarte", fee: "0.5", enabled: true, icon: "💳" },
  { id: "twint", name: "TWINT", fee: "0.3", enabled: true, icon: "📱" },
  { id: "invoice", name: "Rechnung", fee: "0", enabled: false, icon: "🧾" },
  { id: "voucher", name: "Gutschein", fee: "0", enabled: true, icon: "🎁" },
];

export default function AdminPaymentMethods() {
  const [methods, setMethods] = useState(INITIAL_METHODS);

  const toggle = (id: string) => {
    setMethods((prev) => prev.map((m) => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };

  const setFee = (id: string, fee: string) => {
    setMethods((prev) => prev.map((m) => m.id === id ? { ...m, fee } : m));
  };

  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6" /> Zahlungsarten
          </h1>
          <p className="text-muted-foreground mt-1">Akzeptierte Zahlungsmethoden konfigurieren</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {methods.map((m) => (
            <Card key={m.id} className={!m.enabled ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{m.icon} {m.name}</span>
                  <Switch checked={m.enabled} onCheckedChange={() => toggle(m.id)} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Gebühr (%)</Label>
                  <Input
                    type="number"
                    value={m.fee}
                    onChange={(e) => setFee(m.id, e.target.value)}
                    min="0"
                    max="10"
                    step="0.1"
                    disabled={!m.enabled}
                    className="mt-1"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!m.enabled}
                  onClick={() => toast.success(`${m.name} gespeichert`)}
                >
                  <Save className="h-3 w-3 mr-1" /> Speichern
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    
  );
}
