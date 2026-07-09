/**
 * AdminAbsences.tsx – Ferien & Abwesenheiten (Admin-Sicht)
 *
 * Der Admin kann:
 * - Alle Anfragen einsehen (mit Filter)
 * - Anfragen genehmigen oder ablehnen (mit optionaler Notiz)
 * - Kalender-Übersicht aller Abwesenheiten
 * - Statistiken pro Mitarbeiter
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Calendar, CheckCircle2, XCircle, Clock, Users, Palmtree,
  AlertCircle, RefreshCw, Filter,
} from "lucide-react";

const ABSENCE_TYPES: Record<string, { label: string; color: string }> = {
  vacation: { label: "Ferien", color: "bg-blue-100 text-blue-700" },
  sick: { label: "Krankheit", color: "bg-red-100 text-red-700" },
  parental: { label: "Elternzeit", color: "bg-pink-100 text-pink-700" },
  unpaid: { label: "Unbezahlt", color: "bg-gray-100 text-gray-700" },
  other: { label: "Sonstiges", color: "bg-purple-100 text-purple-700" },
};

const STATUS_CONFIG = {
  pending: { label: "Ausstehend", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  approved: { label: "Genehmigt", color: "bg-green-100 text-green-800 border-green-200" },
  rejected: { label: "Abgelehnt", color: "bg-red-100 text-red-800 border-red-200" },
  cancelled: { label: "Storniert", color: "bg-gray-100 text-gray-800 border-gray-200" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

function getDayCount(from: string, to: string): number {
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
}

export default function AdminAbsences() {
  const [tab, setTab] = useState("pending");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean; absenceId: number; staffName: string; action: "approve" | "reject";
  }>({ open: false, absenceId: 0, staffName: "", action: "approve" });
  const [adminNote, setAdminNote] = useState("");

  const today = new Date();
  const year = today.getFullYear();

  const absencesQuery = trpc.absences.listAbsences.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter as any,
    year,
  });

  const approveMutation = trpc.absences.approveAbsence.useMutation({
    onSuccess: () => {
      toast.success("Anfrage genehmigt");
      setDecisionDialog({ open: false, absenceId: 0, staffName: "", action: "approve" });
      setAdminNote("");
      absencesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.absences.rejectAbsence.useMutation({
    onSuccess: () => {
      toast.success("Anfrage abgelehnt");
      setDecisionDialog({ open: false, absenceId: 0, staffName: "", action: "approve" });
      setAdminNote("");
      absencesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDecision = () => {
    if (decisionDialog.action === "approve") {
      approveMutation.mutate({ absenceId: decisionDialog.absenceId, adminNote: adminNote || undefined });
    } else {
      rejectMutation.mutate({ absenceId: decisionDialog.absenceId, adminNote: adminNote || "Kein Grund angegeben" });
    }
  };

  const allAbsences = absencesQuery.data?.absences ?? [];
  const pendingAbsences = allAbsences.filter((a: any) => a.status === "pending");
  const approvedAbsences = allAbsences.filter((a: any) => a.status === "approved");
  const rejectedAbsences = allAbsences.filter((a: any) => a.status === "rejected");

  // Statistiken
  const totalApprovedDays = approvedAbsences.reduce((sum: number, a: any) => sum + getDayCount(a.startDate, a.endDate), 0);
  const uniqueStaff = new Set(allAbsences.map((a: any) => a.staffId)).size;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Abwesenheitsverwaltung</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ferien- und Abwesenheitsanfragen genehmigen oder ablehnen
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => absencesQuery.refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Ausstehend", value: pendingAbsences.length, icon: Clock, color: "text-yellow-600 bg-yellow-100" },
          { label: "Genehmigt", value: approvedAbsences.length, icon: CheckCircle2, color: "text-green-600 bg-green-100" },
          { label: "Abgelehnt", value: rejectedAbsences.length, icon: XCircle, color: "text-red-600 bg-red-100" },
          { label: "Genehmigte Tage", value: totalApprovedDays, icon: Palmtree, color: "text-blue-600 bg-blue-100" },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${kpi.color.split(" ")[1]}`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color.split(" ")[0]}`} />
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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1">
              Ausstehend
              {pendingAbsences.length > 0 && (
                <Badge className="ml-1 h-5 w-5 p-0 text-xs flex items-center justify-center bg-yellow-500">
                  {pendingAbsences.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">Alle Anfragen</TabsTrigger>
            <TabsTrigger value="calendar">Kalender</TabsTrigger>
          </TabsList>

          {tab === "all" && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="approved">Genehmigt</SelectItem>
                  <SelectItem value="rejected">Abgelehnt</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Ausstehende Anfragen */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                {pendingAbsences.length} ausstehende Anfrage{pendingAbsences.length !== 1 ? "n" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingAbsences.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
                  <p className="font-medium">Keine ausstehenden Anfragen</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingAbsences.map((absence: any) => {
                    const typeInfo = ABSENCE_TYPES[absence.type] ?? ABSENCE_TYPES.other;
                    const days = getDayCount(absence.startDate, absence.endDate);
                    return (
                      <div key={absence.id} className="p-4 rounded-lg border bg-yellow-50/30 hover:bg-yellow-50/60 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`px-2 py-1 rounded text-xs font-medium ${typeInfo.color}`}>
                              {typeInfo.label}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{absence.staffName}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(absence.startDate)} – {formatDate(absence.endDate)}
                                <span className="ml-2 font-medium text-foreground">{days} Tag{days !== 1 ? "e" : ""}</span>
                              </p>
                              {absence.reason && (
                                <p className="text-xs text-muted-foreground mt-1 italic">"{absence.reason}"</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Eingereicht: {new Date(absence.createdAt).toLocaleDateString("de-CH")}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm" variant="outline"
                              className="gap-1 border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => setDecisionDialog({ open: true, absenceId: absence.id, staffName: (absence.staffName ?? absence.staffId?.toString() ?? "Unbekannt"), action: "reject" })}
                            >
                              <XCircle className="w-3 h-3" /> Ablehnen
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1 bg-green-600 hover:bg-green-700"
                              onClick={() => setDecisionDialog({ open: true, absenceId: absence.id, staffName: absence.staffName, action: "approve" })}
                            >
                              <CheckCircle2 className="w-3 h-3" /> Genehmigen
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alle Anfragen */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{allAbsences.length} Anfragen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mitarbeiter</TableHead>
                      <TableHead>Art</TableHead>
                      <TableHead>Von</TableHead>
                      <TableHead>Bis</TableHead>
                      <TableHead>Tage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Admin-Notiz</TableHead>
                      <TableHead>Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allAbsences.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Keine Anfragen gefunden
                        </TableCell>
                      </TableRow>
                    ) : allAbsences.map((absence: any) => {
                      const typeInfo = ABSENCE_TYPES[absence.type] ?? ABSENCE_TYPES.other;
                      const statusInfo = STATUS_CONFIG[absence.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                      const days = getDayCount(absence.startDate, absence.endDate);
                      return (
                        <TableRow key={absence.id}>
                          <TableCell className="font-medium text-sm">{absence.staffName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${typeInfo.color}`}>
                              {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(absence.startDate)}</TableCell>
                          <TableCell className="text-sm">{formatDate(absence.endDate)}</TableCell>
                          <TableCell className="text-sm font-medium">{days}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                              {statusInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {absence.adminNote ?? "–"}
                          </TableCell>
                          <TableCell>
                            {absence.status === "pending" && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-green-600 hover:bg-green-50 h-7 px-2"
                                  onClick={() => setDecisionDialog({ open: true, absenceId: absence.id, staffName: absence.staffName, action: "approve" })}
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-red-600 hover:bg-red-50 h-7 px-2"
                                  onClick={() => setDecisionDialog({ open: true, absenceId: absence.id, staffName: absence.staffName, action: "reject" })}
                                >
                                  <XCircle className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Kalender-Übersicht */}
        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Abwesenheits-Übersicht {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {approvedAbsences.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Keine genehmigten Abwesenheiten</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Gruppiert nach Mitarbeiter */}
                  {Array.from(new Set(approvedAbsences.map((a: any) => a.staffId))).map((staffId) => {
                    const staffAbsences = approvedAbsences.filter((a: any) => a.staffId === staffId);
                    const staffName = staffAbsences[0]?.staffName ?? "Unbekannt";
                    const totalDays = staffAbsences.reduce((sum: number, a: any) => sum + getDayCount(a.startDate, a.endDate), 0);
                    return (
                      <div key={staffId as number} className="p-3 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{staffName}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">{totalDays} Tage</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {staffAbsences.map((a: any) => {
                            const typeInfo = ABSENCE_TYPES[a.type] ?? ABSENCE_TYPES.other;
                            const days = getDayCount(a.startDate, a.endDate);
                            return (
                              <div key={a.id} className={`px-2 py-1 rounded text-xs ${typeInfo.color}`}>
                                {typeInfo.label}: {formatDate(a.startDate)}–{formatDate(a.endDate)} ({days}T)
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Entscheidungs-Dialog */}
      <Dialog open={decisionDialog.open} onOpenChange={open => !open && setDecisionDialog({ open: false, absenceId: 0, staffName: "", action: "approve" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${decisionDialog.action === "approve" ? "text-green-700" : "text-red-700"}`}>
              {decisionDialog.action === "approve"
                ? <><CheckCircle2 className="w-5 h-5" /> Anfrage genehmigen</>
                : <><XCircle className="w-5 h-5" /> Anfrage ablehnen</>
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm">
              Anfrage von <strong>{decisionDialog.staffName}</strong> wird{" "}
              {decisionDialog.action === "approve" ? "genehmigt" : "abgelehnt"}.
            </p>
            <div className="space-y-2">
              <Label>Notiz für Mitarbeiter <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                placeholder={decisionDialog.action === "approve"
                  ? "z.B. Genehmigt. Schöne Ferien!"
                  : "z.B. Leider nicht möglich wegen hoher Auslastung."
                }
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog({ open: false, absenceId: 0, staffName: "", action: "approve" })}>
              Abbrechen
            </Button>
            <Button
              className={decisionDialog.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              onClick={handleDecision}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              {approveMutation.isPending || rejectMutation.isPending
                ? "Wird verarbeitet..."
                : decisionDialog.action === "approve" ? "Genehmigen" : "Ablehnen"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
