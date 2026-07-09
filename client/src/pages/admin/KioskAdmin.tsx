import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ScanLine, Plus, Trash2, QrCode, Camera, CheckCircle, AlertCircle, AlertTriangle, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Image, X, Pencil, Check, ThumbsUp, ThumbsDown, Download, RefreshCw, Brain, Heart, Share2, Gift, ExternalLink, Megaphone } from "lucide-react";
import UpsellingRuleEditor from "./UpsellingRuleEditor";
import QRCode from "qrcode";

// ─── Fehler-Warnung: Nicht erreichbare Lernbilder ──────────────────────────────────────────────────────
function ImageFetchErrorWarning() {
  const utils = trpc.useUtils();
  const { data: errors } = trpc.training.listImageFetchErrors.useQuery(
    { restaurantId: 0 }, // restaurantId wird serverseitig aus ctx.user gelesen
    { refetchInterval: 60_000 } // alle 60s aktualisieren
  );
  const resolveMutation = trpc.training.resolveImageFetchError.useMutation({
    onSuccess: () => { utils.training.listImageFetchErrors.invalidate(); toast.success("Als behoben markiert"); },
  });
  // RU-3: Re-Upload-Mutation
  const [reuploadingIds, setReuploadingIds] = useState<Set<number>>(new Set());
  const reuploadMutation = trpc.training.reuploadProductImage.useMutation({
    onSuccess: (_data, variables) => {
      setReuploadingIds(prev => { const s = new Set(prev); s.delete(variables.errorId ?? -1); return s; });
      utils.training.listImageFetchErrors.invalidate();
      toast.success("Bild erfolgreich neu hochgeladen");
    },
    onError: (err, variables) => {
      setReuploadingIds(prev => { const s = new Set(prev); s.delete(variables.errorId ?? -1); return s; });
      toast.error(`Neu-Upload fehlgeschlagen: ${err.message.slice(0, 100)}`);
    },
  });

  const handleReupload = (err: { id: number; imageKey: string | null; menuItemId: number | null }) => {
    if (!err.imageKey || !err.menuItemId) {
      toast.error("Bild-Key oder Produkt-ID fehlt – manueller Upload nötig");
      return;
    }
    setReuploadingIds(prev => new Set(prev).add(err.id));
    reuploadMutation.mutate({
      restaurantId: 0, // wird serverseitig aus ctx.user gelesen
      menuItemId: err.menuItemId,
      imageKey: err.imageKey,
      errorId: err.id,
    });
  };

  if (!errors || errors.length === 0) return null;
  return (
    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
      <CardContent className="pt-4 pb-3">
        <div className="flex gap-3 items-start">
          <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-orange-700 dark:text-orange-300 text-sm">
              {errors.length} Lernbild{errors.length > 1 ? "er" : ""} nicht erreichbar
            </p>
            <p className="text-orange-600 dark:text-orange-400 text-xs mt-0.5 mb-2">
              Diese Bilder konnten beim letzten Scan nicht aus dem Speicher geladen werden und wurden übersprungen.
              Klicken Sie auf <strong>Neu hochladen</strong>, um das Bild automatisch zu reparieren.
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {errors.slice(0, 10).map((err: { id: number; imageKey: string | null; errorType: string; errorMessage: string | null; resolvedAt: string | null; createdAt: string; menuItemId: number | null }) => (
                <div key={err.id} className="flex items-center gap-2 text-xs bg-orange-100 dark:bg-orange-900/30 rounded px-2 py-1">
                  <span className="flex-1 truncate font-mono text-orange-800 dark:text-orange-200">{err.imageKey ?? "Unbekannter Key"}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-orange-300 text-orange-700">{err.errorType}</Badge>
                  {/* RU-3: Neu-hochladen-Button */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 gap-1"
                    disabled={reuploadingIds.has(err.id)}
                    onClick={() => handleReupload(err)}
                  >
                    {reuploadingIds.has(err.id) ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    {reuploadingIds.has(err.id) ? "Lädt…" : "Neu hochladen"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1 text-[10px] text-orange-600 hover:text-orange-800"
                    onClick={() => resolveMutation.mutate({ errorId: err.id })}
                  >
                    Behoben
                  </Button>
                </div>
              ))}
            </div>
            {errors.length > 10 && (
              <p className="text-xs text-orange-500 mt-1">+ {errors.length - 10} weitere Fehler</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── QR-Code Generator ───────────────────────────────────────────────────────
function useQrDataUrl(url: string) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const generate = async () => {
    try {
      const d = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
      setDataUrl(d);
    } catch { /* ignore */ }
  };
  return { dataUrl, generate };
}

// ─── Station Card ─────────────────────────────────────────────────────────────
function StationCard({ station, onDelete, onToggle, onRename }: {
  station: { id: number; name: string; qrToken: string; isActive: boolean };
  onDelete: (id: number) => void;
  onToggle: (id: number, isActive: boolean) => void;
  onRename: (id: number, name: string) => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(station.name);
  const kioskUrl = `https://simplapos.com/kiosk/${station.qrToken}`;
  const { dataUrl, generate } = useQrDataUrl(kioskUrl);

  const handleShowQr = () => {
    setShowQr(true);
    generate();
  };

  const handleRenameSubmit = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== station.name) onRename(station.id, trimmed);
    setEditingName(false);
  };

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><body style="text-align:center;font-family:sans-serif;padding:40px">
      <h2>${station.name}</h2>
      <p style="color:#666">Scannen Sie diesen QR-Code mit Ihrer Handy-Kamera</p>
      <img src="${dataUrl}" style="width:250px;height:250px" />
      <p style="font-size:12px;color:#999;margin-top:20px">Powered by SimplaPOS Kiosk-Scan</p>
    </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <Card className={`transition-all ${!station.isActive ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {editingName ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <Input
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") { setEditingName(false); setNameValue(station.name); } }}
                    className="h-7 text-sm font-semibold"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={handleRenameSubmit}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  className="font-semibold hover:text-primary transition-colors text-left truncate"
                  onClick={() => { setEditingName(true); setNameValue(station.name); }}
                  title="Klicken zum Umbenennen"
                >
                  {station.name}
                </button>
              )}
              {!editingName && (
                <>
                  <Badge variant={station.isActive ? "default" : "secondary"} className="text-xs shrink-0">
                    {station.isActive ? "Aktiv" : "Inaktiv"}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-5 w-5 opacity-40 hover:opacity-100" onClick={() => { setEditingName(true); setNameValue(station.name); }} title="Umbenennen">
                    <Pencil className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{station.qrToken.slice(0, 16)}…</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleShowQr} title="QR-Code anzeigen">
              <QrCode className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onToggle(station.id, !station.isActive)} title={station.isActive ? "Deaktivieren" : "Aktivieren"}>
              {station.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(station.id)} title="Löschen">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> {station.name}</DialogTitle>
            <DialogDescription>Drucken Sie diesen QR-Code aus und befestigen Sie ihn am Kiosk-Tisch.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {dataUrl ? (
              <img src={dataUrl} alt="QR-Code" className="w-56 h-56 border rounded-lg" />
            ) : (
              <div className="w-56 h-56 bg-muted rounded-lg flex items-center justify-center">
                <span className="text-muted-foreground text-sm">Wird geladen…</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center break-all">{kioskUrl}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQr(false)}>Schliessen</Button>
            <Button onClick={handlePrint} disabled={!dataUrl}>
              Drucken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Product Training ─────────────────────────────────────────────────────────
function ProductTraining() {
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<"front" | "back" | "left" | "right" | "top" | "other">("front");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Get menu items
  const { data: menuData } = trpc.kiosk.listMenuItems.useQuery(undefined, { retry: false });
  const menuItems = menuData ?? [];

  // Get learned images for selected item
  const { data: images, isLoading: imagesLoading } = trpc.kiosk.listProductImages.useQuery(
    { menuItemId: selectedItemId! },
    { enabled: !!selectedItemId }
  );

  const uploadMutation = trpc.kiosk.uploadProductImage.useMutation({
    onSuccess: () => {
      utils.kiosk.listProductImages.invalidate({ menuItemId: selectedItemId! });
      toast.success("Bild gespeichert: Das Produktbild wurde erfolgreich gespeichert.");
    },
    onError: (err) => toast.error("Fehler: " + err.message),
  });

  const deleteMutation = trpc.kiosk.deleteProductImage.useMutation({
    onSuccess: () => {
      utils.kiosk.listProductImages.invalidate({ menuItemId: selectedItemId! });
      toast.success("Bild gelöscht");
    },
  });

  const handleFile = async (file: File) => {
    if (!selectedItemId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Datei zu gross: Maximale Dateigrösse: 5 MB");
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        await uploadMutation.mutateAsync({ menuItemId: selectedItemId, imageBase64: base64, side: selectedSide });
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  const sideLabels: Record<string, string> = {
    front: "Vorderseite", back: "Rückseite", left: "Links", right: "Rechts", top: "Oben", other: "Sonstige",
  };

  // KIF-4: Lernbild-Status per Produkt (grün/rot)
  const { data: imageStatusData } = trpc.training.getImageFetchStatusByItem.useQuery(
    { restaurantId: 0 }, // wird serverseitig aus ctx.user gelesen
    { refetchInterval: 30_000 }
  );
  const imageStatusMap = new Map<number, { ok: boolean; hasErrors: boolean; imageCount: number; errorCount: number }>(
    (imageStatusData ?? []).map(s => [s.menuItemId, s])
  );

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">So funktioniert das Einlernen:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
              <li>Wählen Sie ein Produkt aus der Liste</li>
              <li>Fotografieren Sie das Produkt von <strong>3–8 Seiten</strong> (Vorderseite, Rückseite, links, rechts)</li>
              <li>Je mehr Fotos, desto besser erkennt die KI das Produkt</li>
              <li>Empfehlung: Mindestens Vorderseite + Rückseite</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Product selector mit Status-Badges */}
      <div className="space-y-2">
        <Label>Produkt auswählen</Label>
        <Select value={selectedItemId?.toString() ?? ""} onValueChange={(v) => setSelectedItemId(Number(v))}>
          <SelectTrigger>
            <SelectValue placeholder="Produkt wählen…" />
          </SelectTrigger>
          <SelectContent>
            {menuItems.map((item: { id: number; name: string }) => {
              const status = imageStatusMap.get(item.id);
              return (
                <SelectItem key={item.id} value={item.id.toString()}>
                  <div className="flex items-center gap-2 w-full">
                    <span className="flex-1">{item.name}</span>
                    {status?.hasErrors ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded px-1.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                        {status.errorCount} Fehler
                      </span>
                    ) : status?.ok ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded px-1.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        {status.imageCount} Fotos
                      </span>
                    ) : null}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {selectedItemId && (
        <>
          {/* Side selector */}
          <div className="space-y-2">
            <Label>Seite des Produkts</Label>
            <div className="flex flex-wrap gap-2">
              {(["front", "back", "left", "right", "top", "other"] as const).map((side) => (
                <Button
                  key={side}
                  size="sm"
                  variant={selectedSide === side ? "default" : "outline"}
                  onClick={() => setSelectedSide(side)}
                >
                  {sideLabels[side]}
                </Button>
              ))}
            </div>
          </div>

          {/* Upload buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              disabled={uploading}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              Kamera
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Image className="h-4 w-4 mr-2" />
              Datei wählen
            </Button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>

          {/* Learned images grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Gespeicherte Fotos</Label>
              <Badge variant="secondary">{images?.length ?? 0} Fotos</Badge>
            </div>
            {imagesLoading ? (
              <div className="text-sm text-muted-foreground">Wird geladen…</div>
            ) : images && images.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.map((img: { id: number; imageUrl: string; side: string }) => {
                  const imgSrc = img.imageUrl?.startsWith("/") ? img.imageUrl : img.imageUrl;
                  return (
                  <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                    <img src={imgSrc} alt={img.side} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-7 w-7"
                        onClick={() => deleteMutation.mutate({ id: img.id })}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                      {sideLabels[img.side] ?? img.side}
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                <Camera className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Noch keine Fotos gespeichert</p>
                <p className="text-xs mt-1">Fotografieren Sie das Produkt von allen Seiten</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Guest Training Review ──────────────────────────────────────────────────
function GuestTrainingReview() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [page, setPage] = useState(0);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const PAGE_SIZE = 20;
  const utils = trpc.useUtils();

  const { data: stats, refetch: refetchStats } = trpc.training.getStats.useQuery();
  const { data: qualityStats } = trpc.training.getQualityStats.useQuery();
  const { data, isLoading, refetch } = trpc.training.listImages.useQuery({
    status: statusFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const approveMutation = trpc.training.approveImage.useMutation({
    onSuccess: () => { utils.training.listImages.invalidate(); utils.training.getStats.invalidate(); utils.training.getQualityStats.invalidate(); toast.success("Bild genehmigt"); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMutation = trpc.training.rejectImage.useMutation({
    onSuccess: () => { utils.training.listImages.invalidate(); utils.training.getStats.invalidate(); utils.training.getQualityStats.invalidate(); toast.success("Bild abgelehnt"); },
    onError: (e) => toast.error(e.message),
  });
  const bulkApproveMutation = trpc.training.bulkApprove.useMutation({
    onSuccess: (result) => {
      utils.training.listImages.invalidate();
      utils.training.getStats.invalidate();
      utils.training.getQualityStats.invalidate();
      setShowBulkConfirm(false);
      toast.success(`${result.approvedCount} Bilder genehmigt`);
    },
    onError: (e) => { setShowBulkConfirm(false); toast.error(e.message); },
  });
  const { refetch: doExport, isFetching: exporting } = trpc.training.exportApproved.useQuery(
    undefined,
    { enabled: false }
  );

  const handleExport = async () => {
    const result = await doExport();
    if (!result.data) return;
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${result.data.count} Bilder exportiert`);
  };

  type TrainingImage = {
    id: number;
    s3Url: string;
    label: string | null;
    status: "pending" | "approved" | "rejected";
    createdAt: Date;
    sessionId: string;
    rejectionReason: string | null;
    avgConfidence: string | null;
  };

  const pendingCount = stats?.pending ?? 0;

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Gesamt", value: stats?.total ?? 0, color: "text-foreground" },
          { label: "Ausstehend", value: pendingCount, color: "text-amber-500" },
          { label: "Genehmigt", value: stats?.approved ?? 0, color: "text-green-500" },
          { label: "Abgelehnt", value: stats?.rejected ?? 0, color: "text-red-500" },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Qualitätsindikator */}
      {qualityStats && qualityStats.totalCount > 0 && (
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Qualität</span>
              </div>
              <div className="flex gap-4 text-sm flex-wrap">
                <span className="text-emerald-700 dark:text-emerald-300">
                  <span className="font-bold">{qualityStats.highConfidencePct}%</span>
                  <span className="text-emerald-600 dark:text-emerald-400 ml-1">hohe Erkennungssicherheit</span>
                </span>
                <span className="text-emerald-700 dark:text-emerald-300">
                  <span className="font-bold">{qualityStats.autoRejectedCount}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 ml-1">auto-abgelehnt (Person erkannt)</span>
                </span>
                {/* Confidence-Balken */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Confidence:</span>
                  <div className="flex h-3 w-24 rounded-full overflow-hidden gap-px">
                    <div className="bg-green-500" style={{ width: `${qualityStats.confidenceBreakdown.high / qualityStats.totalCount * 100}%` }} title="Hoch" />
                    <div className="bg-yellow-400" style={{ width: `${qualityStats.confidenceBreakdown.medium / qualityStats.totalCount * 100}%` }} title="Mittel" />
                    <div className="bg-red-400" style={{ width: `${qualityStats.confidenceBreakdown.low / qualityStats.totalCount * 100}%` }} title="Niedrig" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {qualityStats.confidenceBreakdown.high} hoch / {qualityStats.confidenceBreakdown.medium} mittel / {qualityStats.confidenceBreakdown.low} niedrig
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-3 items-start">
            <Brain className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-700 dark:text-blue-300">Automatische Personenerkennung aktiv</p>
              <p className="text-blue-600 dark:text-blue-400 mt-0.5">Bilder mit erkennbaren Personen werden automatisch abgelehnt (KI-Prüfung via Claude Vision). Verbleibende Bilder können einzeln oder per Massen-Genehmigung freigegeben werden.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fehler-Warnung: Nicht erreichbare Lernbilder */}
      <ImageFetchErrorWarning />
      {/* Filter + Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => { setStatusFilter(s); setPage(0); }}
            >
              {s === "pending" ? "Ausstehend" : s === "approved" ? "Genehmigt" : s === "rejected" ? "Abgelehnt" : "Alle"}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Aktualisieren
          </Button>
          {/* Massen-Approve Button */}
          {pendingCount > 0 && (
            showBulkConfirm ? (
              <div className="flex gap-1 items-center">
                <span className="text-xs text-muted-foreground">{pendingCount} Bilder genehmigen?</span>
                <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={() => bulkApproveMutation.mutate()} disabled={bulkApproveMutation.isPending}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Ja, alle
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowBulkConfirm(false)}>Abbrechen</Button>
              </div>
            ) : (
              <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={() => setShowBulkConfirm(true)}>
                <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Alle genehmigen ({pendingCount})
              </Button>
            )
          )}
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || (stats?.approved ?? 0) === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export ({stats?.approved ?? 0})
          </Button>
        </div>
      </div>

      {/* Image Grid */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Wird geladen…</div>
      ) : !data?.images.length ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <Image className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="font-medium text-muted-foreground">Keine Bilder vorhanden</p>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter === "pending" ? "Alle Bilder wurden bereits bearbeitet." : "Noch keine Bilder in dieser Kategorie."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.images.map((img: TrainingImage) => {
              let parsedLabel: Array<{ name: string; quantity: number; confidence: string }> = [];
              try { parsedLabel = img.label ? JSON.parse(img.label) : []; } catch { /* ignore */ }
              const isAutoRejected = img.rejectionReason === "auto_person_detected";
              const confColor = img.avgConfidence === "high" ? "bg-green-500" : img.avgConfidence === "medium" ? "bg-yellow-400" : img.avgConfidence === "low" ? "bg-red-400" : "";
              return (
                <div key={img.id} className="relative group rounded-lg overflow-hidden border bg-card">
                  <img
                    src={img.s3Url}
                    alt="Trainingsbild"
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  {/* Confidence-Dot oben links */}
                  {img.avgConfidence && (
                    <div className={`absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full ${confColor} ring-1 ring-white/50`} title={`Erkennungssicherheit: ${img.avgConfidence}`} />
                  )}
                  {/* Label overlay */}
                  {parsedLabel.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1.5 leading-tight">
                      {parsedLabel.slice(0, 2).map((p, i) => (
                        <div key={i} className="truncate">{p.name} ×{p.quantity}</div>
                      ))}
                      {parsedLabel.length > 2 && <div className="text-white/60">+{parsedLabel.length - 2} weitere</div>}
                    </div>
                  )}
                  {/* Status Badge */}
                  {img.status !== "pending" && (
                    <div className={`absolute top-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      img.status === "approved" ? "bg-green-500 text-white" : "bg-red-500 text-white"
                    }`}>
                      {img.status === "approved" ? "✓" : "×"}
                    </div>
                  )}
                  {/* Auto-Reject Badge */}
                  {isAutoRejected && (
                    <div className="absolute bottom-0 left-0 right-0 bg-red-600/90 text-white text-xs px-1.5 py-1 text-center">
                      👤 Person erkannt
                    </div>
                  )}
                  {/* Action Buttons (only for pending, non-auto-rejected) */}
                  {img.status === "pending" && !isAutoRejected && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        className="bg-green-500 hover:bg-green-600 text-white h-8 w-8 p-0 rounded-full"
                        onClick={() => approveMutation.mutate({ id: img.id })}
                        disabled={approveMutation.isPending}
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="bg-red-500 hover:bg-red-600 text-white h-8 w-8 p-0 rounded-full"
                        onClick={() => rejectMutation.mutate({ id: img.id })}
                        disabled={rejectMutation.isPending}
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Zurück</Button>
              <span className="text-sm text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} von {data.total}
              </span>
              <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= data.total} onClick={() => setPage(p => p + 1)}>Weiter</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KioskAdmin() {
    const [newStationName, setNewStationName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const { data: stations, isLoading } = trpc.kiosk.listStations.useQuery();

  const createMutation = trpc.kiosk.createStation.useMutation({
    onSuccess: () => {
      utils.kiosk.listStations.invalidate();
      setNewStationName("");
      setShowCreate(false);
      toast.success("Station erstellt: Die Kiosk-Station wurde erfolgreich erstellt.");
    },
    onError: (err) => toast.error("Fehler: " + err.message),
  });

  const deleteMutation = trpc.kiosk.deleteStation.useMutation({
    onSuccess: () => {
      utils.kiosk.listStations.invalidate();
      toast.success("Station gelöscht");
    },
  });

  const toggleMutation = trpc.kiosk.toggleStation.useMutation({
    onSuccess: () => utils.kiosk.listStations.invalidate(),
  });

  const renameMutation = trpc.kiosk.updateStationName.useMutation({
    onSuccess: (data) => {
      utils.kiosk.listStations.invalidate();
      toast.success(`Station umbenannt in "${data.name}"`);
    },
    onError: (err) => toast.error("Fehler: " + err.message),
  });

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanLine className="h-6 w-6 text-primary" />
            Kiosk-Scan
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Gäste fotografieren ihre Produkte – die KI erkennt sie automatisch und erstellt die Bestellung.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Station
        </Button>
      </div>

      <Tabs defaultValue="stations">
        <TabsList className="w-full">
          <TabsTrigger value="stations" className="flex-1">Stationen</TabsTrigger>
          <TabsTrigger value="training" className="flex-1">Einlernen</TabsTrigger>
          <TabsTrigger value="guest-training" className="flex-1">Gästefotos</TabsTrigger>
          <TabsTrigger value="upselling" className="flex-1">Upselling</TabsTrigger>
          <TabsTrigger value="marketing" className="flex-1">Marketing</TabsTrigger>
        </TabsList>

        {/* Stations Tab */}
        <TabsContent value="stations" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Wie es funktioniert</CardTitle>
              <CardDescription>
                Erstellen Sie eine Station pro Kiosk-Tisch. Jede Station bekommt einen eigenen QR-Code, den Sie ausdrucken und am Tisch befestigen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <span className="font-bold text-primary">1</span>
                  </div>
                  <p className="text-muted-foreground">Station erstellen & QR-Code drucken</p>
                </div>
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <span className="font-bold text-primary">2</span>
                  </div>
                  <p className="text-muted-foreground">Gast scannt QR-Code mit Handy-Kamera</p>
                </div>
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <span className="font-bold text-primary">3</span>
                  </div>
                  <p className="text-muted-foreground">KI erkennt Produkte & Gast bestätigt</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Wird geladen…</div>
          ) : stations && stations.length > 0 ? (
            <div className="space-y-3">
              {stations.map((station: { id: number; name: string; qrToken: string; isActive: boolean }) => (
                <StationCard
                  key={station.id}
                  station={station}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                  onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
                  onRename={(id, name) => renameMutation.mutate({ id, name })}
                />
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-xl p-12 text-center">
              <ScanLine className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="font-medium text-muted-foreground">Noch keine Stationen</p>
              <p className="text-sm text-muted-foreground mt-1">Erstellen Sie Ihre erste Kiosk-Station</p>
              <Button className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" /> Station erstellen
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Training Tab */}
        <TabsContent value="training" className="mt-4">
          <ProductTraining />
        </TabsContent>

        {/* Guest Training Images Tab */}
        <TabsContent value="guest-training" className="mt-4">
          <GuestTrainingReview />
        </TabsContent>

        {/* Upselling & Ablaufdatum Tab */}
        <TabsContent value="upselling" className="mt-4">
          <UpsellingRuleEditor />
        </TabsContent>

        {/* Marketing Tab */}
        <TabsContent value="marketing" className="mt-4">
          <MarketingConfigEditor />
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Neue Kiosk-Station</DialogTitle>
            <DialogDescription>Geben Sie einen Namen für die Station ein (z.B. „Tisch Terrasse" oder „Kiosk Eingang").</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Name</Label>
            <Input
              placeholder="z.B. Tisch Terrasse"
              value={newStationName}
              onChange={(e) => setNewStationName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newStationName.trim() && createMutation.mutate({ name: newStationName.trim() })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
            <Button
              disabled={!newStationName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newStationName.trim() })}
            >
              {createMutation.isPending ? "Wird erstellt…" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Marketing-Konfiguration ───────────────────────────────────────────────────
function MarketingConfigEditor() {
  const utils = trpc.useUtils();
  const { data: cfg, isLoading } = trpc.kiosk.getMarketingConfig.useQuery(
    {}, // kein Token → Backend liest restaurantId aus ctx.user
    { throwOnError: false }
  );

  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyTitle, setLoyaltyTitle] = useState("Treuepunkte sammeln");
  const [loyaltyText, setLoyaltyText] = useState("Melden Sie sich an und sammeln Sie Punkte bei jedem Einkauf!");
  const [loyaltyUrl, setLoyaltyUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [customCtaEnabled, setCustomCtaEnabled] = useState(false);
  const [customCtaTitle, setCustomCtaTitle] = useState("");
  const [customCtaText, setCustomCtaText] = useState("");
  const [customCtaButtonLabel, setCustomCtaButtonLabel] = useState("");
  const [customCtaUrl, setCustomCtaUrl] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Formular mit gespeicherten Werten befüllen
  if (cfg && !initialized) {
    setLoyaltyEnabled(cfg.loyaltyEnabled ?? false);
    setLoyaltyTitle(cfg.loyaltyTitle ?? "Treuepunkte sammeln");
    setLoyaltyText(cfg.loyaltyText ?? "Melden Sie sich an und sammeln Sie Punkte bei jedem Einkauf!");
    setLoyaltyUrl(cfg.loyaltyUrl ?? "");
    setInstagramUrl(cfg.instagramUrl ?? "");
    setFacebookUrl(cfg.facebookUrl ?? "");
    setTiktokUrl(cfg.tiktokUrl ?? "");
    setCustomCtaEnabled(cfg.customCtaEnabled ?? false);
    setCustomCtaTitle(cfg.customCtaTitle ?? "");
    setCustomCtaText(cfg.customCtaText ?? "");
    setCustomCtaButtonLabel(cfg.customCtaButtonLabel ?? "");
    setCustomCtaUrl(cfg.customCtaUrl ?? "");
    setInitialized(true);
  }

  const saveMutation = trpc.kiosk.saveMarketingConfig.useMutation({
    onSuccess: () => {
      utils.kiosk.getMarketingConfig.invalidate();
      toast.success("Marketing-Einstellungen gespeichert");
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const handleSave = () => {
    saveMutation.mutate({
      loyaltyEnabled,
      loyaltyTitle,
      loyaltyText,
      loyaltyUrl: loyaltyUrl || undefined,
      instagramUrl: instagramUrl || undefined,
      facebookUrl: facebookUrl || undefined,
      tiktokUrl: tiktokUrl || undefined,
      customCtaEnabled,
      customCtaTitle: customCtaTitle || undefined,
      customCtaText: customCtaText || undefined,
      customCtaButtonLabel: customCtaButtonLabel || undefined,
      customCtaUrl: customCtaUrl || undefined,
    });
  };

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Wird geladen…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            Marketing nach Zahlung
          </CardTitle>
          <CardDescription>
            Diese Inhalte werden dem Gast nach erfolgreicher Zahlung auf dem Quittungs-Screen angezeigt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Treuepunkte */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-purple-500" />
                <Label className="font-semibold">Treuepunkte-Block</Label>
              </div>
              <button
                type="button"
                onClick={() => setLoyaltyEnabled(!loyaltyEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${loyaltyEnabled ? "bg-purple-600" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${loyaltyEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {loyaltyEnabled && (
              <div className="pl-6 space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Titel</Label>
                  <Input value={loyaltyTitle} onChange={e => setLoyaltyTitle(e.target.value)} placeholder="Treuepunkte sammeln" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Beschreibung</Label>
                  <Input value={loyaltyText} onChange={e => setLoyaltyText(e.target.value)} placeholder="Melden Sie sich an…" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Link (optional)</Label>
                  <Input value={loyaltyUrl} onChange={e => setLoyaltyUrl(e.target.value)} placeholder="https://…" type="url" />
                </div>
              </div>
            )}
          </div>

          <hr />

          {/* Social Media */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-pink-500" />
              <Label className="font-semibold">Social Media Links</Label>
            </div>
            <div className="pl-6 space-y-2">
              <div>
                <Label className="text-xs text-muted-foreground">Instagram URL</Label>
                <Input value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/…" type="url" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Facebook URL</Label>
                <Input value={facebookUrl} onChange={e => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/…" type="url" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">TikTok URL</Label>
                <Input value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} placeholder="https://tiktok.com/@…" type="url" />
              </div>
            </div>
          </div>

          <hr />

          {/* Custom CTA */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-amber-500" />
                <Label className="font-semibold">Eigener Call-to-Action</Label>
              </div>
              <button
                type="button"
                onClick={() => setCustomCtaEnabled(!customCtaEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${customCtaEnabled ? "bg-amber-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${customCtaEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {customCtaEnabled && (
              <div className="pl-6 space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Titel</Label>
                  <Input value={customCtaTitle} onChange={e => setCustomCtaTitle(e.target.value)} placeholder="z.B. Bewertung abgeben" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Beschreibung</Label>
                  <Input value={customCtaText} onChange={e => setCustomCtaText(e.target.value)} placeholder="z.B. Helfen Sie uns besser zu werden…" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Button-Text</Label>
                  <Input value={customCtaButtonLabel} onChange={e => setCustomCtaButtonLabel(e.target.value)} placeholder="z.B. Jetzt bewerten" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Button-Link</Label>
                  <Input value={customCtaUrl} onChange={e => setCustomCtaUrl(e.target.value)} placeholder="https://…" type="url" />
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full">
            {saveMutation.isPending ? "Wird gespeichert…" : "Einstellungen speichern"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
