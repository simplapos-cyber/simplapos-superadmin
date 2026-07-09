import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Monitor, Printer, Tablet, Wrench } from "lucide-react";

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof Package }> = {
  tablet: { label: "Tablet", icon: Tablet },
  drucker: { label: "Drucker", icon: Printer },
  monitor: { label: "Monitor", icon: Monitor },
  zubehoer: { label: "Zubehör", icon: Wrench },
};

interface HardwareForm {
  name: string;
  description: string;
  category: "tablet" | "drucker" | "monitor" | "zubehoer";
  price: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: string;
}

const emptyForm: HardwareForm = {
  name: "",
  description: "",
  category: "tablet",
  price: "",
  imageUrl: "",
  isActive: true,
  sortOrder: "0",
};

export default function Hardware() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HardwareForm>(emptyForm);

  const { data: products, isLoading } = trpc.hardware.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.hardware.create.useMutation({
    onSuccess: () => {
      utils.hardware.list.invalidate();
      setShowDialog(false);
      setForm(emptyForm);
      toast.success("Produkt erstellt");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.hardware.update.useMutation({
    onSuccess: () => {
      utils.hardware.list.invalidate();
      setShowDialog(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success("Produkt aktualisiert");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.hardware.delete.useMutation({
    onSuccess: () => {
      utils.hardware.list.invalidate();
      toast.success("Produkt gelöscht");
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowDialog(true);
  }

  function openEdit(product: any) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description || "",
      category: product.category,
      price: String(product.price),
      imageUrl: product.imageUrl || "",
      isActive: product.isActive,
      sortOrder: String(product.sortOrder),
    });
    setShowDialog(true);
  }

  function handleSubmit() {
    const price = parseFloat(form.price);
    if (!form.name || isNaN(price) || price < 0) {
      toast.error("Name und gültiger Preis sind erforderlich");
      return;
    }
    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category,
      price,
      imageUrl: form.imageUrl || undefined,
      isActive: form.isActive,
      sortOrder: parseInt(form.sortOrder) || 0,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(id: number, name: string) {
    if (confirm(`"${name}" wirklich löschen?`)) {
      deleteMutation.mutate({ id });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hardware-Katalog</h1>
          <p className="text-muted-foreground">Verwalte Tablets, Drucker, Monitore und Zubehör für den Verkauf</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Neues Produkt
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead>Kategorie</TableHead>
                <TableHead className="text-right">Preis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Laden...</TableCell></TableRow>
              ) : !products?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Keine Produkte vorhanden</TableCell></TableRow>
              ) : (
                products.map((p: any) => {
                  const cat = CATEGORY_LABELS[p.category] || { label: p.category, icon: Package };
                  const Icon = cat.icon;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                              <Icon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{p.name}</p>
                            {p.description && <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{cat.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">CHF {Number(p.price).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "default" : "secondary"}>
                          {p.isActive ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(p.id, p.name)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Produkt bearbeiten" : "Neues Produkt"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Samsung Galaxy Tab A9" />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Kurze Beschreibung des Produkts" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kategorie *</Label>
                <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="drucker">Drucker</SelectItem>
                    <SelectItem value="monitor">Monitor</SelectItem>
                    <SelectItem value="zubehoer">Zubehör</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Preis (CHF) *</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="190.00" />
              </div>
            </div>
            <div>
              <Label>Bild-URL</Label>
              <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sortierung</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label>Aktiv</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Abbrechen</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
