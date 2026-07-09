/**
 * AdminSumup.tsx
 * SumUp Kartenterminal-Konfiguration und Zahlungshistorie
 */

import { useState } from "react";
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
  Wifi,
  WifiOff,
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
  Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SumupReader {
  id: string;
  name: string;
  status: string;
  model: string;
  identifier: string;
  isDefault: boolean;
}

interface SumupTransaction {
  id: number;
  amount: string;
  currency: string;
  status: string;
  readerName: string | null;
  initiatedByName: string | null;
  initiatedAt: Date | string;
  completedAt: Date | string | null;
  sumupTransactionCode: string | null;
  entryMode: string | null;
  tipAmount: string | null;
  orderId: number | null;
}

// ─── Status-Helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    paid: { label: "Bezahlt", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle className="w-3 h-3" /> },
    pending: { label: "Ausstehend", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock className="w-3 h-3" /> },
    failed: { label: "Fehlgeschlagen", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="w-3 h-3" /> },
    cancelled: { label: "Abgebrochen", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <XCircle className="w-3 h-3" /> },
    expired: { label: "Abgelaufen", color: "bg-orange-100 text-orange-700 border-orange-200", icon: <AlertCircle className="w-3 h-3" /> },
    refunded: { label: "Rückerstattet", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <RefreshCw className="w-3 h-3" /> },
  };
  const s = map[status] ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

function ReaderStatusBadge({ status }: { status: string }) {
  if (status === "paired") {
    return <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium"><Wifi className="w-3 h-3" />Verbunden</span>;
  }
  if (status === "processing") {
    return <span className="inline-flex items-center gap-1 text-xs text-yellow-600 font-medium"><Clock className="w-3 h-3" />Kopplung läuft</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium"><WifiOff className="w-3 h-3" />Nicht verbunden</span>;
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminSumup() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [merchantCode, setMerchantCode] = useState("");
  const [tipEnabled, setTipEnabled] = useState(false);
  const [defaultReaderId, setDefaultReaderId] = useState("");
  const [defaultReaderName, setDefaultReaderName] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);

  // ── Daten laden ──────────────────────────────────────────────────────────────
  const { data: config, refetch: refetchConfig } = trpc.sumup.getConfig.useQuery(undefined);

  // Konfiguration in Formularfelder laden (einmalig)
  if (config && !configLoaded) {
    setMerchantCode(config.merchantCode ?? "");
    setApiKeyInput(config.apiKey ?? "");
    setTipEnabled(config.tipEnabled ?? false);
    setDefaultReaderId(config.defaultReaderId ?? "");
    setDefaultReaderName(config.defaultReaderName ?? "");
    setConfigLoaded(true);
  }

  const { data: readers = [], refetch: refetchReaders, isLoading: readersLoading } = trpc.sumup.listReaders.useQuery();

  const { data: transactions = [], refetch: refetchTx } = trpc.sumup.listTransactions.useQuery({ limit: 50 });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const saveConfig = trpc.sumup.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("SumUp-Konfiguration gespeichert");
      refetchConfig();
      refetchReaders();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!merchantCode.trim()) {
      toast.error("Merchant Code ist erforderlich");
      return;
    }
    saveConfig.mutate({
      apiKey: apiKeyInput && !apiKeyInput.startsWith("****") ? apiKeyInput : undefined,
      merchantCode: merchantCode.trim(),
      defaultReaderId: defaultReaderId || undefined,
      defaultReaderName: defaultReaderName || undefined,
      tipEnabled,
      isActive: true,
    });
  };

  const handleSetDefault = (reader: SumupReader) => {
    setDefaultReaderId(reader.id);
    setDefaultReaderName(reader.name);
    toast.info(`"${reader.name}" als Standard-Terminal gesetzt`);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SumUp Kartenterminal</h1>
          <p className="text-sm text-gray-500">Kartenzahlungen direkt aus der Kasse auslösen</p>
        </div>
        {config?.hasApiKey && (
          <Badge className="ml-auto bg-green-100 text-green-700 border-green-200 border">
            <CheckCircle className="w-3 h-3 mr-1" />Konfiguriert
          </Badge>
        )}
      </div>

      <Tabs defaultValue="config">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="config" className="gap-1.5"><Settings className="w-4 h-4" />Konfiguration</TabsTrigger>
          <TabsTrigger value="terminals" className="gap-1.5"><Terminal className="w-4 h-4" />Terminals ({readers.length})</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History className="w-4 h-4" />Zahlungshistorie</TabsTrigger>
        </TabsList>

        {/* ── Tab: Konfiguration ─────────────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SumUp API-Zugangsdaten</CardTitle>
              <CardDescription>
                API-Key und Merchant Code findest du im{" "}
                <a href="https://me.sumup.com/settings/developer" target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 underline">SumUp Developer Dashboard</a>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* API Key */}
              <div className="space-y-1.5">
                <Label htmlFor="apiKey">API-Key (Bearer Token)</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showApiKey ? "text" : "password"}
                    placeholder={config?.hasApiKey ? "Gespeichert – neu eingeben zum Ändern" : "sup_sk_..."}
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
                <p className="text-xs text-gray-400">
                  Benötigte Scopes: <code className="bg-gray-100 px-1 rounded">readers.read</code>{" "}
                  <code className="bg-gray-100 px-1 rounded">readers.write</code>{" "}
                  <code className="bg-gray-100 px-1 rounded">transactions.history</code>
                </p>
              </div>

              {/* Merchant Code */}
              <div className="space-y-1.5">
                <Label htmlFor="merchantCode">Merchant Code</Label>
                <Input
                  id="merchantCode"
                  placeholder="z.B. MC0XXXXXXX"
                  value={merchantCode}
                  onChange={(e) => setMerchantCode(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-400">
                  Zu finden unter: SumUp App → Profil → Merchant Code
                </p>
              </div>

              {/* Standard-Terminal */}
              {defaultReaderId && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-blue-800">Standard-Terminal:</span>{" "}
                    <span className="text-blue-700">{defaultReaderName || defaultReaderId}</span>
                  </div>
                  <button
                    className="ml-auto text-xs text-blue-500 hover:text-blue-700"
                    onClick={() => { setDefaultReaderId(""); setDefaultReaderName(""); }}
                  >
                    Entfernen
                  </button>
                </div>
              )}

              {/* Trinkgeld */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div>
                  <p className="text-sm font-medium text-gray-800">Trinkgeld-Option anzeigen</p>
                  <p className="text-xs text-gray-500">Gast kann Trinkgeld am Terminal wählen (5%, 10%, 15%)</p>
                </div>
                <Switch checked={tipEnabled} onCheckedChange={setTipEnabled} />
              </div>

              <Button
                onClick={handleSave}
                disabled={saveConfig.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saveConfig.isPending ? "Speichern..." : "Konfiguration speichern"}
              </Button>
            </CardContent>
          </Card>

          {/* Anleitung */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-sm text-gray-600">Einrichtungsanleitung</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>SumUp-Konto erstellen und SumUp Solo Terminal kaufen</li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>Im SumUp Developer Dashboard einen API-Key erstellen (Scopes: readers + transactions)</li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>API-Key und Merchant Code hier eintragen und speichern</li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">4</span>Im Tab "Terminals" das gewünschte Terminal als Standard setzen</li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">5</span>In der Kasse beim Bezahlen auf "Kartenzahlung" tippen – Terminal zeigt Betrag an</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Terminals ─────────────────────────────────────────────────── */}
        <TabsContent value="terminals" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {config?.hasApiKey
                ? "Verbundene SumUp-Terminals"
                : "Bitte zuerst API-Key konfigurieren"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchReaders()}
              disabled={readersLoading}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${readersLoading ? "animate-spin" : ""}`} />
              Aktualisieren
            </Button>
          </div>

          {readers.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-gray-400">
                <Terminal className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Keine Terminals gefunden</p>
                <p className="text-sm mt-1">
                  {config?.hasApiKey
                    ? "Stelle sicher, dass dein SumUp Solo Terminal mit deinem Konto verbunden ist."
                    : "Konfiguriere zuerst deinen API-Key im Tab 'Konfiguration'."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {(readers as SumupReader[]).map((reader) => (
                <Card key={reader.id} className={`transition-all ${reader.isDefault ? "border-blue-300 bg-blue-50/30" : ""}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      reader.status === "paired" ? "bg-green-100" : "bg-gray-100"
                    }`}>
                      <Terminal className={`w-5 h-5 ${reader.status === "paired" ? "text-green-600" : "text-gray-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{reader.name}</p>
                        {reader.isDefault && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Standard</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <ReaderStatusBadge status={reader.status} />
                        <span className="text-xs text-gray-400">{reader.model} · {reader.identifier}</span>
                      </div>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{reader.id}</p>
                    </div>
                    {!reader.isDefault && reader.status === "paired" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(reader)}
                        className="gap-1 shrink-0"
                      >
                        <Star className="w-3.5 h-3.5" />
                        Als Standard
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Zahlungshistorie ──────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">Letzte 50 Kartenzahlungen</p>
            <Button variant="outline" size="sm" onClick={() => refetchTx()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Aktualisieren
            </Button>
          </div>

          {(transactions as SumupTransaction[]).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-gray-400">
                <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Noch keine Zahlungen</p>
                <p className="text-sm mt-1">Kartenzahlungen erscheinen hier nach dem ersten Bezahlvorgang.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(transactions as SumupTransaction[]).map((tx) => (
                <Card key={tx.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      tx.status === "paid" ? "bg-green-100" :
                      tx.status === "pending" ? "bg-yellow-100" :
                      "bg-red-100"
                    }`}>
                      <CreditCard className={`w-4 h-4 ${
                        tx.status === "paid" ? "text-green-600" :
                        tx.status === "pending" ? "text-yellow-600" :
                        "text-red-500"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">
                          {parseFloat(tx.amount).toFixed(2)} {tx.currency}
                        </span>
                        <StatusBadge status={tx.status} />
                        {tx.orderId && (
                          <span className="text-xs text-gray-400">Bestellung #{tx.orderId}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                        <span>{tx.readerName ?? "Unbekanntes Terminal"}</span>
                        {tx.entryMode && <span>{tx.entryMode}</span>}
                        {tx.sumupTransactionCode && (
                          <span className="font-mono">{tx.sumupTransactionCode}</span>
                        )}
                        {tx.tipAmount && parseFloat(tx.tipAmount) > 0 && (
                          <span className="text-green-600">+{parseFloat(tx.tipAmount).toFixed(2)} Trinkgeld</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">
                        {new Date(tx.initiatedAt).toLocaleString("de-CH", {
                          day: "2-digit", month: "2-digit", year: "2-digit",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                      {tx.initiatedByName && (
                        <p className="text-xs text-gray-400">{tx.initiatedByName}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
