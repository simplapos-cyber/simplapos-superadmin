import React from "react";
import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";

// Modul-Metadaten für das Upgrade-Banner
const MODULE_META: Record<string, { name: string; price: number; description: string }> = {
  ai_marketing:        { name: "AI Marketing Agent",           price: 149, description: "KI erstellt & postet automatisch auf Instagram, Facebook, Google & TikTok" },
  ai_marketing_pro:    { name: "AI Marketing Agent Pro",       price: 249, description: "Alles aus AI Marketing + unbegrenzte Posts, A/B-Testing, Video-Analyse" },
  bewertungsmanagement:{ name: "Bewertungsmanagement",         price: 14,  description: "Automatisch auf Google-Bewertungen antworten, Reputations-Analyse" },
  loyalty:             { name: "Geschenkkarten & Treuepunkte", price: 39,  description: "Kundenbindung mit Punkten, Geburtstags-Boni und digitalen Geschenkkarten" },
  gutscheine:          { name: "Gutschein-System",             price: 29,  description: "Gutscheine erstellen, verkaufen und einlösen" },
  tischreservierung:   { name: "Tischreservierung",            price: 49,  description: "Online-Reservierungen mit automatischer Tischzuweisung" },
  lieferung:           { name: "Liefermodul",                  price: 59,  description: "Eigener Lieferdienst mit Zonen, Mindestbestellwert und Tracking" },
  smart_building:      { name: "Smart Building & IoT",         price: 29,  description: "Temperatur-Überwachung, Gerätesteuerung und Energie-Monitoring" },
  kassenbuch:          { name: "Kassenbuch",                   price: 19,  description: "Digitales Kassenbuch für alle Ein- und Ausgaben" },
  steuerexport:        { name: "Steuerberater-Export",         price: 9,   description: "Automatischer Export für Steuerberater (CSV, DATEV)" },
  allergene:           { name: "Allergene & Nährwerte",        price: 9,   description: "Allergene und Nährwertangaben für die Speisekarte" },
  multilang_menu:      { name: "Mehrsprachige Speisekarte",    price: 19,  description: "Speisekarte in mehreren Sprachen" },
  personal:            { name: "Personalverwaltung",           price: 25,  description: "Dienstpläne, Zeiterfassung, KI-Planung" },
  inventar:            { name: "Inventarverwaltung",           price: 149, description: "Lager, Warenwirtschaft und automatischer Lagerabzug" },
  qr_bestellung:       { name: "QR-Code Bestellung",          price: 79,  description: "Gäste bestellen direkt vom Tisch per QR-Code" },
};

interface ModuleGateProps {
  moduleId: string;
  children: React.ReactNode;
}

/**
 * ModuleGate – zeigt den Inhalt nur wenn das Modul aktiv/trial ist.
 * Sonst erscheint ein Upgrade-Banner mit Preis und 7-Tage-Trial-Button.
 */
export function ModuleGate({ moduleId, children }: ModuleGateProps) {
  const { hasModule, isLoading } = useModuleAccess();
  const utils = trpc.useUtils();

  const startTrial = trpc.restaurantAdmin.startTrial.useMutation({
    onSuccess: () => {
      toast.success("7-Tage Testphase gestartet! Du hast jetzt 7 Tage kostenlosen Zugang.");
      utils.restaurantAdmin.listModules.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Während Laden: Inhalt anzeigen (kein Flackern)
  if (isLoading) return <>{children}</>;

  // Modul aktiv oder trial: Inhalt anzeigen
  if (hasModule(moduleId)) return <>{children}</>;

  // Modul nicht gebucht: Upgrade-Banner
  const meta = MODULE_META[moduleId] ?? { name: moduleId, price: 0, description: "" };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="max-w-md mx-auto">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-10 h-10 text-amber-600 dark:text-amber-400" />
        </div>

        {/* Titel */}
        <h2 className="text-2xl font-bold text-foreground mb-2">{meta.name}</h2>
        <p className="text-muted-foreground mb-6">{meta.description}</p>

        {/* Preis */}
        {meta.price > 0 && (
          <div className="bg-muted rounded-xl p-4 mb-6 inline-block">
            <span className="text-3xl font-bold text-foreground">CHF {meta.price}</span>
            <span className="text-muted-foreground">/Monat</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            onClick={() => startTrial.mutate({ moduleId })}
            disabled={startTrial.isPending}
          >
            <Zap className="w-4 h-4 mr-2" />
            {startTrial.isPending ? "Wird aktiviert..." : "7 Tage kostenlos testen"}
          </Button>

          <Button variant="outline" size="lg" asChild>
            <Link href="/admin/modules">
              Modul kaufen – CHF {meta.price}/Mt
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Keine Kreditkarte nötig für die Testphase. Nach 7 Tagen wird das Modul deaktiviert bis zur Buchung.
        </p>
      </div>
    </div>
  );
}
