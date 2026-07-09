import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Receipt, AlertCircle, ArrowLeft, CreditCard, Banknote, Smartphone, Minus, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSearch } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

type TableEntry = {
  id: number;
  sourceType: string;
  label: string;
  seats: number;
  currentOrder: { id: number; status: string; totalAmount: string | null; guestCount: number | null } | null;
};

type OrderItem = {
  id: number;
  productName: string;
  quantity: number;
  totalPrice: string;
  notes?: string | null;
  status: string;
};

type OrderWithItems = {
  id: number;
  status: string;
  subtotal: string | null;
  taxAmount: string | null;
  items: OrderItem[];
};

type PersonItemAssignment = { personIdx: number; qty: number; amount: number };

export default function Waiter_split() {
  const { t } = useLanguage();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const deepLinkOrderId = params.get("orderId") ? parseInt(params.get("orderId")!) : null;

  const [selectedTable, setSelectedTable] = useState<TableEntry | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [personLabels, setPersonLabels] = useState<string[]>(["Gast 1", "Gast 2"]);
  const [personAssignments, setPersonAssignments] = useState<Record<number, PersonItemAssignment[]>>({});
  const [personPayMethods, setPersonPayMethods] = useState<Record<number, "cash" | "card" | "twint" | "invoice">>({});
  const [paidPersons, setPaidPersons] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  const { data: planGroups = [], isLoading, isError, refetch } = trpc.order.getTableStatus.useQuery(undefined, { refetchInterval: 15_000 });

  // Deep-link: wenn orderId in URL, Tisch automatisch vorauswählen
  useEffect(() => {
    if (!deepLinkOrderId || selectedTable || planGroups.length === 0) return;
    const allTables = planGroups.flatMap((g: { tables: TableEntry[] }) => g.tables);
    const match = allTables.find((t: TableEntry) => t.currentOrder?.id === deepLinkOrderId);
    if (match) setSelectedTable(match);
  }, [deepLinkOrderId, planGroups, selectedTable]);

  const { data: orderData, isLoading: orderLoading } = trpc.order.getOrder.useQuery(
    { orderId: selectedTable?.currentOrder?.id ?? 0 },
    { enabled: !!selectedTable?.currentOrder?.id }
  );

  const splitByPersonsMutation = trpc.order.splitByPersons.useMutation({
    onSuccess: () => {
      toast.success("Splits erstellt – jetzt bezahlen");
      setStep(3);
      utils.order.getBillSplits.invalidate({ orderId: selectedTable!.currentOrder!.id });
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: billSplitsData } = trpc.order.getBillSplits.useQuery(
    { orderId: selectedTable?.currentOrder?.id ?? 0 },
    { enabled: step === 3 && !!selectedTable?.currentOrder?.id }
  );

  const paySplitMutation = trpc.order.paySplit.useMutation({
    onSuccess: (data) => {
      utils.order.getBillSplits.invalidate({ orderId: selectedTable!.currentOrder!.id });
      if (data.allPaid) {
        toast.success("Alle Splits bezahlt! Tisch geschlossen.");
        utils.order.getTableStatus.invalidate();
        setSelectedTable(null);
        setStep(1);
        setPaidPersons(new Set());
      } else {
        toast.success("Split bezahlt ✓");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const tablesWithOrders = (planGroups as Array<{ tables: TableEntry[] }>)
    .flatMap((g) => g.tables)
    .filter((t) => t.currentOrder && !["paid", "cancelled"].includes(t.currentOrder.status));

  const order = orderData as OrderWithItems | undefined;
  const subtotal = parseFloat(order?.subtotal ?? "0");

  // Compute per-person totals from assignments
  const personTotals = personLabels.map((_, idx) => {
    let total = 0;
    Object.values(personAssignments).forEach((assignments) => {
      assignments.filter((a) => a.personIdx === idx).forEach((a) => { total += a.amount; });
    });
    return total;
  });

  const allAssigned = (() => {
    if (!order) return false;
    return order.items.every((item) => {
      const assigned = (personAssignments[item.id] ?? []).reduce((s, a) => s + a.qty, 0);
      return assigned >= (item.quantity ?? 1);
    });
  })();

  function handleAssignItem(item: OrderItem, personIdx: number) {
    const unitPrice = parseFloat(item.totalPrice) / (item.quantity ?? 1);
    const already = (personAssignments[item.id] ?? []).reduce((s, a) => s + a.qty, 0);
    if (already >= (item.quantity ?? 1)) {
      // Remove all assignments for this item and reassign to this person
      setPersonAssignments((prev) => ({
        ...prev,
        [item.id]: [{ personIdx, qty: item.quantity ?? 1, amount: parseFloat(item.totalPrice) }],
      }));
    } else {
      setPersonAssignments((prev) => {
        const existing = prev[item.id] ?? [];
        const remaining = (item.quantity ?? 1) - existing.reduce((s, a) => s + a.qty, 0);
        return {
          ...prev,
          [item.id]: [...existing, { personIdx, qty: remaining, amount: unitPrice * remaining }],
        };
      });
    }
  }

  function handleCreateSplits() {
    if (!order) return;
    const persons = personLabels.map((label, idx) => ({
      label,
      items: Object.entries(personAssignments).flatMap(([itemIdStr, assignments]) =>
        assignments.filter((a) => a.personIdx === idx).map((a) => ({
          orderItemId: parseInt(itemIdStr),
          quantity: a.qty,
          amount: a.amount,
        }))
      ),
    })).filter((p) => p.items.length > 0);

    splitByPersonsMutation.mutate({ orderId: order.id, persons });
  }

  // ── TABLE SELECTION ────────────────────────────────────────────────────────
  if (!selectedTable) {
    return (
      <div className="space-y-5 max-w-2xl mx-auto">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-600" /> Split Zahlung
          </h1>
          <p className="text-sm text-muted-foreground">{tablesWithOrders.length} Tische mit offener Rechnung</p>
        </div>
        {isLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>}
        {isError && (
          <div className="p-6 text-center text-destructive border rounded-lg">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p className="font-medium">Daten konnten nicht geladen werden</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Erneut versuchen</Button>
          </div>
        )}
        {!isLoading && tablesWithOrders.length === 0 && (
          <div className="p-10 text-center text-muted-foreground border rounded-lg">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Keine offenen Rechnungen</p>
          </div>
        )}
        <div className="space-y-3">
          {tablesWithOrders.map((table) => (
            <Card key={table.id} className="cursor-pointer hover:shadow-md transition-shadow border-violet-200"
              onClick={() => { setSelectedTable(table); setStep(1); setPersonLabels(["Gast 1", "Gast 2"]); setPersonAssignments({}); setPersonPayMethods({}); setPaidPersons(new Set()); }}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{table.label}</p>
                  <p className="text-xs text-muted-foreground">Bestellung #{table.currentOrder!.id}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">CHF {parseFloat(table.currentOrder!.totalAmount ?? "0").toFixed(2)}</p>
                  <Badge className="text-xs bg-violet-100 text-violet-800">Aufteilen</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── SPLIT FLOW ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setSelectedTable(null); setStep(1); }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">{selectedTable.label} – Rechnung aufteilen</h1>
          <p className="text-xs text-muted-foreground">{t("split.step")} {step}/3</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1">
        {[1, 2, 3].map((s) => (
          <div key={s} className={cn("flex-1 h-1.5 rounded-full transition-colors", s <= step ? "bg-violet-600" : "bg-muted")} />
        ))}
      </div>

      {/* STEP 1: Personen festlegen */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("split.howManyPersons")}</p>
          <div className="flex items-center gap-4 justify-center py-4">
            <Button size="icon" variant="outline" className="h-10 w-10"
              onClick={() => setPersonLabels((l) => l.length > 1 ? l.slice(0, -1) : l)}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-3xl font-bold w-12 text-center">{personLabels.length}</span>
            <Button size="icon" variant="outline" className="h-10 w-10"
              onClick={() => setPersonLabels((l) => l.length < 20 ? [...l, `Gast ${l.length + 1}`] : l)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {personLabels.map((label, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</div>
                <input
                  value={label}
                  onChange={(e) => setPersonLabels((l) => l.map((x, i) => i === idx ? e.target.value : x))}
                  className="flex-1 h-9 rounded-lg border px-3 text-sm bg-background"
                  style={{ fontSize: "16px" }}
                  placeholder={`Gast ${idx + 1}`}
                />
              </div>
            ))}
          </div>
          <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => setStep(2)}>
            Weiter
          </Button>
        </div>
      )}

      {/* STEP 2: Artikel zuweisen */}
      {step === 2 && (
        <div className="space-y-4">
          {orderLoading && <Skeleton className="h-40 rounded-lg" />}
          {order && (
            <>
              <p className="text-xs text-muted-foreground">{t("split.tapToAssign")}</p>
              {/* Person-Tabs */}
              <div className="flex gap-1.5 flex-wrap">
                {personLabels.map((label, idx) => (
                  <div key={idx} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-medium">
                    <span className="w-4 h-4 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                    {label}
                    {personTotals[idx] > 0 && <span className="ml-1 font-bold">CHF {personTotals[idx].toFixed(2)}</span>}
                  </div>
                ))}
              </div>
              {/* Items */}
              <div className="space-y-2">
                {order.items.map((item) => {
                  const assignments = personAssignments[item.id] ?? [];
                  const assignedQty = assignments.reduce((s, a) => s + a.qty, 0);
                  const isFullyAssigned = assignedQty >= (item.quantity ?? 1);
                  return (
                    <div key={item.id} className={cn("rounded-xl border p-3", isFullyAssigned ? "border-emerald-300 bg-emerald-50" : "border-border")}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{item.productName}</p>
                          {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                          <p className="text-xs text-muted-foreground">×{item.quantity} · CHF {parseFloat(item.totalPrice).toFixed(2)}</p>
                        </div>
                        {isFullyAssigned && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
                      </div>
                      {/* Assign buttons */}
                      <div className="flex gap-1.5 flex-wrap">
                        {personLabels.map((label, idx) => {
                          const assigned = assignments.filter((a) => a.personIdx === idx).reduce((s, a) => s + a.qty, 0);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleAssignItem(item, idx)}
                              className={cn(
                                "px-2.5 py-1 rounded-lg border text-xs font-medium transition-all",
                                assigned > 0 ? "border-violet-500 bg-violet-100 text-violet-800" : "border-border text-muted-foreground hover:border-violet-400"
                              )}
                            >
                              {label}{assigned > 0 && ` (×${assigned})`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Zurück</Button>
                <Button
                  className="flex-1 bg-violet-600 hover:bg-violet-700"
                  disabled={!allAssigned || splitByPersonsMutation.isPending}
                  onClick={handleCreateSplits}
                >
                  {splitByPersonsMutation.isPending ? "Erstelle..." : t("split.createSplits")}
                </Button>
              </div>
              {!allAssigned && <p className="text-xs text-amber-600 text-center">Bitte alle Artikel zuweisen</p>}
            </>
          )}
        </div>
      )}

      {/* STEP 3: Bezahlen */}
      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Jede Person wählt ihre Zahlungsmethode und bezahlt.</p>
          {(billSplitsData?.splits ?? []).map((split: any) => {
            const isPaid = split.status === "paid" || paidPersons.has(split.id);
            return (
              <Card key={split.id} className={cn("border", isPaid ? "border-emerald-300 bg-emerald-50 opacity-70" : "border-border")}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{split.personLabel ?? `Person ${split.id}`}</p>
                    <p className="font-bold text-lg">CHF {parseFloat(split.amount ?? "0").toFixed(2)}</p>
                  </div>
                  {isPaid ? (
                    <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" /> Bezahlt
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-1.5">
                        {([
                          { method: "cash" as const, label: "Bar", icon: Banknote },
                          { method: "card" as const, label: "Karte", icon: CreditCard },
                          { method: "twint" as const, label: "TWINT", icon: Smartphone },
                          { method: "invoice" as const, label: "Rechnung", icon: Receipt },
                        ] as const).map(({ method, label, icon: Icon }) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setPersonPayMethods((p) => ({ ...p, [split.id]: method }))}
                            className={cn(
                              "h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 text-xs font-medium transition-all",
                              (personPayMethods[split.id] ?? "cash") === method
                                ? "border-violet-500 bg-violet-100 text-violet-800"
                                : "border-border text-muted-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        disabled={paySplitMutation.isPending}
                        onClick={() => {
                          paySplitMutation.mutate({
                            splitId: split.id,
                            method: personPayMethods[split.id] ?? "cash",
                          });
                          setPaidPersons((p) => { const next = new Set(p); next.add(split.id); return next; });
                        }}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        {split.personLabel ?? `Person ${split.id}`} bezahlen
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
