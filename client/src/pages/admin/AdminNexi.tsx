/**
 * AdminNexi.tsx
 * Nexi/Concardis Kartenterminal-Konfiguration und Zahlungshistorie
 * Protokoll: ZVT-LAN (TCP) – manuelle Bestätigung für Cloud-Umgebung
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Settings,
  History,
  Terminal,
  AlertCircle,
  Info,
  Loader2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NexiTransaction {
  id: number;
  amount: string;
  currency: string;
  status: string;
  terminalIp: string;
  transactionRef: string;
  authCode: string | null;
  cardType: string | null;
  maskedPan: string | null;
  tipAmount: string | null;
  initiatedByName: string | null;
  initiatedAt: Date | string;
  completedAt: Date | string | null;
  orderId: number | null;
  errorMessage: string | null;
}

// ─── Status-Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    approved: { label: "Genehmigt", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle className="w-3 h-3" /> },
    pending: { label: "Ausstehend", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock className="w-3 h-3" /> },
    declined: { label: "Abgelehnt", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="w-3 h-3" /> },
    cancelled: { label: "Abgebrochen", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <XCircle className="w-3 h-3" /> },
    error: { label: "Fehler", color: "bg-orange-100 text-orange-700 border-orange-200", icon: <AlertCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

function formatDate(d: Date | string | null): string {
  if (!d) return "–";
  return new Date(d).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Pending-Transaktionen-Karte ──────────────────────────────────────────────

function PendingTransactionCard({
  tx,
  onConfirm,
  onDecline,
}: {
  tx: NexiTransaction;
  onConfirm: (id: number) => void;
  onDecline: (id: number) => void;
}) {
  const [authCode, setAuthCode] = useState("");
  const [cardType, setCardType] = useState("");

  return (
    <Card className="border-yellow-300 bg-yellow-50">
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <p className="font-semibold text-yellow-900">Ausstehende Zahlung</p>
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 border text-xs">
                Manuelle Bestätigung erforderlich
              </Badge>
            </div>
            <p className="text-sm text-yellow-800 mb-1">
              <span className="font-bold">{parseFloat(tx.amount).toFixed(2)} {tx.currency}</span>
              {tx.orderId && <span className="ml-2 text-yellow-600">Bestellung #{tx.orderId}</span>}
            </p>
            <p className="text-xs text-yellow-600 mb-3">
              Gestartet: {formatDate(tx.initiatedAt)} · Ref: {tx.transactionRef}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <Label className="text-xs text-yellow-700">Autorisierungscode (optional)</Label>
                <Input
                  placeholder="z.B. 123456"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="h-8 text-sm font-mono mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-yellow-700">Kartentyp (optional)</Label>
                <Input
                  placeholder="z.B. Visa, Mastercard"
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={() => onConfirm(tx.id)}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                Terminal hat akzeptiert
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 gap-1.5"
                onClick={() => onDecline(tx.id)}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                Abgelehnt / Abgebrochen
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminNexi() {
  const [terminalIp, setTerminalIp] = useState("");
  const [terminalPort, setTerminalPort] = useState("20007");
  const [merchantId, setMerchantId] = useState("");
  const [protocol, setProtocol] = useState<"zvt_lan" | "opi" | "rest">("zvt_lan");
  const [tipEnabled, setTipEnabled] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // ── Daten laden ──────────────────────────────────────────────────────────────
  const { data: config, refetch: refetchConfig } = trpc.nexi.getConfig.useQuery(undefined);
  const { data: transactions = [], refetch: refetchTx } = trpc.nexi.listTransactions.useQuery({ limit: 50 });

  const pendingTransactions = (transactions as NexiTransaction[]).filter((t) => t.status === "pending");

  // Konfiguration in Formularfelder laden (einmalig via useEffect)
  useEffect(() => {
    if (config && !configLoaded) {
      setTerminalIp(config.terminalIp ?? "");
      setTerminalPort(String(config.terminalPort ?? 20007));
      setMerchantId(config.merchantId ?? "");
      setProtocol((config.protocol as "zvt_lan" | "opi" | "rest") ?? "zvt_lan");
      setTipEnabled(config.tipEnabled ?? false);
      setConfigLoaded(true);
    }
  }, [config, configLoaded]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const saveConfig = trpc.nexi.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Nexi-Konfiguration gespeichert");
      refetchConfig();
    },
    onError: (err) => toast.error(err.message),
  });

  const confirmPayment = trpc.nexi.confirmPayment.useMutation({
    onSuccess: () => {
      toast.success("Zahlung als genehmigt markiert");
      refetchTx();
    },
    onError: (err) => toast.error(err.message),
  });

  const declinePayment = trpc.nexi.declinePayment.useMutation({
    onSuccess: () => {
      toast.info("Zahlung als abgelehnt markiert");
      refetchTx();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!terminalIp.trim()) {
      toast.error("Terminal-IP ist erforderlich");
      return;
    }
    const port = parseInt(terminalPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error("Ungültiger Port (1–65535)");
      return;
    }
    saveConfig.mutate({
      terminalIp: terminalIp.trim(),
      terminalPort: port,
      merchantId: merchantId.trim() || undefined,
      protocol,
      tipEnabled,
      isActive: true,
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nexi / Concardis Terminal</h1>
          <p className="text-sm text-gray-500">ZVT-LAN Protokoll – Kartenzahlungen über LAN-Terminal</p>
        </div>
        {config && (
          <Badge className="ml-auto bg-green-100 text-green-700 border-green-200 border">
            <CheckCircle className="w-3 h-3 mr-1" />Konfiguriert
          </Badge>
        )}
      </div>

      {/* Ausstehende Zahlungen – Banner */}
      {pendingTransactions.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-800 font-medium">
            {pendingTransactions.length} ausstehende Zahlung{pendingTransactions.length > 1 ? "en" : ""} – manuelle Bestätigung erforderlich
          </p>
          <Button variant="outline" size="sm" className="ml-auto border-yellow-400 text-yellow-700 hover:bg-yellow-100"
            onClick={() => document.getElementById("pending-tab")?.click()}>
            Anzeigen
          </Button>
        </div>
      )}

      <Tabs defaultValue="config">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="config" className="gap-1.5"><Settings className="w-4 h-4" />Konfiguration</TabsTrigger>
          <TabsTrigger id="pending-tab" value="pending" className="gap-1.5">
            <Clock className="w-4 h-4" />
            Ausstehend
            {pendingTransactions.length > 0 && (
              <span className="ml-1 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingTransactions.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="w-4 h-4" />
            Zahlungshistorie
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Konfiguration ─────────────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Terminal-Verbindung</CardTitle>
              <CardDescription>
                IP-Adresse und Port des Nexi/Concardis-Terminals im lokalen Netzwerk
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Terminal IP + Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="terminalIp">Terminal IP-Adresse</Label>
                  <Input
                    id="terminalIp"
                    placeholder="z.B. 192.168.1.100"
                    value={terminalIp}
                    onChange={(e) => setTerminalIp(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="terminalPort">Port</Label>
                  <Input
                    id="terminalPort"
                    placeholder="20007"
                    value={terminalPort}
                    onChange={(e) => setTerminalPort(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Standard-Port für ZVT-LAN: 20007. Die IP-Adresse findest du im Terminal-Menü unter «Netzwerk».
              </p>

              {/* Merchant ID */}
              <div className="space-y-1.5">
                <Label htmlFor="merchantId">Händler-ID (optional)</Label>
                <Input
                  id="merchantId"
                  placeholder="z.B. 123456789"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              {/* Protokoll */}
              <div className="space-y-1.5">
                <Label>Kommunikationsprotokoll</Label>
                <Select value={protocol} onValueChange={(v) => setProtocol(v as "zvt_lan" | "opi" | "rest")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zvt_lan">ZVT-LAN (Standard, TCP Port 20007)</SelectItem>
                    <SelectItem value="opi">OPI (XML über TCP)</SelectItem>
                    <SelectItem value="rest">REST API</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                  ZVT-LAN ist das Standardprotokoll für Nexi/Concardis-Terminals in der Schweiz
                </p>
              </div>

              {/* Trinkgeld */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div>
                  <p className="text-sm font-medium text-gray-800">Trinkgeld-Option anzeigen</p>
                  <p className="text-xs text-gray-500">Gast kann Trinkgeld am Terminal wählen</p>
                </div>
                <Switch checked={tipEnabled} onCheckedChange={setTipEnabled} />
              </div>

              <Button
                onClick={handleSave}
                disabled={saveConfig.isPending}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                {saveConfig.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Speichern...</> : "Konfiguration speichern"}
              </Button>
            </CardContent>
          </Card>

          {/* Info-Box: Manuelle Bestätigung */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">Manuelle Bestätigung (Cloud-Modus)</p>
                  <p className="mb-2">
                    Da Nexi-Terminals über ZVT-LAN (TCP) kommunizieren und der Kassensserver in der Cloud läuft, kann die Zahlung nicht vollautomatisch bestätigt werden. Der Ablauf ist:
                  </p>
                  <ol className="space-y-1 list-decimal list-inside text-blue-700">
                    <li>Kellner tippt «Am Terminal bezahlen (Nexi)» in der Kasse</li>
                    <li>Betrag wird am Terminal angezeigt (manuell eingeben oder Kasse zeigt Betrag)</li>
                    <li>Gast zahlt am Terminal</li>
                    <li>Kellner bestätigt in der Kasse: «Terminal hat akzeptiert»</li>
                  </ol>
                  <p className="mt-2 text-xs text-blue-600">
                    Für vollautomatische Integration: lokale Bridge-App im Restaurant-LAN installieren (kommt in zukünftiger Version).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Einrichtungsanleitung */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-sm text-gray-600">Einrichtungsanleitung</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-gray-600">
                {[
                  "Nexi/Concardis-Terminal im Restaurant-LAN verbinden (LAN-Kabel oder WLAN)",
                  "Im Terminal-Menü die IP-Adresse ablesen (Netzwerk → IP-Adresse)",
                  "IP-Adresse und Port (Standard: 20007) hier eintragen und speichern",
                  "In der Kasse beim Bezahlen auf «Am Terminal bezahlen (Nexi)» tippen",
                  "Nach Zahlung am Terminal: Bestätigung in der Kasse eingeben",
                ].map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Ausstehende Zahlungen ────────────────────────────────────── */}
        <TabsContent value="pending" className="mt-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500">
              Zahlungen, die am Terminal noch bestätigt werden müssen
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchTx()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />Aktualisieren
            </Button>
          </div>

          {pendingTransactions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-gray-400">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Keine ausstehenden Zahlungen</p>
                <p className="text-sm mt-1">Alle Nexi-Zahlungen sind abgeschlossen</p>
              </CardContent>
            </Card>
          ) : (
            pendingTransactions.map((tx) => (
              <PendingTransactionCard
                key={tx.id}
                tx={tx}
                onConfirm={(id) => confirmPayment.mutate({ transactionId: id })}
                onDecline={(id) => declinePayment.mutate({ transactionId: id })}
              />
            ))
          )}
        </TabsContent>

        {/* ── Tab: Zahlungshistorie ──────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">Letzte {transactions.length} Transaktionen</p>
            <Button variant="outline" size="sm" onClick={() => refetchTx()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />Aktualisieren
            </Button>
          </div>

          {transactions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-gray-400">
                <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Noch keine Transaktionen</p>
                <p className="text-sm mt-1">Kartenzahlungen über Nexi erscheinen hier</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-medium text-gray-600">Datum</th>
                        <th className="text-left p-3 font-medium text-gray-600">Betrag</th>
                        <th className="text-left p-3 font-medium text-gray-600">Status</th>
                        <th className="text-left p-3 font-medium text-gray-600">Karte</th>
                        <th className="text-left p-3 font-medium text-gray-600">Auth-Code</th>
                        <th className="text-left p-3 font-medium text-gray-600">Kellner</th>
                        <th className="text-left p-3 font-medium text-gray-600">Bestellung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(transactions as NexiTransaction[]).map((tx) => (
                        <tr key={tx.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="p-3 text-gray-600 whitespace-nowrap">{formatDate(tx.initiatedAt)}</td>
                          <td className="p-3 font-semibold text-gray-900">
                            {parseFloat(tx.amount).toFixed(2)} {tx.currency}
                            {tx.tipAmount && parseFloat(tx.tipAmount) > 0 && (
                              <span className="ml-1 text-xs text-gray-400">(+{parseFloat(tx.tipAmount).toFixed(2)} TG)</span>
                            )}
                          </td>
                          <td className="p-3"><StatusBadge status={tx.status} /></td>
                          <td className="p-3 text-gray-600">
                            {tx.cardType && <span className="font-medium">{tx.cardType}</span>}
                            {tx.maskedPan && <span className="ml-1 text-gray-400 font-mono text-xs">{tx.maskedPan}</span>}
                            {!tx.cardType && !tx.maskedPan && "–"}
                          </td>
                          <td className="p-3 font-mono text-xs text-gray-500">{tx.authCode ?? "–"}</td>
                          <td className="p-3 text-gray-600">{tx.initiatedByName ?? "–"}</td>
                          <td className="p-3 text-gray-500">{tx.orderId ? `#${tx.orderId}` : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
