import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText, Search, User, Globe, Users, ShieldCheck, ShieldX, AlertTriangle,
  CheckCircle2, XCircle, Clock, Building2, Phone, Mail, MapPin, Briefcase,
  Download, Send, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  sent: { label: "Versendet", variant: "outline" },
  signed: { label: "Unterzeichnet", variant: "default" },
  active: { label: "Aktiv", variant: "default" },
  expired: { label: "Abgelaufen", variant: "secondary" },
  cancelled: { label: "Storniert", variant: "destructive" },
  pending_verification: { label: "Verifizierung ausstehend", variant: "outline" },
  rejected: { label: "Abgelehnt", variant: "destructive" },
};

const TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  referral: "Empfehlung",
  dropshipping: "Dropshipping",
  partner: "Partner",
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  ecosystem: "Ecosystem",
  modular: "Modular",
};

export default function Contracts() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const utils = trpc.useUtils();

  const { data: contracts, isLoading } = trpc.contracts.list.useQuery(
    search ? { search } : undefined
  );

  const updateMutation = trpc.contracts.update.useMutation({
    onSuccess: () => { utils.contracts.list.invalidate(); toast.success("Status aktualisiert"); },
    onError: (e) => toast.error(e.message),
  });

  const approveMutation = trpc.contracts.approve.useMutation({
    onSuccess: () => {
      utils.contracts.list.invalidate();
      toast.success("Vertrag genehmigt! Restaurant ist jetzt aktiv.");
      setSelectedContract(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.contracts.reject.useMutation({
    onSuccess: () => {
      utils.contracts.list.invalidate();
      toast.success("Vertrag abgelehnt.");
      setSelectedContract(null);
      setRejectDialogOpen(false);
      setRejectionReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  const downloadPdfMutation = trpc.contracts.downloadPdf.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("PDF wird heruntergeladen");
    },
    onError: (e) => toast.error(`PDF-Fehler: ${e.message}`),
  });

  const resendActivationMutation = trpc.contracts.resendActivation.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const pendingContracts = contracts?.filter((c: any) => c.status === "pending_verification") ?? [];
  const otherContracts = contracts?.filter((c: any) => c.status !== "pending_verification") ?? [];

  const handleApprove = (contractId: number) => {
    approveMutation.mutate({ contractId });
  };

  const handleReject = () => {
    if (!selectedContract) return;
    rejectMutation.mutate({ contractId: selectedContract.id, reason: rejectionReason || undefined });
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vertragsverwaltung</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {contracts?.length ?? 0} Verträge · {pendingContracts.length > 0 && (
              <span className="text-orange-500 font-medium">{pendingContracts.length} zur Verifizierung</span>
            )}
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Suchen..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Verifizierung
            {pendingContracts.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{pendingContracts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <FileText className="h-4 w-4" />
            Alle Verträge
          </TabsTrigger>
        </TabsList>

        {/* Pending Verification Tab */}
        <TabsContent value="pending" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : pendingContracts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldCheck className="h-12 w-12 text-green-500/50 mb-4" />
                <p className="text-muted-foreground font-medium">Keine ausstehenden Verifizierungen</p>
                <p className="text-muted-foreground text-sm mt-1">Alle Verträge sind geprüft.</p>
              </CardContent>
            </Card>
          ) : (
            pendingContracts.map((contract: any) => (
              <Card key={contract.id} className="border-orange-200 dark:border-orange-900/50">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    {/* Contract Info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-orange-600 border-orange-300">
                          <Clock className="h-3 w-3 mr-1" /> Verifizierung ausstehend
                        </Badge>
                        <Badge variant="secondary">{TYPE_LABELS[(contract as any).contractType] ?? (contract as any).contractType}</Badge>
                      </div>

                      <h3 className="text-lg font-semibold">
                        {(contract as any).restaurantName || contract.title}
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                        {(contract as any).restaurantAddress && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span>{(contract as any).restaurantAddress}{(contract as any).restaurantZip ? `, ${(contract as any).restaurantZip}` : ""} {(contract as any).restaurantCity || ""}</span>
                          </div>
                        )}
                        {(contract as any).restaurantPhone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span>{(contract as any).restaurantPhone}</span>
                          </div>
                        )}
                        {(contract as any).restaurantEmail && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span>{(contract as any).restaurantEmail}</span>
                          </div>
                        )}
                        {(contract as any).companyName && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Briefcase className="h-3.5 w-3.5 shrink-0" />
                            <span>{(contract as any).companyName}</span>
                          </div>
                        )}
                        {(contract as any).restaurantVatNumber && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                            <span>MwSt: {(contract as any).restaurantVatNumber}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          Registriert von: <strong>{(contract as any).createdByName || (contract as any).signedByName || "Unbekannt"}</strong>
                          {(contract as any).createdByType === "online" && <Globe className="h-3 w-3 inline ml-1 text-blue-500" />}
                          {(contract as any).createdByType === "partner" && <Users className="h-3 w-3 inline ml-1 text-teal-500" />}
                        </span>
                        <span className="text-muted-foreground">
                          Erstellt: {contract.createdAt ? new Date(contract.createdAt).toLocaleDateString("de-CH") : "—"}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <span>Monatlich: <strong>CHF {contract.monthlyFee ? Number(contract.monthlyFee).toFixed(2) : "0.00"}</strong></span>
                        <span>Plan: <strong>{PLAN_LABELS[(contract as any).plan] || (contract as any).plan || "—"}</strong></span>
                        <span>Mitarbeiter: <strong>{(contract as any).numEmployees || 1}</strong></span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-row md:flex-col gap-2 shrink-0">
                      <Button
                        variant="default"
                        className="gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove(contract.id)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Genehmigen
                      </Button>
                      <Button
                        variant="destructive"
                        className="gap-2"
                        onClick={() => { setSelectedContract(contract); setRejectDialogOpen(true); }}
                      >
                        <XCircle className="h-4 w-4" />
                        Ablehnen
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* All Contracts Tab */}
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : otherContracts?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Keine Verträge vorhanden</p>
                  <p className="text-muted-foreground text-sm mt-2">
                    Verträge werden über das Partner-Portal oder Online-Formular erstellt
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Restaurant</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Monatsbeitrag</TableHead>
                        <TableHead>Registriert von</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Erstellt</TableHead>
                        <TableHead className="w-[80px]">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {otherContracts?.map((c: any) => {
                        const status = STATUS_LABELS[c.status] ?? STATUS_LABELS.draft;
                        const registeredBy = (c as any).createdByName || (c as any).signedByName || null;
                        const registeredByType = (c as any).createdByType || "partner";
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">
                              {(c as any).restaurantName || c.title || `Restaurant #${c.restaurantId}`}
                            </TableCell>
                            <TableCell>
                              {(c as any).plan ? (
                                <Badge variant="outline">{PLAN_LABELS[(c as any).plan] || (c as any).plan}</Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-sm">{TYPE_LABELS[c.contractType] ?? c.contractType}</TableCell>
                            <TableCell className="text-sm">
                              {c.monthlyFee ? `CHF ${Number(c.monthlyFee).toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 text-sm">
                                {registeredByType === "online" ? (
                                  <Globe className="h-3.5 w-3.5 text-blue-500" />
                                ) : registeredByType === "partner" ? (
                                  <Users className="h-3.5 w-3.5 text-teal-500" />
                                ) : (
                                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span>{registeredBy || "Unbekannt"}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={c.status}
                                onValueChange={(v) => updateMutation.mutate({ id: c.id, status: v as any })}
                              >
                                <SelectTrigger className="h-7 text-xs w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="draft">Entwurf</SelectItem>
                                  <SelectItem value="sent">Versendet</SelectItem>
                                  <SelectItem value="signed">Unterzeichnet</SelectItem>
                                  <SelectItem value="active">Aktiv</SelectItem>
                                  <SelectItem value="expired">Abgelaufen</SelectItem>
                                  <SelectItem value="cancelled">Storniert</SelectItem>
                                  <SelectItem value="pending_verification">Verifizierung</SelectItem>
                                  <SelectItem value="rejected">Abgelehnt</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.createdAt ? new Date(c.createdAt).toLocaleDateString("de-CH") : "—"}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => downloadPdfMutation.mutate({ id: c.id })}
                                    disabled={downloadPdfMutation.isPending}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    PDF herunterladen
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => resendActivationMutation.mutate({ id: c.id, origin: window.location.origin })}
                                    disabled={resendActivationMutation.isPending}
                                  >
                                    <Send className="h-4 w-4 mr-2" />
                                    Aktivierungslink senden
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldX className="h-5 w-5 text-destructive" />
              Vertrag ablehnen
            </DialogTitle>
            <DialogDescription>
              Restaurant: <strong>{(selectedContract as any)?.restaurantName || selectedContract?.title}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Ablehnungsgrund (optional)</label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="z.B. Fehlende Informationen, nicht verifizierbar..."
                rows={3}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Der Restaurantbetreiber wird benachrichtigt und kann keinen Zugang zum Admin Panel erhalten.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectMutation.isPending}>
              {rejectMutation.isPending ? "Wird abgelehnt..." : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
