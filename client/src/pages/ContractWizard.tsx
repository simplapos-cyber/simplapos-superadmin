import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, Building2, FileText,
  Plus, Trash2, Calculator, Package, ShoppingCart, Minus, Briefcase
} from "lucide-react";
import {
  MODULES, MODULE_CATEGORIES, calculateModularPricing, calculateAnnualPrice,
  ANNUAL_DISCOUNT_PERCENT, type SelectedModule
} from "../../../shared/pricing";


const STEPS = [
  { id: 1, title: "Module wählen", icon: Package },
  { id: 2, title: "Restaurant & Firma", icon: Building2 },
  { id: 3, title: "Hardware", icon: ShoppingCart },
  { id: 4, title: "Zusammenfassung", icon: FileText },
];

const STORAGE_KEY = "simplapos_contract_wizard_draft";

function loadDraft() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

export default function ContractWizard() {
  const [, setLocation] = useLocation();
  const draft = useRef(loadDraft());
  const [step, setStep] = useState(draft.current?.step || 1);

  // Step 1: Module selection & billing
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(draft.current?.billingCycle || "yearly");
  const [contractType, setContractType] = useState<"standard" | "referral" | "dropshipping" | "partner">(draft.current?.contractType || "standard");
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

  // Step 2: Company info
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

  // ─── Persist draft to localStorage (debounced) ───
  const saveDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDraftRef = useRef(() => {});
  saveDraftRef.current = () => {
    try {
      const data = {
        step, billingCycle, contractType,
        selectedModuleIds: Array.from(selectedModuleIds),
        moduleQuantities,
        restaurantName, restaurantAddress, restaurantZip, restaurantCity,
        restaurantPhone, restaurantPhoneReceipt, restaurantEmail, restaurantVatNumber,
        companyName, companyAddress, companyZip, companyCity, companyPhone, companyContact,
        hardwareCart, signedByName, signedByEmail, notes,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage might be full on mobile Safari
    }
  };

  useEffect(() => {
    if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
    saveDraftTimerRef.current = setTimeout(() => saveDraftRef.current(), 500);
    return () => {
      if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
    };
  }, [
    step, billingCycle, contractType, selectedModuleIds, moduleQuantities,
    restaurantName, restaurantAddress, restaurantZip, restaurantCity,
    restaurantPhone, restaurantPhoneReceipt, restaurantEmail, restaurantVatNumber,
    companyName, companyAddress, companyZip, companyCity, companyPhone, companyContact,
    hardwareCart, signedByName, signedByEmail, notes,
  ]);

  // Fetch hardware catalog
  const { data: hardwareProducts, isLoading: hardwareLoading } = trpc.hardware.list.useQuery();

  const createContract = trpc.contracts.createWithRestaurant.useMutation({
    onSuccess: () => {
      localStorage.removeItem(STORAGE_KEY);
      toast.success("Vertrag erfolgreich eingereicht! Er wird nun geprüft.");
      setLocation("/contracts");
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

  // Number of licenses = 1 (basis) + extra_pos quantity
  const numLicenses = useMemo(() => {
    return 1 + (moduleQuantities["extra_pos"] || 0);
  }, [moduleQuantities]);

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

  

  // Hardware total calculation
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
      contractType,
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
        <Button variant="ghost" size="sm" onClick={() => setLocation("/contracts")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Neuer Vertrag</h1>
          <p className="text-muted-foreground text-sm">Restaurant über digitalen Vertrag anlegen</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between px-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              step === s.id ? "bg-primary text-primary-foreground" :
              step > s.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {step > s.id ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
              <span className="text-sm font-medium hidden sm:inline">{s.title}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 ${step > s.id ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {/* Step 1: Module Selection */}
        {step === 1 && (
          <div className="space-y-6 pb-40 md:pb-0">
            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-4">
              <span className={billingCycle === "monthly" ? "font-semibold" : "text-muted-foreground"}>Monatlich</span>
              <Switch
                checked={billingCycle === "yearly"}
                onCheckedChange={(v) => setBillingCycle(v ? "yearly" : "monthly")}
              />
              <span className={billingCycle === "yearly" ? "font-semibold" : "text-muted-foreground"}>
                Jährlich <Badge variant="secondary" className="ml-1">{ANNUAL_DISCOUNT_PERCENT}% Rabatt</Badge>
              </span>
            </div>

            {/* Module categories */}
            <div className="space-y-6">
              {MODULE_CATEGORIES.map(category => {
                const categoryModules = MODULES.filter(m => m.category === category.id);
                if (categoryModules.length === 0) return null;
                return (
                  <Card key={category.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{category.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
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
                            {mod.isPerUnit && isSelected && (
                              <div className="flex items-center gap-2 mt-2 ml-8 pl-1" onClick={(e) => e.stopPropagation()}>
                                <span className="text-xs text-muted-foreground">Anzahl:</span>
                                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQuantity(mod.id, quantity - 1)} disabled={quantity <= 1}>-</Button>
                                <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQuantity(mod.id, quantity + 1)} disabled={quantity >= (mod.maxUnits || 20)}>+</Button>
                                <span className="text-xs text-muted-foreground ml-1">= CHF {mod.priceMonthly * quantity}/Mt.</span>
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

            {/* Live price summary - fixed at bottom on mobile, sticky on desktop */}
            <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 md:static md:px-0 md:pb-0">
            <Card className="bg-white dark:bg-slate-900 border-primary/30 shadow-lg md:sticky md:bottom-4">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Preisvorschau</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {pricing.breakdown.length} {pricing.breakdown.length === 1 ? "Modul" : "Module"} gewählt
                  </span>
                </div>
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

            {/* Contract type */}
            <div className="max-w-sm">
              <Label>Vertragsart</Label>
              <Select value={contractType} onValueChange={(v: any) => setContractType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="referral">Empfehlung</SelectItem>
                  <SelectItem value="dropshipping">Dropshipping</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 2: Restaurant & Company Info */}
        {step === 2 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" /> Restaurant-Informationen
                </CardTitle>
                <CardDescription>
                  Nur der Restaurant-Name ist Pflicht. Alle anderen Felder können nachträglich im Admin Panel ergänzt werden.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Restaurant-Name *</Label>
                    <Input value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} placeholder="z.B. Pizzeria Bella Napoli" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Adresse</Label>
                    <Input value={restaurantAddress} onChange={(e) => setRestaurantAddress(e.target.value)} placeholder="Strasse und Hausnummer" />
                  </div>
                  <div>
                    <Label>PLZ</Label>
                    <Input value={restaurantZip} onChange={(e) => setRestaurantZip(e.target.value)} placeholder="z.B. 8001" />
                  </div>
                  <div>
                    <Label>Stadt</Label>
                    <Input value={restaurantCity} onChange={(e) => setRestaurantCity(e.target.value)} placeholder="z.B. Zürich" />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input value={restaurantPhone} onChange={(e) => setRestaurantPhone(e.target.value)} placeholder="+41 44 123 45 67" />
                  </div>
                  <div>
                    <Label>Telefon für Beleg</Label>
                    <Input value={restaurantPhoneReceipt} onChange={(e) => setRestaurantPhoneReceipt(e.target.value)} placeholder="Wird auf dem Beleg gedruckt" />
                  </div>
                  <div>
                    <Label>E-Mail</Label>
                    <Input type="email" value={restaurantEmail} onChange={(e) => setRestaurantEmail(e.target.value)} placeholder="info@restaurant.ch" />
                  </div>
                  <div>
                    <Label>MwSt-Nummer</Label>
                    <Input value={restaurantVatNumber} onChange={(e) => setRestaurantVatNumber(e.target.value)} placeholder="CHE-123.456.789 MWST" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" /> Firmen-Informationen
                </CardTitle>
                <CardDescription>
                  Optional – nur ausfüllen, falls die Firma vom Restaurant abweicht.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Firmenname</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="z.B. Gastro AG" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Firmenadresse</Label>
                    <Input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="Strasse und Hausnummer" />
                  </div>
                  <div>
                    <Label>PLZ</Label>
                    <Input value={companyZip} onChange={(e) => setCompanyZip(e.target.value)} placeholder="z.B. 8001" />
                  </div>
                  <div>
                    <Label>Stadt</Label>
                    <Input value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} placeholder="z.B. Zürich" />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="+41 44 123 45 67" />
                  </div>
                  <div>
                    <Label>Ansprechpartner</Label>
                    <Input value={companyContact} onChange={(e) => setCompanyContact(e.target.value)} placeholder="Vor- und Nachname" />
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
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Hardware bestellen (optional)
              </CardTitle>
              <CardDescription>
                Tablets, Drucker und Monitore können direkt mitbestellt werden (einmalige Kosten). Dieser Schritt ist optional.
              </CardDescription>
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
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Vertragszusammenfassung
                </CardTitle>
                <CardDescription>
                  Nach Abschluss wird der Vertrag zur Prüfung eingereicht. Das Restaurant erhält erst nach Freigabe Zugang zum Admin Panel.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-1">Abrechnung</h4>
                      <p className="font-medium">{billingCycle === "yearly" ? "Jährlich" : "Monatlich"} ({billingCycle === "yearly" ? `${ANNUAL_DISCOUNT_PERCENT}% Rabatt` : "Standard"})</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-1">Restaurant</h4>
                      <p className="font-medium">{restaurantName}</p>
                      {restaurantAddress && <p className="text-sm text-muted-foreground">{restaurantAddress}</p>}
                      {(restaurantZip || restaurantCity) && (
                        <p className="text-sm text-muted-foreground">{[restaurantZip, restaurantCity].filter(Boolean).join(" ")}</p>
                      )}
                      {restaurantPhone && <p className="text-sm text-muted-foreground">Tel: {restaurantPhone}</p>}
                      {restaurantEmail && <p className="text-sm text-muted-foreground">{restaurantEmail}</p>}
                      {restaurantVatNumber && <p className="text-sm text-muted-foreground">MwSt: {restaurantVatNumber}</p>}
                    </div>
                    {companyName && (
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-1">Firma</h4>
                        <p className="font-medium">{companyName}</p>
                        {companyAddress && <p className="text-sm text-muted-foreground">{companyAddress}</p>}
                        {(companyZip || companyCity) && (
                          <p className="text-sm text-muted-foreground">{[companyZip, companyCity].filter(Boolean).join(" ")}</p>
                        )}
                        {companyPhone && <p className="text-sm text-muted-foreground">Tel: {companyPhone}</p>}
                        {companyContact && <p className="text-sm text-muted-foreground">Kontakt: {companyContact}</p>}
                      </div>
                    )}
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-1">Gewählte Module ({selectedModules.length})</h4>
                      <div className="flex flex-wrap gap-1">
                        {pricing.breakdown.map(item => (
                          <Badge key={item.moduleId} variant="secondary" className="text-xs">
                            {item.moduleName} {item.quantity > 1 ? `×${item.quantity}` : ""}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-1">POS-Lizenzen</h4>
                      <p className="text-sm">{numLicenses} Lizenz{numLicenses > 1 ? "en" : ""} (Mitarbeiter werden im Admin Panel registriert)</p>
                    </div>
                    {hardwareTotal > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-1">Hardware-Bestellung</h4>
                        {Object.entries(hardwareCart).filter(([, qty]) => qty > 0).map(([idStr, qty]) => {
                          const product = hardwareProducts?.find((p: any) => p.id === Number(idStr));
                          return product ? (
                            <p key={idStr} className="text-sm">{qty}× {product.name} – CHF {(Number(product.price) * qty).toFixed(0)}</p>
                          ) : null;
                        })}
                        <p className="text-sm font-semibold mt-1">Hardware-Total: CHF {hardwareTotal.toFixed(0)} (einmalig)</p>
                      </div>
                    )}
                  </div>

                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="pt-4 space-y-3">
                      <h4 className="font-semibold">Kosten</h4>
                      <div className="space-y-2 text-sm">
                        {pricing.breakdown.map(item => (
                          <div key={item.moduleId} className="flex justify-between">
                            <span>{item.moduleName} {item.quantity > 1 ? `(×${item.quantity})` : ""}</span>
                            <span>
                              {item.monthlySubtotal > 0 ? `CHF ${item.monthlySubtotal}` : ""}
                              {item.oneTimeSubtotal > 0 ? `CHF ${item.oneTimeSubtotal}*` : ""}
                            </span>
                          </div>
                        ))}
                        <Separator />
                        <div className="flex justify-between font-bold text-lg">
                          <span>Total monatlich</span>
                          <span className="text-primary">CHF {pricing.effectiveMonthly}</span>
                        </div>
                        {billingCycle === "yearly" && (
                          <p className="text-xs text-muted-foreground">
                            Jährliche Abrechnung: CHF {pricing.effectiveMonthly * 12}/Jahr
                          </p>
                        )}
                        {(pricing.oneTimeTotal > 0 || hardwareTotal > 0) && (
                          <div className="space-y-1 pt-1">
                            {pricing.oneTimeTotal > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>* Einmalige Gebühren</span>
                                <span>CHF {pricing.oneTimeTotal}</span>
                              </div>
                            )}
                            {hardwareTotal > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Hardware (einmalig)</span>
                                <span>CHF {hardwareTotal.toFixed(0)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-semibold pt-1 border-t">
                              <span>Einmalig gesamt</span>
                              <span>CHF {(pricing.oneTimeTotal + hardwareTotal).toFixed(0)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Unterzeichnet von (Name)</Label>
                    <Input value={signedByName} onChange={(e) => setSignedByName(e.target.value)} placeholder="Vor- und Nachname" />
                  </div>
                  <div>
                    <Label>E-Mail des Unterzeichners <span className="text-destructive">*</span></Label>
                    <Input type="email" value={signedByEmail} onChange={(e) => setSignedByEmail(e.target.value)} placeholder="name@email.com" required />
                    <p className="text-xs text-muted-foreground mt-1">Pflichtfeld – An diese E-Mail wird der Aktivierungslink gesendet.</p>
                  </div>
                </div>
                <div>
                  <Label>Anmerkungen (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Besondere Vereinbarungen..." />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 1}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
        </Button>

        {step < 4 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
            Weiter <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createContract.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {createContract.isPending ? "Wird eingereicht..." : "Vertrag einreichen"}
            <Check className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
