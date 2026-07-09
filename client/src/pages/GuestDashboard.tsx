import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gift, CreditCard, Receipt, Star } from "lucide-react";

export default function GuestDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Willkommen{user?.name ? `, ${user.name}` : ""}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Hier finden Sie Ihre Treuepunkte, Geschenkkarten und Rechnungen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Star className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Treuepunkte</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sammeln Sie Punkte bei jeder Bestellung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Gift className="h-5 w-5 text-emerald-600" />
            </div>
            <CardTitle className="text-sm font-medium">Geschenkkarten</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
            <p className="text-xs text-muted-foreground mt-1">
              Keine aktiven Geschenkkarten
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Receipt className="h-5 w-5 text-blue-600" />
            </div>
            <CardTitle className="text-sm font-medium">Rechnungen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
            <p className="text-xs text-muted-foreground mt-1">
              Noch keine Bestellungen
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CreditCard className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">Bald verfügbar</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-2">
            Treuepunkte, Geschenkkarten und Ihre Bestellhistorie werden hier angezeigt,
            sobald das Kassensystem vollständig integriert ist.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
