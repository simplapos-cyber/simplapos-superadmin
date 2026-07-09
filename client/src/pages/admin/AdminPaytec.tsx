/**
 * AdminPaytec.tsx
 * PayTec KIT REST Kartenterminal-Konfiguration und Zahlungshistorie
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
  Eye,
  EyeOff,
  AlertCircle,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaytecTransaction {
  id: number;
  amount: string;
  currency: string;
  status: string;
  terminalId: string;
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

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminPaytec() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [kitRestUrl, setKitRestUrl] = useState("https://kitrest.paytec.ch");
  const [terminalId, setTerminalId] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [tipEnabled, setTipEnabled] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Daten laden ──────────────────────────────────────────────────────────────
  const { data: config, refetch: refetchConfig } = trpc.paytec.getConfig.useQuery(undefined);
  const { data: transactions = [], refetch: refetchTx } = trpc.paytec.listTransactions.useQuery({ limit: 50 });

  // Konfiguration in Formularfelder laden (einmalig via useEffect)
  useEffect(() => {
    if (config && !configLoaded) {
      setKitRestUrl(config.kitRestUrl ?? "https://kitrest.paytec.ch");
      setTerminalId(config.terminalId ?? "");
      setTipEnabled(config.tipEnabled ?? false);
      setConfigLoaded(true);
    }
  }, [config, configLoaded]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const saveConfig = trpc.paytec.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("PayTec-Konfiguration gespeichert");
      refetchConfig();
    },
    onError: (err) => toast.error(err.message),
  });

  const testConnection = trpc.paytec.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        setTestResult({ ok: true, message: "Verbindung erfolgreich" });
        toast.success("PayTec-Verbindung erfolgreich");
      } else {
        setTestResult({ ok: false, message: data.error ?? "Verbindung fehlgeschlagen" });
        toast.error(`Verbindung fehlgeschlagen: ${data.error}`);
      }
    },
    onError: (err) => {
      setTestResult({ ok: false, message: err.message });
      toast.error(err.message);
    },
  });

  const handleSave = () => {
    if (!terminalId.trim()) {
      toast.error("Terminal-ID ist erforderlich");
      return;
    }
    saveConfig.mutate({
      kitRestUrl: kitRestUrl.trim() || "https://kitrest.paytec.ch",
      terminalId: terminalId.trim(),
      apiKey: apiKeyInput && !apiKeyInput.startsWith("****") ? apiKeyInput : undefined,
      tipEnabled,
      isActive: true,
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PayTec Kartenterminal</h1>
          <p className="text-sm text-gray-500">Schweizer KIT REST API – Kartenzahlungen direkt aus der Kasse</p>
        </div>
        {config && (
          <Badge className="ml-auto bg-green-100 text-green-700 border-green-200 border">
            <CheckCircle className="w-3 h-3 mr-1" />Konfiguriert
          </Badge>
        )}
      </div>

      <Tabs defaultValue="config">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="config" className="gap-1.5"><Settings className="w-4 h-4" />Konfiguration</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="w-4 h-4" />
            Zahlungshistorie
            {transactions.length > 0 && (
              <span className="ml-1 bg-gray-200 text-gray-700 text-xs px-1.5 py-0.5 rounded-full">{transactions.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Konfiguration ─────────────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">PayTec KIT REST Zugangsdaten</CardTitle>
              <CardDescription>
                Zugangsdaten erhältst du von PayTec direkt.{" "}
                <a href="https://kitrest.paytec.ch" target="_blank" rel="noopener noreferrer"
                  className="text-emerald-600 underline">KIT REST Dokumentation</a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* KIT REST URL */}
              <div className="space-y-1.5">
                <Label htmlFor="kitRestUrl">KIT REST API URL</Label>
                <Input
                  id="kitRestUrl"
                  type="url"
                  placeholder="https://kitrest.paytec.ch"
                  value={kitRestUrl}
                  onChange={(e) => setKitRestUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-400">Standard: https://kitrest.paytec.ch</p>
              </div>

              {/* Terminal ID */}
              <div className="space-y-1.5">
                <Label htmlFor="terminalId">Terminal-ID</Label>
                <Input
                  id="terminalId"
                  placeholder="z.B. TID-12345678"
                  value={terminalId}
                  onChange={(e) => setTerminalId(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-400">
                  Die Terminal-ID findest du auf dem Gerät oder im PayTec-Händlerportal
                </p>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <Label htmlFor="apiKey">API-Key (optional)</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showApiKey ? "text" : "password"}
                    placeholder={config ? "Gespeichert – neu eingeben zum Ändern" : "Optionaler Bearer Token"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Trinkgeld */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div>
                  <p className="text-sm font-medium text-gray-800">Trinkgeld-Option anzeigen</p>
                  <p className="text-xs text-gray-500">Gast kann Trinkgeld am Terminal wählen</p>
                </div>
                <Switch checked={tipEnabled} onCheckedChange={setTipEnabled} />
              </div>

              {/* Test-Verbindung Ergebnis */}
              {testResult && (
                <div className={`p-3 rounded-lg border flex items-center gap-2 text-sm ${
                  testResult.ok
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}>
                  {testResult.ok
                    ? <Wifi className="w-4 h-4 text-green-600 shrink-0" />
                    : <WifiOff className="w-4 h-4 text-red-600 shrink-0" />}
                  {testResult.message}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saveConfig.isPending}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saveConfig.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Speichern...</> : "Konfiguration speichern"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => testConnection.mutate()}
                  disabled={testConnection.isPending || !config}
                  className="gap-1.5"
                >
                  {testConnection.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <RefreshCw className="w-4 h-4" />}
                  Verbindung testen
                </Button>
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
                  "PayTec-Händlerkonto erstellen und Terminal (z.B. Yomani, Valina) bestellen",
                  "Im PayTec-Händlerportal die Terminal-ID und ggf. den API-Key abrufen",
                  "Terminal-ID und API-URL hier eintragen und speichern",
                  "Verbindung testen – bei Erfolg ist das Terminal einsatzbereit",
                  "In der Kasse beim Bezahlen auf «Am Terminal bezahlen (PayTec)» tippen",
                ].map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Info-Box: Schweizer Markt */}
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <Terminal className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-800">
                  <p className="font-semibold mb-1">PayTec – Schweizer Zahlungslösung</p>
                  <p>PayTec ist ein Schweizer Anbieter für Zahlungsterminals (Yomani, Valina, Artema). Die KIT REST API ermöglicht die direkte Integration in Kassensysteme. Unterstützte Karten: Visa, Mastercard, Maestro, PostFinance, TWINT.</p>
                </div>
              </div>
            </CardContent>
          </Card>
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
                <p className="text-sm mt-1">Kartenzahlungen über PayTec erscheinen hier</p>
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
                        <th className="text-left p-3 font-medium text-gray-600">Referenz</th>
                        <th className="text-left p-3 font-medium text-gray-600">Kellner</th>
                        <th className="text-left p-3 font-medium text-gray-600">Bestellung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(transactions as PaytecTransaction[]).map((tx) => (
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
                          <td className="p-3 font-mono text-xs text-gray-500">{tx.transactionRef}</td>
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
