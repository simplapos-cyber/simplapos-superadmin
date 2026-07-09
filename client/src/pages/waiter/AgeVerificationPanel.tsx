import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ShieldAlert, CheckCircle, XCircle, Clock, RefreshCw,
  Wine, Cigarette, Package, AlertTriangle,
} from "lucide-react";

type AgeVerRow = {
  id: number;
  restaurantId: number;
  stationId: number;
  stationName: string;
  sessionToken: string;
  products: unknown;
  status: "pending" | "approved" | "rejected";
  approvedBy: number | null;
  approvedAt: Date | null;
  rejectedBy: number | null;
  rejectedAt: Date | null;
  note: string | null;
  createdAt: Date;
  expiresAt: Date;
  waitingSec: number | null;
};

type ScannedProduct = {
  name: string;
  quantity?: number;
  requiresAgeVerification?: boolean;
};

function formatWaiting(sec: number | null): string {
  if (sec === null) return "–";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function ProductList({ products }: { products: unknown }) {
  const items = (Array.isArray(products) ? products : []) as ScannedProduct[];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Keine Produktdaten</p>;
  return (
    <div className="space-y-1.5">
      {items.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          {p.requiresAgeVerification ? (
            <Wine className="h-4 w-4 text-amber-500 shrink-0" />
          ) : (
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className={p.requiresAgeVerification ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
            {p.quantity && p.quantity > 1 ? `${p.quantity}× ` : ""}{p.name}
          </span>
          {p.requiresAgeVerification && (
            <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 ml-auto shrink-0">
              18+
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

function RequestCard({
  req,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  req: AgeVerRow;
  onApprove: (id: number) => void;
  onReject: (id: number, note: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const isPending = req.status === "pending";
  const isExpired = new Date(req.expiresAt) < new Date();

  return (
    <>
      <Card className={`transition-all ${isPending && !isExpired ? "border-amber-400 shadow-sm" : "opacity-70"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isPending && !isExpired ? "bg-amber-100 dark:bg-amber-900/30" : "bg-muted"}`}>
                <ShieldAlert className={`h-5 w-5 ${isPending && !isExpired ? "text-amber-600" : "text-muted-foreground"}`} />
              </div>
              <div>
                <CardTitle className="text-base">{req.stationName}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(req.createdAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                  {isPending && req.waitingSec !== null && (
                    <span className={`ml-2 font-medium ${req.waitingSec > 120 ? "text-red-500" : "text-amber-500"}`}>
                      Wartet: {formatWaiting(req.waitingSec)}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              {isExpired && isPending ? (
                <Badge variant="destructive" className="text-xs">Abgelaufen</Badge>
              ) : req.status === "pending" ? (
                <Badge className="bg-amber-500 text-white text-xs">Offen</Badge>
              ) : req.status === "approved" ? (
                <Badge className="bg-green-500 text-white text-xs">Genehmigt</Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">Abgelehnt</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Produkte */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Gescannte Produkte</p>
            <ProductList products={req.products} />
          </div>

          {/* Aktions-Buttons (nur bei offenen, nicht abgelaufenen Anfragen) */}
          {isPending && !isExpired && (
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
                onClick={() => onApprove(req.id)}
                disabled={isApproving || isRejecting}
              >
                <CheckCircle className="h-4 w-4" />
                Genehmigen
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={() => setShowRejectDialog(true)}
                disabled={isApproving || isRejecting}
              >
                <XCircle className="h-4 w-4" />
                Ablehnen
              </Button>
            </div>
          )}

          {/* Abgelehnt mit Notiz */}
          {req.status === "rejected" && req.note && (
            <p className="text-xs text-muted-foreground bg-muted rounded p-2">
              Grund: {req.note}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Ablehnungs-Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Altersverifikation ablehnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bitte geben Sie einen Grund an (optional). Der Gast wird informiert.
            </p>
            <Textarea
              placeholder="z.B. Kein gültiger Ausweis vorhanden"
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Abbrechen</Button>
            <Button
              variant="destructive"
              onClick={() => {
                onReject(req.id, rejectNote);
                setShowRejectDialog(false);
                setRejectNote("");
              }}
              disabled={isRejecting}
            >
              Ablehnen bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Web Audio Alert Tone ─────────────────────────────────────────────────────────────
function useAlertTone() {
  return useCallback(() => {
    try {
      type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [0, 0.28, 0.56].forEach((t) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime + t);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + t + 0.12);
        gain.gain.setValueAtTime(0.35, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.24);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.24);
      });
      setTimeout(() => ctx.close(), 1800);
    } catch { /* AudioContext not available */ }
  }, []);
}

export default function AgeVerificationPanel() {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const utils = trpc.useUtils();
  const playAlertTone = useAlertTone();
  const prevPendingCount = useRef(0);

  const requestsQuery = trpc.kiosk.getAgeVerificationRequests.useQuery(
    { status: tab === "pending" ? "pending" : "all" },
    { refetchInterval: 5000 }
  );

  const approveMutation = trpc.kiosk.approveAgeVerification.useMutation({
    onSuccess: () => {
      toast.success("Altersverifikation genehmigt");
      utils.kiosk.getAgeVerificationRequests.invalidate();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const rejectMutation = trpc.kiosk.rejectAgeVerification.useMutation({
    onSuccess: () => {
      toast.success("Altersverifikation abgelehnt");
      utils.kiosk.getAgeVerificationRequests.invalidate();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  // Helper: sessionToken aus requests holen
  const getToken = (id: number) => requests.find(r => r.id === id)?.sessionToken ?? "";

  const requests = (requestsQuery.data ?? []) as AgeVerRow[];
  const pendingCount = requests.filter(r => r.status === "pending" && new Date(r.expiresAt) > new Date()).length;

  // Ton-Alert und Titel bei neuen Anfragen
  useEffect(() => {
    if (pendingCount > 0) {
      document.title = `(${pendingCount}) Altersverifikation – SimplaPos`;
      if (pendingCount > prevPendingCount.current) {
        playAlertTone();
      }
    } else {
      document.title = "Altersverifikation – SimplaPos";
    }
    prevPendingCount.current = pendingCount;
    return () => { document.title = "SimplaPos"; };
  }, [pendingCount, playAlertTone]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <ShieldAlert className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Altersverifikation</h1>
            <p className="text-sm text-muted-foreground">Anfragen für Alkohol & Tabak-Produkte</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge className="bg-amber-500 text-white text-sm px-3 py-1 animate-pulse">
              {pendingCount} offen
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => requestsQuery.refetch()}
            disabled={requestsQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${requestsQuery.isFetching ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Hinweis-Banner wenn offene Anfragen */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {pendingCount === 1 ? "1 Gast wartet" : `${pendingCount} Gäste warten`} auf Altersverifikation
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Bitte prüfen Sie den Ausweis und genehmigen oder ablehnen Sie die Anfrage.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as "pending" | "all")}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Offen
            {pendingCount > 0 && (
              <Badge className="bg-amber-500 text-white text-xs ml-1 px-1.5">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <Package className="h-4 w-4" />
            Alle
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {requestsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : requests.filter(r => r.status === "pending").length === 0 ? (
            <Card>
              <CardContent className="p-10 flex flex-col items-center gap-3 text-center">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p className="text-lg font-medium">Keine offenen Anfragen</p>
                <p className="text-sm text-muted-foreground">Alle Altersverifikationen sind bearbeitet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {requests
                .filter(r => r.status === "pending")
                .map(req => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    onApprove={(id) => approveMutation.mutate({ sessionToken: getToken(id) })}
                    onReject={(id, note) => rejectMutation.mutate({ sessionToken: getToken(id), note })}
                    isApproving={approveMutation.isPending}
                    isRejecting={rejectMutation.isPending}
                  />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {requestsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                Noch keine Altersverifikationsanfragen
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <RequestCard
                  key={req.id}
                  req={req}
                  onApprove={(id) => approveMutation.mutate({ sessionToken: getToken(id) })}
                  onReject={(id, note) => rejectMutation.mutate({ sessionToken: getToken(id), note })}
                  isApproving={approveMutation.isPending}
                  isRejecting={rejectMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Legende */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Legende</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Wine className="h-4 w-4 text-amber-500" />
              <span>Alkoholisches Produkt</span>
            </div>
            <div className="flex items-center gap-2">
              <Cigarette className="h-4 w-4 text-amber-500" />
              <span>Tabakprodukt</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <span>Anfrage läuft ab nach 10 Min.</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span>Wartezeit &gt; 2 Min.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
