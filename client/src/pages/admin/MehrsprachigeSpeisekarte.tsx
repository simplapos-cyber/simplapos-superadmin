import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Save } from "lucide-react";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";

const LANGS = [
  { value: "de", label: "🇩🇪 Deutsch" },
  { value: "fr", label: "🇫🇷 Français" },
  { value: "en", label: "🇬🇧 English" },
  { value: "it", label: "🇮🇹 Italiano" },
] as const;

function MehrsprachigeSpeisekarteInner() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [lang, setLang] = useState<"de" | "fr" | "en" | "it">("fr");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: categories } = trpc.restaurants.categories.useQuery(
    { restaurantId },
    { enabled: !!restaurantId }
  );

  const { data: translations, refetch } = trpc.multilangMenu.getCategoryTranslations.useQuery(
    { restaurantId, categoryId: selectedCategoryId ?? 0 },
    { enabled: !!selectedCategoryId && !!restaurantId }
  );

  const upsert = trpc.multilangMenu.upsertCategoryTranslation.useMutation({
    onSuccess: () => { refetch(); toast.success("Übersetzung gespeichert"); },
    onError: (e: any) => toast.error(e.message),
  });

  const loadTranslation = (targetLang: "de" | "fr" | "en" | "it") => {
    setLang(targetLang);
    const existing = (translations as any[])?.find((t: any) => t.lang === targetLang);
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mehrsprachige Speisekarte</h1>
        <p className="text-muted-foreground text-sm">Kategorien und Produkte in DE / FR / EN / IT übersetzen</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" />Kategorie übersetzen</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Kategorie</Label>
              <Select
                value={selectedCategoryId?.toString() ?? ""}
                onValueChange={v => { setSelectedCategoryId(parseInt(v)); setName(""); setDescription(""); }}
              >
                <SelectTrigger><SelectValue placeholder="Kategorie auswählen..." /></SelectTrigger>
                <SelectContent>
                  {(categories as any[] ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Sprache</Label>
              <Select value={lang} onValueChange={v => loadTranslation(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedCategoryId && (
            <>
              {/* Übersetzungsstatus */}
              <div className="flex gap-2 flex-wrap">
                {LANGS.map(l => {
                  const has = (translations as any[])?.some((t: any) => t.lang === l.value);
                  return (
                    <button
                      key={l.value}
                      onClick={() => loadTranslation(l.value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        lang === l.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : has
                          ? "bg-green-100 text-green-800 border-green-200"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {l.label} {has ? "✓" : "–"}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Name ({lang.toUpperCase()})</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder={`Kategoriename auf ${lang.toUpperCase()}...`} />
                </div>
                <div className="space-y-1">
                  <Label>Beschreibung ({lang.toUpperCase()}) – optional</Label>
                  <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Kurze Beschreibung..." />
                </div>
                <Button
                  onClick={() => upsert.mutate({ restaurantId, categoryId: selectedCategoryId, lang, name, description: description || undefined })}
                  disabled={upsert.isPending || !name}
                  className="flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {upsert.isPending ? "Speichern..." : "Übersetzung speichern"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Wichtig für die Schweiz</p>
        <p>Restaurants in touristischen Regionen profitieren besonders von DE/FR/EN/IT-Übersetzungen. Die QR-Speisekarte erkennt automatisch die Browser-Sprache des Gastes.</p>
      </div>
    </div>
  );
}

export default function MehrsprachigeSpeisekarte() {
  return (
    <ModuleGate moduleId="multilang_menu">
      <MehrsprachigeSpeisekarteInner />
    </ModuleGate>
  );
}
