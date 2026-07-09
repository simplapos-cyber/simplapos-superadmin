import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Grid3X3, Users } from "lucide-react";

const AREAS = ["Innen", "Terrasse", "Bar", "VIP", "Garten", "Obergeschoss"];

export default function AdminTables() {
  const utils = trpc.useUtils();
  const { data: tables, isLoading } = trpc.restaurantAdmin.listTables.useQuery();
  const createTable = trpc.restaurantAdmin.createTable.useMutation({
    onSuccess: () => {
      utils.restaurantAdmin.listTables.invalidate();
      toast.success("Tisch erfolgreich erstellt");
      setCreateOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateTable = trpc.restaurantAdmin.updateTable.useMutation({
    onSuccess: () => {
      utils.restaurantAdmin.listTables.invalidate();
      toast.success("Tisch aktualisiert");
      setEditOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteTable = trpc.restaurantAdmin.deleteTable.useMutation({
    onSuccess: () => {
      utils.restaurantAdmin.listTables.invalidate();
      toast.success("Tisch gelöscht");
    },
    onError: (err) => toast.error(err.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  // Create form
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(4);
  const [area, setArea] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editSeats, setEditSeats] = useState(4);
  const [editArea, setEditArea] = useState("");
  const [editActive, setEditActive] = useState(true);

  const resetForm = () => {
    setName("");
    setSeats(4);
    setArea("");
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Bitte einen Tischnamen eingeben");
      return;
    }
    createTable.mutate({ name: name.trim(), seats, area: area || undefined });
  };

  const openEdit = (table: any) => {
    setEditTarget(table);
    setEditName(table.name);
    setEditSeats(table.seats || 4);
    setEditArea(table.area || "");
    setEditActive(table.isActive !== false);
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editTarget) return;
    updateTable.mutate({
      id: editTarget.id,
      name: editName,
      seats: editSeats,
      area: editArea || undefined,
      isActive: editActive,
    });
  };

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  // Group tables by area
  const tableList = tables || [];
  type TableItem = NonNullable<typeof tables>[0];
  const areas: string[] = Array.from(new Set(tableList.map((t: TableItem) => t.area || "Ohne Bereich")));
  const totalTables = tableList.length;
  const activeTables = tableList.filter((t: TableItem) => t.isActive !== false).length;
  const totalSeats = tableList.reduce((sum: number, t: TableItem) => sum + (t.seats || 0), 0);

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tischplan</h1>
          <p className="text-muted-foreground">
            {totalTables} Tische · {totalSeats} Sitzplätze · {activeTables} aktiv
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Tisch hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuer Tisch</DialogTitle>
              <DialogDescription>Erstellen Sie einen neuen Tisch für Ihren Tischplan</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tischname / Nummer *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Tisch 1, A1, Terrasse 3" />
              </div>
              <div>
                <Label>Sitzplätze</Label>
                <Input type="number" min={1} max={50} value={seats} onChange={e => setSeats(parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <Label>Bereich (optional)</Label>
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger>
                    <SelectValue placeholder="Bereich wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Bereich</SelectItem>
                    {AREAS.map(a => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={createTable.isPending}>
                {createTable.isPending ? "Erstelle..." : "Erstellen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table Grid grouped by area */}
      {tableList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Grid3X3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Noch keine Tische erstellt</p>
            <p className="text-sm mt-1">Erstellen Sie Ihren Tischplan, um Bestellungen Tischen zuordnen zu können</p>
          </CardContent>
        </Card>
      ) : (
        areas.map(areaName => {
          const areaTables = tableList.filter((t: TableItem) => (t.area || "Ohne Bereich") === areaName);
          return (
            <div key={areaName} className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {areaName}
                <Badge variant="secondary">{areaTables.length} Tische</Badge>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {areaTables.map((table: TableItem) => (
                  <Card
                    key={table.id}
                    className={`relative group transition-all hover:shadow-md ${
                      table.isActive === false ? "opacity-50 border-dashed" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-lg">{table.name}</span>
                        {table.isActive === false && (
                          <Badge variant="secondary" className="text-xs">Inaktiv</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        <span>{table.seats || "–"} Plätze</span>
                      </div>
                      {/* Action buttons on hover */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(table)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm(`Tisch "${table.name}" wirklich löschen?`)) {
                              deleteTable.mutate({ id: table.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tisch bearbeiten</DialogTitle>
            <DialogDescription>Tisch "{editTarget?.name}" bearbeiten</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tischname / Nummer</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Sitzplätze</Label>
              <Input type="number" min={1} max={50} value={editSeats} onChange={e => setEditSeats(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label>Bereich</Label>
              <Select value={editArea || "none"} onValueChange={v => setEditArea(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Bereich</SelectItem>
                  {AREAS.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Aktiv</Label>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Abbrechen</Button>
            <Button onClick={handleUpdate} disabled={updateTable.isPending}>
              {updateTable.isPending ? "Speichere..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
