import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Star, Gift, Trophy, Clock, Trash2, Wallet, Loader2, Award, CheckCircle2, AlertCircle, Share, Plus, X, Bell, BellOff, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  bronze:   { bg: "bg-amber-100",  text: "text-amber-800",  border: "border-amber-300",  label: "Bronze"  },
  silver:   { bg: "bg-slate-100",  text: "text-slate-700",  border: "border-slate-300",  label: "Silber"  },
  gold:     { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-400", label: "Gold"    },
  platinum: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-400", label: "Platin"  },
};

function TierBadge({ tier }: { tier: string }) {
  const c = TIER_COLORS[tier] ?? TIER_COLORS.bronze;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      <Trophy className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function txLabel(type: string): string {
  const map: Record<string, string> = {
    earn: "Punkte gesammelt", redeem: "Punkte eingelöst",
    welcome_bonus: "Willkommens-Bonus", birthday_bonus: "Geburtstags-Bonus",
    manual_add: "Manuelle Gutschrift", manual_deduct: "Manuelle Abbuchung", expire: "Punkte verfallen",
  };
  return map[type] ?? type;
}

function RegisterForm({ restaurantId, onSuccess }: { restaurantId: number; onSuccess: (token: string) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", birthMonth: "", birthDay: "", marketingConsent: false, consentGiven: false });
  const { data: program } = trpc.loyalty.getProgramPublic.useQuery({ restaurantId });
  const register = trpc.loyalty.register.useMutation({
    onSuccess: (data) => {
      toast.success(data.isNew ? "Willkommen! Deine Treuekarte wurde erstellt." : "Du bist bereits registriert – hier ist deine Karte.");
      onSuccess(data.token);
    },
    onError: (e) => toast.error(e.message),
  });
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.consentGiven) { toast.error("Bitte stimme den Datenschutzbestimmungen zu."); return; }
    register.mutate({ restaurantId, email: form.email, firstName: form.firstName, lastName: form.lastName || undefined, phone: form.phone || undefined, birthMonth: form.birthMonth ? parseInt(form.birthMonth) : undefined, birthDay: form.birthDay ? parseInt(form.birthDay) : undefined, marketingConsent: form.marketingConsent, consentGiven: true });
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-600 text-white mb-4 shadow-lg"><Star className="h-8 w-8" /></div>
          <h1 className="text-2xl font-bold text-gray-900">Treueprogramm</h1>
          <p className="text-gray-500 mt-1 text-sm">Punkte sammeln und tolle Prämien sichern</p>
          {program && <p className="text-violet-700 font-medium mt-2 text-sm">{program.pointsPerChf} Punkte pro CHF · Willkommens-Bonus: {program.welcomeBonus} Punkte</p>}
        </div>
        <Card className="shadow-xl border-0">
          <CardHeader className="pb-4"><CardTitle className="text-lg">Jetzt registrieren</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor="fn">Vorname *</Label><Input id="fn" required value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                <div className="space-y-1"><Label htmlFor="ln">Nachname</Label><Input id="ln" value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
              </div>
              <div className="space-y-1"><Label htmlFor="em">E-Mail *</Label><Input id="em" type="email" required value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor="ph">Telefon (optional)</Label><Input id="ph" type="tel" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>Geburtstag (optional – für persönliche Geschenke)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.birthDay}
                    onChange={(e) => setForm(f => ({ ...f, birthDay: e.target.value }))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">– Tag –</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}.</option>)}
                  </select>
                  <select
                    value={form.birthMonth}
                    onChange={(e) => setForm(f => ({ ...f, birthMonth: e.target.value }))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">– Monat –</option>
                    {["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"].map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <p className="text-xs text-gray-400">Damit wir dir am Geburtstag eine persönliche Überraschung zukommen lassen können.</p>
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3">
                  <Checkbox id="consent" checked={form.consentGiven} onCheckedChange={(v) => setForm(f => ({ ...f, consentGiven: !!v }))} />
                  <Label htmlFor="consent" className="text-xs text-gray-600 leading-relaxed cursor-pointer">Ich stimme der Speicherung meiner Daten für das Treueprogramm zu. Die Daten werden ausschliesslich für die Verwaltung meines Punktekontos verwendet und können jederzeit gelöscht werden. *</Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox id="marketing" checked={form.marketingConsent} onCheckedChange={(v) => setForm(f => ({ ...f, marketingConsent: !!v }))} />
                  <Label htmlFor="marketing" className="text-xs text-gray-600 leading-relaxed cursor-pointer">Ich möchte gelegentlich Angebote und Neuigkeiten per E-Mail erhalten. (freiwillig)</Label>
                </div>
              </div>
              <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700" disabled={register.isPending}>
                {register.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird registriert...</> : "Treuekarte erstellen"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-gray-400 mt-4">Bereits registriert? Dein Link wurde per E-Mail zugesandt.</p>
      </div>
    </div>
  );
}

// Hook: erkennt ob "Zum Homescreen hinzufügen" möglich ist
function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // Prüfe ob bereits als PWA installiert
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }
    // iOS-Erkennung
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);
    // Android/Chrome: beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setIsInstalled(true);
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSHint(true);
    }
  };

  return { canInstall: !!deferredPrompt || isIOS, isInstalled, isIOS, showIOSHint, setShowIOSHint, install };
}

// Hook: Browser Push-Benachrichtigungen
function usePushNotifications(token: string) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const { data: vapidData } = trpc.loyalty.getVapidPublicKey.useQuery();
  const subscribeMutation = trpc.loyalty.subscribePush.useMutation();
  const unsubscribeMutation = trpc.loyalty.unsubscribePush.useMutation();

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.register('/sw.js').then(reg => {
      setRegistration(reg);
      reg.pushManager.getSubscription().then(sub => {
        setIsSubscribed(!!sub);
      });
    }).catch(console.error);
  }, []);

  const urlB64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
    return output;
  };

  const toggle = async () => {
    if (!registration || !vapidData?.publicKey) return;
    setIsLoading(true);
    try {
      if (isSubscribed) {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await unsubscribeMutation.mutateAsync({ token, endpoint: sub.endpoint });
        }
        setIsSubscribed(false);
        toast.success('Benachrichtigungen deaktiviert');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.error('Benachrichtigungen wurden nicht erlaubt');
          return;
        }
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(vapidData.publicKey),
        });
        const key = sub.getKey('p256dh');
        const authKey = sub.getKey('auth');
        if (!key || !authKey) throw new Error('Keys fehlen');
        await subscribeMutation.mutateAsync({
          token,
          endpoint: sub.endpoint,
          p256dh: btoa(Array.from(new Uint8Array(key)).map(b => String.fromCharCode(b)).join('')),
          auth: btoa(Array.from(new Uint8Array(authKey)).map(b => String.fromCharCode(b)).join('')),
        });
        setIsSubscribed(true);
        toast.success('Benachrichtigungen aktiviert! Du wirst über neue Prämien informiert.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Fehler beim Einrichten der Benachrichtigungen');
    } finally {
      setIsLoading(false);
    }
  };

  const isSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  return { isSubscribed, isLoading, toggle, isSupported };
}

function LoyaltyCard({ token }: { token: string }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [redeemDialog, setRedeemDialog] = useState<{ open: boolean; reward: any | null }>({ open: false, reward: null });
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const { canInstall, isInstalled, isIOS, showIOSHint, setShowIOSHint, install } = useInstallPrompt();
  const push = usePushNotifications(token);
  const { data, isLoading, error, refetch } = trpc.loyalty.getCard.useQuery({ token });
  const redeemReward = trpc.loyalty.redeemReward.useMutation({
    onSuccess: (result) => {
      setRedeemSuccess(`"${result.rewardName}" wurde eingelöst! Verbleibendes Guthaben: ${result.remainingPoints.toLocaleString("de-CH")} Punkte.`);
      setRedeemDialog({ open: false, reward: null });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteAccount = trpc.loyalty.deleteAccount.useMutation({
    onSuccess: () => { toast.success("Dein Konto wurde gelöscht."); window.location.href = "/"; },
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center p-4"><div className="text-center"><p className="text-gray-500">Treuekarte nicht gefunden.</p><p className="text-xs text-gray-400 mt-2">Bitte verwende den Link aus deiner Bestätigungs-E-Mail.</p></div></div>;
  const { customer, program, restaurant, transactions, rewards, tiers, nextTier, progressToNext } = data;
  const primaryColor = (program as any)?.primaryColor ?? "#7c3aed";
  const tierInfo = TIER_COLORS[customer.tier] ?? TIER_COLORS.bronze;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(token, { width: 220, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } })
      .then(setQrDataUrl).catch(console.error);
  }, [token]);
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="text-white py-8 px-4" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}>
        <div className="max-w-md mx-auto">
          {restaurant?.logoUrl && <img src={restaurant.logoUrl} alt={restaurant.name ?? ""} className="h-10 mb-4 rounded" />}
          <p className="text-white/70 text-sm mb-1">{restaurant?.name}</p>
          <h1 className="text-2xl font-bold">{customer.firstName} {customer.lastName}</h1>
            <div className="mt-4 bg-white/20 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-white/70 text-xs">Aktuelles Guthaben</p>
                <p className="text-4xl font-bold">{customer.totalPoints.toLocaleString("de-CH")}</p>
                <p className="text-white/70 text-xs">Punkte</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <TierBadge tier={customer.tier} />
                <button
                  onClick={() => setShowQr(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs transition-all"
                >
                  <QrCode className="h-3.5 w-3.5" /> QR-Code
                </button>
              </div>
            </div>
            {nextTier && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-white/70 mb-1"><span>{tierInfo.label}</span><span>{nextTier.label} ab {nextTier.minPoints.toLocaleString("de-CH")} Punkte</span></div>
                <div className="h-2 bg-white/30 rounded-full overflow-hidden"><div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${progressToNext}%` }} /></div>
                <p className="text-xs text-white/60 mt-1">Noch {(nextTier.minPoints - customer.lifetimePoints).toLocaleString("de-CH")} Punkte bis {nextTier.label}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <a href={`/api/loyalty/apple-wallet?token=${token}`} className="flex items-center justify-center gap-2 h-12 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition-all">
            <Wallet className="h-4 w-4" /> Apple Wallet
          </a>
          <a href={`/api/loyalty/google-wallet?token=${token}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-all">
            <Wallet className="h-4 w-4" /> Google Wallet
          </a>
        </div>

        {/* Zum Homescreen hinzufügen – für Geräte ohne Wallet */}
        {!isInstalled && canInstall && (
          <button
            onClick={install}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 transition-all"
          >
            <Plus className="h-4 w-4" />
            Zum Homescreen hinzufügen
          </button>
        )}
        {isInstalled && (
          <div className="flex items-center justify-center gap-2 h-10 text-emerald-600 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Bereits auf dem Homescreen gespeichert
          </div>
        )}

        {/* Push-Benachrichtigungen */}
        {push.isSupported && (
          <button
            onClick={push.toggle}
            disabled={push.isLoading}
            className={`w-full flex items-center justify-center gap-2 h-12 rounded-xl border-2 text-sm font-medium transition-all ${
              push.isSubscribed
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {push.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : push.isSubscribed ? (
              <><BellOff className="h-4 w-4" /> Benachrichtigungen deaktivieren</>
            ) : (
              <><Bell className="h-4 w-4" /> Benachrichtigungen aktivieren</>
            )}
          </button>
        )}

        {/* iOS-Anleitung-Dialog */}
        <Dialog open={showIOSHint} onOpenChange={setShowIOSHint}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share className="h-5 w-5 text-violet-500" />
                Zum Homescreen hinzufügen
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">So speicherst du deine Treuekarte auf dem iPhone/iPad:</p>
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">1</span>
                  <span className="text-sm text-gray-700">Tippe unten in Safari auf das <strong>Teilen-Symbol</strong> <Share className="inline h-4 w-4" /></span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">2</span>
                  <span className="text-sm text-gray-700">Scrolle nach unten und tippe auf <strong>"Zum Home-Bildschirm"</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">3</span>
                  <span className="text-sm text-gray-700">Tippe oben rechts auf <strong>"Hinzufügen"</strong></span>
                </li>
              </ol>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                Die Karte erscheint dann als App-Icon auf deinem Homescreen und öffnet sich direkt ohne Browser.
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => setShowIOSHint(false)}>Verstanden</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* QR-Code-Dialog */}
        <Dialog open={showQr} onOpenChange={setShowQr}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-violet-500" />
                Mein QR-Code
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center py-4 space-y-3">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR-Code" className="w-48 h-48 rounded-xl shadow-md" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>
              )}
              <p className="text-sm text-center text-gray-600">Zeige diesen QR-Code dem Personal beim Bezahlen – deine Punkte werden automatisch gutgeschrieben.</p>
              <p className="text-xs text-gray-400">{customer.firstName} {customer.lastName} · {restaurant?.name}</p>
            </div>
            <DialogFooter>
              <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => setShowQr(false)}>Schliessen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" />Treue-Stufen</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tiers.map((tier: any) => {
                const tc = TIER_COLORS[tier.name] ?? TIER_COLORS.bronze;
                const isActive = tier.name === customer.tier;
                return (
                  <div key={tier.name} className={`flex items-center justify-between p-2 rounded-lg ${isActive ? `${tc.bg} ${tc.border} border` : "bg-gray-50"}`}>
                    <span className={`text-sm font-medium ${isActive ? tc.text : "text-gray-500"}`}>{tier.label ?? tc.label}</span>
                    <span className={`text-xs ${isActive ? tc.text : "text-gray-400"}`}>ab {tier.minPoints.toLocaleString("de-CH")} Punkte</span>
                    {isActive && <Badge variant="outline" className={`text-xs ${tc.text} ${tc.border}`}>Aktiv</Badge>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        {redeemSuccess && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-800">Prämie eingelöst!</p>
              <p className="text-xs text-emerald-600 mt-0.5">{redeemSuccess}</p>
              <Button size="sm" variant="ghost" className="text-xs text-emerald-600 mt-1 h-auto p-0" onClick={() => setRedeemSuccess(null)}>Schliessen</Button>
            </div>
          </div>
        )}
        {rewards.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gift className="h-4 w-4 text-violet-500" />Prämien-Katalog
              </CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Du hast <strong>{customer.totalPoints.toLocaleString("de-CH")} Punkte</strong> – wähle eine Prämie und löse sie direkt ein.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {rewards.map((r: any) => {
                const canRedeem = customer.totalPoints >= r.pointsCost;
                const tierOk = !r.minTier || r.minTier === "none" || ["bronze","silver","gold","platinum"].indexOf(customer.tier) >= ["bronze","silver","gold","platinum"].indexOf(r.minTier);
                const eligible = canRedeem && tierOk;
                return (
                  <div key={r.id} className={`rounded-xl border p-4 transition-all ${eligible ? "border-violet-200 bg-violet-50 shadow-sm" : "border-gray-100 bg-gray-50 opacity-70"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${eligible ? "text-violet-800" : "text-gray-500"}`}>{r.name}</p>
                        {r.description && <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>}
                        {r.minTier && r.minTier !== "none" && (
                          <span className="inline-block mt-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            Ab {r.minTier === "silver" ? "Silber" : r.minTier === "gold" ? "Gold" : r.minTier === "platinum" ? "Platin" : r.minTier}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${eligible ? "text-violet-700" : "text-gray-400"}`}>{r.pointsCost.toLocaleString("de-CH")} Pkt.</p>
                        {eligible ? (
                          <Button size="sm" className="mt-2 h-7 text-xs bg-violet-600 hover:bg-violet-700" onClick={() => setRedeemDialog({ open: true, reward: r })}>
                            Einlösen
                          </Button>
                        ) : (
                          <p className="text-xs text-gray-400 mt-1">
                            {!tierOk ? `Stufe ${r.minTier} nötig` : `Noch ${(r.pointsCost - customer.totalPoints).toLocaleString("de-CH")} Pkt.`}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Prämie einlösen Bestätigungs-Dialog */}
        <Dialog open={redeemDialog.open} onOpenChange={(o) => !o && setRedeemDialog({ open: false, reward: null })}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-violet-500" />Prämie einlösen</DialogTitle></DialogHeader>
            {redeemDialog.reward && (
              <div className="space-y-4">
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-4">
                  <p className="font-semibold text-violet-800">{redeemDialog.reward.name}</p>
                  {redeemDialog.reward.description && <p className="text-sm text-gray-500 mt-1">{redeemDialog.reward.description}</p>}
                  <p className="text-sm font-bold text-violet-700 mt-2">{redeemDialog.reward.pointsCost.toLocaleString("de-CH")} Punkte werden abgezogen</p>
                </div>
                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Zeige dem Personal diese Bestätigung. Die Punkte werden sofort abgezogen und können nicht rückgängig gemacht werden.</span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRedeemDialog({ open: false, reward: null })}>Abbrechen</Button>
              <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => redeemReward.mutate({ token, rewardId: redeemDialog.reward!.id })} disabled={redeemReward.isPending}>
                {redeemReward.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Jetzt einlösen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" />Punkte-Verlauf</CardTitle></CardHeader>
          <CardContent>
            {transactions.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Noch keine Transaktionen.</p> : (
              <div className="space-y-2">
                {transactions.slice(0, 20).map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{txLabel(tx.type)}</p>
                      {tx.description && <p className="text-xs text-gray-400">{tx.description}</p>}
                      <p className="text-xs text-gray-300">{new Date(tx.createdAt).toLocaleDateString("de-CH")}</p>
                    </div>
                    <span className={`text-sm font-bold ${tx.points >= 0 ? "text-emerald-600" : "text-red-500"}`}>{tx.points >= 0 ? "+" : ""}{tx.points.toLocaleString("de-CH")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {program && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Award className="h-4 w-4 text-gray-400" />Programm-Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between"><span>Punkte pro CHF</span><span className="font-medium">{(program as any).pointsPerChf}</span></div>
              <div className="flex justify-between"><span>Einlösung</span><span className="font-medium">{(program as any).pointsPerRedemptionChf} Punkte = CHF 1.00</span></div>
              {(program as any).expiryMonths && <div className="flex justify-between"><span>Punkte verfallen nach</span><span className="font-medium">{(program as any).expiryMonths} Monaten Inaktivität</span></div>}
              {(program as any).privacyText && (
                <Accordion type="single" collapsible className="mt-2">
                  <AccordionItem value="privacy">
                    <AccordionTrigger className="text-xs text-gray-400 py-1">Datenschutz-Hinweise</AccordionTrigger>
                    <AccordionContent className="text-xs text-gray-500 whitespace-pre-line">{(program as any).privacyText}</AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </CardContent>
          </Card>
        )}
        <div className="pt-2">
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="h-3 w-3" />Konto und Daten löschen (DSGVO)
            </button>
          ) : (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm text-red-700 font-medium">Konto wirklich löschen?</p>
                <p className="text-xs text-red-600">Deine persönlichen Daten werden anonymisiert. Transaktionen bleiben für die Buchhaltung erhalten.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(false)}>Abbrechen</Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteAccount.mutate({ token })} disabled={deleteAccount.isPending}>{deleteAccount.isPending ? "..." : "Ja, löschen"}</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GuestLoyalty() {
  const [, params] = useRoute("/loyalty/:token");
  const [, regParams] = useRoute("/loyalty/register/:restaurantId");
  const [newToken, setNewToken] = useState<string | null>(null);
  const token = params?.token;
  const restaurantId = regParams?.restaurantId ? parseInt(regParams.restaurantId) : null;
  if (newToken) return <LoyaltyCard token={newToken} />;
  if (token && token !== "register") return <LoyaltyCard token={token} />;
  if (restaurantId) return <RegisterForm restaurantId={restaurantId} onSuccess={setNewToken} />;
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center"><Star className="h-12 w-12 text-violet-300 mx-auto mb-4" /><p className="text-gray-500">Bitte verwende den Link aus deiner E-Mail oder vom Restaurant.</p></div>
    </div>
  );
}
