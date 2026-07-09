import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, TrendingUp, TrendingDown, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";

function KassenbuchInner() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 16),
    type: "einnahme" as "einnahme" | "ausgabe" | "kassensturz",
    amount: "",
    description: "",
    category: "",
    receiptNumber: "",
    notes: "",
  });

  const { data: entries, refetch } = trpc.kassenbuch.listEntries.useQuery(
    { restaurantId },
    { enabled: !!restaurantId }
  );

  const createEntry = trpc.kassenbuch.createEntry.useMutation({
    onSuccess: () => { refetch(); setOpen(false); toast.success("Eintrag erstellt"); },
    onError: (e) => toast.error(e.message),
  });

  const totalEinnahmen = entries?.filter((e: any) => e.type === "einnahme").reduce((s: number, e: any) => s + parseFloat(e.amount), 0) ?? 0;
  const totalAusgaben = entries?.filter((e: any) => e.type === "ausgabe").reduce((s: number, e: any) => s + parseFloat(e.amount), 0) ?? 0;
  const saldo = totalEinnahmen - totalAusgaben;

  const typeColor = (type: string) => ({
    einnahme: "bg-green-100 text-green-800",
    ausgabe: "bg-red-100 text-red-800",
    kassensturz: "bg-blue-100 text-blue-800",
  }[type] ?? "bg-gray-100 text-gray-800");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kassenbuch</h1>
          <p className="text-muted-foreground text-sm">Einnahmen, Ausgaben und Kassenstürze</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Neuer Eintrag</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Kassenbuch-Eintrag</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Typ</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="einnahme">Einnahme</SelectItem>
                      <SelectItem value="ausgabe">Ausgabe</SelectItem>
                      <SelectItem value="kassensturz">Kassensturz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Betrag (CHF)</Label>
                  <Input placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Beschreibung *</Label>
                <Input placeholder="z.B. Bareinnahme Mittagsservice" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Kategorie</Label>
                  <Input placeholder="z.B. Betriebskosten" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Belegnummer</Label>
                  <Input placeholder="z.B. RE-2024-001" value={form.receiptNumber} onChange={e => setForm(f => ({ ...f, receiptNumber: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Datum & Uhrzeit</Label>
                <Input type="datetime-local" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Notizen</Label>
                <Textarea placeholder="Optionale Notizen..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={() => createEntry.mutate({ restaurantId, ...form })} disabled={!form.description || !form.amount || createEntry.isPending}>
                {createEntry.isPending ? "Speichern..." : "Eintrag speichern"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Übersicht */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Einnahmen</p>
                <p className="text-xl font-bold text-green-600">CHF {totalEinnahmen.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Ausgaben</p>
                <p className="text-xl font-bold text-red-600">CHF {totalAusgaben.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Saldo</p>
                <p className={`text-xl font-bold ${saldo >= 0 ? "text-green-600" : "text-red-600"}`}>CHF {saldo.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Einträge */}
      <Card>
        <CardHeader>
          <CardTitle>Einträge</CardTitle>
        </CardHeader>
        <CardContent>
          {!entries?.length ? (
            <p className="text-center text-muted-foreground py-8">Noch keine Einträge vorhanden.</p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Badge className={typeColor(entry.type)}>{entry.type}</Badge>
                    <div>
                      <p className="font-medium text-sm">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.entryDate).toLocaleString("de-CH")}
                        {entry.category && ` · ${entry.category}`}
                        {entry.receiptNumber && ` · ${entry.receiptNumber}`}
                      </p>
                    </div>
                  </div>
                  <p className={`font-bold ${entry.type === "einnahme" ? "text-green-600" : entry.type === "ausgabe" ? "text-red-600" : "text-blue-600"}`}>
                    {entry.type === "ausgabe" ? "-" : "+"}CHF {parseFloat(entry.amount).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Kassenbuch() {
  return (
    <ModuleGate moduleId="kassenbuch">
      <KassenbuchInner />
    </ModuleGate>
  );
}
