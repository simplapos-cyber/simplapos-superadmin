/**
 * AdminShiftSwap.tsx – Admin-Verwaltung für Schicht-Tausch-Anfragen
 *
 * Zwei Tabs:
 * 1. Ausstehend – Anfragen die auf Admin-Genehmigung warten
 * 2. Alle Anfragen – vollständige Historie
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
  ArrowLeftRight, CheckCircle2, XCircle, Clock, Calendar,
  User, RefreshCw, AlertCircle, Filter
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  accepted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  admin_approved: "bg-green-100 text-green-800 border-green-200",
  admin_declined: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

function formatDate(date: string) {
  try {
    return format(new Date(date), "EEE, dd. MMM yyyy", { locale: de });
  } catch {
    return date;
  }
}

export default function AdminShiftSwap() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState("pending");
  const [historyFilter, setHistoryFilter] = useState<"all" | "admin_approved" | "admin_declined" | "cancelled">("all");

  // Genehmigungsdialog
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveSwapId, setApproveSwapId] = useState<number | null>(null);
  const [approveNote, setApproveNote] = useState("");

  // Ablehnungsdialog
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineSwapId, setDeclineSwapId] = useState<number | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: pendingSwaps = [], isLoading: loadingPending, refetch: refetchPending } =
    trpc.shiftSwap.getPendingAdminApproval.useQuery({ status: "accepted", limit: 50 });

  const { data: allSwaps = [], isLoading: loadingAll, refetch: refetchAll } =
    trpc.shiftSwap.getPendingAdminApproval.useQuery({ status: "all", limit: 100 });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const approveSwap = trpc.shiftSwap.adminApproveSwap.useMutation({
    onSuccess: () => {
      toast.success("Tausch genehmigt", {
        description: "Die Schichten wurden automatisch aktualisiert. Beide Mitarbeiter wurden benachrichtigt.",
      });
      setApproveDialogOpen(false);
      setApproveSwapId(null);
      setApproveNote("");
      utils.shiftSwap.getPendingAdminApproval.invalidate();
      utils.shiftSwap.getSwapBadgeCount.invalidate();
    },
    onError: (e) => toast.error("Fehler", { description: e.message }),
  });

  const declineSwap = trpc.shiftSwap.adminDeclineSwap.useMutation({
    onSuccess: () => {
      toast.success("Tausch abgelehnt", {
        description: "Beide Mitarbeiter wurden über die Ablehnung informiert.",
      });
      setDeclineDialogOpen(false);
      setDeclineSwapId(null);
      setDeclineNote("");
      utils.shiftSwap.getPendingAdminApproval.invalidate();
      utils.shiftSwap.getSwapBadgeCount.invalidate();
    },
    onError: (e) => toast.error("Fehler", { description: e.message }),
  });

  // ── Hilfsfunktionen ──────────────────────────────────────────────────────────
  function openApproveDialog(swapId: number) {
    setApproveSwapId(swapId);
    setApproveNote("");
    setApproveDialogOpen(true);
  }

  function openDeclineDialog(swapId: number) {
    setDeclineSwapId(swapId);
    setDeclineNote("");
    setDeclineDialogOpen(true);
  }

  const filteredHistory = historyFilter === "all"
    ? (allSwaps as any[]).filter((s: any) => s.status !== "accepted")
    : (allSwaps as any[]).filter((s: any) => s.status === historyFilter);

  // ── Swap-Karte ────────────────────────────────────────────────────────────────
  function SwapCard({ swap, showActions }: { swap: any; showActions: boolean }) {
    return (
      <Card className={showActions ? "border-yellow-300 hover:border-yellow-400 transition-colors" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                Schicht-Tausch #{swap.id}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Erstellt am {format(new Date(swap.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
              </p>
            </div>
            <Badge className={`text-xs border ${STATUS_COLORS[swap.status]}`}>
              {swap.statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Requester */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-1">GIBT AB</p>
              <div className="flex items-center gap-2 mb-1">
                <User className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm font-medium">{swap.requesterName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs">{formatDate(swap.offeredDate)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                {swap.offeredStart} – {swap.offeredEnd} Uhr
              </p>
            </div>

            {swap.targetName ? (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">ÜBERNIMMT</p>
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm font-medium">{swap.targetName}</span>
                </div>
                {swap.counterShiftId ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs">{formatDate(swap.counterDate)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                      {swap.counterStart} – {swap.counterEnd} Uhr (Gegenschicht)
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground ml-5">Kein Gegentausch</p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-muted/30 rounded-lg flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Noch kein Kollege</p>
              </div>
            )}
          </div>

          {/* Notizen */}
          {swap.requesterNote && (
            <p className="text-xs text-muted-foreground italic">
              Notiz: "{swap.requesterNote}"
            </p>
          )}
          {swap.adminNote && (
            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              <strong>Admin-Notiz:</strong> {swap.adminNote}
            </div>
          )}

          {/* Aktionen */}
          {showActions && swap.targetName && (
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                size="sm"
                onClick={() => openApproveDialog(swap.id)}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Genehmigen
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => openDeclineDialog(swap.id)}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Ablehnen
              </Button>
            </div>
          )}

          {/* Entscheidungsinfo */}
          {swap.adminDecidedAt && (
            <p className="text-xs text-muted-foreground">
              Entschieden am {format(new Date(swap.adminDecidedAt), "dd.MM.yyyy HH:mm", { locale: de })}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-blue-600" />
            Schicht-Tausch Verwaltung
          </h1>
          <p className="text-muted-foreground mt-1">
            Genehmige oder lehne Tausch-Anfragen deiner Mitarbeiter ab
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetchPending(); refetchAll(); }}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Aktualisieren
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock className="w-4 h-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingSwaps.length}</p>
                <p className="text-xs text-muted-foreground">Ausstehend</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {(allSwaps as any[]).filter((s: any) => s.status === "admin_approved").length}
                </p>
                <p className="text-xs text-muted-foreground">Genehmigt</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                <XCircle className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {(allSwaps as any[]).filter((s: any) => s.status === "admin_declined").length}
                </p>
                <p className="text-xs text-muted-foreground">Abgelehnt</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending">
            Ausstehend
            {pendingSwaps.length > 0 && (
              <Badge className="ml-2 text-xs bg-yellow-500">
                {pendingSwaps.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Alle Anfragen</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Ausstehend ─────────────────────────────────────────────── */}
        <TabsContent value="pending" className="space-y-4 mt-4">
          {loadingPending ? (
            <div className="text-center py-8 text-muted-foreground">Lade...</div>
          ) : pendingSwaps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-medium">Alles erledigt!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Keine ausstehenden Tausch-Anfragen
                </p>
              </CardContent>
            </Card>
          ) : (
            pendingSwaps.map((swap: any) => (
              <SwapCard key={swap.id} swap={swap} showActions={true} />
            ))
          )}
        </TabsContent>

        {/* ── Tab 2: Alle Anfragen ──────────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {(["all", "admin_approved", "admin_declined", "cancelled"] as const).map((f) => (
              <Button
                key={f}
                variant={historyFilter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryFilter(f)}
              >
                {f === "all" ? "Alle" :
                 f === "admin_approved" ? "Genehmigt" :
                 f === "admin_declined" ? "Abgelehnt" : "Abgebrochen"}
              </Button>
            ))}
          </div>

          {loadingAll ? (
            <div className="text-center py-8 text-muted-foreground">Lade...</div>
          ) : filteredHistory.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Keine Einträge</p>
              </CardContent>
            </Card>
          ) : (
            filteredHistory.map((swap: any) => (
              <SwapCard key={swap.id} swap={swap} showActions={false} />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Genehmigen ──────────────────────────────────────────────── */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              Tausch genehmigen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Nach der Genehmigung werden die Schichten automatisch im Dienstplan aktualisiert
              und beide Mitarbeiter werden benachrichtigt.
            </p>
            <div className="space-y-2">
              <Label>Notiz (optional)</Label>
              <Textarea
                placeholder="z.B. Genehmigt – bitte Übergabe koordinieren"
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (!approveSwapId) return;
                approveSwap.mutate({
                  swapId: approveSwapId,
                  adminNote: approveNote || undefined,
                });
              }}
              disabled={approveSwap.isPending}
            >
              {approveSwap.isPending ? "Wird genehmigt..." : "Genehmigen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Ablehnen ────────────────────────────────────────────────── */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              Tausch ablehnen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Bitte gib eine Begründung an. Beide Mitarbeiter werden benachrichtigt.
            </p>
            <div className="space-y-2">
              <Label>Begründung *</Label>
              <Textarea
                placeholder="z.B. Personalengpass an diesem Tag – Tausch nicht möglich"
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!declineSwapId || !declineNote.trim()) {
                  toast.error("Bitte Begründung angeben");
                  return;
                }
                declineSwap.mutate({
                  swapId: declineSwapId,
                  adminNote: declineNote,
                });
              }}
              disabled={declineSwap.isPending || !declineNote.trim()}
            >
              {declineSwap.isPending ? "Wird abgelehnt..." : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
