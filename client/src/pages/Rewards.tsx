import { Card, CardContent } from "@/components/ui/card";
import { Gift, Star } from "lucide-react";

export default function Rewards() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Treuepunkte & Geschenkkarten</h1>
        <p className="text-muted-foreground mt-1">
          Verwalten Sie Ihre Treuepunkte und Geschenkkarten
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Star className="h-12 w-12 text-primary/40 mb-4" />
            <h3 className="font-semibold text-lg">Treuepunkte</h3>
            <p className="text-3xl font-bold mt-2">0 Punkte</p>
            <p className="text-sm text-muted-foreground mt-2">
              Sammeln Sie Punkte bei jeder Bestellung und lösen Sie diese für Prämien ein.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Gift className="h-12 w-12 text-emerald-500/40 mb-4" />
            <h3 className="font-semibold text-lg">Geschenkkarten</h3>
            <p className="text-3xl font-bold mt-2">CHF 0.00</p>
            <p className="text-sm text-muted-foreground mt-2">
              Sie haben derzeit keine aktiven Geschenkkarten.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
