/**
 * GiftCardBuyPage – Eigenständige Landingpage für Geschenkkarten-Kauf
 * Route: /gift/buy/:restaurantId
 *
 * Ermöglicht den Kauf einer Geschenkkarte ohne aktive Tischsession.
 * Kann z.B. auf der Restaurant-Website verlinkt werden.
 */
import { useState } from "react";
import { useRoute } from "wouter";
import { Gift, MapPin, Phone, Globe, Instagram, Facebook, Loader2, CheckCircle, Star, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ─── Öffnungszeiten-Typ ───────────────────────────────────────────────────────

type OpeningHours = Record<string, { open: string; close: string; closed?: boolean }>;

const DAY_NAMES: Record<string, string> = {
  monday: "Montag", tuesday: "Dienstag", wednesday: "Mittwoch",
  thursday: "Donnerstag", friday: "Freitag", saturday: "Samstag", sunday: "Sonntag",
};
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function GiftCardBuyPage() {
  const [, params] = useRoute("/gift/buy/:restaurantId");
  const restaurantId = parseInt(params?.restaurantId ?? "0");

  // Form-State
  const [gcAmount, setGcAmount] = useState<number>(50);
  const [gcCustomAmount, setGcCustomAmount] = useState("");
  const [gcRecipientName, setGcRecipientName] = useState("");
  const [gcBuyerEmail, setGcBuyerEmail] = useState("");
  const [gcMessage, setGcMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Restaurant-Daten laden
  const { data: restaurant, isLoading, error } = trpc.voucher.getRestaurantForGiftCard.useQuery(
    { restaurantId },
    { enabled: !!restaurantId && restaurantId > 0, retry: false }
  );

  // Stripe Checkout Mutation
  const purchaseMutation = trpc.voucher.createGiftCardPurchaseSession.useMutation({
    onSuccess: ({ checkoutUrl }) => {
      window.location.href = checkoutUrl;
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePurchase = () => {
    if (!restaurant) return;
    if (!gcBuyerEmail) {
      toast.error("Bitte gib deine E-Mail-Adresse ein.");
      return;
    }
    if (gcAmount < 5 || gcAmount > 500) {
      toast.error("Betrag muss zwischen CHF 5 und CHF 500 liegen.");
      return;
    }
    setSubmitted(true);
    purchaseMutation.mutate({
      restaurantId,
      amount: gcAmount,
      origin: window.location.origin,
      recipientName: gcRecipientName || undefined,
      buyerEmail: gcBuyerEmail || undefined,
      message: gcMessage || undefined,
    });
  };

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  // ─── Fehler ─────────────────────────────────────────────────────────────────

  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Gift className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Restaurant nicht gefunden</h1>
          <p className="text-gray-500 text-sm">Der Link ist ungültig oder das Restaurant existiert nicht mehr.</p>
        </div>
      </div>
    );
  }

  const openingHours = restaurant.openingHours as OpeningHours | null;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      {/* Hero-Header */}
      <div
        className="relative overflow-hidden"
        style={restaurant.giftCardBackgroundUrl ? {
          backgroundImage: `url(${restaurant.giftCardBackgroundUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : {
          background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
        }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 px-4 py-12 text-center text-white">
          {restaurant.logoUrl && (
            <div className="mx-auto mb-4 w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm p-2 flex items-center justify-center">
              <img
                src={restaurant.logoUrl}
                alt={restaurant.name}
                className="w-full h-full object-contain rounded-xl"
              />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-1">{restaurant.name}</h1>
          <p className="text-white/80 text-base">Geschenkkarte kaufen</p>
          <p className="text-white/60 text-sm mt-1">Perfektes Geschenk für jeden Anlass · 3 Jahre gültig</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Kauf-Formular */}
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="h-5 w-5 text-purple-600" />
            <h2 className="font-bold text-gray-900 text-lg">Geschenkkarte konfigurieren</h2>
          </div>

          {/* Betrag */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Betrag (CHF)</Label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[20, 50, 100, 200].map((amt) => (
                <button
                  key={amt}
                  onClick={() => { setGcAmount(amt); setGcCustomAmount(""); }}
                  className={cn(
                    "py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
                    gcAmount === amt && !gcCustomAmount
                      ? "border-purple-600 bg-purple-50 text-purple-700"
                      : "border-border bg-background text-foreground hover:border-purple-300"
                  )}
                >
                  {amt}
                </button>
              ))}
            </div>
            <Input
              type="number"
              placeholder="Anderer Betrag (5–500)"
              value={gcCustomAmount}
              onChange={(e) => {
                setGcCustomAmount(e.target.value);
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) setGcAmount(v);
              }}
              min={5}
              max={500}
              className="text-sm"
            />
          </div>

          {/* Empfänger */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Für wen? <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              placeholder="Name des Empfängers"
              value={gcRecipientName}
              onChange={(e) => setGcRecipientName(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Persönliche Nachricht */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Persönliche Nachricht <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              placeholder='z.B. "Herzlichen Glückwunsch zum Geburtstag!"'
              value={gcMessage}
              onChange={(e) => setGcMessage(e.target.value)}
              maxLength={100}
              className="text-sm"
            />
          </div>

          {/* Käufer-E-Mail */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Deine E-Mail <span className="text-red-500">*</span>
              <span className="text-muted-foreground font-normal ml-1">(für Bestätigung)</span>
            </Label>
            <Input
              type="email"
              placeholder="deine@email.ch"
              value={gcBuyerEmail}
              onChange={(e) => setGcBuyerEmail(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Zusammenfassung */}
          {gcAmount >= 5 && gcAmount <= 500 && (
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-700 font-medium">Geschenkkarte</p>
                  <p className="text-xs text-purple-500 mt-0.5">
                    {restaurant.name} · 3 Jahre gültig
                    {gcRecipientName && ` · Für: ${gcRecipientName}`}
                  </p>
                </div>
                <p className="text-2xl font-bold text-purple-700">CHF {gcAmount.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* Kaufen-Button */}
          <Button
            className="w-full h-12 text-base bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
            disabled={purchaseMutation.isPending || submitted || gcAmount < 5 || gcAmount > 500 || !gcBuyerEmail}
            onClick={handlePurchase}
          >
            {purchaseMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Weiterleitung zu Stripe...</>
            ) : (
              <><Gift className="h-4 w-4 mr-2" /> CHF {gcAmount.toFixed(2)} – Jetzt kaufen</>
            )}
          </Button>

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Sichere Zahlung via Stripe</span>
            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> 3 Jahre gültig</span>
            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> E-Mail-Bestätigung</span>
          </div>
        </div>

        {/* Restaurant-Info */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
            Über {restaurant.name}
          </h3>

          <div className="space-y-2.5 text-sm text-gray-600">
            {(restaurant.address || restaurant.city) && (
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <span>
                  {[restaurant.address, restaurant.zip, restaurant.city].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            {restaurant.phone && (
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <a href={`tel:${restaurant.phone}`} className="hover:text-purple-600 transition-colors">
                  {restaurant.phone}
                </a>
              </div>
            )}
            {restaurant.website && (
              <div className="flex items-center gap-2.5">
                <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <a
                  href={restaurant.website.startsWith("http") ? restaurant.website : `https://${restaurant.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-purple-600 transition-colors truncate"
                >
                  {restaurant.website.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
          </div>

          {/* Social Media */}
          {(restaurant.instagramUrl || restaurant.facebookUrl || restaurant.googleMapsUrl) && (
            <div className="flex items-center gap-3 pt-1">
              {restaurant.instagramUrl && (
                <a href={restaurant.instagramUrl} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white hover:opacity-90 transition-opacity">
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {restaurant.facebookUrl && (
                <a href={restaurant.facebookUrl} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white hover:opacity-90 transition-opacity">
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {restaurant.googleMapsUrl && (
                <a href={restaurant.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-red-500 flex items-center justify-center text-white hover:opacity-90 transition-opacity">
                  <MapPin className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Öffnungszeiten */}
        {openingHours && Object.keys(openingHours).length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-gray-500" />
              Öffnungszeiten
            </h3>
            <div className="space-y-2">
              {DAY_ORDER.map((day) => {
                const hours = openingHours[day];
                if (!hours) return null;
                return (
                  <div key={day} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 w-28">{DAY_NAMES[day]}</span>
                    {hours.closed ? (
                      <span className="text-red-400 font-medium">Geschlossen</span>
                    ) : (
                      <span className="text-gray-900 font-medium">{hours.open} – {hours.close} Uhr</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-center text-gray-400 pb-4">
          Powered by <strong>SimplaPOS</strong> · Sichere Zahlung via Stripe
        </p>
      </div>
    </div>
  );
}
