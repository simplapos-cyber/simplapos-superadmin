import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useSSE } from "@/hooks/useSSE";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { SharedFloorPlan, type SharedTableEntry, type SharedPlanGroup } from "@/components/SharedFloorPlan";
import { Mic, MicOff, Loader2, CheckCircle2, XCircle, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Web Speech API type declarations ────────────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type VoiceItem = {
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
};

type VoiceGroup = {
  tableNumber: number | null;
  items: VoiceItem[];
};

type VoiceResult = {
  transcription: string;
  tableNumber: number | null;
  items: VoiceItem[];
  groups: VoiceGroup[];
  isMultiTable: boolean;
};

// ─── Gang-Hilfsfunktionen ─────────────────────────────────────────────────────
const COURSE_OPTIONS = [
  { value: "", label: "Kein Gang" },
  { value: "vorspeise", label: "Vorspeise" },
  { value: "hauptgang", label: "Hauptgang" },
  { value: "dessert", label: "Dessert" },
  { value: "getraenk", label: "Getränk" },
];

function courseLabel(course: string | null): string | null {
  if (!course) return null;
  const found = COURSE_OPTIONS.find(o => o.value === course.toLowerCase());
  return found?.label ?? course;
}

function courseToNumber(course: string | null): number | undefined {
  if (!course) return undefined;
  const cl = course.toLowerCase();
  if (cl === "vorspeise") return 1;
  if (cl === "hauptgang") return 2;
  if (cl === "dessert") return 3;
  if (cl === "getraenk") return 4;
  return undefined;
}

// ─── Voice Order Dialog ───────────────────────────────────────────────────────
function VoiceOrderDialog({
  result,
  onConfirm,
  onClose,
  isConfirming,
  tableNotes,
  onTableNotesChange,
}: {
  result: VoiceResult;
  onConfirm: (groupComments: Array<Record<number, string>>, groupCourses: Array<Record<number, string>>, groupNotes: Record<number, string>) => void;
  onClose: () => void;
  isConfirming: boolean;
  tableNotes?: Record<number, string>;
  onTableNotesChange?: (notes: Record<number, string>) => void;
}) {
  // Kommentare pro Gruppe und Artikel-Index
  const [groupComments, setGroupComments] = useState<Array<Record<number, string>>>(() =>
    result.groups.map(group =>
      Object.fromEntries(
        group.items.map((item, idx) => [idx, item.comment ?? ""])
      )
    )
  );
  // Gang-Auswahl pro Gruppe und Artikel-Index (editierbar)
  const [groupCourses, setGroupCourses] = useState<Array<Record<number, string>>>(() =>
    result.groups.map(group =>
      Object.fromEntries(
        group.items.map((item, idx) => [idx, item.course ?? ""])
      )
    )
  );

  const totalMatched = result.groups.reduce(
    (sum, g) => sum + g.items.filter(i => i.matched && i.action === "add").length, 0
  );
  const totalRemove = result.groups.reduce(
    (sum, g) => sum + g.items.filter(i => i.matched && i.action === "remove").length, 0
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.55)", display: "flex",
      alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: "16px 16px 0 0", padding: 20,
        width: "100%", maxWidth: 480, maxHeight: "85dvh", overflowY: "auto",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Bestellung bestätigen</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Transkription */}
        <div style={{ background: "#f1f5f9", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#475569" }}>
          <span style={{ fontWeight: 600 }}>Erkannt: </span>"{result.transcription}"
        </div>

        {/* Gruppen */}
        {result.groups.map((group, gIdx) => {
          const addItems = group.items.filter(i => i.matched && i.action === "add");
          const removeItems = group.items.filter(i => i.matched && i.action === "remove");
          const unmatchedItems = group.items.filter(i => !i.matched);

          return (
            <div key={gIdx} style={{
              border: result.isMultiTable ? "1px solid #e2e8f0" : "none",
              borderRadius: result.isMultiTable ? 10 : 0,
              padding: result.isMultiTable ? 12 : 0,
              marginBottom: result.isMultiTable ? 12 : 0,
            }}>
              {/* Tisch-Header */}
              {(group.tableNumber || result.isMultiTable) && (
                <div style={{ marginBottom: 10, fontSize: 14, color: "#1e293b", fontWeight: 700 }}>
                  {group.tableNumber ? `Tisch ${group.tableNumber}` : "Tisch unbekannt"}
                </div>
              )}

              {/* Hinzufügen */}
              {addItems.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#16a34a" }}>
                    <CheckCircle2 size={12} style={{ display: "inline", marginRight: 4 }} />
                    Hinzufügen ({addItems.length})
                  </p>
                  {group.items.map((item, idx) => {
                    if (!item.matched || item.action !== "add") return null;
                    const cl = courseLabel(item.course);
                    return (
                      <div key={idx} style={{
                        padding: "8px 10px", background: "#f0fdf4", borderRadius: 8, marginBottom: 6,
                        fontSize: 14, border: "1px solid #bbf7d0",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>
                            {item.qty}× {item.matchedName}
                            {cl && (
                              <span style={{
                                marginLeft: 6, fontSize: 11, background: "#dbeafe",
                                color: "#1d4ed8", borderRadius: 4, padding: "1px 6px",
                              }}>{cl}</span>
                            )}
                          </span>
                          <span style={{ color: "#16a34a", fontWeight: 600 }}>
                            CHF {(item.qty * item.unitPrice).toFixed(2)}
                          </span>
                        </div>
                        {/* Gang-Auswahl (editierbar) */}
                        <select
                          value={groupCourses[gIdx]?.[idx] ?? ""}
                          onChange={e => setGroupCourses(prev => {
                            const next = [...prev];
                            next[gIdx] = { ...next[gIdx], [idx]: e.target.value };
                            return next;
                          })}
                          style={{
                            width: "100%", boxSizing: "border-box",
                            border: "1px solid #d1fae5", borderRadius: 6,
                            padding: "5px 8px", fontSize: 12, color: "#374151",
                            background: "#fff", outline: "none", marginBottom: 4,
                            cursor: "pointer",
                          }}
                        >
                          {COURSE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Kommentar (z.B. ohne Sauce)"
                          value={groupComments[gIdx]?.[idx] ?? ""}
                          onChange={e => setGroupComments(prev => {
                            const next = [...prev];
                            next[gIdx] = { ...next[gIdx], [idx]: e.target.value };
                            return next;
                          })}
                          style={{
                            width: "100%", boxSizing: "border-box",
                            border: "1px solid #d1fae5", borderRadius: 6,
                            padding: "5px 8px", fontSize: 12, color: "#374151",
                            background: "#fff", outline: "none",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Stornierungen */}
              {removeItems.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#dc2626" }}>
                    <Trash2 size={12} style={{ display: "inline", marginRight: 4 }} />
                    Stornieren ({removeItems.length})
                  </p>
                  {group.items.map((item, idx) => {
                    if (!item.matched || item.action !== "remove") return null;
                    return (
                      <div key={idx} style={{
                        padding: "8px 10px", background: "#fef2f2", borderRadius: 8, marginBottom: 6,
                        fontSize: 14, border: "1px solid #fecaca",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 600, color: "#dc2626" }}>
                            {item.qty}× {item.matchedName}
                          </span>
                          <span style={{ color: "#dc2626", fontSize: 12 }}>wird entfernt</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Nicht erkannt */}
              {unmatchedItems.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
                    <XCircle size={12} style={{ display: "inline", marginRight: 4 }} />
                    Nicht erkannt ({unmatchedItems.length})
                  </p>
                  {unmatchedItems.map((item, i) => (
                    <div key={i} style={{
                      padding: "5px 10px", background: "#f8fafc", borderRadius: 6, marginBottom: 3,
                      fontSize: 13, color: "#94a3b8",
                    }}>
                      {item.qty}× {item.recognizedName}
                    </div>
                  ))}
                </div>
              )}

              {/* Tisch-Notiz */}
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#92400e", display: "block", marginBottom: 4 }}>
                  📝 Tisch-Notiz (erscheint im Küchen- & Bar-Monitor)
                </label>
                <textarea
                  placeholder="z.B. Allergie Nüsse, Geburtstag, VIP-Gast…"
                  value={tableNotes?.[gIdx] ?? ""}
                  onChange={e => onTableNotesChange?.({ ...(tableNotes ?? {}), [gIdx]: e.target.value })}
                  rows={2}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    border: "1px solid #fde68a", borderRadius: 6,
                    padding: "6px 8px", fontSize: 12, color: "#374151",
                    background: "#fffbeb", outline: "none", resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>
          );
        })}

        {totalMatched === 0 && totalRemove === 0 && (
          <p style={{ color: "#64748b", fontSize: 14, textAlign: "center", margin: "16px 0" }}>
            Keine Artikel erkannt. Bitte erneut versuchen.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button variant="outline" onClick={onClose} style={{ flex: 1 }} disabled={isConfirming}>
            Abbrechen
          </Button>
          <Button
            onClick={() => onConfirm(groupComments, groupCourses, tableNotes ?? {})}
            style={{ flex: 2, background: "#2563eb", color: "#fff" }}
            disabled={(totalMatched === 0 && totalRemove === 0) || isConfirming}
          >
            {isConfirming ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {totalMatched > 0 && totalRemove > 0
              ? `${totalMatched} bonieren, ${totalRemove} stornieren`
              : totalMatched > 0
              ? `${totalMatched} Artikel bonieren`
              : totalRemove > 0
              ? `${totalRemove} Artikel stornieren`
              : "Keine Artikel"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Waiter_tables() {
  const [location, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;
  // Offline-Queue synchronisieren wenn Internet zurückkommt
  useOfflineSync(restaurantId ?? undefined);
  const [pendingTableId, setPendingTableId] = useState<number | null>(null);
  // Offline-Bestellungen: Tische die offline geöffnet wurden (für Tischplan-Anzeige)
  // Synchron aus localStorage lesen (persistent über Navigation)
  const offlineTablesKey = restaurantId ? `offlineTables_${restaurantId}` : 'offlineTables';
  const getOfflineTablesFromStorage = (): Set<number> => {
    try {
      const raw = localStorage.getItem(offlineTablesKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as number[];
      return new Set(arr);
    } catch { return new Set(); }
  };
  const saveOfflineTablesToStorage = (ids: Set<number>) => {
    try {
      localStorage.setItem(offlineTablesKey, JSON.stringify(Array.from(ids)));
    } catch { /* ignore */ }
  };
  const [offlineOpenedTables, setOfflineOpenedTablesState] = useState<Set<number>>(() => getOfflineTablesFromStorage());
  const setOfflineOpenedTables = (updater: ((prev: Set<number>) => Set<number>) | Set<number>) => {
    setOfflineOpenedTablesState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveOfflineTablesToStorage(next);
      return next;
    });
  };

  // Bei jedem Render aus localStorage lesen (falls sich Daten geändert haben)
  useEffect(() => {
    setOfflineOpenedTablesState(getOfflineTablesFromStorage());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, offlineTablesKey]);

  // Voice state
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceResult, setVoiceResult] = useState<VoiceResult | null>(null);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [interimText, setInterimText] = useState<string>("");

  // Web Speech API ref
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>("");

  // ── Offline-Cache für Tischplan ──────────────────────────────────────────
  const FLOOR_PLAN_CACHE_KEY = restaurantId ? `cachedFloorPlan_${restaurantId}` : 'cachedFloorPlan';
  const { isOffline } = useOfflineStatus();

  // Table status (orders) – shared across all users of this restaurant
  const { data: planGroupsRaw = [], isLoading: planLoading, isError: planError, refetch } = trpc.order.getTableStatus.useQuery(undefined, {
    refetchInterval: 30_000,
    enabled: !isOffline,
  });

  // Cache successful responses in localStorage
  useEffect(() => {
    if (planGroupsRaw && planGroupsRaw.length > 0) {
      try {
        localStorage.setItem(FLOOR_PLAN_CACHE_KEY, JSON.stringify(planGroupsRaw));
      } catch {
        // localStorage full – ignore
      }
    }
  }, [planGroupsRaw, FLOOR_PLAN_CACHE_KEY]);

  // When offline, load from cache
  const planGroups: typeof planGroupsRaw = isOffline
    ? (() => {
        try {
          const cached = localStorage.getItem(FLOOR_PLAN_CACHE_KEY);
          return cached ? JSON.parse(cached) : [];
        } catch {
          return [];
        }
      })()
    : planGroupsRaw;

  const isLoading = !isOffline && planLoading;
  const isError = !isOffline && planError;

  // Offline-geöffnete Tische in planGroups einfügen (damit Tisch als besetzt angezeigt wird)
  const planGroupsWithOffline = useMemo(() => {
    if (offlineOpenedTables.size === 0) return planGroups;
    const openedSet = offlineOpenedTables;
    return planGroups.map((group: any) => ({
      ...group,
      tables: group.tables.map((t: any) => {
        if (openedSet.has(t.id) && !t.currentOrder) {
          return {
            ...t,
            currentOrder: {
              id: -(t.id),
              status: 'pending',
              totalAmount: 0,
              guestCount: 0,
              createdAt: new Date().toISOString(),
            },
          };
        }
        return t;
      }),
    }));
  }, [planGroups, offlineOpenedTables]);

  // SSE for real-time updates
  const handleSSEEvent = useCallback((event: { type: string; payload: Record<string, unknown> }) => {
    utils.order.getTableStatus.invalidate();
    if (event.type === "order_ready") {
      const tableLabel = (event.payload?.tableLabel as string | null) ?? "";
      const orderNumber = (event.payload?.orderNumber as string | null) ?? "";
      toast.success(
        `✅ Bereit zur Ausgabe${tableLabel ? ` – ${tableLabel}` : ""}`,
        {
          description: orderNumber ? `Bestellung ${orderNumber} ist fertig zubereitet.` : "Alle Positionen sind bereit.",
          duration: 8000,
          position: "top-right",
        }
      );
    }
  }, [utils]);
  const { status: sseStatus, retryCount } = useSSE(restaurantId, {
    channels: ["floor", "waiter"],
    onEvent: handleSSEEvent,
  });

  const openOrder = trpc.order.getOrCreateTableOrder.useMutation({
    onSuccess: (order) => {
      setPendingTableId(null);
      navigate(`/kellner/order?orderId=${order.id}`);
    },
    onError: (e, variables) => {
      setPendingTableId(null);
      // Bei Netzwerkfehler: Offline-Fallback – Tisch trotzdem öffnen
      if (isOffline || e.message?.toLowerCase().includes('fetch') || e.message?.toLowerCase().includes('network') || e.message?.toLowerCase().includes('failed')) {
        const tableId = (variables as any).floorPlanObjectId ?? (variables as any).tableId;
        if (tableId) {
          toast.warning('Offline-Modus: Bestellung wird gespeichert und synchronisiert wenn Internet verfügbar ist');
          navigate(`/kellner/order?offlineTable=${tableId}&offlineType=${(variables as any).floorPlanObjectId ? 'floor_plan' : 'table'}`);
          return;
        }
      }
      toast.error(e.message);
    },
  });

  // Voice order processing mutation
  const processVoiceOrder = trpc.voiceOrder.processVoiceOrder.useMutation({
    onSuccess: (data) => {
      // Normalize: ensure groups always exist
      const raw = data as any;
      const groups: VoiceGroup[] = raw.groups ?? [{ tableNumber: raw.tableNumber ?? null, items: raw.items ?? [] }];
      const normalized: VoiceResult = {
        transcription: raw.transcription ?? "",
        tableNumber: raw.tableNumber ?? null,
        items: raw.items ?? [],
        groups,
        isMultiTable: groups.length > 1,
      };
      setVoiceResult(normalized);
      setShowVoiceDialog(true);
      setVoiceProcessing(false);
    },
    onError: (e) => {
      toast.error(e.message || "KI-Analyse fehlgeschlagen.");
      setVoiceProcessing(false);
    },
  });

  // Add / remove item mutations
  const addItem = trpc.order.addItem.useMutation();
  const removeItemByMenuItemId = trpc.order.removeItemByMenuItemId.useMutation();
  const getOrCreateOrder = trpc.order.getOrCreateTableOrder.useMutation();
  const updateOrderNotes = trpc.order.updateOrderNotes.useMutation();
  // Tisch-Notizen pro Gruppen-Index
  const [tableNotes, setTableNotes] = useState<Record<number, string>>({});

  const handleTable = useCallback((table: SharedTableEntry) => {
    // Bestehende offene Bestellung: direkt navigieren
    if (table.currentOrder && !["paid", "cancelled"].includes(table.currentOrder.status)) {
      if (isOffline) {
        // Offline: Bestellung aus Cache laden statt vom Server
        navigate(`/kellner/order?offlineTable=${table.id}&offlineType=${table.sourceType}&cachedOrderId=${table.currentOrder.id}`);
      } else {
        navigate(`/kellner/order?orderId=${table.currentOrder.id}`);
      }
      return;
    }
    // Offline-Fallback: Neuer Tisch ohne Internet öffnen
    if (isOffline) {
      // Tisch lokal als "geöffnet" markieren für Tischplan-Anzeige
      setOfflineOpenedTables(prev => { const s = new Set(prev); s.add(table.id); return s; });
      toast.warning('Offline-Modus: Neue Bestellung wird gespeichert und synchronisiert wenn Internet verfügbar ist');
      navigate(`/kellner/order?offlineTable=${table.id}&offlineType=${table.sourceType}`);
      return;
    }
    setPendingTableId(table.id);
    const payload = table.sourceType === "floor_plan"
      ? { floorPlanObjectId: table.id, guestCount: 0 }
      : { tableId: table.id, guestCount: 0 };
    openOrder.mutate(payload);
  }, [navigate, openOrder]);

  const handleSplit = useCallback((table: SharedTableEntry) => {
    if (table.currentOrder?.id) {
      navigate(`/kellner/split?orderId=${table.currentOrder.id}`);
    }
  }, [navigate]);

  // ── Web Speech API ──────────────────────────────────────────────────────────
  const isSpeechSupported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startRecording = useCallback(() => {
    if (!isSpeechSupported) {
      toast.error("Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome oder Safari verwenden.");
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = "de-CH";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    finalTranscriptRef.current = "";
    setInterimText("");

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) finalTranscriptRef.current += final;
      setInterimText(interim);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceRecording(false);
      setInterimText("");
      const transcript = finalTranscriptRef.current.trim();
      if (!transcript) {
        toast.error("Keine Sprache erkannt. Bitte deutlicher sprechen.");
        return;
      }
      setVoiceProcessing(true);
      processVoiceOrder.mutate({ transcription: transcript, restaurantId: restaurantId ?? 0 });
    };

    recognition.onerror = (event: any) => {
      recognitionRef.current = null;
      setVoiceRecording(false);
      setInterimText("");
      if (event.error === "no-speech") toast.error("Keine Sprache erkannt. Bitte erneut versuchen.");
      else if (event.error === "not-allowed") toast.error("Mikrofon-Zugriff verweigert. Bitte Berechtigung erteilen.");
      else if (event.error !== "aborted") toast.error(`Sprachfehler: ${event.error}`);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setVoiceRecording(true);
  }, [isSpeechSupported, processVoiceOrder, restaurantId]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { if (recognitionRef.current) recognitionRef.current.abort(); };
  }, []);

  // ── Helper: find table by number ────────────────────────────────────────────
  const findTableByNumber = useCallback((tableNum: number): SharedTableEntry | null => {
    for (const group of planGroups as SharedPlanGroup[]) {
      const found = group.tables.find(t => {
        const labelNum = parseInt(t.label.replace(/\D/g, ""), 10);
        return labelNum === tableNum;
      });
      if (found) return found;
    }
    return null;
  }, [planGroups]);

  // ── Voice confirm: supports multi-table, add and remove ────────────────────
  const handleVoiceConfirm = useCallback(async (groupComments: Array<Record<number, string>>, groupCourses: Array<Record<number, string>> = [], groupNotes: Record<number, string> = {}) => {
    if (!voiceResult) return;
    setIsConfirming(true);
    try {
      let totalAdded = 0;
      let totalRemoved = 0;
      let lastOrderId: number | null = null;

      for (let gIdx = 0; gIdx < voiceResult.groups.length; gIdx++) {
        const group = voiceResult.groups[gIdx];
        const comments = groupComments[gIdx] ?? {};

        const addItems = group.items
          .map((item, idx) => ({ ...item, idx }))
          .filter(i => i.matched && i.menuItemId !== null && i.action === "add");

        const removeItems = group.items
          .map((item, idx) => ({ ...item, idx }))
          .filter(i => i.matched && i.menuItemId !== null && i.action === "remove");

        if (addItems.length === 0 && removeItems.length === 0) continue;

        // Find table
        let targetTable: SharedTableEntry | null = null;
        if (group.tableNumber !== null) {
          targetTable = findTableByNumber(group.tableNumber);
        }

        if (!targetTable) {
          toast.error(
            group.tableNumber
              ? `Tisch ${group.tableNumber} nicht gefunden.`
              : "Keine Tischnummer erkannt. Bitte Tisch manuell auswählen."
          );
          continue;
        }

        const payload = targetTable.sourceType === "floor_plan"
          ? { floorPlanObjectId: targetTable.id, guestCount: 0 }
          : { tableId: targetTable.id, guestCount: 0 };

        const order = await getOrCreateOrder.mutateAsync(payload);
        lastOrderId = order.id;

        // Tisch-Notiz speichern wenn vorhanden
        const noteText = groupNotes[gIdx]?.trim();
        if (noteText) {
          await updateOrderNotes.mutateAsync({ orderId: order.id, notes: noteText });
        }

        // Add items
        const courses = groupCourses[gIdx] ?? {};
        for (const item of addItems) {
          const comment = comments[item.idx]?.trim() || undefined;
          const courseStr = courses[item.idx] ?? item.course ?? "";
          const courseNum = courseToNumber(courseStr || null);
          await addItem.mutateAsync({
            orderId: order.id,
            menuItemId: item.menuItemId!,
            name: item.matchedName,
            unitPrice: item.unitPrice,
            quantity: item.qty,
            notes: comment,
            ...(courseNum !== undefined ? { course: courseNum } : {}),
          });
          totalAdded++;
        }

        // Remove items by menuItemId
        for (const item of removeItems) {
          try {
            await removeItemByMenuItemId.mutateAsync({
              orderId: order.id,
              menuItemId: item.menuItemId!,
              quantity: item.qty,
            });
            totalRemoved++;
          } catch {
            toast.error(`Artikel "${item.matchedName}" nicht in Bestellung gefunden.`);
          }
        }
      }

      setShowVoiceDialog(false);
      setVoiceResult(null);

      const parts: string[] = [];
      if (totalAdded > 0) parts.push(`${totalAdded} Artikel boniert`);
      if (totalRemoved > 0) parts.push(`${totalRemoved} Artikel storniert`);
      if (parts.length > 0) toast.success(parts.join(", "));

      // Navigate to last order if single table
      if (lastOrderId && !voiceResult.isMultiTable) {
        navigate(`/kellner/order?orderId=${lastOrderId}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Fehler beim Bonieren.";
      toast.error(msg);
    } finally {
      setIsConfirming(false);
    }
  }, [voiceResult, findTableByNumber, getOrCreateOrder, addItem, removeItemByMenuItemId, updateOrderNotes, navigate]);

  const isBusy = voiceRecording || voiceProcessing;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <SharedFloorPlan
        planGroups={planGroupsWithOffline as SharedPlanGroup[]}
        isLoading={isLoading}
        isError={isError}
        onRefetch={refetch}
        sseStatus={sseStatus}
        sseRetryCount={retryCount}
        onTableClick={handleTable}
        onSplitClick={handleSplit}
        pendingTableId={pendingTableId}
      />

      {/* ── Floating Mic Button ── */}
      {isSpeechSupported && (
        <button
          onClick={() => {
            if (voiceProcessing) return;
            if (voiceRecording) stopRecording();
            else startRecording();
          }}
          disabled={voiceProcessing}
          title={voiceRecording ? "Klicken zum Beenden" : "Klicken zum Sprechen"}
          style={{
            position: "fixed", bottom: 80, right: 20, zIndex: 1000,
            width: 56, height: 56, borderRadius: "50%", border: "none",
            cursor: voiceProcessing ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            transition: "transform 0.15s ease, background 0.15s ease",
            transform: voiceRecording ? "scale(1.15)" : "scale(1)",
            userSelect: "none", WebkitUserSelect: "none", touchAction: "manipulation",
            background: voiceRecording ? "#dc2626" : voiceProcessing ? "#94a3b8" : "#2563eb",
            color: "#fff",
          }}
        >
          {voiceProcessing ? <Loader2 size={24} className="animate-spin" />
            : voiceRecording ? <MicOff size={24} />
            : <Mic size={24} />}
        </button>
      )}

      {/* ── Recording indicator with interim text ── */}
      {voiceRecording && (
        <div style={{
          position: "fixed", bottom: 146, right: 12, zIndex: 1001,
          background: "#dc2626", color: "#fff", borderRadius: 20,
          padding: "6px 14px", fontSize: 13, fontWeight: 600,
          boxShadow: "0 2px 8px rgba(220,38,38,0.4)",
          display: "flex", alignItems: "center", gap: 6, maxWidth: "80vw",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "inline-block", flexShrink: 0 }} />
          {interimText ? `"${interimText}"` : "Aufnahme läuft…"}
        </div>
      )}

      {/* ── Voice Order Dialog ── */}
      {showVoiceDialog && voiceResult && (
        <VoiceOrderDialog
          result={voiceResult}
          onConfirm={(comments, courses, notes) => { void handleVoiceConfirm(comments, courses, notes); }}
          onClose={() => { setShowVoiceDialog(false); setVoiceResult(null); setTableNotes({}); }}
          isConfirming={isConfirming}
          tableNotes={tableNotes}
          onTableNotesChange={setTableNotes}
        />
      )}
    </div>
  );
}
