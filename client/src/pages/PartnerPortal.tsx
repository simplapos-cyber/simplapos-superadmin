import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  BarChart3, Handshake, FileText, TrendingUp, MapPin, Building2,
  ArrowLeft, ArrowRight, Check, CreditCard, Monitor, Briefcase,
  Plus, Trash2, Calculator, Package, ShoppingCart, Minus
} from "lucide-react";
import {
  MODULES, MODULE_CATEGORIES, calculateModularPricing, calculateAnnualPrice,
  ANNUAL_DISCOUNT_PERCENT, type SelectedModule
} from "../../../shared/pricing";



// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function PartnerPortal() {
  const [location] = useLocation();
  
  // Determine which sub-view to show
  if (location === "/partner/new") return <PartnerWizard />;
  if (location === "/partner/contracts") return <PartnerContracts />;
  return <PartnerDashboard />;
}

// ─── PARTNER DASHBOARD ──────────────────────────────────────────────────────
function PartnerDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: stats, isLoading, error, refetch } = trpc.partner.stats.useQuery(undefined, {
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground mb-4">Daten konnten nicht geladen werden.</p>
        <Button variant="outline" onClick={() => refetch()}>Erneut versuchen</Button>
      </div>
    );
  }

  const cityEntries = stats?.cityStats ? Object.entries(stats.cityStats) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Partner-Dashboard</h1>
        <p className="text-muted-foreground">Willkommen zurück, {user?.name}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Handshake className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Verträge gesamt</p>
                <p className="text-2xl font-bold">{stats?.totalContracts ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktive Verträge</p>
                <p className="text-2xl font-bold">{stats?.activeContracts ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monatlicher Umsatz</p>
                <p className="text-2xl font-bold">CHF {(stats?.totalMonthlyRevenue ?? 0).toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Städte</p>
                <p className="text-2xl font-bold">{cityEntries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">Neuen Vertrag abschliessen</h3>
              <p className="text-muted-foreground text-sm">Restaurant über den digitalen Vertrags-Wizard onboarden</p>
            </div>
            <Button onClick={() => setLocation("/partner/new")} className="gap-2">
              <Plus className="h-4 w-4" /> Neuer Vertrag
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* City Stats */}
      {cityEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Umsatz nach Stadt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cityEntries
                .sort((a, b) => b[1].revenue - a[1].revenue)
                .map(([city, data]) => (
                  <div key={city} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{city}</span>
                      <Badge variant="secondary">{data.count} {data.count === 1 ? "Vertrag" : "Verträge"}</Badge>
                    </div>
                    <span className="font-semibold">CHF {(data.revenue ?? 0).toFixed(0)}/Mt.</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Contracts */}
      {(stats?.recentContracts?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Letzte Verträge</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(stats?.recentContracts as any[])?.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium">{c.restaurantName || c.title}</p>
                    <p className="text-sm text-muted-foreground">{c.restaurantCity || "–"} · {c.plan?.toUpperCase()}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={c.status === "signed" || c.status === "active" ? "default" : "secondary"}>
                      {c.status || "–"}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">CHF {c.monthlyFee}/Mt.</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── PARTNER CONTRACTS LIST ─────────────────────────────────────────────────
function PartnerContracts() {
  const [, setLocation] = useLocation();
  const { data: contracts, isLoading, error, refetch } = trpc.partner.myContracts.useQuery(undefined, {
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground mb-4">Verträge konnten nicht geladen werden.</p>
        <Button variant="outline" onClick={() => refetch()}>Erneut versuchen</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meine Verträge</h1>
          <p className="text-muted-foreground">{contracts?.length ?? 0} Verträge</p>
        </div>
        <Button onClick={() => setLocation("/partner/new")} className="gap-2">
          <Plus className="h-4 w-4" /> Neuer Vertrag
        </Button>
      </div>

      {(!contracts || contracts.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Noch keine Verträge</h3>
            <p className="text-muted-foreground mb-4">Erstellen Sie Ihren ersten Vertrag über den Wizard</p>
            <Button onClick={() => setLocation("/partner/new")}>Ersten Vertrag erstellen</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(contracts as any[]).map((c: any) => (
            <Card key={c.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{c.restaurantName || c.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.restaurantCity || "–"} · {c.plan?.toUpperCase()} · {c.billingCycle === "yearly" ? "Jährlich" : "Monatlich"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={c.status === "signed" || c.status === "active" ? "default" : "secondary"}>
                      {c.status === "signed" ? "Unterzeichnet" : c.status === "active" ? "Aktiv" : c.status}
                    </Badge>
                    <p className="text-sm font-medium mt-1">CHF {c.monthlyFee}/Mt.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PARTNER WIZARD ─────────────────────────────────────────────────────────
const WIZARD_STEPS = [
  { id: 1, title: "Module wählen", icon: Package },
  { id: 2, title: "Restaurant & Firma", icon: Building2 },
  { id: 3, title: "Hardware", icon: ShoppingCart },
  { id: 4, title: "Zusammenfassung", icon: FileText },
];

const PARTNER_WIZARD_STORAGE_KEY = "simplapos_partner_wizard_draft";

function loadPartnerDraft() {
  try {
    const saved = localStorage.getItem(PARTNER_WIZARD_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

function PartnerWizard() {
  const [, setLocation] = useLocation();
  const draft = useRef(loadPartnerDraft());
  const [step, setStep] = useState(draft.current?.step || 1);

  // Step 1: Module selection & billing
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(draft.current?.billingCycle || "yearly");
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(new Set(draft.current?.selectedModuleIds || ["cloud_pos_basis"]));
  const [moduleQuantities, setModuleQuantities] = useState<Record<string, number>>(draft.current?.moduleQuantities || {});

  // Step 2: Restaurant info
  const [restaurantName, setRestaurantName] = useState(draft.current?.restaurantName || "");
  const [restaurantAddress, setRestaurantAddress] = useState(draft.current?.restaurantAddress || "");
  const [restaurantZip, setRestaurantZip] = useState(draft.current?.restaurantZip || "");
  const [restaurantCity, setRestaurantCity] = useState(draft.current?.restaurantCity || "");
  const [restaurantPhone, setRestaurantPhone] = useState(draft.current?.restaurantPhone || "");
  const [restaurantPhoneReceipt, setRestaurantPhoneReceipt] = useState(draft.current?.restaurantPhoneReceipt || "");
  const [restaurantEmail, setRestaurantEmail] = useState(draft.current?.restaurantEmail || "");
  const [restaurantVatNumber, setRestaurantVatNumber] = useState(draft.current?.restaurantVatNumber || "");
  // Company info
  const [companyName, setCompanyName] = useState(draft.current?.companyName || "");
  const [companyAddress, setCompanyAddress] = useState(draft.current?.companyAddress || "");
  const [companyZip, setCompanyZip] = useState(draft.current?.companyZip || "");
  const [companyCity, setCompanyCity] = useState(draft.current?.companyCity || "");
  const [companyPhone, setCompanyPhone] = useState(draft.current?.companyPhone || "");
  const [companyContact, setCompanyContact] = useState(draft.current?.companyContact || "");

  // Step 3: Hardware selection
  const [hardwareCart, setHardwareCart] = useState<Record<number, number>>(draft.current?.hardwareCart || {});

  // Step 4: Signing
  const [signedByName, setSignedByName] = useState(draft.current?.signedByName || "");
  const [signedByEmail, setSignedByEmail] = useState(draft.current?.signedByEmail || "");
  const [notes, setNotes] = useState(draft.current?.notes || "");

  // ─── Scroll to top on step change ───
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // ─── Persist draft to localStorage (debounced to prevent thrashing) ───
  const saveDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDraftRef = useRef(() => {});
  saveDraftRef.current = () => {
    try {
      const data = {
        step, billingCycle,
        selectedModuleIds: Array.from(selectedModuleIds),
        moduleQuantities,
        restaurantName, restaurantAddress, restaurantZip, restaurantCity,
        restaurantPhone, restaurantPhoneReceipt, restaurantEmail, restaurantVatNumber,
        companyName, companyAddress, companyZip, companyCity, companyPhone, companyContact,
        hardwareCart, signedByName, signedByEmail, notes,
      };
      localStorage.setItem(PARTNER_WIZARD_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage might be full on mobile Safari
    }
  };

  useEffect(() => {
    // Debounce: only save after 500ms of inactivity
    if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
    saveDraftTimerRef.current = setTimeout(() => saveDraftRef.current(), 500);
    return () => {
      if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
    };
  }, [
    step, billingCycle, selectedModuleIds, moduleQuantities,
    restaurantName, restaurantAddress, restaurantZip, restaurantCity,
    restaurantPhone, restaurantPhoneReceipt, restaurantEmail, restaurantVatNumber,
    companyName, companyAddress, companyZip, companyCity, companyPhone, companyContact,
    hardwareCart, signedByName, signedByEmail, notes,
  ]);

  // Fetch hardware catalog
  const { data: hardwareProducts, isLoading: hardwareLoading } = trpc.hardware.list.useQuery();

  const createContract = trpc.contracts.createWithRestaurant.useMutation({
    onSuccess: () => {
      localStorage.removeItem(PARTNER_WIZARD_STORAGE_KEY);
      toast.success("Vertrag erfolgreich erstellt! Restaurant wurde angelegt.");
      setLocation("/partner/contracts");
    },
    onError: (err) => toast.error(err.message),
  });

  // Build selectedModules array for pricing
  const selectedModules: SelectedModule[] = useMemo(() => {
    return Array.from(selectedModuleIds).map(moduleId => ({
      moduleId,
      quantity: moduleQuantities[moduleId] || 1,
    }));
  }, [selectedModuleIds, moduleQuantities]);

  // Price calculation
  const pricing = useMemo(() => {
    const result = calculateModularPricing(selectedModules);
    const effectiveMonthly = billingCycle === "yearly"
      ? calculateAnnualPrice(result.monthlyTotal)
      : result.monthlyTotal;
    return { ...result, effectiveMonthly };
  }, [selectedModules, billingCycle]);

  const toggleModule = (moduleId: string) => {
    const mod = MODULES.find(m => m.id === moduleId);
    if (!mod || mod.isRequired) return;
    const newSet = new Set(selectedModuleIds);
    if (newSet.has(moduleId)) {
      newSet.delete(moduleId);
      const newQty = { ...moduleQuantities };
      delete newQty[moduleId];
      setModuleQuantities(newQty);
    } else {
      newSet.add(moduleId);
      if (mod.isPerUnit) {
        setModuleQuantities({ ...moduleQuantities, [moduleId]: 1 });
      }
    }
    setSelectedModuleIds(newSet);
  };

  const setQuantity = (moduleId: string, qty: number) => {
    const mod = MODULES.find(m => m.id === moduleId);
    const maxQty = mod?.maxUnits || 20;
    const clampedQty = Math.max(1, Math.min(qty, maxQty));
    setModuleQuantities({ ...moduleQuantities, [moduleId]: clampedQty });
  };

  // Number of licenses = 1 (basis) + extra_pos quantity
  const numLicenses = useMemo(() => {
    return 1 + (moduleQuantities["extra_pos"] || 0);
  }, [moduleQuantities]);

  // Hardware helpers
  const hardwareTotal = useMemo(() => {
    if (!hardwareProducts) return 0;
    return Object.entries(hardwareCart).reduce((sum, [idStr, qty]) => {
      const product = hardwareProducts.find((p: any) => p.id === Number(idStr));
      return sum + (product ? Number(product.price) * qty : 0);
    }, 0);
  }, [hardwareCart, hardwareProducts]);

  const addToCart = (productId: number) => {
    setHardwareCart(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  };

  const removeFromCart = (productId: number) => {
    setHardwareCart(prev => {
      const newCart = { ...prev };
      if (newCart[productId] && newCart[productId] > 1) {
        newCart[productId] = newCart[productId] - 1;
      } else {
        delete newCart[productId];
      }
      return newCart;
    });
  };

  const handleSubmit = () => {
    const hardwareItems = Object.entries(hardwareCart)
      .filter(([, qty]) => qty > 0)
      .map(([idStr, qty]) => {
        const product = hardwareProducts?.find((p: any) => p.id === Number(idStr));
        return {
          productId: Number(idStr),
          name: product?.name || "Unbekannt",
          quantity: qty,
          unitPrice: Number(product?.price || 0),
        };
      });

    createContract.mutate({
      billingCycle,
      contractType: "partner",
      restaurantName,
      restaurantAddress: restaurantAddress || undefined,
      restaurantZip: restaurantZip || undefined,
      restaurantCity: restaurantCity || undefined,
      restaurantPhone: restaurantPhone || undefined,
      restaurantPhoneReceipt: restaurantPhoneReceipt || undefined,
      restaurantEmail: restaurantEmail || undefined,
      restaurantVatNumber: restaurantVatNumber || undefined,
      companyName: companyName || undefined,
      companyAddress: companyAddress || undefined,
      companyZip: companyZip || undefined,
      companyCity: companyCity || undefined,
      companyPhone: companyPhone || undefined,
      companyContact: companyContact || undefined,
      numEmployees: numLicenses,
      selectedModules,
      hardwareItems: hardwareItems.length > 0 ? hardwareItems : undefined,
      signedByName: signedByName || undefined,
      signedByEmail: signedByEmail || undefined,
      notes: notes || undefined,
      origin: window.location.origin,
    });
  };

  const canProceed = () => {
    if (step === 1) return selectedModuleIds.size > 0;
    if (step === 2) return restaurantName.trim().length > 0;
    if (step === 3) return true;
    // Step 4 (Zusammenfassung): E-Mail ist Pflicht für Aktivierungslink
    if (step === 4) return signedByEmail.trim().length > 0 && signedByEmail.includes("@");
    return true;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/partner")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Neuer Vertrag</h1>
          <p className="text-muted-foreground text-sm">Restaurant über digitalen Vertrag anlegen</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {WIZARD_STEPS.map((s) => (
          <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${step === s.id ? "bg-primary text-primary-foreground" : step > s.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            <s.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{s.title}</span>
            <span className="sm:hidden">{s.id}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Module Selection */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Billing toggle */}
          <div className="flex items-center gap-4 mb-4">
            <Label>Abrechnungszyklus:</Label>
            <div className="flex gap-2">
              <Button size="sm" variant={billingCycle === "yearly" ? "default" : "outline"} onClick={() => setBillingCycle("yearly")}>
                Jährlich ({ANNUAL_DISCOUNT_PERCENT}% Rabatt)
              </Button>
              <Button size="sm" variant={billingCycle === "monthly" ? "default" : "outline"} onClick={() => setBillingCycle("monthly")}>
                Monatlich
              </Button>
            </div>
          </div>

          {/* Module categories */}
          <div className="space-y-4">
            {MODULE_CATEGORIES.map(category => {
              const categoryModules = MODULES.filter(m => m.category === category.id);
              if (categoryModules.length === 0) return null;
              return (
                <Card key={category.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{category.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {categoryModules.map(mod => {
                      const isSelected = selectedModuleIds.has(mod.id);
                      const quantity = moduleQuantities[mod.id] || 1;
                      return (
                        <div
                          key={mod.id}
                          className={`p-3 rounded-lg border transition-all cursor-pointer ${
                            isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                          }`}
                          onClick={() => toggleModule(mod.id)}
                        >
                          {/* Row 1: Checkbox + Name + Price */}
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleModule(mod.id)}
                              disabled={mod.isRequired}
                              className="mt-0.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{mod.name}</span>
                                  {mod.isRequired && <Badge variant="secondary" className="text-xs">Pflicht</Badge>}
                                </div>
                                <span className="font-semibold text-sm whitespace-nowrap shrink-0">
                                  {mod.priceMonthly > 0 && `CHF ${mod.priceMonthly}${mod.isPerUnit ? `/${mod.unitLabel}` : ""}/Mt.`}
                                  {mod.priceOneTime > 0 && `CHF ${mod.priceOneTime} einmalig`}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{mod.description}</p>
                            </div>
                          </div>
                          {/* Row 2: Quantity controls */}
                          {mod.isPerUnit && isSelected && (
                            <div className="flex items-center gap-2 mt-2 ml-8 pl-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-xs text-muted-foreground">Anzahl:</span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setQuantity(mod.id, quantity - 1)}
                                disabled={quantity <= 1}
                              >
                                -
                              </Button>
                              <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setQuantity(mod.id, quantity + 1)}
                                disabled={quantity >= (mod.maxUnits || 20)}
                              >
                                +
                              </Button>
                              <span className="text-xs text-muted-foreground ml-1">
                                = CHF {mod.priceMonthly * quantity}/Mt.
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Live price summary */}
          <Card className="bg-white dark:bg-slate-900 border-primary/30 shadow-lg sticky bottom-4 z-20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="h-5 w-5 text-primary" />
                <span className="font-semibold">Preisvorschau</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {pricing.breakdown.length} {pricing.breakdown.length === 1 ? "Modul" : "Module"} gewählt
                </span>
              </div>
              {/* Compact breakdown */}
              <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
                {pricing.breakdown.map(item => (
                  <div key={item.moduleId} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate mr-2">
                      {item.moduleName}{item.quantity > 1 ? ` ×${item.quantity}` : ""}
                    </span>
                    <span className="font-medium whitespace-nowrap">
                      {item.monthlySubtotal > 0 ? `CHF ${item.monthlySubtotal}/Mt.` : ""}
                      {item.oneTimeSubtotal > 0 ? `CHF ${item.oneTimeSubtotal}*` : ""}
                    </span>
                  </div>
                ))}
              </div>
              <Separator className="mb-3" />
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Monatlich total</p>
                  {billingCycle === "yearly" && pricing.monthlyTotal !== pricing.effectiveMonthly && (
                    <p className="text-xs text-muted-foreground line-through">CHF {pricing.monthlyTotal}/Mt.</p>
                  )}
                </div>
                <p className="text-2xl font-bold text-primary">CHF {pricing.effectiveMonthly}/Mt.</p>
              </div>
              {pricing.oneTimeTotal > 0 && (
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">* Einmalige Gebühren</span>
                  <span className="text-sm font-medium">CHF {pricing.oneTimeTotal}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Restaurant & Company Info */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Restaurant-Informationen</CardTitle>
              <CardDescription>Nur der Restaurant-Name ist Pflicht. Alle anderen Felder können nachträglich im Admin Panel ergänzt werden.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Restaurant-Name *</Label>
                <Input value={restaurantName} onChange={e => setRestaurantName(e.target.value)} placeholder="z.B. Pizzeria Napoli" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Adresse</Label>
                  <Input value={restaurantAddress} onChange={e => setRestaurantAddress(e.target.value)} placeholder="Strasse und Hausnummer" />
                </div>
                <div>
                  <Label>PLZ</Label>
                  <Input value={restaurantZip} onChange={e => setRestaurantZip(e.target.value)} placeholder="z.B. 8001" />
                </div>
                <div>
                  <Label>Stadt</Label>
                  <Input value={restaurantCity} onChange={e => setRestaurantCity(e.target.value)} placeholder="z.B. Zürich" />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input value={restaurantPhone} onChange={e => setRestaurantPhone(e.target.value)} placeholder="+41 44 123 45 67" />
                </div>
                <div>
                  <Label>Telefon für Beleg</Label>
                  <Input value={restaurantPhoneReceipt} onChange={e => setRestaurantPhoneReceipt(e.target.value)} placeholder="Wird auf dem Beleg gedruckt" />
                </div>
                <div>
                  <Label>E-Mail</Label>
                  <Input value={restaurantEmail} onChange={e => setRestaurantEmail(e.target.value)} placeholder="info@restaurant.ch" type="email" />
                </div>
                <div>
                  <Label>MwSt-Nummer</Label>
                  <Input value={restaurantVatNumber} onChange={e => setRestaurantVatNumber(e.target.value)} placeholder="CHE-123.456.789 MWST" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Firmen-Informationen</CardTitle>
              <CardDescription>Optional – nur ausfüllen, falls die Firma vom Restaurant abweicht.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Firmenname</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="z.B. Gastro AG" />
                </div>
                <div className="md:col-span-2">
                  <Label>Firmenadresse</Label>
                  <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="Strasse und Hausnummer" />
                </div>
                <div>
                  <Label>PLZ</Label>
                  <Input value={companyZip} onChange={e => setCompanyZip(e.target.value)} placeholder="z.B. 8001" />
                </div>
                <div>
                  <Label>Stadt</Label>
                  <Input value={companyCity} onChange={e => setCompanyCity(e.target.value)} placeholder="z.B. Zürich" />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} placeholder="+41 44 123 45 67" />
                </div>
                <div>
                  <Label>Ansprechpartner</Label>
                  <Input value={companyContact} onChange={e => setCompanyContact(e.target.value)} placeholder="Vor- und Nachname" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Hardware (optional) */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Hardware bestellen (optional)</CardTitle>
            <CardDescription>Tablets, Drucker und Monitore können direkt mitbestellt werden (einmalige Kosten). Dieser Schritt ist optional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hardwareLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : hardwareProducts && hardwareProducts.filter((p: any) => p.isActive).length > 0 ? (
              <div className="space-y-2">
                {hardwareProducts.filter((p: any) => p.isActive).map((product: any) => (
                  <div key={product.id} className={`p-3 rounded-lg border transition-all ${
                    hardwareCart[product.id] ? "border-primary bg-primary/5" : "border-border"
                  }`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{product.name}</span>
                        {product.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{product.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-sm">CHF {Number(product.price).toFixed(0)}</span>
                        {hardwareCart[product.id] ? (
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => removeFromCart(product.id)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center text-sm font-bold">{hardwareCart[product.id]}</span>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => addToCart(product.id)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" className="h-7" onClick={() => addToCart(product.id)}>
                            <Plus className="h-3 w-3 mr-1" /> Hinzufügen
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Keine Hardware-Produkte verfügbar.</p>
            )}
            {hardwareTotal > 0 && (
              <div className="mt-3 p-3 bg-muted rounded-lg flex justify-between items-center">
                <span className="text-sm font-medium">Hardware-Gesamtkosten (einmalig)</span>
                <span className="font-bold text-primary text-lg">CHF {hardwareTotal.toFixed(0)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Summary */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Abrechnung:</span> <strong>{billingCycle === "yearly" ? "Jährlich" : "Monatlich"}</strong></div>
                <div><span className="text-muted-foreground">Restaurant:</span> <strong>{restaurantName}</strong></div>
                <div><span className="text-muted-foreground">Stadt:</span> <strong>{restaurantCity || "–"}</strong></div>
                <div><span className="text-muted-foreground">Lizenzen:</span> <strong>{numLicenses}</strong></div>
                <div><span className="text-muted-foreground">Module:</span> <strong>{pricing.breakdown.length}</strong></div>
              </div>

              {/* Module list */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Gewählte Module</h4>
                <div className="flex flex-wrap gap-1">
                  {pricing.breakdown.map(item => (
                    <Badge key={item.moduleId} variant="secondary" className="text-xs">
                      {item.moduleName} {item.quantity > 1 ? `×${item.quantity}` : ""}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Monatlich:</span>
                <span>CHF {pricing.effectiveMonthly}</span>
              </div>
              {pricing.oneTimeTotal > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Einmalige Gebühren:</span>
                  <span>CHF {pricing.oneTimeTotal}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unterschrift des Gastronomen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name des Unterzeichners</Label>
                  <Input value={signedByName} onChange={e => setSignedByName(e.target.value)} placeholder="Vor- und Nachname" />
                </div>
                <div>
                  <Label>E-Mail des Unterzeichners <span className="text-destructive">*</span></Label>
                  <Input value={signedByEmail} onChange={e => setSignedByEmail(e.target.value)} placeholder="email@example.com" type="email" required />
                  <p className="text-xs text-muted-foreground mt-1">Pflichtfeld – An diese E-Mail wird der Aktivierungslink gesendet.</p>
                </div>
              </div>
              <div>
                <Label>Bemerkungen</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionale Notizen zum Vertrag..." rows={3} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 1}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
            Weiter <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={createContract.isPending} className="gap-2">
            {createContract.isPending ? "Wird erstellt..." : <><Check className="h-4 w-4" /> Vertrag abschliessen</>}
          </Button>
        )}
      </div>
    </div>
  );
}
