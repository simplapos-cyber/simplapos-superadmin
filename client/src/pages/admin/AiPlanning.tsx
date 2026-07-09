/**
 * AiPlanning.tsx – KI-gestützte Dienstplanung
 *
 * Der Admin kann:
 * 1. Woche auswählen + Parameter setzen
 * 2. KI-Analyse starten (Wetter, Feiertage, Reservationen, Umsätze)
 * 3. Generierten Dienstplan prüfen und bearbeiten
 * 4. Plan veröffentlichen → Mitarbeiter sehen ihre Schichten
 * 5. Vergangene Pläne einsehen
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";
import {
  Sparkles, Calendar, Clock, Users, AlertTriangle, CheckCircle2,
  ChevronLeft, ChevronRight, Loader2, Eye, Send, Trash2,
  CloudSun, MapPin, TrendingUp, Info, RefreshCw,
} from "lucide-react";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-CH", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

const ROLE_LABELS: Record<string, string> = {
  kellner: "Kellner", manager: "Manager", barkeeper: "Barkeeper", koch: "Koch",
};

const PRIORITY_CONFIG = {
  essential: { label: "Pflicht", color: "bg-red-100 text-red-700 border-red-200" },
  recommended: { label: "Empfohlen", color: "bg-blue-100 text-blue-700 border-blue-200" },
  optional: { label: "Optional", color: "bg-gray-100 text-gray-700 border-gray-200" },
};

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

function AiPlanningInner() {
  const [tab, setTab] = useState("generate");
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [settings, setSettings] = useState({
    openingHour: 11,
    closingHour: 23,
    minStaffPerShift: 2,
    hourlyWage: 25,
    restaurantLat: 47.3769,
    restaurantLon: 8.5417,
  });
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // Woche navigieren
  const navigateWeek = (dir: -1 | 1) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().split("T")[0]);
  };

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d.toISOString().split("T")[0];
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    return `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
  }, [weekStart, weekEnd]);

  // Queries
  const plansQuery = trpc.aiPlanning.getPlans.useQuery({ limit: 20 });
  const planDetailQuery = trpc.aiPlanning.getPlanDetail.useQuery(
    { planId: selectedPlanId! },
    { enabled: !!selectedPlanId && showDetailDialog },
  );

  // Mutations
  const generateMutation = trpc.aiPlanning.generatePlan.useMutation({
    onSuccess: (data) => {
      setGeneratedPlan(data);
      setIsGenerating(false);
      toast.success(`KI-Dienstplan generiert: ${data.shifts?.length ?? 0} Schichten für ${data.weekSummary?.totalStaffHours}h`);
    },
    onError: (e) => {
      setIsGenerating(false);
      toast.error(e.message);
    },
  });

  const publishMutation = trpc.aiPlanning.publishPlan.useMutation({
    onSuccess: () => {
      toast.success("Dienstplan veröffentlicht – Mitarbeiter können ihre Schichten sehen");
      setGeneratedPlan(null);
      plansQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.aiPlanning.deletePlan.useMutation({
    onSuccess: () => {
      toast.success("Plan gelöscht");
      plansQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    setGeneratedPlan(null);
    generateMutation.mutate({
      weekStart,
      ...settings,
    });
  };

  // Schichten nach Tag gruppieren
  const shiftsByDay = useMemo(() => {
    if (!generatedPlan?.shifts) return {};
    const grouped: Record<string, any[]> = {};
    for (const shift of generatedPlan.shifts) {
      if (!grouped[shift.date]) grouped[shift.date] = [];
      grouped[shift.date].push(shift);
    }
    return grouped;
  }, [generatedPlan]);

  const weekDates = useMemo(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  }, [weekStart]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            KI-Dienstplanung
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Intelligente Personalplanung basierend auf Wetter, Feiertagen, Reservationen und historischen Umsätzen
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="generate" className="gap-1">
            <Sparkles className="w-3 h-3" /> Plan generieren
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <Calendar className="w-3 h-3" /> Vergangene Pläne
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Plan generieren ─────────────────────────────────────── */}
        <TabsContent value="generate" className="space-y-6">

          {/* Einstellungen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Planungsparameter
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Woche */}
              <div>
                <Label className="text-sm font-medium">Planungswoche</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Button variant="outline" size="icon" onClick={() => navigateWeek(-1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex-1 text-center">
                    <p className="font-semibold">{weekLabel}</p>
                    <p className="text-xs text-muted-foreground">KW {Math.ceil((new Date(weekStart).getTime() - new Date(new Date(weekStart).getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}</p>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => navigateWeek(1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Input
                    type="date"
                    value={weekStart}
                    onChange={e => setWeekStart(getMonday(new Date(e.target.value)))}
                    className="w-36"
                  />
                </div>
              </div>

              {/* Parameter-Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Öffnung (Uhr)</Label>
                  <Input
                    type="number" min={0} max={23}
                    value={settings.openingHour}
                    onChange={e => setSettings(s => ({ ...s, openingHour: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Schliessung (Uhr)</Label>
                  <Input
                    type="number" min={0} max={23}
                    value={settings.closingHour}
                    onChange={e => setSettings(s => ({ ...s, closingHour: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Min. Personal/Schicht</Label>
                  <Input
                    type="number" min={1} max={20}
                    value={settings.minStaffPerShift}
                    onChange={e => setSettings(s => ({ ...s, minStaffPerShift: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Stundenlohn (CHF)</Label>
                  <Input
                    type="number" min={0} max={200}
                    value={settings.hourlyWage}
                    onChange={e => setSettings(s => ({ ...s, hourlyWage: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* Standort */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Breitengrad (Wetter)
                  </Label>
                  <Input
                    type="number" step={0.0001}
                    value={settings.restaurantLat}
                    onChange={e => setSettings(s => ({ ...s, restaurantLat: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Längengrad (Wetter)
                  </Label>
                  <Input
                    type="number" step={0.0001}
                    value={settings.restaurantLon}
                    onChange={e => setSettings(s => ({ ...s, restaurantLon: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* KI-Datenquellen Info */}
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm font-medium text-purple-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Die KI analysiert automatisch:
                </p>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-purple-700">
                  <div className="flex items-center gap-1"><CloudSun className="w-3 h-3" /> 7-Tage-Wetterprognose</div>
                  <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Schweizer Feiertage</div>
                  <div className="flex items-center gap-1"><Users className="w-3 h-3" /> Reservationen</div>
                  <div className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Historische Umsätze (4 Wochen)</div>
                  <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> Mitarbeiter-Verfügbarkeiten</div>
                  <div className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Genehmigte Abwesenheiten</div>
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white h-12 text-base"
              >
                {isGenerating ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> KI analysiert Daten...</>
                ) : (
                  <><Sparkles className="w-5 h-5" /> Dienstplan mit KI generieren</>
                )}
              </Button>

              {isGenerating && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800 font-medium">KI-Analyse läuft...</p>
                  <div className="mt-2 space-y-1 text-xs text-blue-700">
                    <p>✓ Wetterdaten werden abgerufen</p>
                    <p>✓ Feiertage werden geprüft</p>
                    <p>✓ Reservationen werden analysiert</p>
                    <p>✓ Historische Umsätze werden ausgewertet</p>
                    <p className="animate-pulse">⟳ KI erstellt optimalen Dienstplan...</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generierter Plan */}
          {generatedPlan && (
            <>
              {/* KI-Begründung */}
              <Card className="border-purple-200 bg-purple-50/30">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-purple-800">
                    <Sparkles className="w-4 h-4" />
                    KI-Analyse & Begründung
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {generatedPlan.reasoning}
                  </p>

                  {/* Zusammenfassung */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-white rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Gesamtstunden</p>
                      <p className="text-xl font-bold text-purple-700">{generatedPlan.weekSummary?.totalStaffHours}h</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Lohnkosten (est.)</p>
                      <p className="text-xl font-bold">CHF {generatedPlan.weekSummary?.estimatedCost}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Schichten</p>
                      <p className="text-xl font-bold">{generatedPlan.shifts?.length ?? 0}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Spitzentage</p>
                      <p className="text-sm font-bold">{generatedPlan.weekSummary?.peakDays?.join(", ") ?? "–"}</p>
                    </div>
                  </div>

                  {/* Warnungen */}
                  {generatedPlan.weekSummary?.warnings?.length > 0 && (
                    <div className="space-y-2">
                      {generatedPlan.weekSummary.warnings.map((w: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-orange-800">{w}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Datenquellen */}
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {generatedPlan.inputSummary?.weatherAvailable ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <AlertTriangle className="w-3 h-3 text-orange-500" />}
                      Wetter {generatedPlan.inputSummary?.weatherAvailable ? "verfügbar" : "nicht verfügbar"}
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      {generatedPlan.inputSummary?.staffCount} Mitarbeiter
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      {generatedPlan.inputSummary?.reservationDays} Reservationstage
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Wochenplan-Ansicht */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Generierter Dienstplan – {weekLabel}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Wochenraster */}
                  <div className="grid grid-cols-7 gap-2 mb-4">
                    {weekDates.map((date, i) => {
                      const dayShifts = shiftsByDay[date] ?? [];
                      const isWeekend = i >= 5;
                      return (
                        <div key={date} className={`rounded-lg border p-2 ${isWeekend ? "bg-orange-50 border-orange-200" : "bg-muted/20"}`}>
                          <p className="text-xs font-semibold text-center mb-1">{DAY_NAMES[i]}</p>
                          <p className="text-xs text-muted-foreground text-center mb-2">{new Date(date).getDate()}.{(new Date(date).getMonth() + 1).toString().padStart(2, "0")}.</p>
                          {dayShifts.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center">Frei</p>
                          ) : (
                            <div className="space-y-1">
                              {dayShifts.map((shift: any, si: number) => (
                                <div key={si} className="bg-white rounded p-1 border text-xs">
                                  <p className="font-medium truncate">{shift.staffName?.split(" ")[0] ?? "?"}</p>
                                  <p className="text-muted-foreground">{shift.startTime}–{shift.endTime}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {dayShifts.length > 0 && (
                            <p className="text-xs text-center mt-1 text-muted-foreground">{dayShifts.length} Schicht{dayShifts.length !== 1 ? "en" : ""}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Detaillierte Tabelle */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mitarbeiter</TableHead>
                          <TableHead>Rolle</TableHead>
                          <TableHead>Tag</TableHead>
                          <TableHead>Beginn</TableHead>
                          <TableHead>Ende</TableHead>
                          <TableHead>Pause</TableHead>
                          <TableHead>Netto</TableHead>
                          <TableHead>Priorität</TableHead>
                          <TableHead>KI-Hinweis</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(generatedPlan.shifts ?? []).map((shift: any, i: number) => {
                          const priorityInfo = PRIORITY_CONFIG[shift.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.recommended;
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-sm">{shift.staffName}</TableCell>
                              <TableCell><Badge variant="secondary" className="text-xs">{ROLE_LABELS[shift.role] ?? shift.role}</Badge></TableCell>
                              <TableCell className="text-sm">{formatDate(shift.date)}</TableCell>
                              <TableCell className="text-sm font-mono">{shift.startTime}</TableCell>
                              <TableCell className="text-sm font-mono">{shift.endTime}</TableCell>
                              <TableCell className="text-sm">{shift.breakMinutes ? `${shift.breakMinutes} Min` : "–"}</TableCell>
                              <TableCell className="text-sm font-medium">{shift.netHours}h</TableCell>
                              <TableCell><Badge variant="outline" className={`text-xs ${priorityInfo.color}`}>{priorityInfo.label}</Badge></TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px]">{shift.aiNote}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Aktionen */}
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setGeneratedPlan(null)} className="gap-2">
                  <Trash2 className="w-4 h-4" /> Verwerfen
                </Button>
                <Button
                  onClick={() => publishMutation.mutate({ planId: generatedPlan.planId })}
                  disabled={publishMutation.isPending}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {publishMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Wird veröffentlicht...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Plan veröffentlichen</>
                  )}
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Tab 2: Vergangene Pläne ────────────────────────────────────── */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Vergangene Dienstpläne
                </span>
                <Button variant="ghost" size="icon" onClick={() => plansQuery.refetch()}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {plansQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (plansQuery.data ?? []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Noch keine Pläne generiert</p>
                  <p className="text-sm mt-1">Erstelle deinen ersten KI-Dienstplan</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Woche</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Stunden</TableHead>
                      <TableHead>Kosten (est.)</TableHead>
                      <TableHead>Erstellt</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(plansQuery.data ?? []).map((plan: any) => (
                      <TableRow key={plan.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{formatDate(plan.weekStart)} – {formatDate(plan.weekEnd)}</p>
                          <p className="text-xs text-muted-foreground">KW {Math.ceil((new Date(plan.weekStart).getTime() - new Date(new Date(plan.weekStart).getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${plan.status === "published" ? "bg-green-100 text-green-700 border-green-200" : "bg-yellow-100 text-yellow-700 border-yellow-200"}`}>
                            {plan.status === "published" ? "Veröffentlicht" : "Entwurf"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{plan.totalStaffHours}h</TableCell>
                        <TableCell className="text-sm">CHF {plan.estimatedCost}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(plan.createdAt).toLocaleDateString("de-CH")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => { setSelectedPlanId(plan.id); setShowDetailDialog(true); }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {plan.status === "draft" && (
                              <Button
                                variant="ghost" size="icon"
                                className="text-green-600"
                                onClick={() => publishMutation.mutate({ planId: plan.id })}
                              >
                                <Send className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost" size="icon"
                              className="text-red-500"
                              onClick={() => deleteMutation.mutate({ planId: plan.id })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Plan-Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={open => { setShowDetailDialog(open); if (!open) setSelectedPlanId(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Dienstplan-Detail
            </DialogTitle>
          </DialogHeader>
          {planDetailQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : planDetailQuery.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Zeitraum</p>
                  <p className="text-sm font-medium">{formatDate(planDetailQuery.data.plan.weekStart)} – {formatDate(planDetailQuery.data.plan.weekEnd)}</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Gesamtstunden</p>
                  <p className="text-sm font-medium">{planDetailQuery.data.plan.totalStaffHours}h</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Lohnkosten</p>
                  <p className="text-sm font-medium">CHF {planDetailQuery.data.plan.estimatedCost}</p>
                </div>
              </div>
              {planDetailQuery.data.plan.aiReasoning && (
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs font-medium text-purple-800 flex items-center gap-1 mb-1"><Info className="w-3 h-3" /> KI-Begründung</p>
                  <p className="text-xs text-purple-700">{planDetailQuery.data.plan.aiReasoning}</p>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitarbeiter</TableHead><TableHead>Tag</TableHead>
                    <TableHead>Zeit</TableHead><TableHead>Netto</TableHead>
                    <TableHead>Bestätigt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planDetailQuery.data.shifts.map((shift: any) => (
                    <TableRow key={shift.id}>
                      <TableCell className="font-medium text-sm">{shift.staffName ?? `ID ${shift.staffId}`}</TableCell>
                      <TableCell className="text-sm">{formatDate(shift.date)}</TableCell>
                      <TableCell className="text-sm font-mono">{shift.startTime}–{shift.endTime}</TableCell>
                      <TableCell className="text-sm">{shift.netHours}h</TableCell>
                      <TableCell>{shift.confirmedByStaff ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Clock className="w-4 h-4 text-muted-foreground" />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>Schliessen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AiPlanning() {
  return (
    <ModuleGate moduleId="personal">
      <AiPlanningInner />
    </ModuleGate>
  );
}
