import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Leaf, Save } from "lucide-react";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";

function NaehrwerteInner() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [form, setForm] = useState({
    servingSize: "100g",
    calories: "",
    protein: "",
    carbohydrates: "",
    sugar: "",
    fat: "",
    saturatedFat: "",
    fiber: "",
    salt: "",
  });

  const { data: products } = trpc.restaurants.products.useQuery(
    { restaurantId },
    { enabled: !!restaurantId }
  );

  const { data: existing, refetch: refetchNutrition } = trpc.nutrition.getByMenuItem.useQuery(
    { menuItemId: selectedItemId ?? 0, restaurantId },
    { enabled: !!selectedItemId && !!restaurantId }
  );

  // Formular befüllen wenn Daten geladen
  useState(() => {
    if (existing) setForm({
      servingSize: (existing as any).servingSize ?? "100g",
      calories: (existing as any).calories ?? "",
      protein: (existing as any).protein ?? "",
      carbohydrates: (existing as any).carbohydrates ?? "",
      sugar: (existing as any).sugar ?? "",
      fat: (existing as any).fat ?? "",
      saturatedFat: (existing as any).saturatedFat ?? "",
      fiber: (existing as any).fiber ?? "",
      salt: (existing as any).salt ?? "",
    });
  });

  const upsert = trpc.nutrition.upsert.useMutation({
    onSuccess: () => { refetchNutrition(); toast.success("Nährwerte gespeichert"); },
    onError: (e: any) => toast.error(e.message),
  });

  const fields = [
    { key: "calories", label: "Kalorien (kcal)" },
    { key: "protein", label: "Protein (g)" },
    { key: "carbohydrates", label: "Kohlenhydrate (g)" },
    { key: "sugar", label: "davon Zucker (g)" },
    { key: "fat", label: "Fett (g)" },
    { key: "saturatedFat", label: "davon gesättigte Fettsäuren (g)" },
    { key: "fiber", label: "Ballaststoffe (g)" },
    { key: "salt", label: "Salz (g)" },
  ] as const;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nährwerte & Allergene</h1>
        <p className="text-muted-foreground text-sm">EU-konforme Nährwertangaben pro Menüpunkt</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Leaf className="w-5 h-5" />Menüpunkt auswählen</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Produkt</Label>
            <Select
              value={selectedItemId?.toString() ?? ""}
              onValueChange={v => setSelectedItemId(parseInt(v))}
            >
              <SelectTrigger><SelectValue placeholder="Produkt auswählen..." /></SelectTrigger>
              <SelectContent>
                {(products as any[] ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedItemId && (
            <>
              <div className="space-y-1">
                <Label>Portionsgrösse</Label>
                <Input value={form.servingSize} onChange={e => setForm(f => ({ ...f, servingSize: e.target.value }))} placeholder="z.B. 100g" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {fields.map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <Button
                onClick={() => upsert.mutate({ menuItemId: selectedItemId, restaurantId, ...form })}
                disabled={upsert.isPending}
                className="flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {upsert.isPending ? "Speichern..." : "Nährwerte speichern"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">EU-Lebensmittelinformationsverordnung (LMIV)</p>
        <p>Seit 2014 müssen Restaurants auf Anfrage Nährwertinformationen bereitstellen. SimplaPOS speichert diese strukturiert und macht sie auf der digitalen Speisekarte sichtbar.</p>
      </div>
    </div>
  );
}

export default function Naehrwerte() {
  return (
    <ModuleGate moduleId="allergene">
      <NaehrwerteInner />
    </ModuleGate>
  );
}
