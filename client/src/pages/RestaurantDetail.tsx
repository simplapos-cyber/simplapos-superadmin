import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Save, Store, Tag, Package, TableIcon, Puzzle } from "lucide-react";
import { MODULES } from "../../../shared/pricing";

export default function RestaurantDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: restaurant, isLoading } = trpc.restaurants.get.useQuery({ id });
  const { data: categories } = trpc.restaurants.categories.useQuery({ restaurantId: id });
  const { data: products } = trpc.restaurants.products.useQuery({ restaurantId: id });
  const { data: tables } = trpc.restaurants.tables.useQuery({ restaurantId: id });
  const { data: modules } = trpc.restaurants.modules.useQuery({ restaurantId: id });

  const [form, setForm] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  const updateMutation = trpc.restaurants.update.useMutation({
    onSuccess: () => {
      utils.restaurants.get.invalidate({ id });
      setIsDirty(false);
      toast.success("Änderungen gespeichert");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    const payload: Record<string, unknown> = { id };
    for (const [k, v] of Object.entries(form)) {
      if (k === 'riskScore') payload[k] = parseInt(v, 10) || 0;
      else payload[k] = v;
    }
    updateMutation.mutate(payload as any);
  };

  const getValue = (field: string) => {
    if (field in form) return form[field];
    return (restaurant as any)?.[field] ?? "";
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Restaurant nicht gefunden</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/restaurants")}>
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/restaurants")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{restaurant.name}</h1>
            <p className="text-muted-foreground text-sm">{restaurant.city ?? ""}</p>
          </div>
        </div>
        {isDirty && (
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Speichert..." : "Speichern"}
          </Button>
        )}
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info"><Store className="h-3.5 w-3.5 mr-1.5" />Info</TabsTrigger>
          <TabsTrigger value="categories"><Tag className="h-3.5 w-3.5 mr-1.5" />Kategorien ({categories?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="products"><Package className="h-3.5 w-3.5 mr-1.5" />Produkte ({products?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="tables"><TableIcon className="h-3.5 w-3.5 mr-1.5" />Tische ({tables?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="modules"><Puzzle className="h-3.5 w-3.5 mr-1.5" />Module ({modules?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={getValue("name")} onChange={(e) => handleChange("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input value={getValue("slug")} onChange={(e) => handleChange("slug", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>E-Mail</Label>
                <Input type="email" value={getValue("email")} onChange={(e) => handleChange("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={getValue("phone")} onChange={(e) => handleChange("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Stadt</Label>
                <Input value={getValue("city")} onChange={(e) => handleChange("city", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Land</Label>
                <Input value={getValue("country")} onChange={(e) => handleChange("country", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={getValue("website")} onChange={(e) => handleChange("website", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={getValue("status") || "trial"} onValueChange={(v) => handleChange("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                    <SelectItem value="suspended">Gesperrt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Währung</Label>
                <Input value={getValue("currency") || "CHF"} onChange={(e) => handleChange("currency", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Risiko-Score (0–100)</Label>
                <Input
                  type="number"
                  min={0} max={100}
                  value={getValue("riskScore")}
                  onChange={(e) => handleChange("riskScore", e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Notizen</Label>
                <Textarea value={getValue("notes")} onChange={(e) => handleChange("notes", e.target.value)} rows={3} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Kategorien</CardTitle></CardHeader>
            <CardContent>
              {categories?.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Kategorien vorhanden</p>
              ) : (
                <div className="space-y-2">
                  {categories?.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="font-medium">{c.name}</span>
                      <Badge variant={c.isActive ? "default" : "secondary"}>
                        {c.isActive ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Produkte</CardTitle></CardHeader>
            <CardContent>
              {products?.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Produkte vorhanden</p>
              ) : (
                <div className="space-y-2">
                  {products?.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <span className="font-medium">{p.name}</span>
                        {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                      </div>
                      <span className="font-semibold text-sm">CHF {Number(p.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tables" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Tische</CardTitle></CardHeader>
            <CardContent>
              {tables?.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Tische vorhanden</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {tables?.map((t: any) => (
                    <div key={t.id} className="p-3 rounded-lg border text-center">
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.seats ?? 4} Plätze</p>
                      {t.area && <p className="text-xs text-muted-foreground">{t.area}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Aktive Module</CardTitle></CardHeader>
            <CardContent>
              {(!modules || modules.length === 0) ? (
                <p className="text-muted-foreground text-sm">Keine Module aktiviert. Module werden automatisch beim Vertragsabschluss zugewiesen.</p>
              ) : (
                <div className="space-y-2">
                  {modules.map((m: any) => {
                    const modDef = MODULES.find(mod => mod.id === m.moduleId);
                    return (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <span className="font-medium">{modDef?.name ?? m.moduleId}</span>
                          {modDef?.description && <p className="text-xs text-muted-foreground">{modDef.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          {m.quantity > 1 && <Badge variant="outline">{m.quantity}x</Badge>}
                          <Badge variant={m.status === "active" ? "default" : "secondary"}>
                            {m.status === "active" ? "Aktiv" : m.status === "pending" ? "Ausstehend" : "Inaktiv"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
