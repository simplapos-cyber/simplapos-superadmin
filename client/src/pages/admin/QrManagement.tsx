/**
 * QrManagement – Admin-Seite für QR-Code-Verwaltung
 *
 * Funktionen:
 * - QR-Token für Tisch generieren
 * - QR-Code als Bild anzeigen (canvas-basiert via qrcode)
 * - QR-Code drucken / herunterladen
 * - Aktive Sessions auflisten und schliessen
 */
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { QrCode, Plus, Download, Printer, X, RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import QRCode from "qrcode";

// ─── QR Canvas ────────────────────────────────────────────────────────────────

function QRCanvas({ url, size = 240 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(console.error);
  }, [url, size]);

  return <canvas ref={canvasRef} />;
}

// ─── Generate Dialog ──────────────────────────────────────────────────────────

function GenerateQrDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [tableLabel, setTableLabel] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(12);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const generate = trpc.qrOrder.generateQrToken.useMutation({
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const qrUrl = generatedToken
    ? `https://simplapos.com/guest/order/${generatedToken}`
    : null;

  function handleDownload() {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-download-canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-tisch-${tableLabel}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function handlePrint() {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-download-canvas");
    if (!canvas) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR-Code Tisch ${tableLabel}</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:16px}
      h2{margin:0;font-size:1.5rem}p{margin:0;color:#666;font-size:0.9rem}</style></head>
      <body>
        <h2>Tisch ${tableLabel}</h2>
        <img src="${canvas.toDataURL("image/png")}" style="width:280px;height:280px" />
        <p>Scannen Sie den QR-Code um zu bestellen</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  }

  function handleClose() {
    setOpen(false);
    setGeneratedToken(null);
    setTableLabel("");
    setExpiresInHours(12);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          QR-Code generieren
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR-Code für Tisch generieren</DialogTitle>
        </DialogHeader>

        {!generatedToken ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tischbezeichnung</Label>
              <Input
                placeholder="z.B. Tisch 5, Terrasse A, Bar 2"
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value)}
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gültigkeitsdauer (Stunden)</Label>
              <Input
                type="number"
                min={1}
                max={72}
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(parseInt(e.target.value) || 12)}
                style={{ fontSize: "16px" }}
              />
            </div>
            <Button
              className="w-full"
              disabled={!tableLabel.trim() || generate.isPending}
              onClick={() => generate.mutate({ tableLabel: tableLabel.trim(), expiresInHours })}
            >
              {generate.isPending ? "Generiere…" : "QR-Code erstellen"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div id="qr-canvas-wrapper">
                <QRCanvas url={qrUrl!} size={240} />
                {/* Hidden canvas for download/print */}
                <canvas id="qr-download-canvas" style={{ display: "none" }} />
              </div>
              <p className="text-sm font-medium text-center">Tisch {tableLabel}</p>
              <p className="text-xs text-muted-foreground text-center break-all">{qrUrl}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1.5" />
                Download
              </Button>
              <Button variant="outline" className="flex-1" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1.5" />
                Drucken
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={handleClose}>
              Schliessen
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QrManagement() {
  const utils = trpc.useUtils();
  const [viewToken, setViewToken] = useState<string | null>(null);

  const sessionsQuery = trpc.qrOrder.listSessions.useQuery();

  const closeSession = trpc.qrOrder.closeSession.useMutation({
    onSuccess: () => {
      toast.success("Session geschlossen");
      utils.qrOrder.listSessions.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const sessions = sessionsQuery.data ?? [];
  type QrSession = typeof sessions[number];
  const activeSessions = sessions.filter((s: QrSession) => s.status !== "closed");
  const closedSessions = sessions.filter((s: QrSession) => s.status === "closed");

  function getStatusBadge(status: string) {
    if (status === "active") return <Badge variant="outline" className="text-blue-600 border-blue-300">Aktiv</Badge>;
    if (status === "ordered") return <Badge className="bg-green-100 text-green-700 border-green-300">Bestellt</Badge>;
    return <Badge variant="secondary">Geschlossen</Badge>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="h-6 w-6" />
            QR-Bestellung
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generieren Sie QR-Codes für Tische – Gäste können direkt vom Tisch bestellen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => utils.qrOrder.listSessions.invalidate()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <GenerateQrDialog onSuccess={() => utils.qrOrder.listSessions.invalidate()} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{activeSessions.length}</p>
            <p className="text-xs text-muted-foreground">Aktive Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{sessions.filter((s: QrSession) => s.status === "ordered").length}</p>
            <p className="text-xs text-muted-foreground">Bestellungen eingegangen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{closedSessions.length}</p>
            <p className="text-xs text-muted-foreground">Geschlossene Sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Active sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aktive QR-Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {sessionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : activeSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Keine aktiven Sessions. Generieren Sie einen QR-Code für einen Tisch.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tisch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead>Läuft ab</TableHead>
                  <TableHead className="w-24">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSessions.map((session: QrSession) => {
                  const qrUrl = `https://simplapos.com/guest/order/${session.token}`;
                  const isExpired = new Date(session.expiresAt) < new Date();
                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.tableLabel}</TableCell>
                      <TableCell>{getStatusBadge(isExpired ? "closed" : session.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(session.createdAt).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={isExpired ? "text-destructive" : "text-muted-foreground"}>
                          <Clock className="h-3 w-3 inline mr-1" />
                          {new Date(session.expiresAt).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 px-2"
                                onClick={() => setViewToken(session.token)}>
                                <QrCode className="h-3 w-3" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-xs">
                              <DialogHeader>
                                <DialogTitle>Tisch {session.tableLabel}</DialogTitle>
                              </DialogHeader>
                              <div className="flex flex-col items-center gap-3">
                                <QRCanvas url={qrUrl} size={220} />
                                <p className="text-xs text-muted-foreground text-center break-all">{qrUrl}</p>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => closeSession.mutate({ sessionId: session.id })}
                            disabled={closeSession.isPending}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Closed sessions (collapsed) */}
      {closedSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              Geschlossene Sessions ({closedSessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tisch</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead>Bestellung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedSessions.slice(0, 10).map((session: QrSession) => (
                  <TableRow key={session.id} className="opacity-60">
                    <TableCell className="font-medium">{session.tableLabel}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(session.createdAt).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {session.orderId ? `#${session.orderId}` : "–"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
