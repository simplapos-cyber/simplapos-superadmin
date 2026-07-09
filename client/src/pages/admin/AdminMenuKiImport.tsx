/**
 * AdminMenuKiImport.tsx
 * KI-gestützter Speisekarten-Import-Wizard
 *
 * Schritt 1: Datei hochladen (PDF / Foto)
 * Schritt 2: KI analysiert → Ladeanimation
 * Schritt 3: Ergebnis prüfen + bearbeiten (Menü / Rohwaren / Rezepte)
 * Schritt 4: Bestätigen → alles in DB speichern
 * Schritt 5: Fertig
 */
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  ChevronRight,
  X,
  UtensilsCrossed,
  Package,
  BookOpen,
  RotateCcw,
  AlertTriangle,
  Pencil,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiImportResult } from "../../../../server/aiImportRouter";

// ─── Typen ────────────────────────────────────────────────────────────────────

type Step = "upload" | "analyzing" | "review" | "importing" | "done";

interface EditableItem {
  name: string;
  price: number;
  description?: string;
  itemType?: string;
  kitchenStation?: string;
  allergens?: string[];
  labels?: string[];
  isDirectStock?: boolean;
  ingredients?: { rawMaterialName: string; quantity: number; unit: string }[];
  _editing: boolean;
  _nameInput: string;
  _priceInput: string;
}

interface EditableCategory {
  name: string;
  topCategory?: string;
  items: EditableItem[];
  _open: boolean;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function fileIcon(type: string) {
  if (type === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  return <ImageIcon className="w-5 h-5 text-blue-500" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminMenuKiImport() {
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [result, setResult] = useState<AiImportResult | null>(null);
  const [categories, setCategories] = useState<EditableCategory[]>([]);
  const [importMenu, setImportMenu] = useState(true);
  const [importInventory, setImportInventory] = useState(true);
  const [importRecipes, setImportRecipes] = useState(true);
  const [importStats, setImportStats] = useState<{ categories: number; items: number; rawMaterials: number; recipes: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeMutation = trpc.aiImport.analyzeMenu.useMutation();
  const confirmMutation = trpc.aiImport.confirmImport.useMutation();

  // ── Datei-Validierung ──────────────────────────────────────────────────────
  const validateFile = (file: File): string | null => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) return "Nur PDF, JPEG, PNG oder WEBP erlaubt";
    if (file.size > 16 * 1024 * 1024) return "Datei ist zu gross (max. 16 MB)";
    return null;
  };

  const handleFileSelect = useCallback((file: File) => {
    const err = validateFile(file);
    if (err) { toast.error(err); return; }
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ── Analyse starten ────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return;
    setStep("analyzing");
    try {
      // 1. Datei hochladen
      const fd = new FormData();
      fd.append("file", selectedFile);
      const uploadRes = await fetch("/api/ai-import/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ error: "Upload fehlgeschlagen" }));
        throw new Error(err.error ?? "Upload fehlgeschlagen");
      }
      const { url, key, fileName, mimeType } = await uploadRes.json();

      // 2. KI-Analyse starten
      const analysisResult = await analyzeMutation.mutateAsync({
        fileUrl: `${window.location.origin}${url}`,
        fileKey: key,
        fileName: fileName ?? selectedFile.name,
        mimeType: mimeType ?? selectedFile.type,
      });

      setSessionId(analysisResult.sessionId);
      setResult(analysisResult.result);

      // Kategorien in editierbares Format umwandeln
      setCategories(analysisResult.result.categories.map(cat => ({
        ...cat,
        _open: true,
        items: cat.items.map(item => ({
          ...item,
          _editing: false,
          _nameInput: item.name,
          _priceInput: String(item.price),
        })),
      })));

      setStep("review");
    } catch (err: any) {
      toast.error(err.message ?? "Analyse fehlgeschlagen");
      setStep("upload");
    }
  }, [selectedFile, analyzeMutation]);

  // ── Bestätigen ─────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!sessionId || !result) return;
    setStep("importing");
    try {
      // Aktualisiertes Ergebnis aus editierbaren Kategorien zusammenbauen
      const updatedResult: AiImportResult = {
        ...result,
        categories: categories.map(cat => ({
          name: cat.name,
          topCategory: cat.topCategory,
          items: cat.items.map(item => ({
            name: item._nameInput || item.name,
            price: parseFloat(item._priceInput) || item.price,
            description: item.description,
            itemType: item.itemType as any,
            allergens: item.allergens,
            labels: item.labels,
            kitchenStation: item.kitchenStation,
            isDirectStock: item.isDirectStock,
            ingredients: item.ingredients,
          })),
        })),
      };

      const stats = await confirmMutation.mutateAsync({
        sessionId,
        result: updatedResult,
        importMenu,
        importInventory,
        importRecipes,
      });

      setImportStats(stats.stats);
      setStep("done");
      toast.success("Import erfolgreich abgeschlossen!");
    } catch (err: any) {
      toast.error(err.message ?? "Import fehlgeschlagen");
      setStep("review");
    }
  }, [sessionId, result, categories, importMenu, importInventory, importRecipes, confirmMutation]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setStep("upload");
    setSelectedFile(null);
    setSessionId(null);
    setResult(null);
    setCategories([]);
    setImportStats(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">KI-Speisekarten-Import</h1>
          <p className="text-sm text-muted-foreground">
            Lade deine Speisekarte hoch – die KI erstellt automatisch Menü, Lagerartikel und Rezepte
          </p>
        </div>
      </div>

      {/* Fortschrittsleiste */}
      <div className="flex items-center gap-2">
        {[
          { key: "upload", label: "Hochladen", icon: Upload },
          { key: "analyzing", label: "Analysieren", icon: Sparkles },
          { key: "review", label: "Prüfen", icon: BookOpen },
          { key: "done", label: "Fertig", icon: CheckCircle2 },
        ].map((s, idx, arr) => {
          const stepOrder = ["upload", "analyzing", "review", "importing", "done"];
          const currentIdx = stepOrder.indexOf(step);
          const sIdx = stepOrder.indexOf(s.key);
          const isActive = s.key === step || (step === "importing" && s.key === "review");
          const isDone = currentIdx > sIdx;
          return (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                isActive ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" :
                isDone ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                "bg-muted text-muted-foreground"
              )}>
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              {idx < arr.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* ── SCHRITT 1: Upload ── */}
      {(step === "upload") && (
        <div className="space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer",
              dragOver ? "border-violet-500 bg-violet-50 dark:bg-violet-900/10" : "border-border hover:border-violet-400 hover:bg-muted/50",
              selectedFile && "border-green-500 bg-green-50 dark:bg-green-900/10"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
          >
            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                {fileIcon(selectedFile.type)}
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4 mr-1" /> Entfernen
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-violet-500" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Speisekarte hochladen</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    PDF, JPEG, PNG oder WEBP · max. 16 MB
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ziehe die Datei hierher oder klicke zum Auswählen
                  </p>
                </div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
          />

          {/* Info-Box */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 text-sm text-blue-800 dark:text-blue-300">
            <p className="font-semibold mb-1">Was die KI automatisch erstellt:</p>
            <ul className="space-y-0.5 list-disc list-inside text-xs">
              <li>Alle Menükategorien und Artikel mit Preisen</li>
              <li>Lagerartikel (Rohwaren) mit Einheiten und Mindestbeständen</li>
              <li>Rezepte mit Zutaten und Mengenangaben</li>
              <li>Allergene, Labels und Küchenstationen</li>
            </ul>
          </div>

          <Button
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            size="lg"
            disabled={!selectedFile}
            onClick={handleAnalyze}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            KI-Analyse starten
          </Button>
        </div>
      )}

      {/* ── SCHRITT 2: Analysieren ── */}
      {step === "analyzing" && (
        <div className="flex flex-col items-center justify-center py-20 gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-violet-500 animate-pulse" />
            </div>
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin absolute -bottom-1 -right-1" />
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold">KI analysiert deine Speisekarte…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Das kann 15–60 Sekunden dauern. Bitte warte.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground text-center">
            <p>✓ Kategorien und Artikel erkennen</p>
            <p>✓ Rohwaren und Rezepte ableiten</p>
            <p>✓ Allergene und Labels zuweisen</p>
          </div>
        </div>
      )}

      {/* ── SCHRITT 3: Review ── */}
      {step === "review" && result && (
        <div className="space-y-6">
          {/* Zusammenfassung */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Kategorien", value: result.summary.totalCategories, icon: BookOpen, color: "blue" },
              { label: "Artikel", value: result.summary.totalItems, icon: UtensilsCrossed, color: "green" },
              { label: "Rohwaren", value: result.summary.totalRawMaterials, icon: Package, color: "orange" },
              { label: "Rezepte", value: result.summary.totalRecipes, icon: Sparkles, color: "violet" },
            ].map(s => (
              <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Import-Optionen */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="font-semibold text-sm">Was soll importiert werden?</p>
            {[
              { key: "menu", label: "Menükarte (Kategorien & Artikel)", value: importMenu, setter: setImportMenu },
              { key: "inventory", label: "Lagerartikel (Rohwaren)", value: importInventory, setter: setImportInventory },
              { key: "recipes", label: "Rezepte (Zutaten-Verknüpfungen)", value: importRecipes, setter: setImportRecipes },
            ].map(opt => (
              <div key={opt.key} className="flex items-center justify-between">
                <Label htmlFor={`opt-${opt.key}`} className="text-sm cursor-pointer">{opt.label}</Label>
                <Switch
                  id={`opt-${opt.key}`}
                  checked={opt.value}
                  onCheckedChange={opt.setter}
                />
              </div>
            ))}
          </div>

          {/* Kategorien & Artikel */}
          {importMenu && (
            <div className="space-y-2">
              <p className="font-semibold text-sm flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4" /> Menükarte
              </p>
              <Accordion type="multiple" defaultValue={categories.map((_, i) => `cat-${i}`)}>
                {categories.map((cat, catIdx) => (
                  <AccordionItem key={catIdx} value={`cat-${catIdx}`}>
                    <AccordionTrigger className="text-sm font-medium">
                      <span className="flex items-center gap-2">
                        {cat.name}
                        {cat.topCategory && (
                          <Badge variant="outline" className="text-xs">{cat.topCategory}</Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">{cat.items.length} Artikel</Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pl-2">
                        {cat.items.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                            <div className="flex-1 min-w-0">
                              {item._editing ? (
                                <div className="flex gap-2">
                                  <Input
                                    value={item._nameInput}
                                    onChange={(e) => {
                                      const newCats = [...categories];
                                      newCats[catIdx].items[itemIdx]._nameInput = e.target.value;
                                      setCategories(newCats);
                                    }}
                                    className="h-7 text-sm flex-1"
                                  />
                                  <Input
                                    value={item._priceInput}
                                    onChange={(e) => {
                                      const newCats = [...categories];
                                      newCats[catIdx].items[itemIdx]._priceInput = e.target.value;
                                      setCategories(newCats);
                                    }}
                                    className="h-7 text-sm w-20"
                                    placeholder="Preis"
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      const newCats = [...categories];
                                      newCats[catIdx].items[itemIdx]._editing = false;
                                      setCategories(newCats);
                                    }}
                                  >
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{item._nameInput || item.name}</span>
                                  {item.isDirectStock && (
                                    <Badge variant="outline" className="text-xs shrink-0">Fertigprodukt</Badge>
                                  )}
                                  {item.kitchenStation && (
                                    <Badge variant="secondary" className="text-xs shrink-0">{item.kitchenStation}</Badge>
                                  )}
                                </div>
                              )}
                              {item.description && !item._editing && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                              )}
                              {item.allergens && item.allergens.length > 0 && !item._editing && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.allergens.map(a => (
                                    <Badge key={a} variant="outline" className="text-xs py-0">{a}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!item._editing && (
                                <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                                  CHF {parseFloat(item._priceInput || String(item.price)).toFixed(2)}
                                </span>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => {
                                  const newCats = [...categories];
                                  newCats[catIdx].items[itemIdx]._editing = !item._editing;
                                  setCategories(newCats);
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {/* Rohwaren */}
          {importInventory && result.rawMaterials.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold text-sm flex items-center gap-2">
                <Package className="w-4 h-4" /> Lagerartikel ({result.rawMaterials.length})
              </p>
              <ScrollArea className="h-48 rounded-lg border bg-card">
                <div className="p-3 space-y-1">
                  {result.rawMaterials.map((rm, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{rm.name}</span>
                        {rm.category && (
                          <Badge variant="outline" className="text-xs">{rm.category}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Einheit: {rm.unit}</span>
                        {rm.estimatedMinStock != null && (
                          <span>Min: {rm.estimatedMinStock}</span>
                        )}
                        {rm.einkaufspreis != null && (
                          <span>EK: CHF {rm.einkaufspreis.toFixed(3)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Hinweis */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Die KI-Vorschläge sind Schätzungen. Bitte prüfe Preise, Mengen und Rezepte nach dem Import
              und passe sie bei Bedarf an. Bestehende Daten werden nicht überschrieben.
            </p>
          </div>

          {/* Aktionen */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset} className="flex-1">
              <RotateCcw className="w-4 h-4 mr-2" /> Neu starten
            </Button>
            <Button
              className="flex-2 bg-violet-600 hover:bg-violet-700 text-white flex-1"
              onClick={handleConfirm}
              disabled={!importMenu && !importInventory}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Importieren
            </Button>
          </div>
        </div>
      )}

      {/* ── SCHRITT 4: Importieren ── */}
      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-20 gap-6">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-green-600 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold">Daten werden gespeichert…</p>
            <p className="text-sm text-muted-foreground mt-1">Bitte warte einen Moment.</p>
          </div>
        </div>
      )}

      {/* ── SCHRITT 5: Fertig ── */}
      {step === "done" && importStats && (
        <div className="flex flex-col items-center justify-center py-12 gap-6">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">Import erfolgreich!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Alle Daten wurden in dein System übernommen.
            </p>
          </div>

          {/* Statistiken */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-lg">
            {[
              { label: "Kategorien", value: importStats.categories, icon: BookOpen },
              { label: "Artikel", value: importStats.items, icon: UtensilsCrossed },
              { label: "Rohwaren", value: importStats.rawMaterials, icon: Package },
              { label: "Rezepte", value: importStats.recipes, icon: Sparkles },
            ].map(s => (
              <div key={s.label} className="rounded-xl border bg-card p-4 text-center">
                <s.icon className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-3xl font-bold text-green-600">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" /> Weitere Speisekarte importieren
            </Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => window.location.href = "/admin/menu"}
            >
              <UtensilsCrossed className="w-4 h-4 mr-2" /> Zur Speisekarte
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
