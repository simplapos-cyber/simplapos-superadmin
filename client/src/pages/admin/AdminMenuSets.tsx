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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, BookOpen, GripVertical, X } from "lucide-react";

type SetCourse = {
  id: number;
  menuSetId: number;
  name: string;
  courseNumber: number;
  minChoices: number;
  maxChoices: number;
  menuItemIds: number[];
  sortOrder: number;
};

type MenuSet = {
  id: number;
  name: string;
  description: string | null;
  price: string;
  isActive: boolean;
  availabilityType: "always" | "scheduled" | "manual";
  availabilitySchedule: unknown;
  sortOrder: number;
  courses: SetCourse[];
};

type MenuItem = {
  id: number;
  name: string;
  price: string;
  categoryId: number | null;
};

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function AdminMenuSets() {
  const utils = trpc.useUtils();

  const { data: sets = [], isLoading } = trpc.menu.listSets.useQuery();
  const { data: menuData } = trpc.menu.getFullMenu.useQuery();

  const allItems: MenuItem[] = (menuData as { items?: MenuItem[] } | undefined)?.items ?? [];

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Set dialog
  const [setDlg, setSetDlg] = useState<{ open: boolean; item: MenuSet | null }>({ open: false, item: null });
  const [sName, setSName] = useState("");
  const [sDesc, setSDesc] = useState("");
  const [sPrice, setSPrice] = useState("");
  const [sActive, setSActive] = useState(true);
  const [sAvailType, setSAvailType] = useState<"always" | "scheduled" | "manual">("always");
  const [sSchedule, setSSchedule] = useState<Record<string, { from: string; to: string; active: boolean }>>(() =>
    Object.fromEntries(DAY_KEYS.map(d => [d, { from: "11:00", to: "14:00", active: false }]))
  );

  // Course dialog
  const [courseDlg, setCourseDlg] = useState<{ open: boolean; setId: number | null; item: SetCourse | null }>({ open: false, setId: null, item: null });
  const [cName, setCName] = useState("");
  const [cNumber, setCNumber] = useState("1");
  const [cMin, setCMin] = useState("1");
  const [cMax, setCMax] = useState("1");
  const [cItems, setCItems] = useState<number[]>([]);
  const [cSearch, setCSearch] = useState("");

  // Delete dialog
  const [deleteDlg, setDeleteDlg] = useState<{ open: boolean; type: "set" | "course"; id: number; name: string } | null>(null);

  const upsertSet = trpc.menu.upsertSet.useMutation({
    onSuccess: () => { utils.menu.listSets.invalidate(); setSetDlg({ open: false, item: null }); toast.success("Menü gespeichert"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteSet = trpc.menu.deleteSet.useMutation({
    onSuccess: () => { utils.menu.listSets.invalidate(); setDeleteDlg(null); toast.success("Menü gelöscht"); },
    onError: (e) => toast.error(e.message),
  });
  const upsertCourse = trpc.menu.upsertSetCourse.useMutation({
    onSuccess: () => { utils.menu.listSets.invalidate(); setCourseDlg({ open: false, setId: null, item: null }); toast.success("Gang gespeichert"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCourse = trpc.menu.deleteSetCourse.useMutation({
    onSuccess: () => { utils.menu.listSets.invalidate(); setDeleteDlg(null); toast.success("Gang gelöscht"); },
    onError: (e) => toast.error(e.message),
  });

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openSetDlg(item: MenuSet | null) {
    setSName(item?.name ?? "");
    setSDesc(item?.description ?? "");
    setSPrice(item?.price ?? "");
    setSActive(item?.isActive ?? true);
    setSAvailType(item?.availabilityType ?? "always");
    const sched = item?.availabilitySchedule as Record<string, { from: string; to: string; active: boolean }> | null;
    if (sched) setSSchedule(sched);
    else setSSchedule(Object.fromEntries(DAY_KEYS.map(d => [d, { from: "11:00", to: "14:00", active: false }])));
    setSetDlg({ open: true, item });
  }

  function openCourseDlg(setId: number, item: SetCourse | null) {
    setCName(item?.name ?? "");
    setCNumber(String(item?.courseNumber ?? 1));
    setCMin(String(item?.minChoices ?? 1));
    setCMax(String(item?.maxChoices ?? 1));
    setCItems(item?.menuItemIds ?? []);
    setCSearch("");
    setCourseDlg({ open: true, setId, item });
  }

  function saveSet() {
    upsertSet.mutate({
      id: setDlg.item?.id,
      name: sName.trim(),
      description: sDesc.trim() || undefined,
      price: parseFloat(sPrice).toFixed(2),
      isActive: sActive,
      availabilityType: sAvailType,
      availabilitySchedule: sAvailType === "scheduled" ? sSchedule : undefined,
    });
  }

  function saveCourse() {
    if (!courseDlg.setId) return;
    upsertCourse.mutate({
      id: courseDlg.item?.id,
      menuSetId: courseDlg.setId,
      name: cName.trim(),
      courseNumber: parseInt(cNumber) || 1,
      minChoices: parseInt(cMin) || 1,
      maxChoices: parseInt(cMax) || 1,
      menuItemIds: cItems,
    });
  }

  const filteredItems = allItems.filter(i =>
    cSearch ? i.name.toLowerCase().includes(cSearch.toLowerCase()) : true
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Menüs & Sets</h1>
          <p className="text-muted-foreground text-sm mt-1">Verwalte Fixmenüs, Mittagsmenüs und Gangmenüs mit wählbaren Gerichten pro Gang</p>
        </div>
        <Button onClick={() => openSetDlg(null)}>
          <Plus className="w-4 h-4 mr-2" />Neues Menü
        </Button>
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground">Lade Menüs…</div>}

      {!isLoading && (sets as unknown as MenuSet[]).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Noch keine Menüs</p>
            <p className="text-sm mt-1">Erstelle dein erstes Menü (z.B. "Mittagsmenü", "Businesslunch", "Degustationsmenü")</p>
            <Button className="mt-4" onClick={() => openSetDlg(null)}><Plus className="w-4 h-4 mr-2" />Erstes Menü erstellen</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(sets as unknown as MenuSet[]).map(set => {
          const isExpanded = expanded.has(set.id);
          return (
            <Card key={set.id} className="overflow-hidden">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleExpand(set.id)} className="p-1 rounded hover:bg-muted transition-colors">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{set.name}</span>
                      <Badge variant="outline" className="text-xs font-mono">CHF {parseFloat(set.price).toFixed(2)}</Badge>
                      {!set.isActive && <Badge variant="secondary" className="text-xs">Inaktiv</Badge>}
                      {set.availabilityType === "scheduled" && <Badge variant="secondary" className="text-xs">Zeitgesteuert</Badge>}
                      {set.availabilityType === "manual" && <Badge variant="secondary" className="text-xs">Manuell</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {set.courses.length} {set.courses.length === 1 ? "Gang" : "Gänge"}
                      {set.description && ` · ${set.description}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openSetDlg(set)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteDlg({ open: true, type: "set", id: set.id, name: set.name })}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0 pb-3 px-4">
                  <Separator className="mb-3" />
                  <div className="space-y-2">
                    {set.courses.sort((a, b) => a.courseNumber - b.courseNumber).map(course => {
                      const courseItems = allItems.filter(i => (course.menuItemIds ?? []).includes(i.id));
                      return (
                        <div key={course.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                          <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">Gang {course.courseNumber}</Badge>
                              <span className="text-sm font-medium">{course.name}</span>
                              <span className="text-xs text-muted-foreground">Wähle {course.minChoices}–{course.maxChoices}</span>
                            </div>
                            {courseItems.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                {courseItems.map(i => i.name).join(", ")}
                              </p>
                            )}
                            {courseItems.length === 0 && (
                              <p className="text-xs text-amber-600 mt-1">Keine Gerichte zugewiesen</p>
                            )}
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openCourseDlg(set.id, course)}><Pencil className="w-3 h-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteDlg({ open: true, type: "course", id: course.id, name: course.name })}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      );
                    })}
                    {set.courses.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">Noch keine Gänge – füge den ersten Gang hinzu</p>
                    )}
                    <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => openCourseDlg(set.id, null)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />Gang hinzufügen
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Set Dialog */}
      <Dialog open={setDlg.open} onOpenChange={o => !o && setSetDlg({ open: false, item: null })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{setDlg.item ? "Menü bearbeiten" : "Neues Menü erstellen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">Name *</Label>
              <Input className="mt-1" value={sName} onChange={e => setSName(e.target.value)} placeholder="z.B. Mittagsmenü, Businesslunch, Degustationsmenü" />
            </div>
            <div>
              <Label className="text-sm">Beschreibung</Label>
              <Textarea className="mt-1" value={sDesc} onChange={e => setSDesc(e.target.value)} placeholder="Kurze Beschreibung des Menüs…" rows={2} />
            </div>
            <div>
              <Label className="text-sm">Preis (CHF) *</Label>
              <Input className="mt-1" type="number" step="0.50" value={sPrice} onChange={e => setSPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Aktiv</p>
                <p className="text-xs text-muted-foreground">Menü ist bestellbar</p>
              </div>
              <Switch checked={sActive} onCheckedChange={setSActive} />
            </div>
            <div>
              <Label className="text-sm">Verfügbarkeit</Label>
              <Select value={sAvailType} onValueChange={v => setSAvailType(v as "always" | "scheduled" | "manual")}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Immer verfügbar</SelectItem>
                  <SelectItem value="scheduled">Zeitgesteuert (z.B. Mo–Fr 11–14 Uhr)</SelectItem>
                  <SelectItem value="manual">Manuell aktivieren/deaktivieren</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {sAvailType === "scheduled" && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium mb-2">Verfügbarkeitszeiten</p>
                {DAY_KEYS.map((day, i) => (
                  <div key={day} className="flex items-center gap-3">
                    <Switch checked={sSchedule[day]?.active ?? false} onCheckedChange={v => setSSchedule(prev => ({ ...prev, [day]: { ...prev[day], active: v } }))} />
                    <span className="text-sm w-6 shrink-0">{DAYS[i]}</span>
                    <Input type="time" className="h-7 text-xs" value={sSchedule[day]?.from ?? "11:00"} onChange={e => setSSchedule(prev => ({ ...prev, [day]: { ...prev[day], from: e.target.value } }))} disabled={!sSchedule[day]?.active} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="time" className="h-7 text-xs" value={sSchedule[day]?.to ?? "14:00"} onChange={e => setSSchedule(prev => ({ ...prev, [day]: { ...prev[day], to: e.target.value } }))} disabled={!sSchedule[day]?.active} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetDlg({ open: false, item: null })}>Abbrechen</Button>
            <Button onClick={saveSet} disabled={!sName.trim() || !sPrice || upsertSet.isPending}>
              {upsertSet.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Course Dialog */}
      <Dialog open={courseDlg.open} onOpenChange={o => !o && setCourseDlg({ open: false, setId: null, item: null })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{courseDlg.item ? "Gang bearbeiten" : "Neuer Gang"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">Name des Gangs *</Label>
              <Input className="mt-1" value={cName} onChange={e => setCName(e.target.value)} placeholder="z.B. Vorspeise, Hauptgang, Dessert" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-sm">Gang-Nr.</Label>
                <Input className="mt-1" type="number" min="1" max="10" value={cNumber} onChange={e => setCNumber(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">Min. Wahl</Label>
                <Input className="mt-1" type="number" min="0" value={cMin} onChange={e => setCMin(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">Max. Wahl</Label>
                <Input className="mt-1" type="number" min="1" value={cMax} onChange={e => setCMax(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-sm">Gerichte für diesen Gang</Label>
              <Input className="mt-1" value={cSearch} onChange={e => setCSearch(e.target.value)} placeholder="Gericht suchen…" />
              <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg divide-y">
                {filteredItems.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Keine Gerichte gefunden</p>
                )}
                {filteredItems.map(item => {
                  const selected = cItems.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors ${selected ? "bg-primary/5" : ""}`}
                      onClick={() => setCItems(prev => selected ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                    >
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                        {selected && <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <span className="text-sm flex-1">{item.name}</span>
                      <span className="text-xs text-muted-foreground">CHF {parseFloat(item.price).toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
              {cItems.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {cItems.map(id => {
                    const item = allItems.find(i => i.id === id);
                    if (!item) return null;
                    return (
                      <Badge key={id} variant="secondary" className="text-xs gap-1">
                        {item.name}
                        <button onClick={() => setCItems(prev => prev.filter(i => i !== id))}><X className="w-2.5 h-2.5" /></button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCourseDlg({ open: false, setId: null, item: null })}>Abbrechen</Button>
            <Button onClick={saveCourse} disabled={!cName.trim() || upsertCourse.isPending}>
              {upsertCourse.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteDlg?.open} onOpenChange={o => !o && setDeleteDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{deleteDlg?.type === "set" ? "Menü löschen?" : "Gang löschen?"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {deleteDlg?.type === "set"
              ? `Das Menü "${deleteDlg?.name}" und alle zugehörigen Gänge werden unwiderruflich gelöscht.`
              : `Der Gang "${deleteDlg?.name}" wird unwiderruflich gelöscht.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDlg(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => {
              if (!deleteDlg) return;
              if (deleteDlg.type === "set") deleteSet.mutate({ id: deleteDlg.id });
              else deleteCourse.mutate({ id: deleteDlg.id });
            }}>Löschen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
