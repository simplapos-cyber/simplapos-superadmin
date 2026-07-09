import { useState, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Star } from "lucide-react";
import {
  Clock, Download, Users, AlertTriangle, CheckCircle2, Key,
  TrendingUp, Shield, RefreshCw, Edit3, ChevronLeft, ChevronRight,
  FileText, FileSpreadsheet, QrCode, Printer, Nfc, Wifi, Copy,
} from "lucide-react";

// Inline QR-Code-Komponente für Badge
import QRCode from "qrcode";
import { useRef, useEffect } from "react";
function BadgeQrCode({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, `WAITER_BADGE:${token}`, { width: 200, margin: 1 });
    }
  }, [token]);
  return <canvas ref={canvasRef} />;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatDate(ts: Date | string | null): string {
  if (!ts) return "–";
  return new Date(ts).toLocaleDateString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

const ROLE_LABELS: Record<string, string> = {
  kellner: "Kellner", manager: "Manager", barkeeper: "Barkeeper", koch: "Koch",
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  auto_closed: "bg-orange-100 text-orange-800 border-orange-200",
};

export default function AdminShifts() {
  const [tab, setTab] = useState("overview");
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(lastOfMonth);
  const [selectedStaffId, setSelectedStaffId] = useState<number | undefined>(undefined);
  const [pinDialog, setPinDialog] = useState<{ open: boolean; staffId: number; staffName: string }>({ open: false, staffId: 0, staffName: "" });
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [badgeDialog, setBadgeDialog] = useState<{ open: boolean; staffId: number; staffName: string; token: string | null }>({ open: false, staffId: 0, staffName: "", token: null });
  const [nfcDialog, setNfcDialog] = useState<{ open: boolean; staffId: number; staffName: string; token: string | null; writing: boolean; writeSuccess: boolean }>({ open: false, staffId: 0, staffName: "", token: null, writing: false, writeSuccess: false });
  const [editDialog, setEditDialog] = useState<{ open: boolean; shiftId: number; startedAt: string; endedAt: string; breakMinutes: number }>({ open: false, shiftId: 0, startedAt: "", endedAt: "", breakMinutes: 0 });
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);

  // Bewertungs-Query (verwendet exportYear/exportMonth für Monatsauswahl)
  const ratingsQuery = trpc.adminShifts.getRatingsOverview.useQuery({ year: exportYear, month: exportMonth });

  const staffListQuery = trpc.adminShifts.getStaffList.useQuery();
  const shiftsQuery = trpc.adminShifts.getAllShifts.useQuery({ dateFrom, dateTo, staffId: selectedStaffId, limit: 200 });
  const statsQuery = trpc.adminShifts.getShiftStats.useQuery({ dateFrom, dateTo, staffId: selectedStaffId });
  const exportQuery = trpc.adminShifts.exportShiftsCsv.useQuery({ dateFrom, dateTo, staffId: selectedStaffId }, { enabled: false });
  const datevQuery = trpc.adminShifts.exportDatev.useQuery({ year: exportYear, month: exportMonth, staffId: selectedStaffId }, { enabled: false });
  const pdfQuery = trpc.adminShifts.exportPdfMonthly.useQuery({ year: exportYear, month: exportMonth, staffId: selectedStaffId }, { enabled: false });
  const [reportFrom, setReportFrom] = useState(firstOfMonth);
  const [reportTo, setReportTo] = useState(lastOfMonth);
  const salesReportQuery = trpc.adminShifts.getWaiterSalesReport.useQuery({ from: reportFrom, to: reportTo });

  const resetPinMutation = trpc.adminShifts.resetStaffPin.useMutation({
    onSuccess: (data) => {
      toast.success(`PIN für ${data.staffName} gesetzt`);
      setPinDialog({ open: false, staffId: 0, staffName: "" });
      setNewPin(""); setConfirmPin("");
      staffListQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const generateNfcTokenMutation = trpc.adminShifts.generateNfcToken.useMutation({
    onSuccess: (data) => {
      setNfcDialog(prev => ({ ...prev, token: data.token }));
    },
    onError: (e) => toast.error(e.message),
  });

  const generateBadgeMutation = trpc.adminShifts.generateBadgeToken.useMutation({
    onSuccess: (data) => {
      setBadgeDialog(prev => ({ ...prev, token: data.token }));
      staffListQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const editShiftMutation = trpc.adminShifts.editShift.useMutation({
    onSuccess: () => {
      toast.success("Schicht aktualisiert");
      setEditDialog({ open: false, shiftId: 0, startedAt: "", endedAt: "", breakMinutes: 0 });
      shiftsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExport = async () => {
    const result = await exportQuery.refetch();
    if (!result.data?.csv) return;
    const blob = new Blob(["\uFEFF" + result.data.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = result.data.filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${result.data.rowCount} Schichten exportiert`);
  };

  const handleDatevExport = async () => {
    const result = await datevQuery.refetch();
    if (!result.data?.datev) { toast.error("Keine Daten für diesen Zeitraum"); return; }
    const blob = new Blob([result.data.datev], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = result.data.filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`DATEV-Export: ${result.data.staffCount} Mitarbeiter, ${result.data.totalShifts} Schichten`);
  };

  const handlePdfExport = async () => {
    const result = await pdfQuery.refetch();
    if (!result.data?.reports?.length) { toast.error("Keine Daten für diesen Zeitraum"); return; }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const { reports, month, year } = result.data;

    reports.forEach((report: any, idx: number) => {
      if (idx > 0) doc.addPage();

      // Header
      doc.setFontSize(18);
      doc.setTextColor(30, 64, 175);
      doc.text("Arbeitszeitnachweis", 20, 20);
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.text(`${report.name}`, 20, 30);
      doc.text(`${month} ${year}`, 20, 37);
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 41, 190, 41);

      // Zusammenfassung
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`Schichten: ${report.shiftCount}`, 20, 50);
      doc.text(`Netto-Stunden: ${report.totalNetHours}h`, 70, 50);
      doc.text(`Ø Schicht: ${report.avgShiftHours}h`, 130, 50);
      doc.text(`Compliance: ${report.complianceRate}%`, 20, 57);
      doc.text(`Pausenverstösse: ${report.nonCompliantCount}`, 70, 57);

      // Tabelle
      autoTable(doc, {
        startY: 65,
        head: [["Datum", "Beginn", "Ende", "Netto", "Pause", "Status"]],
        body: report.shifts.map((s: any) => [
          s.date, s.start, s.end,
          `${Math.floor(s.netMinutes / 60)}h ${s.netMinutes % 60}m`,
          `${s.breakMinutes}m`,
          s.status === "completed" ? "Abgeschlossen" : s.status === "active" ? "Aktiv" : "Auto",
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 22 }, 4: { cellWidth: 18 }, 5: { cellWidth: 30 } },
      });

      // Unterschrift
      const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text("Unterschrift Mitarbeiter: ________________________", 20, finalY + 15);
      doc.text("Unterschrift Vorgesetzter: ________________________", 110, finalY + 15);
      doc.text(`Erstellt am ${new Date().toLocaleDateString("de-CH")} – SimplaPOS`, 20, finalY + 25);
    });

    doc.save(result.data.filename);
    toast.success(`PDF erstellt: ${reports.length} Mitarbeiter-Berichte`);
  };

  const navigateMonth = (dir: -1 | 1) => {
    const from = new Date(dateFrom);
    from.setMonth(from.getMonth() + dir);
    setDateFrom(new Date(from.getFullYear(), from.getMonth(), 1).toISOString().split("T")[0]);
    setDateTo(new Date(from.getFullYear(), from.getMonth() + 1, 0).toISOString().split("T")[0]);
  };

  const monthLabel = useMemo(() => new Date(dateFrom).toLocaleDateString("de-CH", { month: "long", year: "numeric" }), [dateFrom]);
  const stats = statsQuery.data;
  const shifts = shiftsQuery.data?.shifts ?? [];
  const staffList = staffListQuery.data ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schichtverwaltung</h1>
          <p className="text-muted-foreground text-sm mt-1">Übersicht aller Schichten, Compliance-Prüfung und Lohnexport</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" /> CSV
          </Button>
          <Button onClick={handleDatevExport} variant="outline" size="sm" className="gap-2 border-green-300 text-green-700 hover:bg-green-50">
            <FileSpreadsheet className="w-4 h-4" /> DATEV
          </Button>
          <Button onClick={handlePdfExport} variant="outline" size="sm" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50">
            <FileText className="w-4 h-4" /> PDF-Bericht
          </Button>
          <div className="flex items-center gap-1 ml-2">
            <select
              value={exportMonth}
              onChange={e => setExportMonth(Number(e.target.value))}
              className="text-xs border rounded px-2 py-1 bg-background"
            >
              {["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={exportYear}
              onChange={e => setExportYear(Number(e.target.value))}
              className="text-xs border rounded px-2 py-1 bg-background"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="font-medium min-w-[140px] text-center">{monthLabel}</span>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Von</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Bis</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
            </div>
            <Select value={selectedStaffId?.toString() ?? "all"} onValueChange={v => setSelectedStaffId(v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Alle Mitarbeiter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Mitarbeiter</SelectItem>
                {staffList.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name ?? s.email}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => { shiftsQuery.refetch(); statsQuery.refetch(); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Gesamtstunden", value: `${(stats.totalNetMinutes / 60).toFixed(1)}h`, icon: Clock, color: "bg-blue-100 text-blue-600" },
            { label: "Schichten", value: stats.totalShifts, icon: Users, color: "bg-green-100 text-green-600" },
            { label: "Compliance", value: `${stats.complianceRate}%`, icon: stats.complianceRate >= 95 ? CheckCircle2 : AlertTriangle, color: stats.complianceRate >= 95 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600" },
            { label: "Ø Schicht", value: formatDuration(stats.avgShiftMinutes), icon: TrendingUp, color: "bg-purple-100 text-purple-600" },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${kpi.color.split(" ")[0]}`}>
                    <kpi.icon className={`w-5 h-5 ${kpi.color.split(" ")[1]}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-xl font-bold">{kpi.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Schichten</TabsTrigger>
          <TabsTrigger value="staff">Mitarbeiter & PINs</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="ratings" className="flex items-center gap-1"><Star className="w-3 h-3" />Bewertungen</TabsTrigger>
          <TabsTrigger value="report" className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Kellner-Bericht</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle className="text-base">{shifts.length} Schichten im Zeitraum</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mitarbeiter</TableHead><TableHead>Datum</TableHead><TableHead>Beginn</TableHead>
                      <TableHead>Ende</TableHead><TableHead>Brutto</TableHead><TableHead>Pause</TableHead>
                      <TableHead>Netto</TableHead><TableHead>Status</TableHead><TableHead>Compliance</TableHead><TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Keine Schichten im Zeitraum</TableCell></TableRow>
                    ) : shifts.map((shift: any) => (
                      <TableRow key={shift.id}>
                        <TableCell><p className="font-medium text-sm">{shift.staffName}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[shift.staffRole] ?? shift.staffRole}</p></TableCell>
                        <TableCell className="text-sm">{formatDate(shift.startedAt)}</TableCell>
                        <TableCell className="text-sm font-mono">{shift.startedAt ? new Date(shift.startedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : "–"}</TableCell>
                        <TableCell className="text-sm font-mono">{shift.endedAt ? new Date(shift.endedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : <span className="text-green-600 font-medium">Aktiv</span>}</TableCell>
                        <TableCell className="text-sm">{formatDuration(shift.durationMinutes)}</TableCell>
                        <TableCell className="text-sm">{shift.breakMinutes ? `${shift.breakMinutes} Min` : "–"}</TableCell>
                        <TableCell className="text-sm font-medium">{formatDuration(shift.netWorkMinutes)}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${STATUS_COLORS[shift.status] ?? ""}`}>{shift.status === "active" ? "Aktiv" : shift.status === "completed" ? "Fertig" : "Auto"}</Badge></TableCell>
                        <TableCell>{shift.breakCompliant ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <div className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-red-500" /><span className="text-xs text-red-600">{shift.requiredBreakMinutes}m</span></div>}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setEditDialog({ open: true, shiftId: shift.id, startedAt: shift.startedAt ? new Date(shift.startedAt).toISOString().slice(0, 16) : "", endedAt: shift.endedAt ? new Date(shift.endedAt).toISOString().slice(0, 16) : "", breakMinutes: shift.breakMinutes ?? 0 })}>
                            <Edit3 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" />Mitarbeiter & PIN-Status</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead><TableHead>Rolle</TableHead><TableHead>Status</TableHead>
                    <TableHead>PIN</TableHead><TableHead>Letzte Schicht</TableHead><TableHead>Aktuell</TableHead><TableHead>Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffList.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Keine Mitarbeiter</TableCell></TableRow>
                  ) : staffList.map((staff: any) => (
                    <TableRow key={staff.id}>
                      <TableCell><p className="font-medium text-sm">{staff.name ?? "–"}</p><p className="text-xs text-muted-foreground">{staff.email}</p></TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{ROLE_LABELS[staff.role] ?? staff.role}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={`text-xs ${staff.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-600"}`}>{staff.status === "active" ? "Aktiv" : "Inaktiv"}</Badge></TableCell>
                      <TableCell>{staff.pinLocked ? <Badge variant="outline" className="text-xs bg-red-50 text-red-700">Gesperrt</Badge> : staff.hasPinSet ? <Badge variant="outline" className="text-xs bg-green-50 text-green-700">✓ Gesetzt</Badge> : <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700">Nicht gesetzt</Badge>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{staff.lastShiftDate ? formatDate(staff.lastShiftDate) : "–"}</TableCell>
                      <TableCell>{staff.isCurrentlyWorking ? <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /><span className="text-xs text-green-600">Arbeitet</span></div> : <span className="text-xs text-muted-foreground">–</span>}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setPinDialog({ open: true, staffId: staff.id, staffName: staff.name ?? staff.email })}>
                            <Key className="w-3 h-3" /> PIN
                          </Button>
                          {staff.hasPinSet && (
                            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setBadgeDialog({ open: true, staffId: staff.id, staffName: staff.name ?? staff.email, token: null })}>
                              <QrCode className="w-3 h-3" /> Badge
                            </Button>
                          )}
                          {staff.hasPinSet && (
                            <Button variant="outline" size="sm" className="gap-1 text-xs border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => setNfcDialog({ open: true, staffId: staff.id, staffName: staff.name ?? staff.email, token: null, writing: false, writeSuccess: false })}>
                              <Nfc className="w-3 h-3" /> NFC
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" />CH ArG Art. 15 – Pflichtpausen</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800 font-medium">Schweizer Arbeitsgesetz – Pflichtpausen</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-blue-700">
                  <div>Ab 5,5h → <strong>15 Min.</strong></div>
                  <div>Ab 7h → <strong>30 Min.</strong></div>
                  <div>Ab 9h → <strong>60 Min.</strong></div>
                </div>
              </div>
              {stats && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-4 rounded-lg border">
                    <p className="text-sm text-muted-foreground">Compliance-Rate</p>
                    <p className={`text-3xl font-bold mt-1 ${stats.complianceRate >= 95 ? "text-green-600" : stats.complianceRate >= 80 ? "text-yellow-600" : "text-red-600"}`}>{stats.complianceRate}%</p>
                    <p className="text-xs text-muted-foreground mt-1">{stats.nonCompliantShifts} von {stats.totalShifts} Schichten ohne Pflichtpause</p>
                  </div>
                  <div className="p-4 rounded-lg border">
                    <p className="text-sm text-muted-foreground">Gesamt Pausenzeit</p>
                    <p className="text-3xl font-bold mt-1">{formatDuration(stats.totalBreakMinutes)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Ø {stats.totalShifts > 0 ? Math.round(stats.totalBreakMinutes / stats.totalShifts) : 0} Min. pro Schicht</p>
                  </div>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Mitarbeiter</TableHead><TableHead>Datum</TableHead><TableHead>Netto</TableHead><TableHead>Pause</TableHead><TableHead>Pflichtpause</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.filter((s: any) => !s.breakCompliant && s.requiredBreakMinutes > 0).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8"><div className="flex flex-col items-center gap-2 text-green-600"><CheckCircle2 className="w-8 h-8" /><p className="font-medium">Alle Schichten compliant!</p></div></TableCell></TableRow>
                  ) : shifts.filter((s: any) => !s.breakCompliant && s.requiredBreakMinutes > 0).map((shift: any) => (
                    <TableRow key={shift.id} className="bg-red-50/50">
                      <TableCell className="font-medium text-sm">{shift.staffName}</TableCell>
                      <TableCell className="text-sm">{formatDate(shift.startedAt)}</TableCell>
                      <TableCell className="text-sm">{formatDuration(shift.netWorkMinutes)}</TableCell>
                      <TableCell className="text-sm">{shift.breakMinutes ? `${shift.breakMinutes} Min` : "Keine"}</TableCell>
                      <TableCell className="text-sm font-medium text-red-600">{shift.requiredBreakMinutes} Min</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">Verletzung</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ratings">
          <div className="space-y-4">
            {/* Durchschnitt-Karte */}
            {ratingsQuery.data && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">Ø Bewertung</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-3xl font-bold">{ratingsQuery.data.avgRating ? ratingsQuery.data.avgRating.toFixed(1) : "–"}</p>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`w-4 h-4 ${s <= Math.round(ratingsQuery.data.avgRating ?? 0) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{ratingsQuery.data.ratings.length} Bewertungen</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">Schichten mit Notiz</p>
                    <p className="text-3xl font-bold mt-1">{ratingsQuery.data.shiftsWithNotes.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">im gewählten Zeitraum</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">Stimmungen</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(["great","good","neutral","tired","stressed"] as const).map(mood => {
                        const count = ratingsQuery.data.ratings.filter((r: any) => r.mood === mood).length;
                        if (count === 0) return null;
                        const labels: Record<string, string> = { great:"😄", good:"😊", neutral:"😐", tired:"😴", stressed:"😓" };
                        return <Badge key={mood} variant="outline" className="text-xs">{labels[mood]} {count}</Badge>;
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Bewertungs-Tabelle */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500" />Schicht-Bewertungen</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mitarbeiter</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Bewertung</TableHead>
                      <TableHead>Stimmung</TableHead>
                      <TableHead>Kommentar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!ratingsQuery.data || ratingsQuery.data.ratings.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Keine Bewertungen im Zeitraum</TableCell></TableRow>
                    ) : ratingsQuery.data.ratings.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{r.staffName ?? "–"}</TableCell>
                        <TableCell className="text-sm">{formatDate(r.ratedAt)}</TableCell>
                        <TableCell>
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {{ great:"😄 Super", good:"😊 Gut", neutral:"😐 Ok", tired:"😴 Müde", stressed:"😓 Gestresst" }[r.mood as string] ?? r.mood}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground italic max-w-xs truncate">{r.comment || "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Schichten mit Notizen */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" />Schicht-Notizen</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mitarbeiter</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Dauer</TableHead>
                      <TableHead>Notiz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!ratingsQuery.data || ratingsQuery.data.shiftsWithNotes.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Keine Notizen im Zeitraum</TableCell></TableRow>
                    ) : ratingsQuery.data.shiftsWithNotes.map((s: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{s.staffName ?? "–"}</TableCell>
                        <TableCell className="text-sm">{formatDate(s.startedAt)}</TableCell>
                        <TableCell className="text-sm">{formatDuration(s.netWorkMinutes)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground italic max-w-xs">{s.notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
              <TabsContent value="report">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" />Umsatz pro Kellner</CardTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground">Von</span>
                  <Input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-36 h-8 text-sm" />
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground">Bis</span>
                  <Input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-36 h-8 text-sm" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {salesReportQuery.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Lade Bericht...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rang</TableHead>
                      <TableHead>Kellner</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead className="text-right">Bestellungen</TableHead>
                      <TableHead className="text-right">Umsatz</TableHead>
                      <TableHead className="text-right">Trinkgeld</TableHead>
                      <TableHead className="text-right">Gäste</TableHead>
                      <TableHead className="text-right">Ø Bon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(salesReportQuery.data?.report ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Keine Daten im gewählten Zeitraum</TableCell></TableRow>
                    ) : (
                      (salesReportQuery.data?.report ?? [] as Array<{staffId:number;name:string|null;role:string|null;avatarUrl:string|null;revenue:number;tips:number;guests:number;orderCount:number}>).map((row: {staffId:number;name:string|null;role:string|null;avatarUrl:string|null;revenue:number;tips:number;guests:number;orderCount:number}, i: number) => (
                        <TableRow key={row.staffId}>
                          <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{row.name ?? "Unbekannt"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{ROLE_LABELS[row.role ?? ""] ?? row.role}</Badge></TableCell>
                          <TableCell className="text-right">{row.orderCount}</TableCell>
                          <TableCell className="text-right font-semibold">CHF {row.revenue.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-green-600">CHF {row.tips.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.guests}</TableCell>
                          <TableCell className="text-right">{row.orderCount > 0 ? `CHF ${(row.revenue / row.orderCount).toFixed(2)}` : "–"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {/* PIN-Dialog */}
      <Dialog open={pinDialog.open} onOpenChange={open => !open && setPinDialog({ open: false, staffId: 0, staffName: "" })}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="w-5 h-5" />PIN setzen für {pinDialog.staffName}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">Der PIN wird für die Stempeluhr verwendet. Kein Kollege kann ohne ihn stempeln.</div>
            <div className="space-y-2">
              <Label>Neuer PIN (4 Ziffern)</Label>
              <Input type="password" inputMode="numeric" maxLength={4} placeholder="••••" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className="text-center text-2xl tracking-widest font-mono" />
            </div>
            <div className="space-y-2">
              <Label>PIN bestätigen</Label>
              <Input type="password" inputMode="numeric" maxLength={4} placeholder="••••" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className="text-center text-2xl tracking-widest font-mono" />
            </div>
            {newPin.length === 4 && confirmPin.length === 4 && newPin !== confirmPin && <p className="text-sm text-red-600">PINs stimmen nicht überein</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinDialog({ open: false, staffId: 0, staffName: "" })}>Abbrechen</Button>
            <Button onClick={() => resetPinMutation.mutate({ staffId: pinDialog.staffId, newPin })} disabled={newPin.length !== 4 || newPin !== confirmPin || resetPinMutation.isPending}>
              {resetPinMutation.isPending ? "Wird gesetzt..." : "PIN setzen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit-Dialog */}
      <Dialog open={editDialog.open} onOpenChange={open => !open && setEditDialog({ open: false, shiftId: 0, startedAt: "", endedAt: "", breakMinutes: 0 })}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="w-5 h-5" />Schicht korrigieren</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-orange-50 rounded-lg text-sm text-orange-800">Admin-Korrekturen werden im Audit-Log protokolliert (CH ArG Art. 46).</div>
            <div className="space-y-2"><Label>Beginn</Label><Input type="datetime-local" value={editDialog.startedAt} onChange={e => setEditDialog(d => ({ ...d, startedAt: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Ende</Label><Input type="datetime-local" value={editDialog.endedAt} onChange={e => setEditDialog(d => ({ ...d, endedAt: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Pausen-Minuten</Label><Input type="number" min={0} max={240} value={editDialog.breakMinutes} onChange={e => setEditDialog(d => ({ ...d, breakMinutes: Number(e.target.value) }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, shiftId: 0, startedAt: "", endedAt: "", breakMinutes: 0 })}>Abbrechen</Button>
            <Button onClick={() => editShiftMutation.mutate({ shiftId: editDialog.shiftId, startedAt: editDialog.startedAt, endedAt: editDialog.endedAt, breakMinutes: editDialog.breakMinutes })} disabled={editShiftMutation.isPending}>
              {editShiftMutation.isPending ? "Wird gespeichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NFC-Badge-Dialog */}
      <Dialog open={nfcDialog.open} onOpenChange={open => !open && setNfcDialog({ open: false, staffId: 0, staffName: "", token: null, writing: false, writeSuccess: false })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Nfc className="w-5 h-5 text-purple-600" />NFC-Badge für {nfcDialog.staffName}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {!nfcDialog.token ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Generiere einen NFC-Token für diesen Mitarbeiter. Der Token wird auf einen NFC-Tag geschrieben und ermöglicht das Einloggen durch Antippen.</p>
                <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-800">⚠️ Ein neuer Token macht den alten NFC-Tag ungültig.</div>
                <Button className="w-full gap-2" onClick={() => generateNfcTokenMutation.mutate({ staffId: nfcDialog.staffId })} disabled={generateNfcTokenMutation.isPending}>
                  <Nfc className="w-4 h-4" />
                  {generateNfcTokenMutation.isPending ? "Wird generiert..." : "NFC-Token generieren"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Android: Web NFC Write */}
                {typeof (window as any).NDEFReader !== "undefined" ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-green-800 font-medium text-sm">
                      <Wifi className="w-4 h-4" /> Android – NFC-Tag direkt beschreiben
                    </div>
                    <p className="text-xs text-green-700">Halte einen leeren NFC-Tag an die Rückseite des Geräts und tippe auf den Button.</p>
                    {nfcDialog.writeSuccess ? (
                      <div className="flex items-center gap-2 text-green-700 font-medium text-sm"><CheckCircle2 className="w-4 h-4" /> NFC-Tag erfolgreich beschrieben!</div>
                    ) : (
                      <Button
                        className="w-full gap-2 bg-green-600 hover:bg-green-700"
                        disabled={nfcDialog.writing}
                        onClick={async () => {
                          setNfcDialog(prev => ({ ...prev, writing: true }));
                          try {
                            const ndef = new (window as any).NDEFReader();
                            await ndef.write({
                              records: [{ recordType: "url", data: `https://simplapos.com/nfc-login?token=${nfcDialog.token}` }]
                            });
                            setNfcDialog(prev => ({ ...prev, writing: false, writeSuccess: true }));
                            toast.success("NFC-Tag erfolgreich beschrieben!");
                          } catch (err: any) {
                            setNfcDialog(prev => ({ ...prev, writing: false }));
                            toast.error(`NFC-Fehler: ${err.message ?? "Unbekannter Fehler"}`);
                          }
                        }}
                      >
                        <Nfc className="w-4 h-4" />
                        {nfcDialog.writing ? "Warte auf NFC-Tag..." : "NFC-Tag beschreiben"}
                      </Button>
                    )}
                  </div>
                ) : (
                  /* iOS / Desktop: URL anzeigen + Anleitung */
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-blue-800 font-medium text-sm">
                      <Nfc className="w-4 h-4" /> iOS / Desktop – NFC-Tag mit App beschreiben
                    </div>
                    <p className="text-xs text-blue-700">Kopiere diese URL und schreibe sie mit einer NFC-App (z.B. <strong>NFC Tools</strong> im App Store) auf einen leeren NFC-Tag:</p>
                    <div className="flex items-center gap-2 p-2 bg-white border rounded-lg">
                      <code className="text-xs flex-1 break-all text-gray-700">
                        {`https://simplapos.com/nfc-login?token=${nfcDialog.token}`}
                      </code>
                      <Button
                        variant="ghost" size="icon" className="shrink-0 h-7 w-7"
                        onClick={() => {
                          navigator.clipboard.writeText(`https://simplapos.com/nfc-login?token=${nfcDialog.token}`);
                          toast.success("URL kopiert!");
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                      <li>NFC Tools App öffnen → <strong>Schreiben</strong></li>
                      <li><strong>Datensatz hinzufügen</strong> → URL</li>
                      <li>Obige URL einfügen → <strong>OK</strong></li>
                      <li>NFC-Tag antippen → <strong>Schreiben</strong></li>
                    </ol>
                  </div>
                )}
                {/* QR-Code als Fallback */}
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><QrCode className="w-3 h-3" /> QR-Code als Fallback (Badge-Scan)</p>
                  <div className="flex flex-col items-center">
                    <div className="p-2 bg-white border rounded-lg">
                      <BadgeQrCode token={`NFC:${nfcDialog.token}`} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Kann auch als QR-Badge verwendet werden</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1" onClick={() => generateNfcTokenMutation.mutate({ staffId: nfcDialog.staffId })} disabled={generateNfcTokenMutation.isPending}>
                    <RefreshCw className="w-4 h-4" /> Neu generieren
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Badge-QR-Code-Dialog */}
      <Dialog open={badgeDialog.open} onOpenChange={open => !open && setBadgeDialog({ open: false, staffId: 0, staffName: "", token: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="w-5 h-5" />Badge für {badgeDialog.staffName}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {!badgeDialog.token ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Generiere einen QR-Badge für diesen Mitarbeiter. Der Badge ersetzt die PIN-Eingabe am Waiter-Panel.</p>
                <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-800">⚠️ Ein neuer Badge macht den alten ungültig.</div>
                <Button className="w-full" onClick={() => generateBadgeMutation.mutate({ staffId: badgeDialog.staffId })} disabled={generateBadgeMutation.isPending}>
                  {generateBadgeMutation.isPending ? "Wird generiert..." : "Neuen Badge generieren"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 p-4 bg-white border rounded-xl">
                  <p className="text-sm font-semibold">{badgeDialog.staffName}</p>
                  <div id="badge-qr-container" className="p-2 bg-white rounded-lg">
                    <BadgeQrCode token={badgeDialog.token} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Diesen QR-Code ausdrucken und laminieren</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1" onClick={() => window.print()}>
                    <Printer className="w-4 h-4" /> Drucken
                  </Button>
                  <Button variant="outline" className="flex-1 gap-1" onClick={() => generateBadgeMutation.mutate({ staffId: badgeDialog.staffId })} disabled={generateBadgeMutation.isPending}>
                    <RefreshCw className="w-4 h-4" /> Neu
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
