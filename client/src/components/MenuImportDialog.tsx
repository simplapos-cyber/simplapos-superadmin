/**
 * MenuImportDialog – KI-Speisekarten-Import
 *
 * 3 Schritte:
 * 1. Upload (PDF oder Bild)
 * 2. Vorschau (Produkte einzeln aktivieren/deaktivieren, Preis + Steuerklasse inline bearbeiten,
 *    Duplikat-Handling: überspringen / überschreiben / als neu anlegen)
 * 3. Bestätigung + Import (optional: KI-Bilder generieren)
 */

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ImageIcon,
  Loader2,
  ChevronRight,
  X,
  UtensilsCrossed,
  Coffee,
  Cake,
  Package,
  Pencil,
  Check,
  Globe,
  Copy,
  SkipForward,
  RefreshCw,
  Image as ImageIconLucide,
} from "lucide-react";

// ─── Typen ────────────────────────────────────────────────────────────────────

type DuplicateAction = "skip" | "overwrite" | "new";

interface ImportedMenuItem {
  name: string;
  description?: string;
  price: string;
  topCategory?: string;  // Oberkategorie (z.B. "GETRÄNKE", "ESSEN")
  category: string;      // Unterkategorie (z.B. "Flaschengetränke")
  itemType: "food" | "beverage" | "dessert" | "other";
  allergens?: string[];
  taxClassId?: number | null;
  isDuplicate?: boolean;
  duplicateAction?: DuplicateAction;
  // Nährwerte (KI-extrahiert, optional)
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

interface ImportItemRow extends ImportedMenuItem {
  _id: number;
  _selected: boolean;
  _editingPrice: boolean;
  _priceInput: string;
  // Inline-Bearbeitung für Name, Oberkategorie, Unterkategorie
  _editingName: boolean;
  _nameInput: string;
  _editingTopCat: boolean;
  _topCatInput: string;
  _editingCat: boolean;
  _catInput: string;
  // Original-Werte für Reset
  _origName: string;
  _origPrice: string;
  _origTopCat: string;
  _origCat: string;
  // Geänderte Felder (für visuelle Hervorhebung)
  _dirtyName: boolean;
  _dirtyPrice: boolean;
  _dirtyTopCat: boolean;
  _dirtyCat: boolean;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function itemTypeIcon(type: string) {
  switch (type) {
    case "beverage": return <Coffee className="w-3 h-3" />;
    case "dessert":  return <Cake className="w-3 h-3" />;
    case "other":    return <Package className="w-3 h-3" />;
    default:         return <UtensilsCrossed className="w-3 h-3" />;
  }
}

function itemTypeLabel(type: string) {
  switch (type) {
    case "beverage": return "Getränk";
    case "dessert":  return "Dessert";
    case "other":    return "Sonstiges";
    default:         return "Speise";
  }
}

function itemTypeColor(type: string) {
  switch (type) {
    case "beverage": return "bg-blue-100 text-blue-700 border-blue-200";
    case "dessert":  return "bg-pink-100 text-pink-700 border-pink-200";
    case "other":    return "bg-gray-100 text-gray-700 border-gray-200";
    default:         return "bg-orange-100 text-orange-700 border-orange-200";
  }
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

interface MenuImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "analyzing" | "preview" | "importing" | "done";

export function MenuImportDialog({ open, onClose, onImported }: MenuImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [warning, setWarning] = useState<string | undefined>();
  const [detectedLanguage, setDetectedLanguage] = useState<string | undefined>();
  const [items, setItems] = useState<ImportItemRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [generatingImages, setGeneratingImages] = useState(false);
  // KI-Bilder-Toggle
  const [generateImages, setGenerateImages] = useState(false);
  // Globale Standard-Steuerklasse für alle Produkte
  const [globalTaxClassId, setGlobalTaxClassId] = useState<string>("none");
  // Globale Duplikat-Aktion
  const [globalDuplicateAction, setGlobalDuplicateAction] = useState<DuplicateAction>("skip");
  // Metadaten der Datei für Import-Protokoll
  const [fileMetadata, setFileMetadata] = useState<{ name: string; type: string; size: number } | null>(null);

  // Steuerklassen laden
  const { data: taxClasses = [] } = trpc.menu.listTaxClasses.useQuery(undefined, {
    enabled: open,
  });

  // ── Reset beim Schliessen ──────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (step === "analyzing" || step === "importing") return;
    setStep("upload");
    setSelectedFile(null);
    setWarning(undefined);
    setDetectedLanguage(undefined);
    setItems([]);
    setSearchQuery("");
    setImportedCount(0);
    setSkippedCount(0);
    setDuplicateCount(0);
    setGeneratingImages(false);
    setGenerateImages(false);
    setGlobalTaxClassId("none");
    setGlobalDuplicateAction("skip");
    setFileMetadata(null);
    onClose();
  }, [step, onClose]);

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
    setFileMetadata({ name: file.name, type: file.type, size: file.size });
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
    setWarning(undefined);
    setDetectedLanguage(undefined);

    try {
      const fd = new FormData();
      fd.append("file", selectedFile);

      const res = await fetch("/api/menu/import-analyze", {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error ?? "Analyse fehlgeschlagen");
      }

      const data = await res.json();

      if (data.detectedLanguage && data.detectedLanguage !== "de") {
        setDetectedLanguage(data.detectedLanguage);
      }

      const rows: ImportItemRow[] = (data.items ?? []).map((item: ImportedMenuItem, idx: number) => ({
        ...item,
        _id: idx,
        _selected: true,
        _editingPrice: false,
        _priceInput: item.price,
        taxClassId: null,
        duplicateAction: item.isDuplicate ? "skip" : undefined,
        // Inline-Bearbeitung
        _editingName: false,
        _nameInput: item.name,
        _editingTopCat: false,
        _topCatInput: item.topCategory ?? "",
        _editingCat: false,
        _catInput: item.category,
        // Original-Werte für Reset
        _origName: item.name,
        _origPrice: item.price,
        _origTopCat: item.topCategory ?? "",
        _origCat: item.category,
        // Dirty-Flags
        _dirtyName: false,
        _dirtyPrice: false,
        _dirtyTopCat: false,
        _dirtyCat: false,
      }));

      if (rows.length === 0) {
        toast.error("Keine Produkte erkannt. Bitte prüfen Sie ob die Datei eine lesbare Speisekarte enthält.");
        setStep("upload");
        return;
      }

      setItems(rows);
      setWarning(data.warning);
      setStep("preview");
    } catch (err: any) {
      toast.error(err.message ?? "Analyse fehlgeschlagen");
      setStep("upload");
    }
  }, [selectedFile]);

  // ── Globale Steuerklasse auf alle Produkte anwenden ────────────────────────
  const applyGlobalTaxClass = useCallback((val: string) => {
    setGlobalTaxClassId(val);
    const id = val === "none" ? null : parseInt(val, 10);
    setItems(prev => prev.map(i => ({ ...i, taxClassId: id })));
  }, []);

  // ── Globale Duplikat-Aktion auf alle Duplikate anwenden ───────────────────
  const applyGlobalDuplicateAction = useCallback((action: DuplicateAction) => {
    setGlobalDuplicateAction(action);
    setItems(prev => prev.map(i => i.isDuplicate ? { ...i, duplicateAction: action } : i));
  }, []);

  // ── Import bestätigen ──────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    const selected = items.filter(i => i._selected);
    if (selected.length === 0) {
      toast.error("Bitte mindestens ein Produkt auswählen");
      return;
    }
    setStep("importing");

    try {
      const payload = selected.map(({
        _id, _selected,
        _editingPrice, _priceInput,
        _editingName, _nameInput,
        _editingTopCat, _topCatInput,
        _editingCat, _catInput,
        _origName, _origPrice, _origTopCat, _origCat,
        _dirtyName, _dirtyPrice, _dirtyTopCat, _dirtyCat,
        ...item
      }) => ({
        ...item,
        name: _nameInput.trim() || item.name,
        price: _priceInput || item.price,
        topCategory: _topCatInput.trim() || item.topCategory,
        category: _catInput.trim() || item.category,
      }));
      const res = await fetch("/api/menu/import-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: payload,
          fileName: fileMetadata?.name,
          fileType: fileMetadata?.type,
          fileSizeBytes: fileMetadata?.size,
          detectedLanguage,
          generateImages,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error ?? "Import fehlgeschlagen");
      }

      const data = await res.json();
      setImportedCount(data.importedCount ?? selected.length);
      setSkippedCount(data.skippedCount ?? 0);
      setDuplicateCount(data.duplicateCount ?? 0);
      setGeneratingImages(data.generatingImages ?? false);
      setStep("done");
      onImported();
    } catch (err: any) {
      toast.error(err.message ?? "Import fehlgeschlagen");
      setStep("preview");
    }
  }, [items, onImported, fileMetadata, detectedLanguage, generateImages]);

  // ── Alle/Keine auswählen ───────────────────────────────────────────────────
  const toggleAll = useCallback((val: boolean) => {
    setItems(prev => prev.map(i => ({ ...i, _selected: val })));
  }, []);

  const toggleItem = useCallback((id: number) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _selected: !i._selected } : i));
  }, []);

  // ── Preis-Inline-Bearbeitung ───────────────────────────────────────────────
  const startEditPrice = useCallback((id: number) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _editingPrice: true } : i));
  }, []);

  const commitPrice = useCallback((id: number) => {
    setItems(prev => prev.map(i => {
      if (i._id !== id) return i;
      const cleaned = i._priceInput.replace(/[^0-9.,]/g, "").replace(",", ".") || "0.00";
      const num = parseFloat(cleaned);
      const formatted = isNaN(num) ? "0.00" : num.toFixed(2);
      return { ...i, _editingPrice: false, _priceInput: formatted, price: formatted, _dirtyPrice: formatted !== i._origPrice };
    }));
  }, []);

  const updatePriceInput = useCallback((id: number, val: string) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _priceInput: val } : i));
  }, []);

  // ── Steuerklasse pro Produkt ───────────────────────────────────────────────
  const updateTaxClass = useCallback((id: number, val: string) => {
    const taxClassId = val === "none" ? null : parseInt(val, 10);
    setItems(prev => prev.map(i => i._id === id ? { ...i, taxClassId } : i));
  }, []);

  // ── Name Inline-Bearbeitung ────────────────────────────────────────────────
  const startEditName = useCallback((id: number) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _editingName: true } : i));
  }, []);

  const commitName = useCallback((id: number) => {
    setItems(prev => prev.map(i => {
      if (i._id !== id) return i;
      const trimmed = i._nameInput.trim() || i._origName;
      return { ...i, _editingName: false, _nameInput: trimmed, name: trimmed, _dirtyName: trimmed !== i._origName };
    }));
  }, []);

  const updateNameInput = useCallback((id: number, val: string) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _nameInput: val } : i));
  }, []);

  // ── Oberkategorie Inline-Bearbeitung ───────────────────────────────────────
  const startEditTopCat = useCallback((id: number) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _editingTopCat: true } : i));
  }, []);

  const commitTopCat = useCallback((id: number) => {
    setItems(prev => prev.map(i => {
      if (i._id !== id) return i;
      const trimmed = i._topCatInput.trim() || i._origTopCat;
      return { ...i, _editingTopCat: false, _topCatInput: trimmed, topCategory: trimmed, _dirtyTopCat: trimmed !== i._origTopCat };
    }));
  }, []);

  const updateTopCatInput = useCallback((id: number, val: string) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _topCatInput: val } : i));
  }, []);

  // ── Unterkategorie Inline-Bearbeitung ──────────────────────────────────────
  const startEditCat = useCallback((id: number) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _editingCat: true } : i));
  }, []);

  const commitCat = useCallback((id: number) => {
    setItems(prev => prev.map(i => {
      if (i._id !== id) return i;
      const trimmed = i._catInput.trim() || i._origCat;
      return { ...i, _editingCat: false, _catInput: trimmed, category: trimmed, _dirtyCat: trimmed !== i._origCat };
    }));
  }, []);

  const updateCatInput = useCallback((id: number, val: string) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, _catInput: val } : i));
  }, []);

  // ── Alle Änderungen eines Produkts zurücksetzen ───────────────────────────
  const resetItem = useCallback((id: number) => {
    setItems(prev => prev.map(i => {
      if (i._id !== id) return i;
      return {
        ...i,
        _nameInput: i._origName, name: i._origName, _dirtyName: false, _editingName: false,
        _priceInput: i._origPrice, price: i._origPrice, _dirtyPrice: false, _editingPrice: false,
        _topCatInput: i._origTopCat, topCategory: i._origTopCat, _dirtyTopCat: false, _editingTopCat: false,
        _catInput: i._origCat, category: i._origCat, _dirtyCat: false, _editingCat: false,
      };
    }));
  }, []);

  // ── Duplikat-Aktion pro Produkt ────────────────────────────────────────────
  const updateDuplicateAction = useCallback((id: number, action: DuplicateAction) => {
    setItems(prev => prev.map(i => i._id === id ? { ...i, duplicateAction: action } : i));
  }, []);

  // ── Gefilterte Items ───────────────────────────────────────────────────────
  const filteredItems = items.filter(i =>
    !searchQuery ||
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCount = items.filter(i => i._selected).length;
  const duplicateItems = items.filter(i => i.isDuplicate);
  // Kategorien nach Oberkategorie gruppiert
  const categories = Array.from(new Set(filteredItems.map(i => i.category)));
  // Oberkategorien für die Vorschau-Anzeige
  const topCategories = Array.from(new Set(filteredItems.map(i => i.topCategory || i.category.toUpperCase())));

  // ── Sprach-Label ───────────────────────────────────────────────────────────
  const languageLabel = (code: string) => {
    const map: Record<string, string> = {
      fr: "Französisch", it: "Italienisch", en: "Englisch",
      de: "Deutsch", es: "Spanisch", pt: "Portugiesisch",
    };
    return map[code] ?? code.toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            KI-Speisekarten-Import
          </DialogTitle>
        </DialogHeader>

        {/* ── Schritt-Anzeige ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
          {[
            { key: "upload", label: "Hochladen" },
            { key: "preview", label: "Vorschau" },
            { key: "done", label: "Fertig" },
          ].map((s, idx, arr) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium",
                (step === s.key || (step === "analyzing" && s.key === "upload") || (step === "importing" && s.key === "preview"))
                  ? "bg-primary text-primary-foreground"
                  : step === "done" || (idx < ["upload", "preview", "done"].indexOf(step))
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}>
                {s.label}
              </span>
              {idx < arr.length - 1 && <ChevronRight className="w-3 h-3" />}
            </span>
          ))}
        </div>

        {/* ── Inhalt ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Schritt 1: Upload */}
          {(step === "upload" || step === "analyzing") && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Laden Sie Ihre bestehende Speisekarte als <strong>PDF</strong> oder <strong>Foto</strong> hoch.
                Die KI erkennt automatisch alle Kategorien, Produkte und Preise –
                auch in <strong>Französisch, Italienisch oder Englisch</strong> (wird automatisch übersetzt).
              </p>

              {/* Drop-Zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30",
                  selectedFile && "border-green-400 bg-green-50 dark:bg-green-950/20"
                )}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !selectedFile && fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
                {selectedFile ? (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                      {selectedFile.type === "application/pdf"
                        ? <FileText className="w-6 h-6 text-green-600" />
                        : <ImageIcon className="w-6 h-6 text-green-600" />}
                    </div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
                      onClick={e => { e.stopPropagation(); setSelectedFile(null); fileRef.current && (fileRef.current.value = ""); }}
                    >
                      <X className="w-3 h-3" /> Andere Datei wählen
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">PDF oder Bild hier ablegen</p>
                    <p className="text-xs text-muted-foreground">oder klicken zum Auswählen · max. 16 MB</p>
                  </div>
                )}
              </div>

              {/* Analyse-Fortschritt */}
              {step === "analyzing" && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                  <div>
                    <p className="text-sm font-medium">KI analysiert Ihre Speisekarte…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gescannte PDFs werden zuerst in Bilder umgewandelt. Dies kann 20–60 Sekunden dauern.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                <span>Die KI erkennt Kategorien, Produktnamen, Beschreibungen, Preise und Allergene.
                  Im nächsten Schritt können Sie alle Produkte einzeln prüfen und anpassen.</span>
              </div>
            </div>
          )}

          {/* Schritt 2: Vorschau */}
          {(step === "preview" || step === "importing") && (
            <div className="space-y-3 py-2">

              {/* Sprach-Hinweis */}
              {detectedLanguage && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400">
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>Originalsprache erkannt: <strong>{languageLabel(detectedLanguage)}</strong> – alle Produkte wurden automatisch auf Deutsch übersetzt.</span>
                </div>
              )}

              {/* Warnung */}
              {warning && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              )}

              {/* Duplikat-Hinweis + globale Aktion */}
              {duplicateItems.length > 0 && (
                <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-yellow-800 dark:text-yellow-300">
                    <Copy className="w-3.5 h-3.5" />
                    <span>{duplicateItems.length} Produkt{duplicateItems.length !== 1 ? "e" : ""} bereits vorhanden</span>
                  </div>
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    Diese Produkte existieren bereits in Ihrer Speisekarte. Was soll damit passieren?
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { action: "skip" as DuplicateAction, label: "Überspringen", icon: <SkipForward className="w-3 h-3" /> },
                      { action: "overwrite" as DuplicateAction, label: "Überschreiben", icon: <RefreshCw className="w-3 h-3" /> },
                      { action: "new" as DuplicateAction, label: "Als neu anlegen", icon: <Copy className="w-3 h-3" /> },
                    ]).map(({ action, label, icon }) => (
                      <button
                        key={action}
                        onClick={() => applyGlobalDuplicateAction(action)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all",
                          globalDuplicateAction === action
                            ? "bg-yellow-700 text-white border-yellow-700"
                            : "bg-white dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                        )}
                      >
                        {icon}{label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Globale Steuerklasse */}
              {taxClasses.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Standard-Steuerklasse:</span>
                  <Select value={globalTaxClassId} onValueChange={applyGlobalTaxClass}>
                    <SelectTrigger className="h-7 text-xs w-52">
                      <SelectValue placeholder="Alle Produkte…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine (individuell setzen)</SelectItem>
                      {taxClasses.map((tc: any) => (
                        <SelectItem key={tc.id} value={String(tc.id)}>
                          {tc.name} ({parseFloat(tc.rate).toFixed(1)}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* KI-Bilder-Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                <ImageIconLucide className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">KI-Produktbilder generieren</p>
                  <p className="text-xs text-muted-foreground">Für jede Speise wird automatisch ein appetitliches Foto erstellt (max. 10 Bilder, dauert 1–2 Min.)</p>
                </div>
                <Switch
                  checked={generateImages}
                  onCheckedChange={setGenerateImages}
                />
              </div>

              {/* Auswahl-Kontrollen */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedCount === items.length && items.length > 0}
                    onCheckedChange={val => toggleAll(!!val)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedCount}/{items.length} ausgewählt
                  </span>
                </div>
                <Input
                  placeholder="Suchen…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-7 text-xs w-40"
                />
              </div>

              {/* Produkt-Liste nach Ober- und Unterkategorien */}
              <div className="space-y-6">
                {topCategories.map(topCat => {
                  const topCatItems = filteredItems.filter(i => (i.topCategory || i.category.toUpperCase()) === topCat);
                  const topCatSelected = topCatItems.filter(i => i._selected).length;
                  const subCategories = Array.from(new Set(topCatItems.map(i => i.category)));
                  return (
                    <div key={topCat} className="border rounded-lg overflow-hidden">
                      {/* Oberkategorie-Header */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                        <Checkbox
                          checked={topCatSelected === topCatItems.length && topCatItems.length > 0}
                          onCheckedChange={val => {
                            setItems(prev => prev.map(i =>
                              (i.topCategory || i.category.toUpperCase()) === topCat ? { ...i, _selected: !!val } : i
                            ));
                          }}
                        />
                        <span className="text-sm font-bold uppercase tracking-wider text-foreground">
                          {topCat}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-4 ml-auto">
                          {topCatSelected}/{topCatItems.length}
                        </Badge>
                      </div>
                      {/* Unterkategorien */}
                      <div className="p-3 space-y-4">
                      {subCategories.map(cat => {
                  const catItems = topCatItems.filter(i => i.category === cat);
                  const catSelected = catItems.filter(i => i._selected).length;
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-2">
                        <Checkbox
                          checked={catSelected === catItems.length}
                          onCheckedChange={val => {
                            setItems(prev => prev.map(i =>
                              i.category === cat ? { ...i, _selected: !!val } : i
                            ));
                          }}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {cat}
                        </span>
                        <Badge variant="secondary" className="text-[10px] h-4">
                          {catSelected}/{catItems.length}
                        </Badge>
                      </div>
                      <div className="space-y-1.5 pl-6">
                        {catItems.map(item => (
                          <div
                            key={item._id}
                            className={cn(
                              "flex items-start gap-2 p-2.5 rounded-lg border transition-all",
                              item._selected
                                ? item.isDuplicate
                                  ? "bg-yellow-50/50 dark:bg-yellow-950/10 border-yellow-200 dark:border-yellow-800"
                                  : "bg-card border-border"
                                : "bg-muted/30 border-muted opacity-60"
                            )}
                          >
                            <Checkbox
                              checked={item._selected}
                              onCheckedChange={() => toggleItem(item._id)}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Name Inline-Edit */}
                                {item._editingName ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      value={item._nameInput}
                                      onChange={e => updateNameInput(item._id, e.target.value)}
                                      onBlur={() => commitName(item._id)}
                                      onKeyDown={e => { if (e.key === "Enter") commitName(item._id); if (e.key === "Escape") { updateNameInput(item._id, item._origName); commitName(item._id); } }}
                                      className="h-6 text-sm font-medium px-1.5 w-48"
                                      autoFocus
                                    />
                                    <button onClick={() => commitName(item._id)} className="text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => startEditName(item._id)}
                                    className={cn(
                                      "flex items-center gap-1 text-sm font-medium hover:text-primary group",
                                      item._dirtyName && "text-amber-700 dark:text-amber-400"
                                    )}
                                    title="Name bearbeiten"
                                  >
                                    {item._nameInput}
                                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                                  </button>
                                )}
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border font-medium",
                                  itemTypeColor(item.itemType)
                                )}>
                                  {itemTypeIcon(item.itemType)}
                                  {itemTypeLabel(item.itemType)}
                                </span>
                                {item.isDuplicate && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-yellow-400 text-yellow-700 bg-yellow-50 dark:bg-yellow-950/20">
                                    Duplikat
                                  </Badge>
                                )}
                                {/* Reset-Button wenn Änderungen vorhanden */}
                                {(item._dirtyName || item._dirtyPrice || item._dirtyTopCat || item._dirtyCat) && (
                                  <button
                                    onClick={() => resetItem(item._id)}
                                    title="Änderungen zurücksetzen"
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                              )}
                              {item.allergens && item.allergens.length > 0 && (
                                <div className="flex gap-1 flex-wrap mt-1">
                                  {item.allergens.map(a => (
                                    <Badge key={a} variant="outline" className="text-[9px] h-3.5 px-1">{a}</Badge>
                                  ))}
                                </div>
                              )}

                              {/* Nährwerte-Anzeige */}
                              {(item.calories != null || item.protein != null || item.carbs != null || item.fat != null) && (
                                <div className="flex gap-2 mt-1 flex-wrap">
                                  {item.calories != null && (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 font-medium">
                                      🔥 {item.calories} kcal
                                    </span>
                                  )}
                                  {item.protein != null && (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-medium">
                                      P {item.protein}g
                                    </span>
                                  )}
                                  {item.carbs != null && (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
                                      K {item.carbs}g
                                    </span>
                                  )}
                                  {item.fat != null && (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-950/30 text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-800 font-medium">
                                      F {item.fat}g
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Duplikat-Aktion pro Produkt */}
                              {item.isDuplicate && item._selected && (
                                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                  {([
                                    { action: "skip" as DuplicateAction, label: "Überspringen" },
                                    { action: "overwrite" as DuplicateAction, label: "Überschreiben" },
                                    { action: "new" as DuplicateAction, label: "Als neu" },
                                  ]).map(({ action, label }) => (
                                    <button
                                      key={action}
                                      onClick={() => updateDuplicateAction(item._id, action)}
                                      className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-medium border transition-all",
                                        item.duplicateAction === action
                                          ? "bg-yellow-600 text-white border-yellow-600"
                                          : "bg-white dark:bg-transparent text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-50"
                                      )}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Kategorie-Inline-Edit */}
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {/* Oberkategorie */}
                                {item._editingTopCat ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground">Oberkategorie:</span>
                                    <Input
                                      value={item._topCatInput}
                                      onChange={e => updateTopCatInput(item._id, e.target.value)}
                                      onBlur={() => commitTopCat(item._id)}
                                      onKeyDown={e => { if (e.key === "Enter") commitTopCat(item._id); if (e.key === "Escape") commitTopCat(item._id); }}
                                      className="h-5 text-[10px] px-1.5 w-32"
                                      autoFocus
                                      placeholder="z.B. GETRÄNKE"
                                    />
                                    <button onClick={() => commitTopCat(item._id)} className="text-green-600 hover:text-green-700"><Check className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => startEditTopCat(item._id)}
                                    className={cn(
                                      "flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border hover:border-primary transition-colors group",
                                      item._dirtyTopCat
                                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
                                        : "bg-muted/40 border-muted-foreground/20 text-muted-foreground"
                                    )}
                                    title="Oberkategorie bearbeiten"
                                  >
                                    {item._topCatInput || "Oberkategorie"}
                                    <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                                  </button>
                                )}
                                <span className="text-[10px] text-muted-foreground/40">›</span>
                                {/* Unterkategorie */}
                                {item._editingCat ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground">Unterkategorie:</span>
                                    <Input
                                      value={item._catInput}
                                      onChange={e => updateCatInput(item._id, e.target.value)}
                                      onBlur={() => commitCat(item._id)}
                                      onKeyDown={e => { if (e.key === "Enter") commitCat(item._id); if (e.key === "Escape") commitCat(item._id); }}
                                      className="h-5 text-[10px] px-1.5 w-36"
                                      autoFocus
                                      placeholder="z.B. Flaschengetränke"
                                    />
                                    <button onClick={() => commitCat(item._id)} className="text-green-600 hover:text-green-700"><Check className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => startEditCat(item._id)}
                                    className={cn(
                                      "flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border hover:border-primary transition-colors group",
                                      item._dirtyCat
                                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
                                        : "bg-muted/40 border-muted-foreground/20 text-muted-foreground"
                                    )}
                                    title="Unterkategorie bearbeiten"
                                  >
                                    {item._catInput}
                                    <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                                  </button>
                                )}
                              </div>

                              {/* Steuerklasse pro Produkt */}
                              {taxClasses.length > 0 && (
                                <div className="mt-1.5">
                                  <Select
                                    value={item.taxClassId != null ? String(item.taxClassId) : "none"}
                                    onValueChange={val => updateTaxClass(item._id, val)}
                                  >
                                    <SelectTrigger className="h-6 text-[10px] w-44 border-dashed">
                                      <SelectValue placeholder="Steuerklasse…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Keine Steuerklasse</SelectItem>
                                      {taxClasses.map((tc: any) => (
                                        <SelectItem key={tc.id} value={String(tc.id)}>
                                          {tc.name} ({parseFloat(tc.rate).toFixed(1)}%)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>

                            {/* Preis-Inline-Bearbeitung */}
                            <div className="shrink-0 flex items-center gap-1">
                              {item._editingPrice ? (
                                <>
                                  <span className="text-xs text-muted-foreground">CHF</span>
                                  <Input
                                    value={item._priceInput}
                                    onChange={e => updatePriceInput(item._id, e.target.value)}
                                    onBlur={() => commitPrice(item._id)}
                                    onKeyDown={e => { if (e.key === "Enter") commitPrice(item._id); }}
                                    className="h-6 w-16 text-xs text-right px-1"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => commitPrice(item._id)}
                                    className="text-green-600 hover:text-green-700"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => startEditPrice(item._id)}
                                  className="flex items-center gap-1 text-sm font-semibold tabular-nums hover:text-primary group"
                                  title="Preis bearbeiten"
                                >
                                  CHF {parseFloat(item._priceInput || "0").toFixed(2)}
                                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Import-Fortschritt */}
              {step === "importing" && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Produkte werden importiert…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Kategorien und Produkte werden angelegt.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Schritt 3: Fertig */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-semibold">Import erfolgreich!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>{importedCount} Produkte</strong> wurden importiert
                  {skippedCount > 0 && <>, <strong>{skippedCount} übersprungen</strong></>}
                  {duplicateCount > 0 && <> ({duplicateCount} Duplikate behandelt)</>}.
                </p>
              </div>
              {generatingImages && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground max-w-xs">
                  <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                  <span>KI-Produktbilder werden im Hintergrund generiert und erscheinen in Kürze in der Speisekarte.</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground max-w-xs">
                Die Produkte sind jetzt in Ihrer Speisekarte verfügbar. Sie können sie im MenuBuilder
                weiter bearbeiten, Bilder hinzufügen und Preise anpassen.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <DialogFooter className="shrink-0 border-t pt-3">
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={handleClose}>Abbrechen</Button>
              <Button onClick={handleAnalyze} disabled={!selectedFile}>
                <Sparkles className="w-4 h-4 mr-2" />
                KI-Analyse starten
              </Button>
            </>
          )}
          {step === "analyzing" && (
            <Button variant="outline" disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analysiere…
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>Zurück</Button>
              <Button onClick={handleImport} disabled={selectedCount === 0}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {selectedCount} Produkte importieren
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Importiere…
            </Button>
          )}
          {step === "done" && (
            <Button onClick={handleClose}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Schliessen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
