import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";
export default function GuestGiftcards() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Geschenkkarten</h1><p className="text-muted-foreground text-sm">Deine Geschenkkarten</p></div>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Meine Karten</CardTitle></CardHeader>
      <CardContent><p className="text-muted-foreground text-sm text-center py-6">Keine Geschenkkarten vorhanden</p></CardContent></Card>
    </div>
  );
}
