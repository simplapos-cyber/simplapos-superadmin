import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface VoiceItem {
  recognizedName: string;
  qty: number;
  comment: string | null;
  course: string | null;
  action: "add" | "remove";
  menuItemId: number | null;
  matchedName: string;
  unitPrice: number;
  itemType: string;
  confidence: number;
  matched: boolean;
}

export interface VoiceGroup {
  tableNumber: number | null;
  items: VoiceItem[];
}

export interface VoiceResult {
  transcription: string;
  tableNumber: number | null;
  isMultiTable: boolean;
  items: VoiceItem[];
  groups: VoiceGroup[];
}

export interface TableEntry {
  id: number | string;
  label?: string;
}

interface Props {
  open: boolean;
  voiceResult: VoiceResult;
  allTables: TableEntry[];
  onClose: () => void;
  onConfirm: (groups: Array<{
    targetTableId: string;
    addItems: Array<{ menuItemId: number; matchedName: string; unitPrice: number; qty: number; notes?: string; course?: number }>;
    removeItems: Array<{ menuItemId: number; qty: number; matchedName: string }>;
  }>) => void;
}

const courseLabel = (c: string | null): string | null => {
  if (!c) return null;
  const cl = c.toLowerCase();
  if (cl.includes("vor") || cl === "1") return "Vorspeise";
  if (cl.includes("haupt") || cl === "2") return "Hauptgang";
  if (cl.includes("des") || cl === "3") return "Dessert";
  return c;
};

const courseNumber = (c: string | null): number | undefined => {
  if (!c) return undefined;
  const cl = c.toLowerCase();
  if (cl.includes("vor") || cl === "1") return 1;
  if (cl.includes("haupt") || cl === "2") return 2;
  if (cl.includes("des") || cl === "3") return 3;
  return undefined;
};

const resolveTable = (tableNumber: number | null, manualId: string, allTables: TableEntry[]): TableEntry | undefined => {
  if (tableNumber !== null) {
    const found = allTables.find(t =>
      t.label === String(tableNumber) ||
      t.label === `Tisch ${tableNumber}` ||
      t.label?.replace(/[^0-9]/g, "") === String(tableNumber)
    );
    if (found) return found;
  }
  if (manualId) return allTables.find(t => String(t.id) === manualId);
  return undefined;
};

export function VoiceOrderConfirmDialog({ open, voiceResult, allTables, onClose, onConfirm }: Props) {
  const [voiceComments, setVoiceComments] = useState<Record<string, string>>({});
  const [groupTableIds, setGroupTableIds] = useState<Record<number, string>>({});

  const groups = voiceResult.groups && voiceResult.groups.length > 0
    ? voiceResult.groups
    : [{ tableNumber: voiceResult.tableNumber, items: voiceResult.items }];
  const isMulti = groups.length > 1;

  const totalAdd = groups.flatMap(g => g.items).filter(i => i.matched && (i.action === "add" || !i.action)).length;
  const totalRemove = groups.flatMap(g => g.items).filter(i => i.matched && i.action === "remove").length;
  const hasAny = totalAdd > 0 || totalRemove > 0;

  const handleConfirm = () => {
    const result = groups.map((group, gi) => {
      const addItems = group.items.filter(i => i.matched && (i.action === "add" || !i.action));
      const removeItems = group.items.filter(i => i.matched && i.action === "remove");
      const resolved = resolveTable(group.tableNumber, groupTableIds[gi] ?? "", allTables);
      return {
        targetTableId: resolved ? String(resolved.id) : "",
        addItems: addItems.map((item, ii) => {
          const key = `${gi}-${ii}`;
          const comment = voiceComments[key]?.trim() || item.comment?.trim() || undefined;
          return {
            menuItemId: item.menuItemId!,
            matchedName: item.matchedName,
            unitPrice: item.unitPrice,
            qty: item.qty,
            notes: comment,
            course: courseNumber(item.course),
          };
        }),
        removeItems: removeItems.map(i => ({ menuItemId: i.menuItemId!, qty: i.qty, matchedName: i.matchedName })),
      };
    });
    onClose();
    onConfirm(result);
  };

  const allGroupsHaveTable = groups.every((group, gi) => {
    const resolved = resolveTable(group.tableNumber, groupTableIds[gi] ?? "", allTables);
    const hasItems = group.items.some(i => i.matched);
    return !hasItems || !!resolved;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sprachbestellung bestätigen</DialogTitle>
          <DialogDescription className="text-xs italic">„{voiceResult.transcription}"</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map((group, gi) => {
            const addItems = group.items.filter(i => i.matched && (i.action === "add" || !i.action));
            const removeItems = group.items.filter(i => i.matched && i.action === "remove");
            const unknownItems = group.items.filter(i => !i.matched);
            const resolved = resolveTable(group.tableNumber, groupTableIds[gi] ?? "", allTables);
            const manualId = groupTableIds[gi] ?? "";

            return (
              <div key={gi} className={`rounded-xl border p-3 space-y-2 ${isMulti ? "bg-muted/30" : ""}`}>
                {isMulti && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gruppe {gi + 1}</p>
                )}
                {/* Table selection */}
                {resolved ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Tisch:</span>
                    <span className="font-semibold">{resolved.label ?? `Tisch ${group.tableNumber}`}</span>
                    <span className="text-xs text-green-600">✓ erkannt</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tisch auswählen</Label>
                    <Select value={manualId} onValueChange={v => setGroupTableIds(prev => ({ ...prev, [gi]: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Tisch wählen…" /></SelectTrigger>
                      <SelectContent>
                        {allTables.map(t => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.label ?? `Tisch ${t.id}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Add items */}
                {addItems.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-green-700">Bonieren ({addItems.length})</p>
                    {addItems.map((item, ii) => {
                      const key = `${gi}-${ii}`;
                      const cl = courseLabel(item.course);
                      return (
                        <div key={ii} className="p-2 rounded-lg border border-green-200 bg-green-50">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm text-green-800">
                              {item.qty}× {item.matchedName}
                              {cl && <span className="ml-1.5 text-xs font-normal text-green-600 bg-green-100 px-1.5 py-0.5 rounded">{cl}</span>}
                            </p>
                            <span className="text-sm font-bold text-green-700">CHF {(item.qty * item.unitPrice).toFixed(2)}</span>
                          </div>
                          <input
                            type="text"
                            placeholder="Kommentar (z.B. ohne Sauce)"
                            value={voiceComments[key] ?? (item.comment ?? "")}
                            onChange={e => setVoiceComments(prev => ({ ...prev, [key]: e.target.value }))}
                            className="mt-1.5 w-full text-xs border border-green-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Remove items */}
                {removeItems.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-red-700">Stornieren ({removeItems.length})</p>
                    {removeItems.map((item, ii) => (
                      <div key={ii} className="p-2 rounded-lg border border-red-200 bg-red-50">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm text-red-800">−{item.qty}× {item.matchedName}</p>
                          <span className="text-xs text-red-600">wird entfernt</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Unknown items */}
                {unknownItems.length > 0 && (
                  <div className="space-y-1">
                    {unknownItems.map((item, ii) => (
                      <div key={ii} className="p-2 rounded-lg border border-orange-200 bg-orange-50">
                        <p className="text-xs text-orange-700">{item.qty}× „{item.recognizedName}" – nicht gefunden</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleConfirm} disabled={!hasAny || !allGroupsHaveTable}>
            {totalAdd > 0 && totalRemove > 0
              ? `${totalAdd} bonieren, ${totalRemove} stornieren`
              : totalAdd > 0
              ? `${totalAdd} Artikel bonieren`
              : totalRemove > 0
              ? `${totalRemove} Artikel stornieren`
              : "Bestätigen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
