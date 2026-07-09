import { useState, lazy, Suspense, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
const LoyaltyStatsCharts = lazy(() => import("./LoyaltyStatsCharts"));
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";
import {
  Star, Users, Gift, Settings, TrendingUp, Award,
  Plus, Edit2, Trash2, Search, Crown, Medal, Shield,
  Copy, ExternalLink, BarChart2, QrCode, Download, Bell,
} from "lucide-react";

const TIER_CONFIG = {
  bronze: { label: "Bronze", icon: Medal, bg: "bg-amber-900/20", text: "text-amber-600" },
  silver: { label: "Silber", icon: Shield, bg: "bg-gray-500/20", text: "text-gray-400" },
  gold: { label: "Gold", icon: Award, bg: "bg-yellow-500/20", text: "text-yellow-500" },
  platinum: { label: "Platin", icon: Crown, bg: "bg-purple-500/20", text: "text-purple-400" },
};

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_CONFIG[tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

const DEFAULT_TIERS = [
  { name: "bronze", minPoints: 0, multiplier: 1.0, color: "#cd7f32", label: "Bronze" },
  { name: "silver", minPoints: 500, multiplier: 1.25, color: "#9ca3af", label: "Silber" },
  { name: "gold", minPoints: 2000, multiplier: 1.5, color: "#f59e0b", label: "Gold" },
  { name: "platinum", minPoints: 5000, multiplier: 2.0, color: "#8b5cf6", label: "Platin" },
];

function AdminLoyaltyInner() {
  
  const [activeTab, setActiveTab] = useState("overview");
  const [customerSearch, setCustomerSearch] = useState("");
  const [adjustDialog, setAdjustDialog] = useState<{ open: boolean; customer: any | null }>({ open: false, customer: null });
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [rewardDialog, setRewardDialog] = useState<{ open: boolean; reward: any | null }>({ open: false, reward: null });
  const [qrDialog, setQrDialog] = useState(false);
  const [pushDialog, setPushDialog] = useState(false);
  const [customerDetailDialog, setCustomerDetailDialog] = useState<{ open: boolean; customer: any | null }>({ open: false, customer: null });
  const [customerEdit, setCustomerEdit] = useState<{ firstName: string; lastName: string; phone: string; birthMonth: string; birthDay: string }>({ firstName: "", lastName: "", phone: "", birthMonth: "", birthDay: "" });
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  // Immer die öffentliche Domain verwenden, damit Gäste-Links auf simplapos.com zeigen
  const [qrOrigin] = useState(() => "https://simplapos.com");
  const [programForm, setProgramForm] = useState<any>(null);

  const { data: program, refetch: refetchProgram } = trpc.loyalty.getProgram.useQuery();
  const { data: stats } = trpc.loyalty.getStats.useQuery();
  const { data: customersData, refetch: refetchCustomers } = trpc.loyalty.listCustomers.useQuery({ limit: 50, offset: 0 });
  const { data: rewards, refetch: refetchRewards } = trpc.loyalty.listRewards.useQuery();
  const { data: qrData } = trpc.loyalty.getRegistrationQr.useQuery({ origin: qrOrigin }, { enabled: qrDialog });
  const { data: pushCount } = trpc.loyalty.getPushSubscriptionCount.useQuery();
  const sendPushMutation = trpc.loyalty.sendPushNotification.useMutation({
    onSuccess: (result) => {
      toast.success(`Push gesendet: ${result.sent} erfolgreich, ${result.failed} fehlgeschlagen`);
      setPushDialog(false);
      setPushTitle("");
      setPushBody("");
    },
    onError: (e) => toast.error(e.message),
  });

  // Normalisiere program clientseitig: verhindert React Error #301 wenn DB-Felder als Objekte (Decimal, Date) ankommen
  const normalizedProgram = useMemo(() => {
    if (!program) return null;
    let tiers: any[] = DEFAULT_TIERS;
    if (program.tiers) {
      if (Array.isArray(program.tiers)) tiers = program.tiers;
      else if (typeof program.tiers === "string") {
        try { tiers = JSON.parse(program.tiers as string); } catch { tiers = DEFAULT_TIERS; }
      }
    }
    return {
      ...program,
      pointsPerChf: String(program.pointsPerChf ?? "1.00"),
      pointsPerRedemptionChf: String(program.pointsPerRedemptionChf ?? "100.00"),
      minRedemptionPoints: Number(program.minRedemptionPoints ?? 100),
      maxRedemptionPercent: Number(program.maxRedemptionPercent ?? 50),
      welcomeBonus: Number(program.welcomeBonus ?? 50),
      birthdayBonus: Number(program.birthdayBonus ?? 100),
      expiryMonths: Number(program.expiryMonths ?? 24),
      tiers,
      name: String(program.name ?? ""),
      privacyText: String(program.privacyText ?? ""),
      primaryColor: String(program.primaryColor ?? "#7c3aed"),
    };
  }, [program]);

  const effectiveProgram = programForm ?? normalizedProgram;

  const saveProgramMutation = trpc.loyalty.saveProgram.useMutation({
    onSuccess: () => { toast.success("Gespeichert"); refetchProgram(); setProgramForm(null); },
    onError: (e) => toast.error(e.message),
  });

  const adjustMutation = trpc.loyalty.adjustPoints.useMutation({
    onSuccess: (data) => {
      toast.success(`Punkte angepasst – Neues Guthaben: ${data.newBalance} Punkte`);
      setAdjustDialog({ open: false, customer: null });
      refetchCustomers();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveRewardMutation = trpc.loyalty.saveReward.useMutation({
    onSuccess: () => { toast.success("Prämie gespeichert"); setRewardDialog({ open: false, reward: null }); refetchRewards(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteRewardMutation = trpc.loyalty.deleteReward.useMutation({
    onSuccess: () => { toast.success("Prämie gelöscht"); refetchRewards(); },
    onError: (e) => toast.error(e.message),
  });

  const updateCustomerMutation = trpc.loyalty.updateCustomer.useMutation({
    onSuccess: () => {
      toast.success("Kundendaten gespeichert");
      setCustomerDetailDialog({ open: false, customer: null });
      refetchCustomers();
    },
    onError: (e) => toast.error(e.message),
  });

  function updateForm(key: string, value: any) {
    setProgramForm((prev: any) => ({ ...(prev ?? program ?? {}), [key]: value }));
  }

  function handleSaveProgram() {
    if (!effectiveProgram) return;
    saveProgramMutation.mutate({
      name: effectiveProgram.name,
      isActive: effectiveProgram.isActive,
      pointsPerChf: parseFloat(effectiveProgram.pointsPerChf),
      pointsPerRedemptionChf: parseFloat(effectiveProgram.pointsPerRedemptionChf),
      minRedemptionPoints: effectiveProgram.minRedemptionPoints,
      maxRedemptionPercent: effectiveProgram.maxRedemptionPercent,
      welcomeBonus: effectiveProgram.welcomeBonus,
      birthdayBonus: effectiveProgram.birthdayBonus,
      tiers: effectiveProgram.tiers ?? DEFAULT_TIERS,
      expiryMonths: effectiveProgram.expiryMonths,
      privacyText: effectiveProgram.privacyText,
      primaryColor: effectiveProgram.primaryColor,
    });
  }

  // Gäste-Links immer auf die öffentliche Domain simplapos.com zeigen lassen
  const cardUrl = (token: string) => `https://simplapos.com/loyalty/${token}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-yellow-500" />
            Treueprogramm
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Kunden binden · Besuche steigern · Umsatz erhöhen</p>
        </div>
        <Badge variant={effectiveProgram?.isActive ? "default" : "secondary"} className="px-3 py-1">
          {effectiveProgram?.isActive ? "Aktiv" : "Inaktiv"}
        </Badge>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Kunden", value: Number(stats.totalCustomers ?? 0).toLocaleString("de-CH"), icon: Users, color: "text-blue-500" },
            { label: "Punkte vergeben", value: Number(stats.totalPointsIssued ?? 0).toLocaleString("de-CH"), icon: TrendingUp, color: "text-green-500" },
            { label: "Punkte eingelöst", value: Number(stats.totalPointsRedeemed ?? 0).toLocaleString("de-CH"), icon: Gift, color: "text-purple-500" },
            { label: "Einlösungsrate", value: Number(stats.totalPointsIssued ?? 0) > 0 ? `${Math.round((Number(stats.totalPointsRedeemed ?? 0) / Number(stats.totalPointsIssued ?? 1)) * 100)}%` : "0%", icon: Star, color: "text-yellow-500" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold">{s.value}</p>
                  </div>
                  <s.icon className={`h-8 w-8 ${s.color} opacity-70`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="overview"><Settings className="h-4 w-4 mr-1" />Einstellungen</TabsTrigger>
          <TabsTrigger value="customers"><Users className="h-4 w-4 mr-1" />Kunden</TabsTrigger>
          <TabsTrigger value="rewards"><Gift className="h-4 w-4 mr-1" />Prämien</TabsTrigger>
          <TabsTrigger value="stats"><BarChart2 className="h-4 w-4 mr-1" />Statistiken</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Programm-Einstellungen</CardTitle>
              <CardDescription>Konfigurieren Sie Ihr Treueprogramm. Änderungen gelten sofort für neue Transaktionen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium">Treueprogramm aktivieren</p>
                  <p className="text-sm text-muted-foreground">Kunden können sich registrieren und Punkte sammeln</p>
                </div>
                <Switch checked={effectiveProgram?.isActive ?? false} onCheckedChange={(v) => updateForm("isActive", v)} />
              </div>

              <div className="space-y-2">
                <Label>Programmname</Label>
                <Input value={effectiveProgram?.name ?? ""} onChange={(e) => updateForm("name", e.target.value)} placeholder="z.B. Stammgast-Club" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Punkte pro CHF</Label>
                  <Input type="number" min="0.1" step="0.1" value={effectiveProgram?.pointsPerChf ?? "1.00"} onChange={(e) => updateForm("pointsPerChf", e.target.value)} />
                  <p className="text-xs text-muted-foreground">z.B. 1 = 1 Punkt pro CHF Umsatz</p>
                </div>
                <div className="space-y-2">
                  <Label>Punkte für CHF 1 Rabatt</Label>
                  <Input type="number" min="1" value={effectiveProgram?.pointsPerRedemptionChf ?? "100"} onChange={(e) => updateForm("pointsPerRedemptionChf", e.target.value)} />
                  <p className="text-xs text-muted-foreground">z.B. 100 = 100 Punkte = CHF 1.00</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mindestpunkte zum Einlösen</Label>
                  <Input type="number" min="1" value={effectiveProgram?.minRedemptionPoints ?? 100} onChange={(e) => updateForm("minRedemptionPoints", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Max. Einlösungs-Anteil pro Rechnung (%)</Label>
                  <Input type="number" min="1" max="100" value={effectiveProgram?.maxRedemptionPercent ?? 50} onChange={(e) => updateForm("maxRedemptionPercent", parseInt(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Willkommens-Bonus (Punkte)</Label>
                  <Input type="number" min="0" value={effectiveProgram?.welcomeBonus ?? 50} onChange={(e) => updateForm("welcomeBonus", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Geburtstags-Bonus (Punkte)</Label>
                  <Input type="number" min="0" value={effectiveProgram?.birthdayBonus ?? 100} onChange={(e) => updateForm("birthdayBonus", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Punkte-Ablauf (Monate Inaktivität)</Label>
                  <Input type="number" min="0" value={effectiveProgram?.expiryMonths ?? 24} onChange={(e) => updateForm("expiryMonths", parseInt(e.target.value))} />
                  <p className="text-xs text-muted-foreground">0 = kein Ablauf</p>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Stufen-System (Multiplikator für Punkte-Sammeln)</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(effectiveProgram?.tiers ?? DEFAULT_TIERS).map((tier: any, idx: number) => (
                    <div key={tier.name} className="border rounded-lg p-3 space-y-2">
                      <TierBadge tier={tier.name} />
                      <div>
                        <p className="text-xs text-muted-foreground">Ab Punkten</p>
                        <Input type="number" min="0" className="h-7 text-xs" value={tier.minPoints}
                          onChange={(e) => {
                            const tiers = [...(effectiveProgram?.tiers ?? DEFAULT_TIERS)];
                            tiers[idx] = { ...tiers[idx], minPoints: parseInt(e.target.value) };
                            updateForm("tiers", tiers);
                          }} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Multiplikator</p>
                        <Input type="number" min="1" step="0.05" className="h-7 text-xs" value={tier.multiplier}
                          onChange={(e) => {
                            const tiers = [...(effectiveProgram?.tiers ?? DEFAULT_TIERS)];
                            tiers[idx] = { ...tiers[idx], multiplier: parseFloat(e.target.value) };
                            updateForm("tiers", tiers);
                          }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Datenschutz-Einwilligungstext (DSGVO/CH DSG)</Label>
                <Textarea rows={3} value={effectiveProgram?.privacyText ?? ""}
                  onChange={(e) => updateForm("privacyText", e.target.value)}
                  placeholder="Ich stimme der Verarbeitung meiner Daten für das Treueprogramm gemäss Datenschutzerklärung zu." />
                <p className="text-xs text-muted-foreground">Pflichtfeld für DSGVO-Konformität. Wird beim Registrierungsformular angezeigt.</p>
              </div>

              <Button onClick={handleSaveProgram} disabled={saveProgramMutation.isPending}>
                {saveProgramMutation.isPending ? "Speichern..." : "Einstellungen speichern"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Name, E-Mail oder Telefon..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
            </div>
            <p className="text-sm text-muted-foreground">{customersData?.total ?? 0} Kunden</p>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Kunde</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Stufe</th>
                  <th className="text-right px-4 py-2 font-medium">Punkte</th>
                  <th className="text-right px-4 py-2 font-medium hidden md:table-cell">Lifetime</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(customersData?.customers ?? []).length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Noch keine Kunden registriert</td></tr>
                )}
                {(customersData?.customers ?? []).map((c: any) => (
                  <tr key={c.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.firstName} {c.lastName}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell"><TierBadge tier={c.tier} /></td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{Number(c.totalPoints ?? 0).toLocaleString("de-CH")}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{Number(c.lifetimePoints ?? 0).toLocaleString("de-CH")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Treuekarte öffnen" onClick={() => window.open(cardUrl(c.token), "_blank")}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Link kopieren"
                          onClick={() => { navigator.clipboard.writeText(cardUrl(c.token)); toast.success("Link kopiert"); }}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Kundendaten bearbeiten"
                          onClick={() => {
                            setCustomerDetailDialog({ open: true, customer: c });
                            setCustomerEdit({
                              firstName: c.firstName ?? "",
                              lastName: c.lastName ?? "",
                              phone: c.phone ?? "",
                              birthMonth: c.birthMonth ? String(c.birthMonth) : "",
                              birthDay: c.birthDay ? String(c.birthDay) : "",
                            });
                          }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="rewards" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{(rewards ?? []).length} Prämien</p>
            <Button size="sm" onClick={() => setRewardDialog({ open: true, reward: null })}>
              <Plus className="h-4 w-4 mr-1" />Neue Prämie
            </Button>
          </div>
          <div className="space-y-2">
            {(rewards ?? []).length === 0 && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Noch keine Prämien. Erstellen Sie Prämien, die Kunden mit Punkten einlösen können.</CardContent></Card>
            )}
            {(rewards ?? []).map((r: any) => (
              <Card key={r.id}>
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Gift className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {Number(r.pointsCost ?? 0).toLocaleString("de-CH")} Punkte
                        {r.value && ` · CHF ${parseFloat(r.value).toFixed(2)}`}
                        {r.minTier && <> · <TierBadge tier={r.minTier} /></>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.isActive ? "default" : "secondary"} className="text-xs">{r.isActive ? "Aktiv" : "Inaktiv"}</Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRewardDialog({ open: true, reward: r })}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteRewardMutation.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        {/* ── Statistiken-Tab ─────────────────────────────────────────────── */}
        <TabsContent value="stats" className="space-y-6 mt-4">
          {/* QR-Code-Button und Push-Button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPushDialog(true)}>
              <Bell className="h-4 w-4 mr-2" />Push senden
              {pushCount && pushCount.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs">{pushCount.count}</span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQrDialog(true)}>
              <QrCode className="h-4 w-4 mr-2" />QR-Code Registrierung
            </Button>
          </div>

          {stats ? (
            <>
              {/* KPI-Karten erweitert */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Aktive Mitglieder", value: Number(stats.totalCustomers ?? 0).toLocaleString("de-CH"), icon: Users, color: "text-blue-500", sub: "registrierte Kunden" },
                  { label: "Punkte vergeben", value: Number(stats.totalPointsIssued ?? 0).toLocaleString("de-CH"), icon: TrendingUp, color: "text-green-500", sub: "gesamt" },
                  { label: "Einlösungsrate", value: `${Number(stats.redemptionRate ?? 0)}%`, icon: Star, color: "text-yellow-500", sub: "der Punkte eingelöst" },
                  { label: "Umsatz-Einfluss", value: `CHF ${Number(stats.revenueImpactChf ?? 0).toLocaleString("de-CH")}`, icon: Award, color: "text-purple-500", sub: "Rabatte gewährt" },
                ].map((s) => (
                  <Card key={s.label}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                          <p className="text-2xl font-bold">{s.value}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
                        </div>
                        <s.icon className={`h-8 w-8 ${s.color} opacity-70`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {/* Charts – lazy geladen damit iOS Safari nicht crasht */}
              <Suspense fallback={<Card><CardContent className="py-8 text-center text-muted-foreground">Lade Charts...</CardContent></Card>}>
                <LoyaltyStatsCharts stats={{
                  tierDistribution: (stats as any).tierCounts,
                  topCustomers: (stats as any).topCustomers,
                  newMembersTrend: (stats as any).newMembersTrend,
                  pointsTrend: (stats as any).pointsTrend,
                }} />
              </Suspense>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Lade Statistiken...</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {/* QR-Code Dialog */}
      <Dialog open={qrDialog} onOpenChange={setQrDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />QR-Code Registrierung</DialogTitle></DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">Drucke diesen QR-Code aus und stelle ihn am Tisch auf. Kunden scannen ihn und registrieren sich direkt für dein Treueprogramm.</p>
            {qrData ? (
              <>
                <img src={qrData.qrDataUrl} alt="QR-Code" className="mx-auto w-48 h-48 rounded-lg border" />
                <p className="text-xs text-muted-foreground break-all">{qrData.registrationUrl}</p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(qrData.registrationUrl); toast.success("Link kopiert"); }}>
                    <Copy className="h-4 w-4 mr-1" />Link kopieren
                  </Button>
                  <Button size="sm" onClick={() => {
                    const a = document.createElement("a");
                    a.href = qrData.qrDataUrl;
                    a.download = "treueprogramm-qr.png";
                    a.click();
                  }}>
                    <Download className="h-4 w-4 mr-1" />PNG herunterladen
                  </Button>
                </div>
              </>
            ) : (
              <div className="w-48 h-48 mx-auto rounded-lg bg-muted animate-pulse" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Push-Benachrichtigungs-Dialog */}
      <Dialog open={pushDialog} onOpenChange={setPushDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-violet-500" />
              Push-Benachrichtigung senden
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              {pushCount?.count ?? 0} Kunden haben Benachrichtigungen aktiviert.
            </div>
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input
                placeholder="z.B. Neue Prämie verfügbar!"
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Nachricht</Label>
              <Textarea
                placeholder="z.B. Jetzt 200 Punkte gegen einen Gratis-Kaffee einlösen."
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPushDialog(false)}>Abbrechen</Button>
            <Button
              onClick={() => sendPushMutation.mutate({ title: pushTitle, body: pushBody })}
              disabled={!pushTitle.trim() || !pushBody.trim() || sendPushMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {sendPushMutation.isPending ? "Sende..." : "Senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Punkte-Anpassungs-Dialog */}
      <Dialog open={adjustDialog.open} onOpenChange={(o) => !o && setAdjustDialog({ open: false, customer: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Punkte anpassen</DialogTitle></DialogHeader>
          {adjustDialog.customer && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-medium">{adjustDialog.customer.firstName} {adjustDialog.customer.lastName}</p>
                <p className="text-sm text-muted-foreground">Aktuell: {Number(adjustDialog.customer.totalPoints ?? 0).toLocaleString("de-CH")} Punkte</p>
              </div>
              <div className="space-y-2">
                <Label>Punkte (+ gutschreiben / − abziehen)</Label>
                <Input type="number" placeholder="z.B. 50 oder -20" value={adjustPoints} onChange={(e) => setAdjustPoints(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Interne Notiz (optional)</Label>
                <Input placeholder="Grund..." value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog({ open: false, customer: null })}>Abbrechen</Button>
            <Button onClick={() => adjustMutation.mutate({ customerId: adjustDialog.customer!.id, points: parseInt(adjustPoints), note: adjustNote || undefined })}
              disabled={!adjustPoints || isNaN(parseInt(adjustPoints)) || adjustMutation.isPending}>
              {adjustMutation.isPending ? "..." : "Anpassen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prämien-Dialog */}
      <RewardDialog open={rewardDialog.open} reward={rewardDialog.reward}
        onClose={() => setRewardDialog({ open: false, reward: null })}
        onSave={(data) => saveRewardMutation.mutate(data)}
        isPending={saveRewardMutation.isPending} />

      {/* Kunden-Detail-Dialog */}
      <Dialog open={customerDetailDialog.open} onOpenChange={(o) => !o && setCustomerDetailDialog({ open: false, customer: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kundendaten bearbeiten</DialogTitle>
          </DialogHeader>
          {customerDetailDialog.customer && (
            <div className="space-y-4">
              {/* Info-Zeile */}
              <div className="p-3 rounded-lg bg-muted/50 flex items-center justify-between">
                <div>
                  <p className="font-medium">{customerDetailDialog.customer.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Registriert: {customerDetailDialog.customer.createdAt ? new Date(customerDetailDialog.customer.createdAt).toLocaleDateString("de-CH") : "–"}
                  </p>
                </div>
                <TierBadge tier={customerDetailDialog.customer.tier} />
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Vorname</Label>
                  <Input value={customerEdit.firstName} onChange={(e) => setCustomerEdit(p => ({ ...p, firstName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Nachname</Label>
                  <Input value={customerEdit.lastName} onChange={(e) => setCustomerEdit(p => ({ ...p, lastName: e.target.value }))} />
                </div>
              </div>

              {/* Telefon */}
              <div className="space-y-1">
                <Label>Telefon</Label>
                <Input placeholder="+41 79 123 45 67" value={customerEdit.phone} onChange={(e) => setCustomerEdit(p => ({ ...p, phone: e.target.value }))} />
              </div>

              {/* Geburtstag */}
              <div className="space-y-1">
                <Label>Geburtstag</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Select value={customerEdit.birthDay} onValueChange={(v) => setCustomerEdit(p => ({ ...p, birthDay: v }))}>
                    <SelectTrigger><SelectValue placeholder="Tag" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <SelectItem key={d} value={String(d)}>{d}.</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={customerEdit.birthMonth} onValueChange={(v) => setCustomerEdit(p => ({ ...p, birthMonth: v }))}>
                    <SelectTrigger><SelectValue placeholder="Monat" /></SelectTrigger>
                    <SelectContent>
                      {["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"].map((m, i) => (
                        <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Punkte-Zusammenfassung */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded bg-muted/40 text-center">
                  <p className="text-muted-foreground text-xs">Aktuell</p>
                  <p className="font-semibold font-mono">{Number(customerDetailDialog.customer.totalPoints ?? 0).toLocaleString("de-CH")} Pkt.</p>
                </div>
                <div className="p-2 rounded bg-muted/40 text-center">
                  <p className="text-muted-foreground text-xs">Lifetime</p>
                  <p className="font-semibold font-mono">{Number(customerDetailDialog.customer.lifetimePoints ?? 0).toLocaleString("de-CH")} Pkt.</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDetailDialog({ open: false, customer: null })}>Abbrechen</Button>
            <Button
              onClick={() => updateCustomerMutation.mutate({
                customerId: customerDetailDialog.customer!.id,
                firstName: customerEdit.firstName || undefined,
                lastName: customerEdit.lastName || null,
                phone: customerEdit.phone || null,
                birthMonth: customerEdit.birthMonth ? parseInt(customerEdit.birthMonth) : null,
                birthDay: customerEdit.birthDay ? parseInt(customerEdit.birthDay) : null,
              })}
              disabled={!customerEdit.firstName || updateCustomerMutation.isPending}>
              {updateCustomerMutation.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RewardDialog({ open, reward, onClose, onSave, isPending }: {
  open: boolean; reward: any | null; onClose: () => void; onSave: (d: any) => void; isPending: boolean;
}) {
  const emptyForm = { name: "", description: "", type: "discount_chf", pointsCost: 100, value: "", minTier: "none", isActive: true, sortOrder: 0 };
  const [form, setForm] = useState(emptyForm);

  // Sync form when dialog opens or reward changes – MUST use useEffect, never setState in render
  useEffect(() => {
    if (open) {
      if (reward) {
        setForm({ ...emptyForm, ...reward, value: reward.value ? String(parseFloat(reward.value)) : "", minTier: reward.minTier ?? "none" });
      } else {
        setForm(emptyForm);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reward?.id]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{reward ? "Prämie bearbeiten" : "Neue Prämie"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Gratis Kaffee" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount_chf">CHF-Rabatt</SelectItem>
                  <SelectItem value="discount_percent">%-Rabatt</SelectItem>
                  <SelectItem value="free_item">Gratis-Artikel</SelectItem>
                  <SelectItem value="custom">Individuell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Punkte-Kosten</Label>
              <Input type="number" min="1" value={form.pointsCost} onChange={(e) => setForm({ ...form, pointsCost: parseInt(e.target.value) })} />
            </div>
          </div>
          {(form.type === "discount_chf" || form.type === "discount_percent") && (
            <div className="space-y-2">
              <Label>{form.type === "discount_chf" ? "Betrag (CHF)" : "Prozent (%)"}</Label>
              <Input type="number" min="0" step="0.5" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Mindest-Stufe</Label>
            <Select value={form.minTier} onValueChange={(v) => setForm({ ...form, minTier: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Alle Stufen</SelectItem>
                <SelectItem value="silver">Silber+</SelectItem>
                <SelectItem value="gold">Gold+</SelectItem>
                <SelectItem value="platinum">Platin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            <Label>Aktiv</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onSave({ ...form, id: reward?.id, minTier: form.minTier === "none" ? null : form.minTier, value: form.value ? parseFloat(form.value) : undefined })}
            disabled={!form.name || isPending}>
            {isPending ? "..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminLoyalty() {
  return (
    <ModuleGate moduleId="loyalty">
      <AdminLoyaltyInner />
    </ModuleGate>
  );
}
