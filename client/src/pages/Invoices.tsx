import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Receipt, Download } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  sent: { label: "Versendet", variant: "outline" },
  paid: { label: "Bezahlt", variant: "default" },
  overdue: { label: "Überfällig", variant: "destructive" },
  cancelled: { label: "Storniert", variant: "secondary" },
};

export default function Invoices() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    restaurantId: "",
    amount: "",
    taxAmount: "0",
    totalAmount: "",
    currency: "CHF",
    description: "",
    invoiceNumber: "",
  });
  const utils = trpc.useUtils();

  const { data: invoices, isLoading } = trpc.invoices.list.useQuery();

  const createMutation = trpc.invoices.create.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate();
      setShowCreate(false);
      setForm({ restaurantId: "", amount: "", taxAmount: "0", totalAmount: "", currency: "CHF", description: "", invoiceNumber: "" });
      toast.success("Rechnung erstellt");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.invoices.update.useMutation({
    onSuccess: () => { utils.invoices.list.invalidate(); toast.success("Status aktualisiert"); },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.restaurantId || !form.amount || !form.totalAmount) {
      toast.error("Restaurant-ID, Betrag und Gesamtbetrag sind erforderlich");
      return;
    }
    createMutation.mutate({
      restaurantId: parseInt(form.restaurantId),
      amount: form.amount,
      taxAmount: form.taxAmount || "0",
      totalAmount: form.totalAmount,
      currency: form.currency,
      description: form.description || undefined,
      invoiceNumber: form.invoiceNumber || undefined,
    });
  };

  const totalPaid = invoices?.filter((i: any) => i.status === "paid").reduce((sum: number, i: any) => sum + Number(i.totalAmount), 0) ?? 0;
  const totalOverdue = invoices?.filter((i: any) => i.status === "overdue").reduce((sum: number, i: any) => sum + Number(i.totalAmount), 0) ?? 0;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rechnungsverwaltung</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{invoices?.length ?? 0} Rechnungen</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Rechnung erstellen
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Gesamt", value: invoices?.length ?? 0, suffix: "Rechnungen" },
          { label: "Bezahlt", value: `CHF ${totalPaid.toFixed(0)}`, suffix: "" },
          { label: "Überfällig", value: `CHF ${totalOverdue.toFixed(0)}`, suffix: "", danger: totalOverdue > 0 },
          { label: "Offen", value: invoices?.filter((i: any) => i.status === "sent").length ?? 0, suffix: "versendet" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${item.danger ? "text-destructive" : ""}`}>{item.value}</p>
              {item.suffix && <p className="text-xs text-muted-foreground">{item.suffix}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : invoices?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Keine Rechnungen vorhanden</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>Erste Rechnung erstellen</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rechnungs-Nr.</TableHead>
                    <TableHead>Restaurant</TableHead>
                    <TableHead>Betrag</TableHead>
                    <TableHead>MwSt.</TableHead>
                    <TableHead>Gesamt</TableHead>
                    <TableHead>Währung</TableHead>
                    <TableHead>Fällig</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erstellt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices?.map((inv: any) => {
                    const status = STATUS_LABELS[inv.status] ?? STATUS_LABELS.draft;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-sm">{inv.invoiceNumber ?? `#${inv.id}`}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">#{inv.restaurantId}</TableCell>
                        <TableCell className="text-sm">{Number(inv.amount).toFixed(2)}</TableCell>
                        <TableCell className="text-sm">{Number(inv.taxAmount ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-sm font-semibold">{Number(inv.totalAmount).toFixed(2)}</TableCell>
                        <TableCell className="text-sm">{inv.currency ?? "CHF"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("de-CH") : "—"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={inv.status}
                            onValueChange={(v) => updateMutation.mutate({ id: inv.id, status: v as any })}
                          >
                            <SelectTrigger className="h-7 text-xs w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Entwurf</SelectItem>
                              <SelectItem value="sent">Versendet</SelectItem>
                              <SelectItem value="paid">Bezahlt</SelectItem>
                              <SelectItem value="overdue">Überfällig</SelectItem>
                              <SelectItem value="cancelled">Storniert</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("de-CH") : "—"}
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Rechnung</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Restaurant-ID *</Label>
                <Input type="number" placeholder="1" value={form.restaurantId} onChange={(e) => setForm(p => ({ ...p, restaurantId: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Rechnungs-Nr.</Label>
                <Input placeholder="RE-2026-001" value={form.invoiceNumber} onChange={(e) => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Betrag *</Label>
                <Input type="number" placeholder="100.00" value={form.amount} onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>MwSt.</Label>
                <Input type="number" placeholder="7.70" value={form.taxAmount} onChange={(e) => setForm(p => ({ ...p, taxAmount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Gesamt *</Label>
                <Input type="number" placeholder="107.70" value={form.totalAmount} onChange={(e) => setForm(p => ({ ...p, totalAmount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Beschreibung</Label>
              <Input placeholder="Monatliche Lizenzgebühr" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Erstelle..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
