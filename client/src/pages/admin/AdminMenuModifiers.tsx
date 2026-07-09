import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Tag } from "lucide-react";

type Modifier = {
  id: number;
  name: string;
  priceAdjustment: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

type ModifierGroup = {
  id: number;
  name: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  isActive: boolean;
  modifiers?: Modifier[];
};

const EMPTY_GROUP = {
  name: "",
  selectionType: "multiple" as "single" | "multiple" | "quantity",
  isRequired: false,
  minSelections: 0,
  maxSelections: null as number | null,
};

const EMPTY_MODIFIER = {
  name: "",
  priceAdjustment: "0.00",
  isDefault: false,
};

export default function AdminMenuModifiers() {
  const utils = trpc.useUtils();

  const { data: groups = [], isLoading } = trpc.menu.listModifierGroups.useQuery();

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [groupDlg, setGroupDlg] = useState<{ open: boolean; item: ModifierGroup | null }>({ open: false, item: null });
  const [modDlg, setModDlg] = useState<{ open: boolean; groupId: number | null; item: Modifier | null }>({ open: false, groupId: null, item: null });
  const [deleteDlg, setDeleteDlg] = useState<{ open: boolean; type: "group" | "modifier"; id: number; name: string } | null>(null);

  // Group form state
  const [gName, setGName] = useState("");
  const [gType, setGType] = useState<"single" | "multiple" | "quantity">("multiple");
  const [gRequired, setGRequired] = useState(false);
  const [gMin, setGMin] = useState("0");
  const [gMax, setGMax] = useState("");

  // Modifier form state
  const [mName, setMName] = useState("");
  const [mPrice, setMPrice] = useState("0.00");
  const [mDefault, setMDefault] = useState(false);

  const upsertGroup = trpc.menu.upsertModifierGroup.useMutation({
    onSuccess: () => { utils.menu.listModifierGroups.invalidate(); setGroupDlg({ open: false, item: null }); toast.success("Gruppe gespeichert"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteGroup = trpc.menu.deleteModifierGroup.useMutation({
    onSuccess: () => { utils.menu.listModifierGroups.invalidate(); setDeleteDlg(null); toast.success("Gruppe gelöscht"); },
    onError: (e) => toast.error(e.message),
  });
  const upsertMod = trpc.menu.upsertModifier.useMutation({
    onSuccess: () => { utils.menu.listModifierGroups.invalidate(); setModDlg({ open: false, groupId: null, item: null }); toast.success("Option gespeichert"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMod = trpc.menu.deleteModifier.useMutation({
    onSuccess: () => { utils.menu.listModifierGroups.invalidate(); setDeleteDlg(null); toast.success("Option gelöscht"); },
    onError: (e) => toast.error(e.message),
  });

  function openGroupDlg(item: ModifierGroup | null) {
    setGName(item?.name ?? "");
    setGType((item?.selectionType as "single" | "multiple" | "quantity") ?? "multiple");
    setGRequired(item?.isRequired ?? false);
    setGMin(String(item?.minSelections ?? 0));
    setGMax(item?.maxSelections != null ? String(item.maxSelections) : "");
    setGroupDlg({ open: true, item });
  }

  function openModDlg(groupId: number, item: Modifier | null) {
    setMName(item?.name ?? "");
    setMPrice(item?.priceAdjustment ?? "0.00");
    setMDefault(item?.isDefault ?? false);
    setModDlg({ open: true, groupId, item });
  }

  function toggleExpand(id: number) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function saveGroup() {
    upsertGroup.mutate({
      id: groupDlg.item?.id,
      name: gName.trim(),
      selectionType: gType,
      isRequired: gRequired,
      minSelections: parseInt(gMin) || 0,
      maxSelections: gMax ? parseInt(gMax) : null,
    });
  }

  function saveMod() {
    if (!modDlg.groupId) return;
    upsertMod.mutate({
      id: modDlg.item?.id,
      groupId: modDlg.groupId,
      name: mName.trim(),
      priceAdjustment: parseFloat(mPrice).toFixed(2),
      isDefault: mDefault,
    });
  }

  const selectionTypeLabel = (t: string) => t === "single" ? "Einzelauswahl" : t === "multiple" ? "Mehrfachauswahl" : "Mengenauswahl";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Extras & Modifier</h1>
          <p className="text-muted-foreground text-sm mt-1">Verwalte Extras-Gruppen (z.B. Beilagen, Saucen) und deren Optionen (z.B. Pommes, Salat, ohne Zwiebeln)</p>
        </div>
        <Button onClick={() => openGroupDlg(null)}>
          <Plus className="w-4 h-4 mr-2" />Neue Gruppe
        </Button>
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground">Lade Modifier-Gruppen…</div>}

      {!isLoading && (groups as unknown as ModifierGroup[]).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Noch keine Modifier-Gruppen</p>
            <p className="text-sm mt-1">Erstelle deine erste Gruppe (z.B. "Beilagen", "Extras", "Saucen")</p>
            <Button className="mt-4" onClick={() => openGroupDlg(null)}><Plus className="w-4 h-4 mr-2" />Erste Gruppe erstellen</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(groups as unknown as ModifierGroup[]).map(group => {
          const expanded = expandedGroups.has(group.id);
          return (
            <Card key={group.id} className="overflow-hidden">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleExpand(group.id)} className="p-1 rounded hover:bg-muted transition-colors">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{group.name}</span>
                      <Badge variant="outline" className="text-xs">{selectionTypeLabel(group.selectionType)}</Badge>
                      {group.isRequired && <Badge variant="destructive" className="text-xs">Pflicht</Badge>}
                      {group.minSelections > 0 && <Badge variant="secondary" className="text-xs">min {group.minSelections}</Badge>}
                      {group.maxSelections != null && <Badge variant="secondary" className="text-xs">max {group.maxSelections}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{group.modifiers?.length ?? 0} Optionen</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openGroupDlg(group)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteDlg({ open: true, type: "group", id: group.id, name: group.name })}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardHeader>

              {expanded && (
                <CardContent className="pt-0 pb-3 px-4">
                  <Separator className="mb-3" />
                  <div className="space-y-2">
                    {(group.modifiers ?? []).map(mod => (
                      <div key={mod.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{mod.name}</span>
                            {mod.isDefault && <Badge variant="secondary" className="text-xs">Standard</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {parseFloat(mod.priceAdjustment) === 0 ? "kostenlos" : parseFloat(mod.priceAdjustment) > 0 ? `+${parseFloat(mod.priceAdjustment).toFixed(2)} CHF` : `${parseFloat(mod.priceAdjustment).toFixed(2)} CHF`}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openModDlg(group.id, mod)}><Pencil className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteDlg({ open: true, type: "modifier", id: mod.id, name: mod.name })}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ))}
                    {(group.modifiers ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">Noch keine Optionen – füge die erste Option hinzu</p>
                    )}
                    <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => openModDlg(group.id, null)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />Option hinzufügen
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Group Dialog */}
      <Dialog open={groupDlg.open} onOpenChange={o => !o && setGroupDlg({ open: false, item: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{groupDlg.item ? "Gruppe bearbeiten" : "Neue Modifier-Gruppe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">Name der Gruppe *</Label>
              <Input className="mt-1" value={gName} onChange={e => setGName(e.target.value)} placeholder="z.B. Beilagen, Saucen, Extras" />
            </div>
            <div>
              <Label className="text-sm">Auswahltyp</Label>
              <Select value={gType} onValueChange={v => setGType(v as "single" | "multiple" | "quantity")}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Einzelauswahl (genau eine Option)</SelectItem>
                  <SelectItem value="multiple">Mehrfachauswahl (mehrere Optionen)</SelectItem>
                  <SelectItem value="quantity">Mengenauswahl (Anzahl wählbar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Pflichtauswahl</p>
                <p className="text-xs text-muted-foreground">Kellner muss eine Option wählen bevor boniert werden kann</p>
              </div>
              <Switch checked={gRequired} onCheckedChange={setGRequired} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Mindestauswahl</Label>
                <Input className="mt-1" type="number" min="0" value={gMin} onChange={e => setGMin(e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label className="text-sm">Maximalauswahl</Label>
                <Input className="mt-1" type="number" min="1" value={gMax} onChange={e => setGMax(e.target.value)} placeholder="unbegrenzt" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDlg({ open: false, item: null })}>Abbrechen</Button>
            <Button onClick={saveGroup} disabled={!gName.trim() || upsertGroup.isPending}>
              {upsertGroup.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modifier Dialog */}
      <Dialog open={modDlg.open} onOpenChange={o => !o && setModDlg({ open: false, groupId: null, item: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{modDlg.item ? "Option bearbeiten" : "Neue Option"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">Name *</Label>
              <Input className="mt-1" value={mName} onChange={e => setMName(e.target.value)} placeholder="z.B. Pommes, ohne Zwiebeln, extra Käse" />
            </div>
            <div>
              <Label className="text-sm">Aufpreis (CHF)</Label>
              <Input className="mt-1" type="number" step="0.10" value={mPrice} onChange={e => setMPrice(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-muted-foreground mt-1">0.00 = kostenlos · positive Werte = Aufpreis · negative Werte = Rabatt</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Standardmässig ausgewählt</p>
                <p className="text-xs text-muted-foreground">Diese Option ist beim Öffnen bereits markiert</p>
              </div>
              <Switch checked={mDefault} onCheckedChange={setMDefault} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModDlg({ open: false, groupId: null, item: null })}>Abbrechen</Button>
            <Button onClick={saveMod} disabled={!mName.trim() || upsertMod.isPending}>
              {upsertMod.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteDlg?.open} onOpenChange={o => !o && setDeleteDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{deleteDlg?.type === "group" ? "Gruppe löschen?" : "Option löschen?"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {deleteDlg?.type === "group"
              ? `Die Gruppe "${deleteDlg?.name}" und alle zugehörigen Optionen werden unwiderruflich gelöscht.`
              : `Die Option "${deleteDlg?.name}" wird unwiderruflich gelöscht.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDlg(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => {
              if (!deleteDlg) return;
              if (deleteDlg.type === "group") deleteGroup.mutate({ id: deleteDlg.id });
              else deleteMod.mutate({ id: deleteDlg.id });
            }}>Löschen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
