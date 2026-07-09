/**
 * GiftCardPurchaseSuccess – Erfolgsseite nach Geschenkkarten-Kauf via Stripe
 * Route: /gift/purchase-success?session_id=...
 */
import { useEffect } from "react";
import { CheckCircle, Gift, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function GiftCardPurchaseSuccess() {
  const [, navigate] = useLocation();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Icon */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 opacity-20 animate-ping" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-xl">
            <CheckCircle className="h-12 w-12 text-white" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Zahlung erfolgreich!</h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            Deine Geschenkkarte wurde erfolgreich erstellt. Du erhältst in Kürze eine E-Mail mit dem Gutschein-Code und einem Link zur Guthaben-Seite.
          </p>
        </div>

        {/* Info card */}
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5 text-left space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Gift className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Geschenkkarte erstellt</p>
              <p className="text-gray-500 text-xs">Bitte prüfe dein E-Mail-Postfach</p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Gutschein-Code per E-Mail zugestellt</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>QR-Code zum Einlösen im Restaurant</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>3 Jahre gültig</span>
            </div>
          </div>
        </div>

        {/* Action */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Speisekarte
        </Button>

        <p className="text-xs text-gray-400">
          Keine E-Mail erhalten? Bitte prüfe deinen Spam-Ordner oder wende dich an das Restaurant.
        </p>
      </div>
    </div>
  );
}
