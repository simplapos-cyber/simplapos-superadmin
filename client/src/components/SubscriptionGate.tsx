import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Lock, Zap, CreditCard, Clock, CheckCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

// ─── Phase Banner (Legacy – gibt null zurück, Icon ist jetzt im Topbar) ───────
/**
 * TrialPhaseBanner – gibt null zurück.
 * Die Information wird jetzt als TrialPhaseTopbarIcon in der Topbar angezeigt.
 * Diese Funktion bleibt für Rückwärtskompatibilität erhalten.
 */
export function TrialPhaseBanner() {
  return null;
}

// ─── Topbar-Icon für Testphase ────────────────────────────────────────────────
/**
 * TrialPhaseTopbarIcon – kompaktes Icon für die Topbar oder Sidebar-Footer.
 *
 * Props:
 *   sidebarMode – wenn true, wird ein breiteres Banner im Sidebar-Footer gerendert
 *                 (zeigt Text + Tageszahl, kein Icon-only)
 */
export function TrialPhaseTopbarIcon({ sidebarMode = false }: { sidebarMode?: boolean }) {
  const { user } = useAuth();
  const { data: accessPhase } = trpc.subscriptions.myAccessPhase.useQuery(undefined, {
    enabled: user?.role === "admin" && !!user?.restaurantId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (!accessPhase || accessPhase.phase === "paid" || accessPhase.phase === "none") return null;

  const isRestricted = accessPhase.phase === "restricted";
  const days = accessPhase.daysRemaining;
  const iconColor = isRestricted ? "text-orange-500" : "text-blue-500";
  const dotColor = isRestricted ? "bg-orange-500" : "bg-blue-500";
  const tooltipText = isRestricted
    ? `Eingeschränkter Zugang – noch ${days}d`
    : `Testphase – noch ${days}d`;

  // ── Sidebar-Footer-Modus: breites Banner ──────────────────────────────────
  // Sidebar-Footer-Modus: reiner Button ohne Popover (Popover wuerde iOS-Scroll-Lock ausloesen)
  if (sidebarMode) {
    return (
      <button
        className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors
          ${isRestricted
            ? "bg-orange-500/10 hover:bg-orange-500/20 text-orange-600"
            : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-600"
          }`}
        aria-label={tooltipText}
        onClick={() => {
          toast.info(
            isRestricted
              ? `Eingeschraenkter Zugang - noch ${days} Tage. Bitte Abonnement abschliessen.`
              : `Kostenlose Testphase - noch ${days} Tage voller Zugriff.`,
            { duration: 4000 }
          );
        }}
      >
        {isRestricted
          ? <AlertTriangle className="h-4 w-4 shrink-0" />
          : <Zap className="h-4 w-4 shrink-0" />
        }
        <span className="text-xs font-medium flex-1 min-w-0 truncate">
          {isRestricted ? "Eingeschraenkter Zugang" : "Kostenlose Testphase"}
        </span>
        <span className={`text-xs font-bold shrink-0 px-1.5 py-0.5 rounded-full
          ${isRestricted ? "bg-orange-500/20" : "bg-blue-500/20"}`}>
          {days}d
        </span>
      </button>
    );
  }

  // ── Topbar-Icon-Modus: kleines Icon mit Badge ─────────────────────────────
  return (
    <Popover>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className={`relative h-8 p-0 px-1.5 gap-1 ${iconColor}`}
                aria-label={tooltipText}
              >
                {isRestricted
                  ? <AlertTriangle className="h-4 w-4 shrink-0" />
                  : <Zap className="h-4 w-4 shrink-0" />
                }
                {/* Tageszahl-Badge */}
                <span
                  className={`text-[10px] font-bold leading-none px-1 py-0.5 rounded-full
                    ${isRestricted
                      ? "bg-orange-500/15 text-orange-600"
                      : "bg-blue-500/15 text-blue-600"
                    }`}
                >
                  {days}d
                </span>
                {/* Pulsierender Dot */}
                <span
                  className={`absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`}
                  style={{ animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" }}
                />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent className="w-80 p-4" align="end">
        <TrialPopoverContent
          isRestricted={isRestricted}
          days={days}
          restaurantId={user?.restaurantId!}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Popover-Inhalt (geteilt zwischen beiden Modi) ────────────────────────────
function TrialPopoverContent({
  isRestricted,
  days,
  restaurantId,
}: {
  isRestricted: boolean;
  days: number;
  restaurantId: number;
}) {
  return isRestricted ? (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
        </div>
        <div>
          <p className="font-semibold text-sm">Eingeschränkter Zugang</p>
          <p className="text-xs text-muted-foreground">
            Noch {days} {days === 1 ? "Tag" : "Tage"} bis zur Sperrung
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Nur die beim Onboarding gewählten Module sind aktiv. Schliessen Sie jetzt Ihr
        Abonnement ab, um dauerhaften Zugang zu sichern.
      </p>
      <PayNowButton restaurantId={restaurantId} />
    </div>
  ) : (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <Zap className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <p className="font-semibold text-sm">Kostenlose Testphase aktiv</p>
          <p className="text-xs text-muted-foreground">
            Noch {days} {days === 1 ? "Tag" : "Tage"} voller Zugriff
          </p>
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
          <span>
            Voller Zugriff auf alle Funktionen für {days} weitere{" "}
            {days === 1 ? "Tag" : "Tage"}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
          <span>Danach 7 Tage eingeschränkter Zugang (nur gebuchte Module)</span>
        </div>
        <div className="flex items-start gap-2">
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span>Kein Abonnement nötig während der Testphase</span>
        </div>
      </div>
      <div className="pt-1 border-t">
        <p className="text-xs text-muted-foreground mb-2">Frühzeitig abonnieren:</p>
        <PayNowButton restaurantId={restaurantId} />
      </div>
    </div>
  );
}

// ─── Pay Now Button ──────────────────────────────────────────────────────────
function PayNowButton({ restaurantId }: { restaurantId: number }) {
  const [loading, setLoading] = useState(false);
  const createCheckout = trpc.subscriptions.createCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (err) => {
      toast.error("Fehler beim Erstellen der Zahlungsseite: " + err.message);
      setLoading(false);
    },
  });

  return (
    <Button
      size="sm"
      className="w-full shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        createCheckout.mutate({ restaurantId, origin: window.location.origin });
      }}
    >
      <CreditCard className="h-3 w-3 mr-1" />
      Jetzt bezahlen
    </Button>
  );
}

// ─── Blocked Screen ──────────────────────────────────────────────────────────
export function BlockedScreen({ restaurantId }: { restaurantId: number }) {
  const [loading, setLoading] = useState(false);
  const createCheckout = trpc.subscriptions.createCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (err) => {
      toast.error("Fehler: " + err.message);
      setLoading(false);
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full shadow-lg border-red-100">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <Lock className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl text-gray-900">Zugang gesperrt</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600 text-sm leading-relaxed">
            Ihre kostenlose Testphase ist abgelaufen. Um weiterhin auf Ihr System und Ihre Daten
            zuzugreifen, schliessen Sie bitte Ihr Abonnement ab.
          </p>

          <div className="bg-gray-50 rounded-lg p-3 text-left space-y-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Nach der Zahlung erhalten Sie:</p>
            {[
              "Sofortiger Zugang zu allen Ihren Daten",
              "Alle gebuchten Module aktiv",
              "Monatliche Abrechnung, jederzeit kündbar",
              "Schweizer Support",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            size="lg"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              createCheckout.mutate({ restaurantId, origin: window.location.origin });
            }}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {loading ? "Weiterleitung..." : "Abonnement abschliessen"}
          </Button>

          <p className="text-xs text-gray-400">
            Bei Fragen: support@simplapos.com · +41 (0)44 000 00 00
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Upselling Module Card ───────────────────────────────────────────────────
export function UpsellModuleHint({
  moduleName,
  description,
  priceMonthly,
  moduleId,
}: {
  moduleName: string;
  description: string;
  priceMonthly: number;
  moduleId: string;
}) {
  return (
    <div className="relative rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 p-4 flex items-start gap-3">
      <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
        <Star className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm text-gray-900">{moduleName}</p>
          <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
            CHF {priceMonthly}/Mt.
          </Badge>
          <Badge className="text-xs bg-blue-600 text-white">Upgrade</Badge>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ─── Main Gate Wrapper ───────────────────────────────────────────────────────
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: accessPhase, isLoading } = trpc.subscriptions.myAccessPhase.useQuery(undefined, {
    enabled: user?.role === "admin" && !!user?.restaurantId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (user?.role !== "admin" || !user?.restaurantId) return <>{children}</>;
  if (isLoading) return <>{children}</>;
  if (accessPhase?.phase === "blocked") {
    return <BlockedScreen restaurantId={user.restaurantId} />;
  }
  return <>{children}</>;
}
