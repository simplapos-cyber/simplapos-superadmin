import { TrendingUp } from "lucide-react";
export default function Waiter_revenue() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold">Eigene Umsätze</h1>
      <div className="p-10 text-center text-muted-foreground border rounded-lg">
        <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Umsatzübersicht</p>
        <p className="text-sm mt-1">Diese Funktion wird in Kürze verfügbar sein.</p>
      </div>
    </div>
  );
}
