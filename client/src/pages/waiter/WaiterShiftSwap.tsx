/**
 * WaiterShiftSwap.tsx – Schicht-Tausch-Seite für Kellner
 *
 * Drei Tabs:
 * 1. Meine Angebote – eigene Tausch-Angebote verwalten (anbieten, zurückziehen)
 * 2. Offene Angebote – Tausch-Angebote von Kollegen annehmen
 * 3. Meine Schichten – eigene geplante Schichten als Basis für Tausch-Angebote
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeftRight, Clock, Calendar, User, CheckCircle2,
  XCircle, AlertCircle, RefreshCw, Plus, Trash2, Info
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// ─── Status-Farben ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  accepted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  admin_approved: "bg-green-100 text-green-800 border-green-200",
  admin_declined: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <AlertCircle className="w-3 h-3" />,
  accepted: <Clock className="w-3 h-3" />,
  admin_approved: <CheckCircle2 className="w-3 h-3" />,
  admin_declined: <XCircle className="w-3 h-3" />,
  cancelled: <XCircle className="w-3 h-3" />,
};

// ─── Hilfsfunktion ────────────────────────────────────────────────────────────
function formatShiftDate(date: string) {
  try {
    return format(new Date(date), "EEE, dd. MMM yyyy", { locale: de });
  } catch {
    return date;
  }
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function WaiterShiftSwap() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState("my-offers");

  // Dialoge
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [offerNote, setOfferNote] = useState("");

  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [selectedSwapId, setSelectedSwapId] = useState<number | null>(null);
  const [counterShiftId, setCounterShiftId] = useState<number | null>(null);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelSwapId, setCancelSwapId] = useState<number | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: mySwaps = [], isLoading: loadingMySwaps, refetch: refetchMySwaps } =
    trpc.shiftSwap.getMySwapRequests.useQuery({ limit: 30 });

  const { data: openSwaps = [], isLoading: loadingOpenSwaps, refetch: refetchOpenSwaps } =
    trpc.shiftSwap.getOpenSwaps.useQuery({ limit: 30 });

  const { data: myShifts = [], isLoading: loadingShifts } =
    trpc.aiPlanning.getMyPlannedShifts.useQuery({ weeksAhead: 8 });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const offerSwap = trpc.shiftSwap.offerSwap.useMutation({
    onSuccess: () => {
      toast.success("Tausch-Angebot erstellt", {
        description: "Deine Kollegen können das Angebot jetzt annehmen.",
      });
      setOfferDialogOpen(false);
      setOfferNote("");
      setSelectedShiftId(null);
      utils.shiftSwap.getMySwapRequests.invalidate();
      utils.shiftSwap.getSwapBadgeCount.invalidate();
    },
    onError: (e) => toast.error("Fehler", { description: e.message }),
  });

  const acceptSwap = trpc.shiftSwap.acceptSwap.useMutation({
    onSuccess: () => {
      toast.success("Tausch-Angebot angenommen", {
        description: "Der Admin wird benachrichtigt und muss noch genehmigen.",
      });
      setAcceptDialogOpen(false);
      setSelectedSwapId(null);
      setCounterShiftId(null);
      utils.shiftSwap.getOpenSwaps.invalidate();
      utils.shiftSwap.getMySwapRequests.invalidate();
      utils.shiftSwap.getSwapBadgeCount.invalidate();
    },
    onError: (e) => toast.error("Fehler", { description: e.message }),
  });

  const cancelSwap = trpc.shiftSwap.cancelSwap.useMutation({
    onSuccess: () => {
      toast.success("Tausch-Angebot zurückgezogen");
      setCancelDialogOpen(false);
      setCancelSwapId(null);
      utils.shiftSwap.getMySwapRequests.invalidate();
      utils.shiftSwap.getSwapBadgeCount.invalidate();
    },
    onError: (e) => toast.error("Fehler", { description: e.message }),
  });

  // ── Hilfsfunktionen ──────────────────────────────────────────────────────────
  function openOfferDialog(shiftId: number) {
    setSelectedShiftId(shiftId);
    setOfferNote("");
    setOfferDialogOpen(true);
  }

  function openAcceptDialog(swapId: number) {
    setSelectedSwapId(swapId);
    setCounterShiftId(null);
    setAcceptDialogOpen(true);
  }

  function openCancelDialog(swapId: number) {
    setCancelSwapId(swapId);
    setCancelDialogOpen(true);
  }

  // Schichten die noch kein offenes Tausch-Angebot haben
  const availableShifts = (myShifts as any[]).filter((shift: any) => {
    const hasOpenOffer = mySwaps.some(
      (s: any) => s.offeredShiftId === shift.id && ["open", "accepted"].includes(s.status)
    );
    return !hasOpenOffer && !shift.confirmedByStaff;
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-blue-600" />
            Schicht-Tausch
          </h1>
          <p className="text-muted-foreground mt-1">
            Biete Schichten zum Tausch an oder übernimm Schichten von Kollegen
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetchMySwaps(); refetchOpenSwaps(); }}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Aktualisieren
        </Button>
      </div>

      {/* Info-Banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <strong>So funktioniert der Schicht-Tausch:</strong> Du bietest eine Schicht an →
          ein Kollege nimmt an → der Admin genehmigt → die Schichten werden automatisch
          in deinem Dienstplan aktualisiert. Alle Beteiligten werden bei jedem Schritt benachrichtigt.
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="my-offers">
            Meine Angebote
            {mySwaps.filter((s: any) => ["open", "accepted"].includes(s.status)).length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {mySwaps.filter((s: any) => ["open", "accepted"].includes(s.status)).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="open-swaps">
            Offene Angebote
            {openSwaps.length > 0 && (
              <Badge className="ml-2 text-xs bg-blue-600">
                {openSwaps.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="my-shifts">
            Meine Schichten
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Meine Angebote ─────────────────────────────────────────── */}
        <TabsContent value="my-offers" className="space-y-4 mt-4">
          {loadingMySwaps ? (
            <div className="text-center py-8 text-muted-foreground">Lade...</div>
          ) : mySwaps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ArrowLeftRight className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Noch keine Tausch-Angebote</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Wechsle zu "Meine Schichten" um eine Schicht zum Tausch anzubieten
                </p>
              </CardContent>
            </Card>
          ) : (
            mySwaps.map((swap: any) => (
              <Card key={swap.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {swap.isRequester ? "Mein Angebot" : "Ich übernehme"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {swap.isRequester
                          ? `Angeboten am ${format(new Date(swap.createdAt), "dd.MM.yyyy", { locale: de })}`
                          : `Von ${swap.requesterName}`}
                      </p>
                    </div>
                    <Badge className={`text-xs border flex items-center gap-1 ${STATUS_COLORS[swap.status]}`}>
                      {STATUS_ICONS[swap.status]}
                      {swap.statusLabel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Angebotene Schicht */}
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{formatShiftDate(swap.offeredDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {swap.offeredStart} – {swap.offeredEnd} Uhr
                        {swap.isRequester ? " (deine Schicht)" : ` (von ${swap.requesterName})`}
                      </p>
                    </div>
                  </div>

                  {/* Gegenschicht */}
                  {swap.counterShiftId && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <ArrowLeftRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{formatShiftDate(swap.counterDate)}</p>
                        <p className="text-xs text-muted-foreground">
                          {swap.counterStart} – {swap.counterEnd} Uhr (Gegenschicht)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Kollege */}
                  {swap.targetName && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span>
                        {swap.isRequester
                          ? `${swap.targetName} möchte übernehmen`
                          : `Du übernimmst von ${swap.requesterName}`}
                      </span>
                    </div>
                  )}

                  {/* Admin-Notiz */}
                  {swap.adminNote && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      <strong>Admin-Notiz:</strong> {swap.adminNote}
                    </div>
                  )}

                  {/* Aktionen */}
                  {swap.isRequester && ["open", "accepted"].includes(swap.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => openCancelDialog(swap.id)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Zurückziehen
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Tab 2: Offene Angebote ────────────────────────────────────────── */}
        <TabsContent value="open-swaps" className="space-y-4 mt-4">
          {loadingOpenSwaps ? (
            <div className="text-center py-8 text-muted-foreground">Lade...</div>
          ) : openSwaps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Keine offenen Tausch-Angebote</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Aktuell bietet kein Kollege eine Schicht zum Tausch an
                </p>
              </CardContent>
            </Card>
          ) : (
            openSwaps.map((swap: any) => (
              <Card key={swap.id} className="border-blue-200 hover:border-blue-400 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        {swap.requesterName}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Angeboten am {format(new Date(swap.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                      </p>
                    </div>
                    <Badge className="text-xs border bg-blue-100 text-blue-800 border-blue-200">
                      Offen
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{formatShiftDate(swap.offeredDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {swap.offeredStart} – {swap.offeredEnd} Uhr
                      </p>
                    </div>
                  </div>

                  {swap.requesterNote && (
                    <p className="text-sm text-muted-foreground italic">
                      "{swap.requesterNote}"
                    </p>
                  )}

                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => openAcceptDialog(swap.id)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Schicht übernehmen
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Tab 3: Meine Schichten ────────────────────────────────────────── */}
        <TabsContent value="my-shifts" className="space-y-4 mt-4">
          {loadingShifts ? (
            <div className="text-center py-8 text-muted-foreground">Lade...</div>
          ) : availableShifts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Keine verfügbaren Schichten</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Alle deine Schichten wurden bereits zum Tausch angeboten oder bestätigt
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Wähle eine Schicht aus, die du zum Tausch anbieten möchtest:
              </p>
              {availableShifts.map((shift: any) => (
                <Card key={shift.id} className="hover:border-blue-300 transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Clock className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{formatShiftDate(shift.date)}</p>
                          <p className="text-xs text-muted-foreground">
                            {shift.startTime} – {shift.endTime} Uhr
                            {shift.netHours && ` · ${shift.netHours}h netto`}
                          </p>
                          {shift.aiNote && (
                            <p className="text-xs text-muted-foreground italic mt-0.5">
                              {shift.aiNote}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => openOfferDialog(shift.id)}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Anbieten
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Tausch anbieten ─────────────────────────────────────────── */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schicht zum Tausch anbieten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedShiftId && (() => {
              const shift = (myShifts as any[]).find((s: any) => s.id === selectedShiftId);
              if (!shift) return null;
              return (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium text-sm">{formatShiftDate(shift.date)}</p>
                  <p className="text-xs text-muted-foreground">{shift.startTime} – {shift.endTime} Uhr</p>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>Notiz für Kollegen (optional)</Label>
              <Textarea
                placeholder="z.B. Bin krank, suche dringend jemanden..."
                value={offerNote}
                onChange={(e) => setOfferNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                if (!selectedShiftId) return;
                offerSwap.mutate({
                  offeredShiftId: selectedShiftId,
                  requesterNote: offerNote || undefined,
                });
              }}
              disabled={offerSwap.isPending}
            >
              {offerSwap.isPending ? "Wird erstellt..." : "Angebot erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Tausch annehmen ─────────────────────────────────────────── */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schicht übernehmen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedSwapId && (() => {
              const swap = openSwaps.find((s: any) => s.id === selectedSwapId);
              if (!swap) return null;
              return (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="font-medium text-sm">{formatShiftDate((swap as any).offeredDate)}</p>
                  <p className="text-xs text-muted-foreground">
                    {(swap as any).offeredStart} – {(swap as any).offeredEnd} Uhr · von {(swap as any).requesterName}
                  </p>
                </div>
              );
            })()}

            {availableShifts.length > 0 && (
              <div className="space-y-2">
                <Label>Gegenschicht anbieten (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Du kannst optional eine deiner eigenen Schichten als Gegentausch anbieten
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  <button
                    className={`w-full text-left p-2 rounded border text-sm transition-colors ${
                      counterShiftId === null
                        ? "border-blue-400 bg-blue-50"
                        : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => setCounterShiftId(null)}
                  >
                    Kein Gegentausch
                  </button>
                  {availableShifts.map((shift: any) => (
                    <button
                      key={shift.id}
                      className={`w-full text-left p-2 rounded border text-sm transition-colors ${
                        counterShiftId === shift.id
                          ? "border-blue-400 bg-blue-50"
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setCounterShiftId(shift.id)}
                    >
                      {formatShiftDate(shift.date)} · {shift.startTime}–{shift.endTime}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              <strong>Wichtig:</strong> Nach deiner Annahme muss der Admin noch genehmigen.
              Erst dann wird die Schicht in deinem Dienstplan aktualisiert.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                if (!selectedSwapId) return;
                acceptSwap.mutate({
                  swapId: selectedSwapId,
                  counterShiftId: counterShiftId ?? undefined,
                });
              }}
              disabled={acceptSwap.isPending}
            >
              {acceptSwap.isPending ? "Wird angenommen..." : "Schicht übernehmen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Angebot zurückziehen ────────────────────────────────────── */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tausch-Angebot zurückziehen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Das Angebot wird für alle Kollegen geschlossen. Falls bereits jemand angenommen hat,
            wird er benachrichtigt.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancelSwapId) return;
                cancelSwap.mutate({ swapId: cancelSwapId });
              }}
              disabled={cancelSwap.isPending}
            >
              {cancelSwap.isPending ? "Wird zurückgezogen..." : "Zurückziehen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
